import { fetchAllConversations, IntercomConversation } from '@/lib/intercom';
import { analyzeConversation } from '@/lib/claude';

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

  let sentiment = { positive: 0, neutral: 0, frustrated: 0, angry: 0, score: 0 };
  let urgentOpen = 0;

  if (analyzeSentiment && todayConvs.length > 0) {
    for (const c of todayConvs) {
      try {
        const text = (c.full_messages || []).map(m => `[${m.author_type === 'admin' ? 'Agent' : m.author_name}]: ${m.body}`).join('\n') || c.last_message;
        const analysis = await analyzeConversation(text, c.user_name);
        sentiment[analysis.sentiment] = (sentiment[analysis.sentiment] || 0) + 1;
        if (analysis.priority === 'urgent' && c.status === 'open') urgentOpen++;
      } catch {
        sentiment.neutral++;
      }
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
    topIssues,
    topLocations,
  };
}

export function formatSlackReport(r: DailyReport): any {
  const issueLabel = (t: string) => t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const trend = r.pctChange > 0 ? `▲ ${r.pctChange}%` : r.pctChange < 0 ? `▼ ${Math.abs(r.pctChange)}%` : 'no change';

  const meterFill = Math.round(r.sentiment.score / 10);
  const meter = '🟩'.repeat(meterFill) + '⬜'.repeat(10 - meterFill);
  const mood = r.sentiment.score >= 70 ? '😊 Healthy' : r.sentiment.score >= 50 ? '😐 OK' : r.sentiment.score >= 30 ? '😤 Tense' : '😠 Rough';

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
      { type: 'section', text: { type: 'mrkdwn', text: `*🌡 Team Sentiment:* ${mood}  (${r.sentiment.score}/100)\n${meter}\n😊 ${r.sentiment.positive}  ·  😐 ${r.sentiment.neutral}  ·  😤 ${r.sentiment.frustrated}  ·  😠 ${r.sentiment.angry}` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*🔝 Top Issues Today*\n${topIssuesText}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*📍 Top Locations*\n${topLocationsText}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Generated ${new Date().toISOString()} · Gacha Support Dashboard` }] },
    ],
  };
}