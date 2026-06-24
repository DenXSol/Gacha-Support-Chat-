'use client';

import { useEffect, useState } from 'react';
import { Conversation, Analytics } from '@/types/index';

export default function AnalyticsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

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
    // Count by issue type
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
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

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
      total_unresolved: convs.filter((c) => c.status === 'open').length,
      top_issues: topIssues,
      resolution_rates: resolutionRates,
    });
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading analytics...</div>;
  }

  if (!analytics) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>No data available</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Total Conversations</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#333' }}>
            {analytics.total_conversations}
          </div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Unresolved</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>
            {analytics.total_unresolved}
          </div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Resolution Rate</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
            {Math.round(
              ((analytics.total_conversations - analytics.total_unresolved) / analytics.total_conversations) * 100
            )}
            %
          </div>
        </div>
      </div>

      {/* Top Issues & Resolution Rates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Top Issues */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '16px', fontWeight: '600' }}>Top Issues This Week</h3>
          <div>
            {analytics.top_issues.map((issue, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: idx < analytics.top_issues.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>{issue.type}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>{issue.percentage}%</div>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>{issue.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution Rates */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '16px', fontWeight: '600' }}>Resolution Rate by Type</h3>
          <div>
            {analytics.resolution_rates.map((rate, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: idx < analytics.resolution_rates.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>{rate.type}</div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: rate.percentage >= 70 ? '#10b981' : rate.percentage >= 40 ? '#f59e0b' : '#ef4444',
                    }}
                  >
                    {rate.percentage}%
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {rate.resolved}/{rate.total}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
