import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/claude';
import { fetchAllConversations } from '@/lib/intercom';

export async function POST(request: NextRequest) {
  try {
    const { query, conversations: providedConversations } = await request.json();

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Query too short' }, { status: 400 });
    }

    // Use provided conversations or fetch from Intercom
    let conversations = providedConversations;
    if (!conversations) {
      const fetched = await fetchAllConversations();
      conversations = fetched.map(c => ({
        id: c.id,
        text: `${c.last_message} ${c.user_name} ${c.issue_type}`,
        user: c.user_name,
      }));
    }

    const results = await semanticSearch(query, conversations);

    return NextResponse.json({
      success: true,
      query,
      results,
      total: results.length,
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}