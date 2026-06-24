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
  unread: boolean;
  replied: boolean;
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
