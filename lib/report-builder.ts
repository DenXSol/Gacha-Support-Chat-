import { fetchAllConversations, IntercomConversation } from '@/lib/intercom';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export interface DailyReport {
  date: string;
  totalToday: number;
  totalYesterday: number;
  pctChange: number;
  newToday: number;
  escalated: number;
  waitingOnAgent: number;
  resolvedByAI: number;
  solved: number;
  openCarryover: number;
  urgentOpen: number;
  sentiment: { positive: number; neutral: number; frustrated: number; angry: number; score: number };
  // Customer happiness from Intercom's native CSAT ratings — free, no AI tokens.
  customerHappiness: {
    score: number;        // 0–100 (avg star rating mapped); -1 when no ratings yet
    avgRating: number;    // 1–5
    ratedCount: number;   // conversations today that have a CSAT rating
    responseRate: number; // % of today's conversations that were rated
    breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  };
  topIssues: { type: string; count: number; summary: string }[];
  topLocations: { location: string; count: number }[];
}

const ISSUE_FALLBACK: Record<string, string> = {
  withdrawal: 'Users withdrawing funds or cards — payout delays, transfers, stuck withdrawals',
  deposit: 'Deposit and payment issues — failed charges, crypto top-ups, missing balance',
  shipping: 'Physical card delivery — tracking questions, delays, lost packages',
  complaint: 'Damaged/wrong cards, refund requests, disputes, fraud concerns',
  card_redemption: 'Redeeming pulled cards — PSA grading, vault claims, certificate issues',
  kyc: 'Identity verification — document submission, KYC blocking purchases',
  general: 'General questions — how the platform works, account help, misc inquiries',
};

// Analyze the actual messages in a category to surface the real recurring pattern
async function summarizeIssuePattern(issueType: string, messages: string[]): Promise<string> {
  if (!ANTHROPIC_API_KEY || messages.length === 0) {
    return ISSUE_FALLBACK[issueType] || 'Various customer inquiries';
  }
  try {
    const sample = messages.slice(0, 15).map((m, i) => `${i + 1}. ${m.substring(0, 200)}`).join('\n');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You are a support analyst. Identify the single most common specific pattern across these messages. Return ONE concise sentence describing what most users in this category are actually asking about today. Be specific — name the actual recurring problem (e.g. "Many users report cards stuck in vault processing and cannot redeem"), not a generic category description. No preamble, no quotes.',
        messages: [{ role: 'user', content: `These are ${issueType} support messages from today. What is the most common specific issue users are raising?\n\n${sample}` }],
      }),
    });
    if (!res.ok) return ISSUE_FALLBACK[issueType] || 'Various inquiries';
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || ISSUE_FALLBACK[issueType] || 'Various inquiries';
  } catch {
    return ISSUE_FALLBACK[issueType] || 'Various inquiries';
  }
}

function isOnDate(iso: string, dateStr: string): boolean {
  return iso.slice(0, 10) === dateStr;
}

