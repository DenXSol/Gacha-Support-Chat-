export interface MessagePart {
  author_type: 'user' | 'admin' | 'bot';
  author_name: string;
  body: string;
  created_at: string;
}

export interface Conversation {
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
  // AI fields (populated after analysis)
  ai_summary?: string;
  ai_priority?: 'low' | 'medium' | 'high' | 'urgent';
  ai_priority_reason?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'frustrated' | 'angry';
  ai_suggested_reply?: string;
  ai_action_needed?: boolean;
}

export interface Analytics {
  total_conversations: number;
  total_unresolved: number;
  top_issues: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  resolution_rates: Array<{
    type: string;
    resolved: number;
    total: number;
    percentage: number;
  }>;
}

export interface FilterOptions {
  issue_type?: string;
  status?: string;
  location?: string;
  date_range?: string;
  search?: string;
}