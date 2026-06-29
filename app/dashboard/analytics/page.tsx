'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Conversation, Analytics } from '@/types/index';

export default function AnalyticsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const router = useRouter();

  useEffect(() => { fetchAndAnalyze(); }, []);

  const fetchAndAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intercom/fetch-conversations');
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
        generateAnalytics(data.data);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateAnalytics = (convs: Conversation[]) => {
    const issueCounts: Record<string, number> = {};
    const issueResolved: Record<string, number> = {};

    convs.forEach(conv => {
      issueCounts[conv.issue_type] = (issueCounts[conv.issue_type] || 0) + 1;
      if (conv.status === 'closed' || conv.replied) {
        issueResolved[conv.issue_type] = (issueResolved[conv.issue_type] || 0) + 1;
      }
    });

    const topIssues = Object.entries(issueCounts)
      .map(([type, count]) => ({ type, count, percentage: Math.round((count / convs.length) * 100) }))
      .sort((a, b) => b.count - a.count);

    const resolutionRates = Object.entries(issueCounts)
      .map(([type, total]) => ({ type, resolved: issueResolved[type] || 0, total, percentage: Math.round(((issueResolved[type] || 0) / total) * 100) }))
      .sort((a, b) => b.percentage - a.percentage);

    setAnalytics({ total_conversations: convs.length, total_unresolved: convs.filter(c => c.status === 'open').length, top_issues: topIssues, resolution_rates: resolutionRates });
  };

  // ── Drill down: navigate to conversations filtered by issue type ──
  const drillDown = (issueType: string) => {
    router.push(`/dashboard/conversations?issue=${encodeURIComponent(issueType)}`);
  };

  // ── Daily report ──
  const generateReport = async (postToSlack: boolean) => {
    setGeneratingReport(true);
    if (postToSlack) toast('Generating report and posting to Slack...');
    else toast('Generating report preview...');
    try {
      const res = await fetch('/api/reports/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postToSlack }),
      });
      const data = await res.json();
      if (data.success) {
        setReport(data.report);
        if (postToSlack) {
          data.posted ? toast.success('Posted to Slack! 🎉') : toast.error('Report built but Slack post failed — check SLACK_WEBHOOK_URL');
        } else {
          toast.success('Report preview ready');
        }
      } else {
        toast.error(data.error || 'Report failed');
      }
    } catch {
      toast.error('Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  };

  const ISSUE_COLORS: Record<string, string> = {
    withdrawal: '#3b82f6', deposit: '#f59e0b', shipping: '#10b981',
    complaint: '#ef4444', card_redemption: '#8b5cf6', kyc: '#6366f1', general: '#6b7280',
  };

  const issueLabel = (type: string) => type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading analytics...</p>
    </div>
  );

  if (!analytics) return null;

  const resolutionRate = Math.round(((analytics.total_conversations - analytics.total_unresolved) / analytics.total_conversations) * 100);

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Analytics</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>Click any issue type to jump to those conversations →</p>

      {/* ── Daily Report card ── */}
      <div style={{ ...cardStyle, marginBottom: 24, background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>📊 Daily Support Report</div>
            <div style={{ color: '#a5b4fc', fontSize: 12, marginTop: 2 }}>Auto-posts to Slack daily at 00:00 UTC · or generate now</div>
          </div>
          <button onClick={() => generateReport(false)} disabled={generatingReport}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: generatingReport ? 'not-allowed' : 'pointer', opacity: generatingReport ? 0.6 : 1 }}>
            {generatingReport ? '⏳ Generating...' : '👁 Preview Report'}
          </button>
          <button onClick={() => generateReport(true)} disabled={generatingReport}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: generatingReport ? 'not-allowed' : 'pointer', opacity: generatingReport ? 0.6 : 1 }}>
            {generatingReport ? '⏳' : '📤 Send to Slack Now'}
          </button>
        </div>

        {report && (
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Report Preview — {report.date}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Total Today', value: `${report.totalToday} (${report.pctChange >= 0 ? '▲' : '▼'}${Math.abs(report.pctChange)}%)`, color: '#1e293b' },
                { label: 'Resolved by Fin AI', value: report.resolvedByAI, color: '#10b981' },
                { label: 'Escalated to Agent', value: report.escalated, color: '#f59e0b' },
                { label: 'Waiting on Agent', value: report.waitingOnAgent, color: '#ef4444' },
                { label: 'Solved (total)', value: report.solved, color: '#10b981' },
                { label: 'Open Carryover', value: report.openCarryover, color: '#6366f1' },
                { label: 'Urgent Open', value: report.urgentOpen, color: '#ef4444' },
              ].map(m => (
                <div key={m.label} style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Sentiment meter */}
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
                Team Sentiment: {report.sentiment.score}/100 {report.sentiment.score >= 70 ? '😊' : report.sentiment.score >= 50 ? '😐' : report.sentiment.score >= 30 ? '😤' : '😠'}
              </div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${report.sentiment.score}%`, background: report.sentiment.score >= 70 ? '#10b981' : report.sentiment.score >= 40 ? '#f59e0b' : '#ef4444', transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                😊 {report.sentiment.positive} · 😐 {report.sentiment.neutral} · 😤 {report.sentiment.frustrated} · 😠 {report.sentiment.angry}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>TOP ISSUES</div>
                {report.topIssues.map((i: any, idx: number) => (
                  <div key={i.type} style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{idx + 1}. {i.type.replace('_', ' ')} — {i.count}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{i.summary}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>TOP LOCATIONS</div>
                {report.topLocations.length ? report.topLocations.map((l: any) => (
                  <div key={l.location} style={{ fontSize: 13, color: '#1e293b', padding: '2px 0' }}>• {l.location} — {l.count}</div>
                )) : <div style={{ fontSize: 13, color: '#94a3b8' }}>No location data</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Conversations', value: analytics.total_conversations, color: '#1e293b' },
          { label: 'Unresolved', value: analytics.total_unresolved, color: '#ef4444' },
          { label: 'Resolution Rate', value: `${resolutionRate}%`, color: '#10b981' },
        ].map(card => (
          <div key={card.label} style={cardStyle}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Top Issues */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Top Issues This Week</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Click to view those conversations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analytics.top_issues.map(issue => (
              <div key={issue.type} onClick={() => drillDown(issue.type)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, border: `1px solid ${ISSUE_COLORS[issue.type]}30`, background: `${ISSUE_COLORS[issue.type]}08`, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${ISSUE_COLORS[issue.type]}18`; (e.currentTarget as HTMLDivElement).style.transform = 'translateX(4px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = `${ISSUE_COLORS[issue.type]}08`; (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)'; }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: ISSUE_COLORS[issue.type], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{issueLabel(issue.type)}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{issue.percentage}%</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: ISSUE_COLORS[issue.type], minWidth: 40, textAlign: 'right' }}>{issue.count}</span>
                <span style={{ fontSize: 12, color: ISSUE_COLORS[issue.type] }}>→</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution Rate */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Resolution Rate by Type</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Click to view those conversations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analytics.resolution_rates.map(item => (
              <div key={item.type} onClick={() => drillDown(item.type)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; (e.currentTarget as HTMLDivElement).style.transform = 'translateX(4px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)'; }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', minWidth: 120 }}>{issueLabel(item.type)}</span>
                <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${item.percentage}%`, background: item.percentage >= 70 ? '#10b981' : item.percentage >= 40 ? '#f59e0b' : '#ef4444', transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right', color: item.percentage >= 70 ? '#10b981' : item.percentage >= 40 ? '#f59e0b' : '#ef4444' }}>{item.percentage}%</span>
                <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 40, textAlign: 'right' }}>{item.resolved}/{item.total}</span>
                <span style={{ fontSize: 12, color: '#6366f1' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };