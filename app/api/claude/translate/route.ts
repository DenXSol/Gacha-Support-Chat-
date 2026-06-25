import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { text, targetLanguage, autoDetect } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const target = targetLanguage || 'English';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are a translation assistant. Translate text accurately and naturally.
Return ONLY a JSON object with these exact fields:
{
  "translated": "the translated text",
  "detectedLanguage": "the language the original text was written in",
  "targetLanguage": "the language you translated to"
}
No prose, no explanation, just the JSON.`,
        messages: [
          {
            role: 'user',
            content: autoDetect
              ? `Detect the language of this text and translate it to English. If it is already English, translate it to the most likely language the user speaks based on context clues, or just return it as-is with detectedLanguage: "English".\n\nText: ${text}`
              : `Translate this text to ${target}.\n\nText: ${text}`,
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
      return NextResponse.json({ success: true, ...parsed });
    } catch {
      return NextResponse.json({ success: true, translated: raw, detectedLanguage: 'Unknown', targetLanguage: target });
    }
  } catch (error: any) {
    console.error('Translate error:', error);
    return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 });
  }
}