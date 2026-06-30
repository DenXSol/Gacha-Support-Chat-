export interface IntercomConversation {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_location: string;
  issue_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message: string;
  full_messages?: MessagePart[];
  unread: boolean;
  replied: boolean;
  tags?: string[];
  ai_participated?: boolean;
  escalated_to_human?: boolean;
  // Native Intercom CSAT (customer-submitted conversation rating), when present
  csat_rating?: number;       // 1–5
  csat_remark?: string;
}

export interface MessagePart {
  author_type: 'user' | 'admin' | 'bot';
  author_name: string;
  body: string;
  created_at: string;
}

export interface IntercomContact {
  id: string;
  name: string;
  email: string;
  location_str?: string;
  custom_attributes?: {
    location?: string;
    user_id?: string;
    wallet?: string;
    [key: string]: any;
  };
}

const API_BASE = 'https://api.intercom.io';
const TOKEN = process.env.INTERCOM_API_TOKEN;

const getHeaders = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'Intercom-Version': '2.11',
});

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  }
}

// ── Wallet helper ─────────────────────────────────────────────────────────────
// Intercom stores the wallet address as a custom attribute — check several
// possible field names before falling back to Intercom's internal contact ID.
function resolveWallet(contact: IntercomContact | null, fallbackContactId: string): string {
  if (!contact) return fallbackContactId;
  const attrs = contact.custom_attributes || {};
  // Try common field names for wallet address
  return (
    attrs.user_id ||
    attrs.wallet ||
    attrs.wallet_address ||
    attrs.eth_address ||
    attrs.address ||
    fallbackContactId
  );
}

export async function fetchAllConversations(): Promise<IntercomConversation[]> {
  try {
    let allConversations: any[] = [];
    let startingAfter: string | null = null;
    let page = 0;
    const MAX_PAGES = 10;

    while (page < MAX_PAGES) {
      page++;
      const url = new URL(`${API_BASE}/conversations`);
      url.searchParams.append('per_page', '50');
      url.searchParams.append('display_as', 'plaintext');
      // Fetch most-recently-updated first so the newest tickets are always
      // included (the MAX_PAGES cap keeps the freshest 500, not the oldest).
      // For the unfiltered list endpoint: sort = field, order = direction.
      url.searchParams.append('sort', 'updated_at');
      url.searchParams.append('order', 'desc');
      if (startingAfter) {
        url.searchParams.append('starting_after', startingAfter);
      }

      const res = await fetchWithTimeout(url.toString());

      if (!res.ok) {
        const errText = await res.text();
        console.error('Intercom API error:', res.status, errText);
        break;
      }

      const data = await res.json();
      allConversations = [...allConversations, ...(data.conversations || [])];

      if (data.pages?.next?.starting_after) {
        startingAfter = data.pages.next.starting_after;
      } else {
        break;
      }
    }

    const enriched = await Promise.all(
      allConversations.map(async (conv) => {
        const contactId = conv.source?.author?.id || conv.contacts?.contacts?.[0]?.id;
        const contact = contactId ? await fetchContact(contactId) : null;
        return mapConversation(conv, contact, contactId);
      })
    );

    return enriched;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw error;
  }
}

