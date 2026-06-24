import { NextRequest, NextResponse } from 'next/server';
import { analyzeConversation } from '@/lib/claude';
import { fetchSingleConversation } from '@/lib/intercom';

export async function POST(request: NextRequest) {
  try {
    const { conversationId, conversationText, userName } = await request.json();

    let textToAnalyze = conversationText;
    let name = userName || 'Customer';

    // If no text provided, fetch from Intercom
    if (!textToAnalyze && conversationId) {
      const conv = await fetchSingleConversation(conversationId);
      if (conv) {
        textToAnalyze = conv.full_messages
          ?.map(m => `[${m.author_type === 'admin' ? 'Support' : m.author_name}]: ${m.body}`)
          .join('\n') || conv.last_message;
        name = conv.user_name;
      }
    }

    if (!textToAnalyze) {
      return NextResponse.json(
        { error: 'No conversation text provided' },
        { status: 400 }
      );
    }

    const analysis = await analyzeConversation(textToAnalyze, name);

    return NextResponse.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error('Analyze conversation error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}