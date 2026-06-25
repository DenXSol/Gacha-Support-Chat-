'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Conversation, Analytics } from '@/types/index';

export default function AnalyticsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchAndAnalyze();
  }, []);

  const fetchAndAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intercom/fetch-conversations');
      const data = await res.json();

      if (data.success) {
        setConversations(data.data);
        generateAnalytics(data.data);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAnalytics = (convs: Conversation[]) => {
    const issueCounts: Record<string, number> = {};
    const issueResolved: Record<string, number> = {};

    convs.forEach((conv) => {
      issueCounts[conv.issue_type] = (issueCounts[conv.issue_type] || 0) + 1;
      if (conv.status === 'closed' || conv.replied) {
        issueResolved[conv.issue_type] = (issueResolved[conv.issue_type] || 0) + 1;
      }
    });

    const topIssues = Object.entries(issueCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / convs.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const resolutionRates = Object.entries(issueCounts)
      .map(([type, total]) => ({
        type,
        resolved: issueResolved[type] || 0,
        total,
        percentage: Math.round(((issueResolved[type] || 0) / total) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage);

    setAnalytics({
      total_conversations: convs.length,
      total_unresolved: convs.filter(c => c.status === 'open').length,
      top_issues: topIssues,
      resolution_rates: resolutionRates,
    });
  };

  // Navigate to conversations filtered by issue type
  const drillDown = (issueType: string) => {
    router.push(`/dashboard/conversations?issue=${issueType}`);
  };

  const ISSUE_COLORS: Record<string, string> = {
    withdrawal: '#3b82f6',
    deposit: '#f59e0b',
    shipping: '#10b981',
    complaint: '#ef4444',
    card_redemption: '#8b5cf6',
    kyc: '#6366f1',
    general: '#6b7280',
  };

  const issueLabel = (type: string) =>
    type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) return null;

  const resolutionRate = Math.round(
    ((analytics.total_conversations - analytics.total_unresolved) / analytics.total_conversations) * 100
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Analytics</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
        Click any issue type to view those conversations →
      </p>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Total Conversations</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#1e293b' }}>{analytics.total_conversations}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Unresolved</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444' }}>{analytics.total_unresolved}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Resolution Rate</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981' }}>{resolutionRate}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Top Issues ── */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Top Issues This Week</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Click to view conversations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analytics.top_issues.map((issue) => (
              <div
                key={issue.type}
                onClick={() => drillDown(issue.type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${ISSUE_COLORS[issue.type]}30`,
                  background: `${ISSUE_COLORS[issue.type]}08`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = `${ISSUE_COLORS[issue.type]}18`;
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(4px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = `${ISSUE_COLORS[issue.type]}08`;
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: ISSUE_COLORS[issue.type], flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                  {issueLabel(issue.type)}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{issue.percentage}%</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: ISSUE_COLORS[issue.type], minWidth: 40, textAlign: 'right' }}>
                  {issue.count}
                </span>
                <span style={{ fontSize: 12, color: ISSUE_COLORS[issue.type] }}>→</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Resolution Rate by Type ── */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Resolution Rate by Type</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Click to view conversations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analytics.resolution_rates.map((item) => (
              <div
                key={item.type}
                onClick={() => drillDown(item.type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = '#f8fafc';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(4px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', minWidth: 120 }}>
                  {issueLabel(item.type)}
                </span>
                <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${item.percentage}%`,
                    background: item.percentage >= 70 ? '#10b981' : item.percentage >= 40 ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right',
                  color: item.percentage >= 70 ? '#10b981' : item.percentage >= 40 ? '#f59e0b' : '#ef4444',
                }}>
                  {item.percentage}%
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 40, textAlign: 'right' }}>
                  {item.resolved}/{item.total}
                </span>
                <span style={{ fontSize: 12, color: '#6366f1' }}>→</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};