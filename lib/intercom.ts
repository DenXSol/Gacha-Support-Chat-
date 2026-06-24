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
  custom_attributes?: {
    location?: string;
    [key: string]: any;
  };
}

const API_BASE = 'https://api.intercom.io';
const TOKEN = process.env.INTERCOM_API_TOKEN;

// FIX: Added Intercom-Version header (required by newer Intercom API)
// FIX: Added AbortController for timeout handling
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

export async function fetchAllConversations(): Promise<IntercomConversation[]> {
  try {
    let allConversations: any[] = [];
    let startingAfter: string | null = null;
    let page = 0;
    const MAX_PAGES = 10; // safety cap

    while (page < MAX_PAGES) {
      page++;
      const url = new URL(`${API_BASE}/conversations`);
      url.searchParams.append('per_page', '50');
      url.searchParams.append('display_as', 'plaintext');
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

    // Enrich conversations with contact info
    const enriched = await Promise.all(
      allConversations.map(async (conv) => {
        const contactId = conv.source?.author?.id || conv.contacts?.contacts?.[0]?.id;
        const contact = contactId ? await fetchContact(contactId) : null;

        return {
          id: conv.id,
          user_id: contactId || '',
          user_name: contact?.name || conv.source?.author?.name || 'Unknown',
          user_email: contact?.email || 'Unknown',
          user_location: contact?.custom_attributes?.location || 'Unknown',
          issue_type: categorizeConversation(conv),
          status: conv.state || 'open',
          created_at: new Date(conv.created_at * 1000).toISOString(),
          updated_at: new Date(conv.updated_at * 1000).toISOString(),
          last_message: getLastMessage(conv),
          full_messages: extractMessages(conv),
          unread: conv.read === false,
          replied: hasAdminReply(conv),
          tags: conv.tags?.tags?.map((t: any) => t.name) || [],
        };
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

    return {
      id: conv.id,
      user_id: contactId || '',
      user_name: contact?.name || conv.source?.author?.name || 'Unknown',
      user_email: contact?.email || 'Unknown',
      user_location: contact?.custom_attributes?.location || 'Unknown',
      issue_type: categorizeConversation(conv),
      status: conv.state || 'open',
      created_at: new Date(conv.created_at * 1000).toISOString(),
      updated_at: new Date(conv.updated_at * 1000).toISOString(),
      last_message: getLastMessage(conv),
      full_messages: extractMessages(conv),
      unread: conv.read === false,
      replied: hasAdminReply(conv),
      tags: conv.tags?.tags?.map((t: any) => t.name) || [],
    };
  } catch (error) {
    console.error('Error fetching single conversation:', error);
    return null;
  }
}

async function fetchContact(contactId: string): Promise<IntercomContact | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/contacts/${contactId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      name: data.name || 'Unknown',
      email: data.email || 'Unknown',
      custom_attributes: data.custom_attributes || {},
    };
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

  // First message (source)
  if (conversation.source?.body) {
    parts.push({
      author_type: 'user',
      author_name: conversation.source.author?.name || 'User',
      body: conversation.source.body,
      created_at: new Date(conversation.created_at * 1000).toISOString(),
    });
  }

  // Conversation parts
  const convParts = conversation.conversation_parts?.conversation_parts || [];
  for (const part of convParts) {
    if (!part.body) continue;
    parts.push({
      author_type: part.author?.type === 'admin' ? 'admin' : 'user',
      author_name: part.author?.name || (part.author?.type === 'admin' ? 'Support' : 'User'),
      body: part.body,
      created_at: new Date(part.created_at * 1000).toISOString(),
    });
  }

  return parts;
}

function getLastMessage(conversation: any): string {
  const parts = conversation.conversation_parts?.conversation_parts;
  if (parts && parts.length > 0) {
    // Get last non-empty part
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
    // First get or create the tag
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

    // Apply tag to conversation
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