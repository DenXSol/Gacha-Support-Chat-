import { NextRequest, NextResponse } from 'next/server';
import { buildDailyReport, formatSlackReport } from '@/lib/report-builder';

export const maxDuration = 300;

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export async function POST(request: NextRequest) {
  try {
    const { postToSlack } = await request.json().catch(() => ({ postToSlack: false }));

    const report = await buildDailyReport(true);

    let posted = false;
    if (postToSlack && SLACK_WEBHOOK_URL) {
      const slackMessage = formatSlackReport(report);
      const slackRes = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage),
      });
      posted = slackRes.ok;
    }

    return NextResponse.json({ success: true, report, posted });
  } catch (error: any) {
    console.error('Manual report error:', error);
    return NextResponse.json({ error: error.message || 'Report failed' }, { status: 500 });
  }
}