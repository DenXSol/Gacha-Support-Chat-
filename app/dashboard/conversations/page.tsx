'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessagePart {
  author_type: 'user' | 'admin' | 'bot';
  author_name: string;
  body: string;
  created_at: string;
}

interface Conversation {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_location: string;
  issue_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message: string;
  full_messages?: MessagePart[];
  unread: boolean;
  replied: boolean;
  tags?: string[];
  // AI fields (populated after analysis)
  ai_summary?: string;
  ai_priority?: 'low' | 'medium' | 'high' | 'urgent';
  ai_priority_reason?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'frustrated' | 'angry';
  ai_suggested_reply?: string;
  ai_action_needed?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_COLORS: Record<string, string> = {
  withdrawal: '#3b82f6',
  deposit: '#f59e0b',
  shipping: '#10b981',
  complaint: '#ef4444',
  card_redemption: '#8b5cf6',
  kyc: '#6366f1',
  general: '#6b7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  frustrated: '😤',
  angry: '😠',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Filters
  const [issueFilter, setIssueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'keyword' | 'ai'>('keyword');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intercom/fetch-conversations');
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
        setFiltered(data.data);
        toast.success(`Loaded ${data.count} conversations`);
      } else {
        toast.error('Failed to load conversations');
      }
    } catch (err) {
      toast.error('Error loading conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConversations(); }, []);

  // ─── Filtering ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let result = [...conversations];

    if (issueFilter) result = result.filter(c => c.issue_type === issueFilter);
    if (statusFilter) result = result.filter(c => c.status === statusFilter);
    if (priorityFilter) result = result.filter(c => c.ai_priority === priorityFilter);

    if (searchMode === 'keyword' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.user_name.toLowerCase().includes(q) ||
        c.user_email.toLowerCase().includes(q) ||
        c.last_message.toLowerCase().includes(q) ||
        c.issue_type.toLowerCase().includes(q) ||
        c.user_location.toLowerCase().includes(q)
      );
    }

    // Sort: urgent first, then by updated_at
    result.sort((a, b) => {
      const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const ap = a.ai_priority ? pOrder[a.ai_priority] : 4;
      const bp = b.ai_priority ? pOrder[b.ai_priority] : 4;
      if (ap !== bp) return ap - bp;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    setFiltered(result);
  }, [conversations, issueFilter, statusFilter, priorityFilter, searchQuery, searchMode]);

  // ─── AI Search ─────────────────────────────────────────────────────────────

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setAiSearching(true);
    try {
      const searchData = conversations.map(c => ({
        id: c.id,
        text: `${c.user_name} ${c.issue_type} ${c.last_message}`,
        user: c.user_name,
      }));

      const res = await fetch('/api/claude/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, conversations: searchData }),
      });

      const data = await res.json();
      if (data.success && data.results.length > 0) {
        const matchIds = new Set(data.results.map((r: any) => r.id));
        setFiltered(conversations.filter(c => matchIds.has(c.id)));
        toast.success(`AI found ${data.results.length} relevant conversations`);
      } else {
        toast('No matches found for that query', { icon: '🔍' });
        setFiltered([]);
      }
    } catch {
      toast.error('AI search failed');
    } finally {
      setAiSearching(false);
    }
  };

  // ─── AI Analysis ───────────────────────────────────────────────────────────

  const analyzeConversation = async (conv: Conversation) => {
    setAnalyzingId(conv.id);
    try {
      const text = conv.full_messages
        ?.map(m => `[${m.author_type === 'admin' ? 'Support' : m.author_name}]: ${m.body}`)
        .join('\n') || conv.last_message;

      const res = await fetch('/api/claude/analyze-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationText: text, userName: conv.user_name }),
      });

      const data = await res.json();
      if (data.success) {
        const updated = conversations.map(c =>
          c.id === conv.id
            ? {
                ...c,
                ai_summary: data.data.summary,
                ai_priority: data.data.priority,
                ai_priority_reason: data.data.priority_reason,
                ai_sentiment: data.data.sentiment,
                ai_suggested_reply: data.data.suggested_reply,
                ai_action_needed: data.data.action_needed,
                issue_type: data.data.issue_type || c.issue_type,
              }
            : c
        );
        setConversations(updated);
        if (selected?.id === conv.id) {
          setSelected(updated.find(c => c.id === conv.id) || null);
        }
        toast.success('AI analysis complete');
      }
    } catch {
      toast.error('AI analysis failed');
    } finally {
      setAnalyzingId(null);
    }
  };

  // ─── Analyze all visible ────────────────────────────────────────────────────

  const analyzeAll = async () => {
    const toAnalyze = filtered.filter(c => !c.ai_summary).slice(0, 20);
    if (toAnalyze.length === 0) {
      toast('All visible conversations already analyzed');
      return;
    }
    toast(`Analyzing ${toAnalyze.length} conversations...`);
    for (const conv of toAnalyze) {
      await analyzeConversation(conv);
    }
  };

  // ─── Reply ─────────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch('/api/intercom/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, message: replyText }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Reply sent!');
        setReplyText('');
        // Mark as replied
        setConversations(prev =>
          prev.map(c => c.id === selected.id ? { ...c, replied: true } : c)
        );
      } else {
        toast.error('Failed to send reply');
      }
    } catch {
      toast.error('Error sending reply');
    } finally {
      setSendingReply(false);
    }
  };

  // ─── Bulk actions ──────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(prev =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map(c => c.id))
    );
  };

  const exportCSV = () => {
    const toExport = selectedIds.size > 0
      ? filtered.filter(c => selectedIds.has(c.id))
      : filtered;

    const headers = ['ID', 'User', 'Email', 'Location', 'Issue Type', 'Status', 'Priority', 'Sentiment', 'Last Message', 'AI Summary', 'Created', 'Updated'];
    const rows = toExport.map(c => [
      c.id,
      c.user_name,
      c.user_email,
      c.user_location,
      c.issue_type,
      c.status,
      c.ai_priority || '',
      c.ai_sentiment || '',
      `"${(c.last_message || '').replace(/"/g, '""').substring(0, 200)}"`,
      `"${(c.ai_summary || '').replace(/"/g, '""')}"`,
      c.created_at,
      c.updated_at,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gacha-conversations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${toExport.length} conversations`);
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return d.toLocaleDateString();
  };

  const issueLabel = (type: string) =>
    type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  // ─── Render ────────────────────────────────────────────────────────────────

  const urgentCount = conversations.filter(c => c.ai_priority === 'urgent').length;
  const unrepliedCount = conversations.filter(c => !c.replied && c.status === 'open').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '12px 20px',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          Conversations
        </h1>

        {urgentCount > 0 && (
          <span style={{
            background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
          }}>
            🚨 {urgentCount} urgent
          </span>
        )}
        {unrepliedCount > 0 && (
          <span style={{
            background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047',
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
          }}>
            💬 {unrepliedCount} unreplied
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={analyzeAll} style={btnStyle('#6366f1')}>
            🤖 AI Analyze All
          </button>
          <button onClick={exportCSV} style={btnStyle('#10b981')}>
            📊 Export CSV
          </button>
          <button onClick={loadConversations} style={btnStyle('#64748b')}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Filters + Search ── */}
      <div style={{
        padding: '10px 20px',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Search bar */}
        <div style={{ display: 'flex', flex: 1, minWidth: 250, gap: 0 }}>
          <select
            value={searchMode}
            onChange={e => setSearchMode(e.target.value as any)}
            style={{ ...selectStyle, borderRadius: '6px 0 0 6px', borderRight: 'none', width: 100 }}
          >
            <option value="keyword">🔍 Text</option>
            <option value="ai">🤖 AI</option>
          </select>
          <input
            type="text"
            placeholder={searchMode === 'ai' ? 'e.g. "users who mentioned express shipping"' : 'Search by name, email, message...'}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (searchMode === 'keyword') {} }}
            onKeyDown={e => { if (e.key === 'Enter' && searchMode === 'ai') handleAiSearch(); }}
            style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 0, fontSize: 13, outline: 'none' }}
          />
          {searchMode === 'ai' && (
            <button
              onClick={handleAiSearch}
              disabled={aiSearching}
              style={{ ...btnStyle('#6366f1'), borderRadius: '0 6px 6px 0', padding: '0 14px' }}
            >
              {aiSearching ? '...' : 'Search'}
            </button>
          )}
          {(searchQuery || issueFilter || statusFilter || priorityFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setIssueFilter(''); setStatusFilter(''); setPriorityFilter(''); }}
              style={{ ...btnStyle('#94a3b8'), borderRadius: '0 6px 6px 0', padding: '0 10px' }}
            >
              ✕
            </button>
          )}
        </div>

        <select value={issueFilter} onChange={e => setIssueFilter(e.target.value)} style={selectStyle}>
          <option value="">All Issues</option>
          {Object.keys(ISSUE_COLORS).map(k => (
            <option key={k} value={k}>{issueLabel(k)}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="snoozed">Snoozed</option>
        </select>

        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={selectStyle}>
          <option value="">All Priority</option>
          <option value="urgent">🚨 Urgent</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>

        <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
          {filtered.length} / {conversations.length}
          {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
        </span>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Conversation list ── */}
        <div style={{
          width: selected ? 360 : '100%',
          overflowY: 'auto',
          borderRight: '1px solid #e2e8f0',
          background: '#fff',
        }}>
          {/* Select-all row */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#f8fafc',
          }}>
            <input
              type="checkbox"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={selectAll}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: '#64748b' }}>Select all</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              Loading conversations...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              No conversations found
            </div>
          ) : (
            filtered.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelected(conv)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  background: selected?.id === conv.id ? '#eff6ff' : conv.unread ? '#fafbff' : '#fff',
                  borderLeft: conv.ai_priority ? `3px solid ${PRIORITY_COLORS[conv.ai_priority]}` : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(conv.id)}
                    onChange={e => { e.stopPropagation(); toggleSelect(conv.id); }}
                    style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: conv.unread ? 700 : 500, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.user_name}
                        {conv.ai_sentiment && (
                          <span style={{ marginLeft: 4 }}>{SENTIMENT_EMOJI[conv.ai_sentiment]}</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                        {formatTime(conv.updated_at)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 4, margin: '4px 0', flexWrap: 'wrap' }}>
                      <span style={{
                        background: ISSUE_COLORS[conv.issue_type] + '20',
                        color: ISSUE_COLORS[conv.issue_type],
                        borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600,
                      }}>
                        {issueLabel(conv.issue_type)}
                      </span>

                      {conv.ai_priority && (
                        <span style={{
                          background: PRIORITY_COLORS[conv.ai_priority] + '20',
                          color: PRIORITY_COLORS[conv.ai_priority],
                          borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600,
                        }}>
                          {conv.ai_priority.toUpperCase()}
                        </span>
                      )}

                      <span style={{
                        background: conv.status === 'open' ? '#dcfce7' : '#f1f5f9',
                        color: conv.status === 'open' ? '#16a34a' : '#64748b',
                        borderRadius: 4, padding: '1px 6px', fontSize: 10,
                      }}>
                        {conv.status}
                      </span>

                      {!conv.replied && conv.status === 'open' && (
                        <span style={{
                          background: '#fef9c3', color: '#854d0e',
                          borderRadius: 4, padding: '1px 6px', fontSize: 10,
                        }}>
                          needs reply
                        </span>
                      )}
                    </div>

                    {conv.ai_summary ? (
                      <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
                        🤖 {conv.ai_summary}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.last_message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Conversation detail ── */}
        {selected && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>

            {/* Detail header */}
            <div style={{
              padding: '14px 20px',
              background: '#fff',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                  {selected.user_name}
                  {selected.ai_sentiment && (
                    <span style={{ marginLeft: 6 }}>{SENTIMENT_EMOJI[selected.ai_sentiment]}</span>
                  )}
                </h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selected.user_email} · {selected.user_location}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    background: ISSUE_COLORS[selected.issue_type] + '20',
                    color: ISSUE_COLORS[selected.issue_type],
                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    {issueLabel(selected.issue_type)}
                  </span>
                  {selected.ai_priority && (
                    <span style={{
                      background: PRIORITY_COLORS[selected.ai_priority] + '20',
                      color: PRIORITY_COLORS[selected.ai_priority],
                      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                    }}>
                      {selected.ai_priority.toUpperCase()} priority
                    </span>
                  )}
                  <span style={{
                    background: '#f1f5f9', color: '#64748b',
                    borderRadius: 4, padding: '2px 8px', fontSize: 11,
                  }}>
                    #{selected.id}
                  </span>
                  <a
                    href={`https://app.intercom.com/a/apps/umt12kl0/conversations/${selected.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none', padding: '2px 8px', background: '#eff6ff', borderRadius: 4 }}
                  >
                    Open in Intercom ↗
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => analyzeConversation(selected)}
                  disabled={analyzingId === selected.id}
                  style={btnStyle('#6366f1')}
                >
                  {analyzingId === selected.id ? '🔄 Analyzing...' : '🤖 AI Analyze'}
                </button>
                <button
                  onClick={() => setSelected(null)}
                  style={btnStyle('#94a3b8')}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* AI Summary panel */}
            {selected.ai_summary && (
              <div style={{
                margin: '12px 16px 0',
                padding: 14,
                background: '#f0f4ff',
                borderRadius: 8,
                border: '1px solid #c7d2fe',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 6 }}>
                  🤖 AI ANALYSIS
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>
                  {selected.ai_summary}
                </p>
                {selected.ai_priority_reason && (
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#4f46e5' }}>
                    📌 {selected.ai_priority_reason}
                  </p>
                )}
                {selected.ai_action_needed && (
                  <span style={{
                    display: 'inline-block', background: '#fef2f2', color: '#ef4444',
                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    ⚡ Action Required
                  </span>
                )}
              </div>
            )}

            {/* Message thread */}
            <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.full_messages && selected.full_messages.length > 0 ? (
                selected.full_messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: msg.author_type === 'admin' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={{
                      maxWidth: '75%',
                      background: msg.author_type === 'admin' ? '#6366f1' : '#fff',
                      color: msg.author_type === 'admin' ? '#fff' : '#1e293b',
                      borderRadius: msg.author_type === 'admin' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '10px 14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      border: msg.author_type === 'user' ? '1px solid #e2e8f0' : 'none',
                    }}>
                      <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7 }}>
                        {msg.author_name} · {formatTime(msg.created_at)}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {msg.body.replace(/<[^>]*>/g, '')}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 16,
                  border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
                  lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {selected.last_message || 'No message content available'}
                </div>
              )}
            </div>

            {/* Reply box */}
            <div style={{
              padding: '12px 16px',
              background: '#fff',
              borderTop: '1px solid #e2e8f0',
            }}>
              {selected.ai_suggested_reply && (
                <div style={{
                  marginBottom: 8,
                  padding: 10,
                  background: '#f0fdf4',
                  borderRadius: 6,
                  border: '1px solid #bbf7d0',
                  fontSize: 12,
                  color: '#166534',
                }}>
                  <span style={{ fontWeight: 600 }}>💡 AI Suggested: </span>
                  {selected.ai_suggested_reply}
                  <button
                    onClick={() => setReplyText(selected.ai_suggested_reply || '')}
                    style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Use this
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  style={{
                    flex: 1, padding: '8px 12px', border: '1px solid #d1d5db',
                    borderRadius: 8, fontSize: 13, resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={sendReply}
                    disabled={sendingReply || !replyText.trim()}
                    style={{
                      ...btnStyle('#6366f1'),
                      opacity: sendingReply || !replyText.trim() ? 0.5 : 1,
                    }}
                  >
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    onClick={() => setReplyText('')}
                    style={btnStyle('#94a3b8')}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 12,
  background: '#fff',
  color: '#374151',
  outline: 'none',
  cursor: 'pointer',
};