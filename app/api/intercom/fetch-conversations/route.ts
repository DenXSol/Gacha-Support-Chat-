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
  } catch (error: any) {
    console.error('Error in fetch-conversations:', error);

    // Give a clear error message for the timeout case
    const isTimeout = error.message?.includes('timed out') || error.message?.includes('ECONNREFUSED');
    const message = isTimeout
      ? 'Intercom API timed out. Check your INTERCOM_API_TOKEN and network connection.'
      : error.message || 'Failed to fetch conversations';

    return NextResponse.json(
      {
        error: message,
        tip: isTimeout
          ? 'Try: (1) Verify INTERCOM_API_TOKEN in .env.local is correct, (2) Check Intercom API status at status.intercom.io'
          : undefined,
      },
      { status: 500 }
    );
  }
}