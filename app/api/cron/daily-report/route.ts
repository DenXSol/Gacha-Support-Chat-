import { NextRequest, NextResponse } from 'next/server';
import { buildDailyReport, formatSlackReport } from '@/lib/report-builder';

// Allow long execution for the sentiment analysis loop
export const maxDuration = 300;

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify this is a legit cron call from Vercel (or a manual call with the secret)
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await buildDailyReport(true);

    if (!SLACK_WEBHOOK_URL) {
      return NextResponse.json({
        success: false,
        error: 'SLACK_WEBHOOK_URL not configured',
        report,
      });
    }

    const slackMessage = formatSlackReport(report);

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackRes.ok) {
      const err = await slackRes.text();
      throw new Error(`Slack post failed: ${err}`);
    }

    return NextResponse.json({ success: true, posted: true, report });
  } catch (error: any) {
    console.error('Daily report error:', error);
    return NextResponse.json({ error: error.message || 'Report failed' }, { status: 500 });
  }
}