const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Robust JSON parser — strips markdown fences before parsing ────────────────
function parseJSON<T>(raw: string, fallback: T): T {
  try {
    // Strip ```json ... ``` or ``` ... ``` fences
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    try {
      // Try extracting first JSON object/array from response
      const match = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (match) return JSON.parse(match[1]);
    } catch { }
    return fallback;
  }
}

async function callClaude(prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in environment variables');
  }

  const messages: ClaudeMessage[] = [{ role: 'user', content: prompt }];
  const body: any = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages,
  };

  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ─── Analyze conversation ─────────────────────────────────────────────────────

export interface ConversationAnalysis {
  summary: string;
  issue_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  priority_reason: string;
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'angry';
  suggested_reply: string;
  key_facts: string[];
  action_needed: boolean;
}

export async function analyzeConversation(
  conversationText: string,
  userName: string
): Promise<ConversationAnalysis> {
  const fallback: ConversationAnalysis = {
    summary: 'Unable to analyze conversation',
    issue_type: 'general',
    priority: 'medium',
    priority_reason: 'Auto-analysis failed',
    sentiment: 'neutral',
    suggested_reply: '',
    key_facts: [],
    action_needed: false,
  };

  const system = `You are a support analyst for Gacha, a trading card platform.
Gacha sells Pokemon and collectible card packs, handles shipping of physical cards,
PSA grading/certification, withdrawals, deposits, and KYC verification.
Return ONLY valid JSON — no prose, no markdown fences, no backticks.`;

  const prompt = `Analyze this customer support conversation and return ONLY a JSON object:

{
  "summary": "1-2 sentence plain English summary of the issue",
  "issue_type": "withdrawal" | "deposit" | "shipping" | "complaint" | "card_redemption" | "kyc" | "general",
  "priority": "low" | "medium" | "high" | "urgent",
  "priority_reason": "brief reason for the priority level",
  "sentiment": "positive" | "neutral" | "frustrated" | "angry",
  "suggested_reply": "a helpful 2-3 sentence reply to send to the customer",
  "key_facts": ["fact 1", "fact 2"],
  "action_needed": true or false
}

Priority guide:
- urgent: fraud, lost money, account locked, very angry
- high: unresolved shipping, withdrawal stuck >3 days, KYC blocking purchase
- medium: shipping delay, deposit issue, unclear complaint
- low: general question, status check, minor issue

Customer: ${userName}
Conversation:
${conversationText}`;

  const raw = await callClaude(prompt, system, 1000);
  return parseJSON(raw, fallback);
}

// ─── Semantic search — batched across ALL conversations ───────────────────────

export async function semanticSearch(
  query: string,
  conversations: { id: string; text: string; user: string }[]
): Promise<{ id: string; relevance: number; reason: string }[]> {
  if (conversations.length === 0) return [];

  const system = `You are a search engine for a customer support system.
Return ONLY valid JSON array — no prose, no markdown fences, no backticks.`;

  const BATCH_SIZE = 50;
  const allResults: { id: string; relevance: number; reason: string }[] = [];

  // Search in batches of 50 to cover all 500 conversations
  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE);

    const prompt = `Search query: "${query}"

Find conversations relevant to this query. Return ONLY a JSON array sorted by relevance:
[{"id": "conv_id", "relevance": 0-100, "reason": "why it matches"}]

Only include conversations with relevance > 30. If nothing matches, return [].

Conversations:
${batch.map(c => `ID: ${c.id}\nUser: ${c.user}\nText: ${c.text.substring(0, 300)}`).join('\n---\n')}`;

    const raw = await callClaude(prompt, system, 2000);
    const batchResults = parseJSON<{ id: string; relevance: number; reason: string }[]>(raw, []);
    allResults.push(...batchResults);
  }

  // Sort by relevance descending and deduplicate
  const seen = new Set<string>();
  return allResults
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => b.relevance - a.relevance);
}

// ─── Detect top issues ────────────────────────────────────────────────────────

export interface TopIssue {
  issue: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
  example_ids: string[];
}

export async function detectTopIssues(
  conversations: { id: string; summary: string; issue_type: string }[]
): Promise<TopIssue[]> {
  if (conversations.length === 0) return [];

  const system = `You are a support analytics tool. Return ONLY valid JSON — no prose, no markdown fences.`;

  const prompt = `Analyze these ${conversations.length} support conversations and identify the top recurring issues.

Return ONLY a JSON array of the top 5-8 issues:
[{
  "issue": "clear description of the issue pattern",
  "count": number_of_conversations,
  "severity": "low" | "medium" | "high",
  "example_ids": ["id1", "id2"]
}]

Conversations:
${conversations.map(c => `ID:${c.id} | Type:${c.issue_type} | ${c.summary}`).join('\n')}`;

  const raw = await callClaude(prompt, system, 2000);
  return parseJSON(raw, []);
}

// Note: suggestReply() and categorizeWithAI() were removed as dead code — no
// callers. The reply-box "Polish" tool uses /api/claude/polish-reply, and
// categorization is handled by categorizeConversation() in lib/intercom.ts.