export async function fetchSingleConversation(conversationId: string): Promise<IntercomConversation | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/conversations/${conversationId}?display_as=plaintext`
    );

    if (!res.ok) return null;

    const conv = await res.json();
    const contactId = conv.source?.author?.id || conv.contacts?.contacts?.[0]?.id;
    const contact = contactId ? await fetchContact(contactId) : null;
    return mapConversation(conv, contact, contactId);
  } catch (error) {
    console.error('Error fetching single conversation:', error);
    return null;
  }
}

// ── Shared mapper — single source of truth for the Intercom→app shape, used by
// both the bulk list and the single-conversation lazy load (keeps them in sync).
function mapConversation(
  conv: any,
  contact: IntercomContact | null,
  contactId?: string
): IntercomConversation {
  const rating = conv.conversation_rating || {};
  return {
    id: conv.id,
    // Resolve actual wallet address from custom attributes, not Intercom's contact ID
    user_id: resolveWallet(contact, contactId || ''),
    user_name: contact?.name || conv.source?.author?.name || 'Unknown',
    user_email: contact?.email || 'Unknown',
    user_location: contact?.location_str || 'Unknown',
    issue_type: categorizeConversation(conv),
    status: conv.state || 'open',
    created_at: new Date(conv.created_at * 1000).toISOString(),
    updated_at: new Date(conv.updated_at * 1000).toISOString(),
    last_message: getLastMessage(conv),
    full_messages: extractMessages(conv),
    unread: conv.read === false,
    replied: hasAdminReply(conv),
    tags: conv.tags?.tags?.map((t: any) => t.name) || [],
    ai_participated: detectAIParticipation(conv),
    escalated_to_human: detectEscalation(conv),
    csat_rating: typeof rating.rating === 'number' ? rating.rating : undefined,
    csat_remark: rating.remark || undefined,
  };
}

// ── Contact cache ───────────────────────────────────────────────────────────
// Conversations are enriched with a contact lookup each fetch. With the 60s
// auto-refresh on the dashboard that would re-fetch every contact every cycle
// and risk Intercom rate limits, so cache resolved contacts for a few minutes.
// (In serverless this lives per warm instance — still cuts repeat calls a lot.)
const CONTACT_TTL_MS = 5 * 60 * 1000;
const contactCache = new Map<string, { contact: IntercomContact | null; at: number }>();

async function fetchContact(contactId: string): Promise<IntercomContact | null> {
  const cached = contactCache.get(contactId);
  if (cached && Date.now() - cached.at < CONTACT_TTL_MS) return cached.contact;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/contacts/${contactId}`);
    if (!res.ok) return null;
    const data = await res.json();

    // Intercom (API 2.11) stores location as a nested object: { type, city, region, country }.
    // Older field names (*_name) and a custom attribute are kept as fallbacks for safety.
    const loc = data.location || {};
    const city = loc.city || loc.city_name;
    const region = loc.region || loc.region_name;
    const country = loc.country || loc.country_name;
    const locParts = [city, region, country].filter(Boolean);
    const location_str = locParts.length > 0
      ? locParts.join(', ')
      : (data.custom_attributes?.location || 'Unknown');

    const contact: IntercomContact = {
      id: data.id,
      name: data.name || 'Unknown',
      email: data.email || 'Unknown',
      location_str,
      custom_attributes: data.custom_attributes || {},
    };
    contactCache.set(contactId, { contact, at: Date.now() });
    return contact;
  } catch {
    return null;
  }
}

export function categorizeConversation(conversation: any): string {
  const lastMsg = getLastMessage(conversation);
  const title = conversation.title || '';
  const allParts = extractMessages(conversation).map(m => m.body).join(' ');
  const text = `${lastMsg} ${title} ${allParts}`.toLowerCase();

  if (/withdraw|cash.?out|payout|bank\s|funds.?out/i.test(text)) return 'withdrawal';
  if (/deposit|payment|charge|crypto|top.?up|pay\s/i.test(text)) return 'deposit';
  if (/ship|deliver|tracking|arrived|package|fedex|ups|dhl|courier/i.test(text)) return 'shipping';
  if (/broken|damaged|wrong|refund|scam|fraud|chargeback/i.test(text)) return 'complaint';
  if (/redeem|certificate|psa|claim|vault|graded/i.test(text)) return 'card_redemption';
  if (/verify|identity|document|kyc|proof\sof|id\s/i.test(text)) return 'kyc';

  return 'general';
}

