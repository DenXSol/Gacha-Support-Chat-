import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { conversationText, userName, issueType } = await request.json();

    if (!conversationText?.trim()) {
      return NextResponse.json({ error: 'No conversation text provided' }, { status: 400 });
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
        max_tokens: 800,
        system: `You are a support analyst for Gacha, a trading card platform.
Analyze support conversations and return structured summaries.
Return ONLY valid JSON, no prose, no markdown fences.`,
        messages: [
          {
            role: 'user',
            content: `Analyze this support conversation and return ONLY a JSON object:

{
  "summary": "2-3 sentence plain English summary of what happened and what the user needs",
  "problem": "one sentence describing the core problem",
  "current_status": "resolved" | "pending" | "escalation_needed" | "waiting_on_user",
  "next_steps": ["step 1", "step 2", "step 3"],
  "key_facts": ["important fact 1", "important fact 2"],
  "urgency": "low" | "medium" | "high" | "urgent",
  "suggested_reply": "a ready-to-send reply that addresses the current state of the conversation"
}

Customer: ${userName || 'Unknown'}
Issue type: ${issueType || 'general'}

Conversation:
${conversationText}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text?.trim() || '{}';

    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json({ success: true, data: parsed });
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Failed to parse summary',
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Summarize error:', error);
    return NextResponse.json({ error: error.message || 'Summary failed' }, { status: 500 });
  }
}