import { NextRequest, NextResponse } from 'next/server';
import { sendReply } from '@/lib/intercom';

export async function POST(request: NextRequest) {
  try {
    const { conversationId, message } = await request.json();

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: 'Missing conversationId or message' },
        { status: 400 }
      );
    }

    const success = await sendReply(conversationId, message, 'comment');

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to send reply' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Reply sent successfully',
    });
  } catch (error) {
    console.error('Error in send-reply:', error);
    return NextResponse.json(
      { error: 'Failed to send reply' },
      { status: 500 }
    );
  }
}
