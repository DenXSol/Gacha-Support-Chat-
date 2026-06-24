import { NextRequest, NextResponse } from 'next/server';
import { detectTopIssues } from '@/lib/claude';

export async function POST(request: NextRequest) {
  try {
    const { conversations } = await request.json();

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: 'No conversations provided' }, { status: 400 });
    }

    const topIssues = await detectTopIssues(conversations);

    return NextResponse.json({
      success: true,
      data: topIssues,
      analyzed: conversations.length,
    });
  } catch (error: any) {
    console.error('Top issues error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect top issues' },
      { status: 500 }
    );
  }
}