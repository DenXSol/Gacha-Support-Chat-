import { NextRequest, NextResponse } from 'next/server';
import { fetchSingleConversation } from '@/lib/intercom';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversation ID' }, { status: 400 });
    }

    const conversation = await fetchSingleConversation(conversationId);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: conversation });
  } catch (error: any) {
    console.error('Error fetching single conversation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}