export async function buildDailyReport(analyzeSentiment = true): Promise<DailyReport> {
  const all = await fetchAllConversations();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const todayConvs = all.filter(c => isOnDate(c.created_at, todayStr));
  const yesterdayConvs = all.filter(c => isOnDate(c.created_at, yesterday));

  const totalToday = todayConvs.length;
  const totalYesterday = yesterdayConvs.length;
  const pctChange = totalYesterday > 0
    ? Math.round(((totalToday - totalYesterday) / totalYesterday) * 100)
    : 0;

  // Escalation & Fin AI — uses Intercom's native fields (see lib/intercom.ts)
  const escalatedConvs = todayConvs.filter(c => c.escalated_to_human);
  const escalated = escalatedConvs.length;
  const waitingOnAgent = escalatedConvs.filter(c => !c.replied && c.status === 'open').length;

  const resolvedByAI = todayConvs.filter(c =>
    c.ai_participated &&
    !c.escalated_to_human &&
    (c.status === 'closed' || (c.tags || []).some(t => t.toLowerCase() === 'solved'))
  ).length;

  const solved = todayConvs.filter(c =>
    c.status === 'closed' ||
    (c.tags || []).some(t => t.toLowerCase() === 'solved')
  ).length;

  const openCarryover = all.filter(c => c.status === 'open' && !isOnDate(c.created_at, todayStr)).length;

  // Top issues with AI-generated pattern summaries
  const issueCounts: Record<string, number> = {};
  const issueMessages: Record<string, string[]> = {};
  todayConvs.forEach(c => {
    issueCounts[c.issue_type] = (issueCounts[c.issue_type] || 0) + 1;
    if (!issueMessages[c.issue_type]) issueMessages[c.issue_type] = [];
    issueMessages[c.issue_type].push(c.last_message.replace(/<[^>]*>/g, ''));
  });

  const sortedIssues = Object.entries(issueCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topIssues = await Promise.all(
    sortedIssues.map(async (i) => ({
      type: i.type,
      count: i.count,
      summary: await summarizeIssuePattern(i.type, issueMessages[i.type] || []),
    }))
  );

  const locCounts: Record<string, number> = {};
  todayConvs.forEach(c => {
    if (c.user_location && c.user_location !== 'Unknown') {
      locCounts[c.user_location] = (locCounts[c.user_location] || 0) + 1;
    }
  });
  const topLocations = Object.entries(locCounts)
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // ── Customer happiness from Intercom CSAT (free — no AI) ──
  const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let ratedCount = 0;
  todayConvs.forEach(c => {
    const r = c.csat_rating;
    if (typeof r === 'number' && r >= 1 && r <= 5) {
      breakdown[r as 1 | 2 | 3 | 4 | 5]++;
      ratingSum += r;
      ratedCount++;
    }
  });
  const avgRating = ratedCount > 0 ? ratingSum / ratedCount : 0;
  const customerHappiness = {
    score: ratedCount > 0 ? Math.round(((avgRating - 1) / 4) * 100) : -1, // 1★→0, 5★→100; -1 = no data
    avgRating: Math.round(avgRating * 10) / 10,
    ratedCount,
    responseRate: totalToday > 0 ? Math.round((ratedCount / totalToday) * 100) : 0,
    breakdown,
  };

  // ── Team sentiment (AI) — batched to save tokens: one call per ~40 convos
  //    instead of one call per conversation. Skippable via analyzeSentiment.
  let sentiment = { positive: 0, neutral: 0, frustrated: 0, angry: 0, score: 0 };
  let urgentOpen = 0;

  if (analyzeSentiment && todayConvs.length > 0) {
    const batch = await batchSentiment(todayConvs);
    for (const c of todayConvs) {
      const s = batch[c.id];
      const mood = s?.sentiment || 'neutral';
      sentiment[mood] = (sentiment[mood] || 0) + 1;
      if (s?.urgent && c.status === 'open') urgentOpen++;
    }
    const total = sentiment.positive + sentiment.neutral + sentiment.frustrated + sentiment.angry;
    sentiment.score = total > 0
      ? Math.round(((sentiment.positive * 100 + sentiment.neutral * 66 + sentiment.frustrated * 33) / total))
      : 0;
  }

  return {
    date: todayStr,
    totalToday,
    totalYesterday,
    pctChange,
    newToday: totalToday,
    escalated,
    waitingOnAgent,
    resolvedByAI,
    solved,
    openCarryover,
    urgentOpen,
    sentiment,
    customerHappiness,
    topIssues,
    topLocations,
  };
}

// ── Batched team sentiment ────────────────────────────────────────────────────
// One Claude call per ~40 conversations (vs one per conversation) — large token
// saving. Returns a map of conversation id → { sentiment, urgent }.
type Mood = 'positive' | 'neutral' | 'frustrated' | 'angry';
async function batchSentiment(
  convs: IntercomConversation[]
): Promise<Record<string, { sentiment: Mood; urgent: boolean }>> {
  const out: Record<string, { sentiment: Mood; urgent: boolean }> = {};
  if (!ANTHROPIC_API_KEY) return out;

  const BATCH = 40;
  for (let i = 0; i < convs.length; i += BATCH) {
    const slice = convs.slice(i, i + BATCH);
    const lines = slice.map(c => {
      const msg = (c.last_message || '').replace(/<[^>]*>/g, '').substring(0, 240);
      return `ID:${c.id} | ${msg}`;
    }).join('\n');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: 'You score customer support messages. Return ONLY a JSON array, no prose, no markdown fences. Each item: {"id":"<id>","sentiment":"positive"|"neutral"|"frustrated"|"angry","urgent":true|false}. urgent = fraud, lost money, locked account, or very angry.',
          messages: [{ role: 'user', content: `Score each message:\n${lines}` }],
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const raw = (data.content?.[0]?.text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');
      for (const item of arr) {
        if (item?.id) {
          const m: Mood = ['positive', 'neutral', 'frustrated', 'angry'].includes(item.sentiment) ? item.sentiment : 'neutral';
          out[item.id] = { sentiment: m, urgent: item.urgent === true };
        }
      }
    } catch { /* leave unscored → treated as neutral by caller */ }
  }
  return out;
}

export function formatSlackReport(r: DailyReport): any {
  const issueLabel = (t: string) => t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const trend = r.pctChange > 0 ? `▲ ${r.pctChange}%` : r.pctChange < 0 ? `▼ ${Math.abs(r.pctChange)}%` : 'no change';

  const meterFill = Math.round(r.sentiment.score / 10);
  const meter = '🟩'.repeat(meterFill) + '⬜'.repeat(10 - meterFill);
  const mood = r.sentiment.score >= 70 ? '😊 Healthy' : r.sentiment.score >= 50 ? '😐 OK' : r.sentiment.score >= 30 ? '😤 Tense' : '😠 Rough';

  const ch = r.customerHappiness;
  const csatText = ch.ratedCount > 0
    ? `*😀 Customer Happiness (CSAT):* ${ch.score}/100  ·  ${ch.avgRating}/5 avg\n${'⭐'.repeat(Math.round(ch.avgRating))} from ${ch.ratedCount} rating${ch.ratedCount !== 1 ? 's' : ''} (${ch.responseRate}% of tickets rated)`
    : '*😀 Customer Happiness (CSAT):* _No ratings submitted yet today_';

  const topIssuesText = r.topIssues.length
    ? r.topIssues.map((i, idx) => `${idx + 1}. *${issueLabel(i.type)}* — ${i.count}\n     _${i.summary}_`).join('\n')
    : '_No tickets today_';

  const topLocationsText = r.topLocations.length
    ? r.topLocations.map(l => `• ${l.location} — ${l.count}`).join('\n')
    : '_No location data_';

  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📊 Gacha Support Daily Report — ${r.date}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: '*📈 Volume*' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Today:*\n${r.totalToday}  (${trend} vs yesterday)` },
          { type: 'mrkdwn', text: `*New Opened:*\n${r.newToday}` },
          { type: 'mrkdwn', text: `*Escalated to Agent:*\n${r.escalated}` },
          { type: 'mrkdwn', text: `*Waiting on Agent:*\n${r.waitingOnAgent}` },
          { type: 'mrkdwn', text: `*Resolved by Fin AI:*\n${r.resolvedByAI}` },
          { type: 'mrkdwn', text: `*Solved (total):*\n${r.solved}` },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*✅ Resolution*' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Solved:*\n${r.solved}` },
          { type: 'mrkdwn', text: `*Open Carryover:*\n${r.openCarryover}` },
          { type: 'mrkdwn', text: `*Urgent Still Open:*\n${r.urgentOpen}` },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: csatText } },
      { type: 'section', text: { type: 'mrkdwn', text: `*🌡 Team Sentiment (AI):* ${mood}  (${r.sentiment.score}/100)\n${meter}\n😊 ${r.sentiment.positive}  ·  😐 ${r.sentiment.neutral}  ·  😤 ${r.sentiment.frustrated}  ·  😠 ${r.sentiment.angry}` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*🔝 Top Issues Today*\n${topIssuesText}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*📍 Top Locations*\n${topLocationsText}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Generated ${new Date().toISOString()} · Gacha Support Dashboard` }] },
    ],
  };
}