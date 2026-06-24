import { NextRequest, NextResponse } from 'next/server';
import { fetchAllConversations } from '@/lib/intercom';

export async function GET(request: NextRequest) {
  try {
    const conversations = await fetchAllConversations();

    return NextResponse.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error('Error in fetch-conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