function extractMessages(conversation: any): MessagePart[] {
  const parts: MessagePart[] = [];

  if (conversation.source?.body) {
    parts.push({
      author_type: 'user',
      author_name: conversation.source.author?.name || 'User',
      body: conversation.source.body,
      created_at: new Date(conversation.created_at * 1000).toISOString(),
    });
  }

  const convParts = conversation.conversation_parts?.conversation_parts || [];
  for (const part of convParts) {
    if (!part.body) continue;
    parts.push({
      author_type: part.author?.type === 'admin' ? 'admin' : 'user',
      author_name: part.author?.name || (part.author?.type === 'admin' ? 'TyAi' : 'User'),
      body: part.body,
      created_at: new Date(part.created_at * 1000).toISOString(),
    });
  }

  return parts;
}

function getLastMessage(conversation: any): string {
  const parts = conversation.conversation_parts?.conversation_parts;
  if (parts && parts.length > 0) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].body) return parts[i].body;
    }
  }
  return conversation.source?.body || conversation.title || '';
}

function hasAdminReply(conversation: any): boolean {
  const parts = conversation.conversation_parts?.conversation_parts || [];
  return parts.some((p: any) => p.author?.type === 'admin' && p.body);
}

// ── Detect if Intercom's Fin AI agent participated ──
// Intercom exposes ai_agent_participated and an ai_agent object on conversations.
function detectAIParticipation(conversation: any): boolean {
  if (conversation.ai_agent_participated === true) return true;
  if (conversation.ai_agent && Object.keys(conversation.ai_agent).length > 0) return true;
  // Fallback: a bot/operator authored a part
  const parts = conversation.conversation_parts?.conversation_parts || [];
  return parts.some((p: any) => p.author?.type === 'bot');
}

// ── Detect if the conversation was escalated to a human agent ──
// Signals: assigned to a human admin, OR a human (non-bot) admin replied,
// OR the user explicitly requested a human ("chat with agent" etc).
function detectEscalation(conversation: any): boolean {
  // Assigned to a human admin (not the AI/unassigned)
  if (conversation.admin_assignee_id && conversation.admin_assignee_id !== null) return true;

  // A human admin (not a bot) posted a reply
  const parts = conversation.conversation_parts?.conversation_parts || [];
  const humanReplied = parts.some((p: any) =>
    p.author?.type === 'admin' && p.body && p.author?.name && p.author.name.toLowerCase() !== 'fin'
  );
  if (humanReplied) return true;

  // User explicitly asked for a human
  const sourceBody = (conversation.source?.body || '').toLowerCase();
  const text = parts.map((p: any) => p.body || '').join(' ').toLowerCase() + ' ' + sourceBody;
  return /chat with agent|talk to (a |an )?(human|agent|person)|speak (to|with) (a |an )?(human|agent|someone)|need (a )?human/i.test(text);
}

export async function sendReply(
  conversationId: string,
  message: string,
  adminId?: string
): Promise<boolean> {
  try {
    const body: any = {
      message_type: 'comment',
      type: 'admin',
      body: message,
    };

    if (adminId) {
      body.admin_id = adminId;
    }

    const res = await fetchWithTimeout(
      `${API_BASE}/conversations/${conversationId}/reply`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Send reply error:', err);
    }

    return res.ok;
  } catch (error) {
    console.error('Error sending reply:', error);
    return false;
  }
}

export async function tagConversation(
  conversationId: string,
  tagName: string
): Promise<boolean> {
  try {
    const tagsRes = await fetchWithTimeout(`${API_BASE}/tags`);
    const tagsData = await tagsRes.json();
    let tag = tagsData.data?.find((t: any) => t.name === tagName);

    if (!tag) {
      const createRes = await fetchWithTimeout(`${API_BASE}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name: tagName }),
      });
      tag = await createRes.json();
    }

    const res = await fetchWithTimeout(
      `${API_BASE}/conversations/${conversationId}/tags`,
      {
        method: 'POST',
        body: JSON.stringify({ id: tag.id }),
      }
    );

    return res.ok;
  } catch (error) {
    console.error('Error tagging conversation:', error);
    return false;
  }
}