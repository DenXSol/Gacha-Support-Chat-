import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    try {
      const match = raw.match(/(\{[\s\S]*\})/);
      if (match) return JSON.parse(match[1]);
    } catch { }
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, texts, targetLanguage, autoDetect } = await request.json();

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // ── Batch mode: translate a whole thread (array of messages) in one call ──
    if (Array.isArray(texts)) {
      if (texts.length === 0) return NextResponse.json({ success: true, translations: [] });
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
          max_tokens: 2000,
          system: `You are a translation assistant. Translate each input message to ${target}. If a message is already in ${target}, return it unchanged. Return ONLY a raw JSON array of the translated strings in the SAME ORDER — no markdown fences, no prose. Example: ["hello","how are you"]`,
          messages: [{ role: 'user', content: `Translate each of these ${texts.length} messages to ${target}. Return a JSON array of ${texts.length} strings:\n\n${JSON.stringify(texts)}` }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error: ${err}`);
      }
      const data = await res.json();
      const raw = (data.content?.[0]?.text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let translations: string[];
      try {
        translations = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');
      } catch {
        translations = texts; // fall back to originals on parse failure
      }
      // Guard length mismatch — fall back to original where missing
      translations = texts.map((t: string, i: number) => translations[i] ?? t);
      return NextResponse.json({ success: true, translations });
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
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
        system: `You are a translation assistant.
Return ONLY a raw JSON object — NO markdown fences, NO backticks, NO prose, NO explanation.
Example output: {"translated": "hello", "detectedLanguage": "Spanish", "targetLanguage": "English"}`,
        messages: [
          {
            role: 'user',
            content: autoDetect
              ? `Detect the language of this text and translate it to English. If it is already English, set translated to the original text and detectedLanguage to "English".\n\nText: ${text}`
              : `Translate this text to ${target}. Detect what language it is written in.\n\nText: ${text}`,
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

    const parsed = parseJSON<{ translated: string; detectedLanguage: string; targetLanguage: string }>(
      raw,
      { translated: text, detectedLanguage: 'Unknown', targetLanguage: target }
    );

    return NextResponse.json({ success: true, ...parsed });
  } catch (error: any) {
    console.error('Translate error:', error);
    return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 });
  }
}