'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Conversation {
  id: string;
  user_name: string;
  user_email: string;
  user_location: string;
  issue_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message: string;
  replied: boolean;
  unread: boolean;
  tags?: string[];
  ai_priority?: string;
}

const ISSUE_COLORS: Record<string, string> = {
  withdrawal: '#3b82f6', deposit: '#f59e0b', shipping: '#10b981',
  complaint: '#ef4444', card_redemption: '#8b5cf6', kyc: '#6366f1', general: '#6b7280',
};

export default function DashboardHome() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intercom/fetch-conversations');
      const data = await res.json();
      if (data.success) setConvs(data.data);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const issueLabel = (t: string) => t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const today = new Date().toISOString().slice(0, 10);

  // Live computed stats
  const todayConvs = convs.filter(c => c.created_at.slice(0, 10) === today);
  const totalOpen = convs.filter(c => c.status === 'open').length;
  const unreplied = convs.filter(c => !c.replied && c.status === 'open').length;
  const urgent = convs.filter(c => c.ai_priority === 'urgent' && c.status === 'open').length;
  const solvedToday = todayConvs.filter(c => c.status === 'closed' || (c.tags || []).some(t => t.toLowerCase() === 'solved')).length;

  // Top issues (all open)
  const issueCounts: Record<string, number> = {};
  convs.filter(c => c.status === 'open').forEach(c => { issueCounts[c.issue_type] = (issueCounts[c.issue_type] || 0) + 1; });
  const topIssues = Object.entries(issueCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  // Needs attention: unreplied open, most recent first
  const needsAttention = convs
    .filter(c => !c.replied && c.status === 'open')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  const formatTime = (iso: string) => {
    const d = new Date(iso), now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Good to see you 👋</h2>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Here's where things stand right now</p>
        </div>
        <button onClick={load} style={{ background: '#64748b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🔄 Refresh</button>
      </div>

      {/* ── Key stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'New Today', value: todayConvs.length, color: '#1e293b', onClick: () => router.push('/dashboard/conversations') },
          { label: 'Open Total', value: totalOpen, color: '#6366f1', onClick: () => router.push('/dashboard/conversations?status=open') },
          { label: 'Unreplied', value: unreplied, color: '#f59e0b', onClick: () => router.push('/dashboard/conversations') },
          { label: 'Urgent', value: urgent, color: '#ef4444', onClick: () => router.push('/dashboard/conversations?priority=urgent') },
          { label: 'Solved Today', value: solvedToday, color: '#10b981', onClick: () => router.push('/dashboard/conversations') },
        ].map(s => (
          <div key={s.label} onClick={s.onClick}
            style={{ ...card, cursor: 'pointer', transition: 'transform 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Needs attention ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>⏳ Needs Your Attention</h3>
            <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>{unreplied} unreplied</span>
          </div>
          {needsAttention.length === 0 ? (
            <div style={{ color: '#10b981', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>🎉 All caught up! Nothing waiting.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {needsAttention.map(c => (
                <div key={c.id} onClick={() => router.push('/dashboard/conversations')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9', cursor: 'pointer', borderLeft: `3px solid ${ISSUE_COLORS[c.issue_type] || '#e2e8f0'}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.user_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message.replace(/<[^>]*>/g, '')}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatTime(c.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Top issues ── */}
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>🔝 Top Open Issues</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topIssues.map(i => {
              const max = topIssues[0]?.count || 1;
              return (
                <div key={i.type} onClick={() => router.push(`/dashboard/conversations?issue=${i.type}`)}
                  style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span style={{ color: '#1e293b', fontWeight: 500 }}>{issueLabel(i.type)}</span>
                    <span style={{ color: ISSUE_COLORS[i.type], fontWeight: 700 }}>{i.count}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(i.count / max) * 100}%`, background: ISSUE_COLORS[i.type], borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => router.push('/dashboard/analytics')}
            style={{ marginTop: 16, width: '100%', background: '#f0f4ff', color: '#4338ca', border: 'none', borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            View full analytics + daily report →
          </button>
        </div>
      </div>

      {/* ── Quick links ── */}
      <div style={{ ...card, marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Quick actions:</span>
        <button onClick={() => router.push('/dashboard/conversations')} style={quickBtn}>💬 All Conversations</button>
        <button onClick={() => router.push('/dashboard/conversations?priority=urgent')} style={quickBtn}>🚨 Urgent Only</button>
        <button onClick={() => router.push('/dashboard/analytics')} style={quickBtn}>📊 Analytics & Daily Report</button>
      </div>
    </div>
  );
}

const quickBtn: React.CSSProperties = { background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };