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
  unread: boolean;
  replied: boolean;
}

export interface IntercomContact {
  id: string;
  name: string;
  email: string;
  custom_attributes?: {
    location?: string;
  };
}

const API_BASE = 'https://api.intercom.io';
const TOKEN = process.env.INTERCOM_API_TOKEN;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export async function fetchAllConversations(): Promise<IntercomConversation[]> {
  try {
    let allConversations: any[] = [];
    let startingAfter = null;

    // Paginate through conversations
    while (true) {
      const url = new URL(`${API_BASE}/conversations`);
      url.searchParams.append('per_page', '50');
      if (startingAfter) {
        url.searchParams.append('starting_after', startingAfter);
      }

      const res = await fetch(url.toString(), {
        headers,
        method: 'GET',
      });

      if (!res.ok) {
        console.error('Failed to fetch conversations:', res.statusText);
        break;
      }

      const data = await res.json();
      allConversations = [...allConversations, ...data.conversations];

      // Check if there are more pages
      if (data.pages?.next?.starting_after) {
        startingAfter = data.pages.next.starting_after;
      } else {
        break;
      }
    }

    // Fetch contact info for each conversation
    const enrichedConversations = await Promise.all(
      allConversations.map(async (conv) => {
        const contact = await fetchContact(conv.source?.id);
        return {
          id: conv.id,
          user_id: conv.source?.id || '',
          user_name: contact?.name || 'Unknown',
          user_email: contact?.email || 'Unknown',
          user_location: contact?.custom_attributes?.location || 'Unknown',
          issue_type: categorizeConversation(conv),
          status: conv.state || 'open',
          created_at: new Date(conv.created_at * 1000).toISOString(),
          updated_at: new Date(conv.updated_at * 1000).toISOString(),
          last_message: getLastMessage(conv),
          unread: conv.unread?.admin || false,
          replied: hasAdminReply(conv),
        };
      })
    );

    return enrichedConversations;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

async function fetchContact(contactId: string): Promise<IntercomContact | null> {
  try {
    const res = await fetch(`${API_BASE}/contacts/${contactId}`, {
      headers,
      method: 'GET',
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      id: data.id,
      name: data.name || 'Unknown',
      email: data.email || 'Unknown',
      custom_attributes: data.custom_attributes,
    };
  } catch (error) {
    console.error('Error fetching contact:', error);
    return null;
  }
}

export function categorizeConversation(conversation: any): string {
  const text = (
    getLastMessage(conversation) +
    ' ' +
    (conversation.title || '')
  ).toLowerCase();

  if (/withdraw|cash out|payout|bank/i.test(text)) return 'withdrawal';
  if (/deposit|payment|charge|crypto|top up/i.test(text)) return 'deposit';
  if (/ship|delivery|tracking|arrived|package/i.test(text)) return 'shipping';
  if (/broken|damaged|wrong|issue|problem|refund/i.test(text)) return 'complaint';
  if (/redeem|certificate|psa|claim/i.test(text)) return 'card_redemption';
  if (/verify|identity|documents|kyc|proof/i.test(text)) return 'kyc';

  return 'general';
}

function getLastMessage(conversation: any): string {
  if (conversation.conversation_parts?.conversation_parts?.[0]) {
    return conversation.conversation_parts.conversation_parts[0].body || '';
  }
  return conversation.title || '';
}

function hasAdminReply(conversation: any): boolean {
  if (!conversation.conversation_parts?.conversation_parts) {
    return false;
  }

  return conversation.conversation_parts.conversation_parts.some(
    (part: any) => part.author?.type === 'admin'
  );
}

export async function sendReply(
  conversationId: string,
  message: string,
  messageType: string = 'comment'
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/parts`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        body: message,
        part_type: messageType,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error('Error sending reply:', error);
    return false;
  }
}

export async function tagConversation(
  conversationId: string,
  tag: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/tags`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        tag,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error('Error tagging conversation:', error);
    return false;
  }
}
