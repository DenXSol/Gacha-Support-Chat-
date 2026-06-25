import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { text, context } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You are a writing assistant for a customer support agent at Gacha, a trading card platform. 
Your job is to polish support replies — fix spelling, improve flow, make the tone warm and professional.
Keep the same meaning and length. Don't add new information. Don't make it sound robotic.
Return ONLY the improved text, nothing else — no explanation, no quotes, no preamble.`,
        messages: [
          {
            role: 'user',
            content: `Polish this support reply. Fix any spelling or grammar issues and make it flow better while keeping it natural and friendly.${context ? `\n\nConversation context: ${context}` : ''}\n\nReply to polish:\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const data = await res.json();
    const polished = data.content?.[0]?.text?.trim() || text;

    return NextResponse.json({ success: true, original: text, polished });
  } catch (error: any) {
    console.error('Polish reply error:', error);
    return NextResponse.json({ error: error.message || 'Failed to polish reply' }, { status: 500 });
  }
}