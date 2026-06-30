'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessagePart {
  author_type: 'user' | 'admin' | 'bot';
  author_name: string;
  body: string;
  created_at: string;
}

interface ConvSummary {
  summary: string;
  problem: string;
  current_status: string;
  next_steps: string[];
  key_facts: string[];
  urgency: string;
  suggested_reply: string;
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
  ai_participated?: boolean;
  escalated_to_human?: boolean;
  csat_rating?: number;
  tags?: string[];
  custom_tags?: string[];
  ai_summary?: string;
  ai_priority?: 'low' | 'medium' | 'high' | 'urgent';
  ai_priority_reason?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'frustrated' | 'angry';
  ai_suggested_reply?: string;
  ai_action_needed?: boolean;
  conv_summary?: ConvSummary;
}

interface TaiMessage {
  role: 'user' | 'tai';
  text: string;
  matches?: Conversation[];
  timestamp: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_COLORS: Record<string, string> = {
  withdrawal: '#3b82f6', deposit: '#f59e0b', shipping: '#10b981',
  complaint: '#ef4444', card_redemption: '#8b5cf6', kyc: '#6366f1', general: '#6b7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#10b981',
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊', neutral: '😐', frustrated: '😤', angry: '😠',
};

const STATUS_COLOR: Record<string, string> = {
  resolved: '#10b981', pending: '#f59e0b', escalation_needed: '#ef4444', waiting_on_user: '#6366f1',
};

// ─── Copy chip ────────────────────────────────────────────────────────────────

function CopyChip({ label, value, color }: { label: string; value: string; color?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title={`Click to copy: ${value}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: copied ? '#dcfce7' : '#f1f5f9', border: `1px solid ${copied ? '#86efac' : '#e2e8f0'}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: copied ? '#16a34a' : (color || '#475569'), cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
      <span style={{ fontWeight: 600, color: '#94a3b8', marginRight: 2 }}>{label}</span>
      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {copied ? '✓ Copied!' : value}
      </span>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [newTag, setNewTag] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Batch 6 states
  const [polishing, setPolishing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [showTranslatePanel, setShowTranslatePanel] = useState(false);
  const [translateTarget, setTranslateTarget] = useState('English');
  const [translatedText, setTranslatedText] = useState('');
  const [translatedFrom, setTranslatedFrom] = useState('');
  const [translateSource, setTranslateSource] = useState<'reply' | 'message'>('reply');

  // Filters
  const [issueFilter, setIssueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [needsResponse, setNeedsResponse] = useState(false);
  const [handlingFilter, setHandlingFilter] = useState<'' | 'ai' | 'human'>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'waiting'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'keyword' | 'ai'>('keyword');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Tai
  const [taiInput, setTaiInput] = useState('');
  const [taiMessages, setTaiMessages] = useState<TaiMessage[]>([]);
  const [taiLoading, setTaiLoading] = useState(false);
  const [showTai, setShowTai] = useState(true);
  const taiEndRef = useRef<HTMLDivElement>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const [lastSync, setLastSync] = useState<Date | null>(null);

  // `silent` = background auto-refresh: no full-screen spinner, no toast.
  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/intercom/fetch-conversations');
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
        setLastSync(new Date());
        if (!silent) {
          const issueParam = searchParams.get('issue');
          if (issueParam) {
            setIssueFilter(issueParam);
            setFiltered(data.data.filter((c: Conversation) => c.issue_type === issueParam));
          } else {
            setFiltered(data.data);
          }
          toast.success(`Loaded ${data.count} conversations`);
        }
      } else if (!silent) {
        toast.error('Failed to load conversations');
      }
    } catch { if (!silent) toast.error('Error loading conversations'); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { loadConversations(); }, []);

  // ─── Real-time auto-refresh: poll the inbox every 30s, and re-sync when the
  // tab regains focus, so the newest tickets show up without a manual reload.
  useEffect(() => {
    const POLL_MS = 60000;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations(true);
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') loadConversations(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // ─── Lazy load thread ─────────────────────────────────────────────────────

  const selectConversation = async (conv: Conversation) => {
    if (selected?.id === conv.id) { setSelected(null); return; }
    setSelected(conv);
    setShowSummaryPanel(false);
    setShowTranslatePanel(false);
    setTranslatedText('');
    if (conv.full_messages && conv.full_messages.length > 1) return;
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/intercom/fetch-single-conversation?id=${conv.id}`);
      const data = await res.json();
      if (data.success) {
        const updated = { ...conv, ...data.data };
        setSelected(updated);
        setConversations(prev => prev.map(c => c.id === conv.id ? updated : c));
      }
    } catch { }
    finally { setLoadingThread(false); }
  };

  useEffect(() => {
    if (selected?.full_messages) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [selected?.full_messages?.length]);

  // ─── Filtering ────────────────────────────────────────────────────────────

  useEffect(() => {
    let result = [...conversations];
    if (issueFilter) result = result.filter(c => c.issue_type === issueFilter);
    if (statusFilter) result = result.filter(c => c.status === statusFilter);
    if (priorityFilter) result = result.filter(c => c.ai_priority === priorityFilter);
    if (locationFilter) result = result.filter(c => (c.user_location || '').toLowerCase().includes(locationFilter.toLowerCase()));
    // Needs response: still open and no agent reply yet
    if (needsResponse) result = result.filter(c => !c.replied && c.status === 'open');
    // Handling: AI = Fin still handling (not handed to a human); Human = escalated to a person
    if (handlingFilter === 'ai') result = result.filter(c => !c.escalated_to_human);
    if (handlingFilter === 'human') result = result.filter(c => c.escalated_to_human);
    if (searchMode === 'keyword' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.user_name.toLowerCase().includes(q) ||
        c.user_email.toLowerCase().includes(q) ||
        c.user_id.toLowerCase().includes(q) ||
        c.user_location.toLowerCase().includes(q) ||
        c.last_message.toLowerCase().includes(q) ||
        c.issue_type.toLowerCase().includes(q) ||
        (c.custom_tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    // Sort applies on top of ALL active filters.
    result.sort((a, b) => {
      const ta = new Date(a.updated_at).getTime();
      const tb = new Date(b.updated_at).getTime();
      if (sortBy === 'oldest') return ta - tb;
      if (sortBy === 'waiting') return ta - tb; // longest since last update first
      return tb - ta; // newest first (default)
    });
    setFiltered(result);
  }, [conversations, issueFilter, statusFilter, priorityFilter, locationFilter, needsResponse, handlingFilter, sortBy, searchQuery, searchMode]);

  // ─── Tags ─────────────────────────────────────────────────────────────────

  const addTag = (tag: string) => {
    if (!selected || !tag.trim()) return;
    const trimmed = tag.trim().toLowerCase();
    if ((selected.custom_tags || []).includes(trimmed)) return;
    const updated = { ...selected, custom_tags: [...(selected.custom_tags || []), trimmed] };
    setSelected(updated);
    setConversations(prev => prev.map(c => c.id === selected.id ? updated : c));
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    if (!selected) return;
    const updated = { ...selected, custom_tags: (selected.custom_tags || []).filter(t => t !== tag) };
    setSelected(updated);
    setConversations(prev => prev.map(c => c.id === selected.id ? updated : c));
  };

  // ─── Tai ─────────────────────────────────────────────────────────────────

  useEffect(() => { taiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [taiMessages]);

  const askTai = async () => {
    if (!taiInput.trim() || taiLoading) return;
    const question = taiInput.trim();
    setTaiInput('');
    setTaiMessages(prev => [...prev, { role: 'user', text: question, timestamp: new Date().toISOString() }]);
    setTaiLoading(true);
    try {
      const searchData = conversations.map(c => ({
        id: c.id,
        text: `User: ${c.user_name} | Email: ${c.user_email} | Wallet: ${c.user_id} | Location: ${c.user_location} | Issue: ${c.issue_type} | Message: ${c.last_message} | Status: ${c.status}`,
        user: c.user_name,
      }));
      const res = await fetch('/api/claude/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, conversations: searchData }),
      });
      const data = await res.json();
      if (data.success && data.results.length > 0) {
        const matchIds = new Set(data.results.map((r: any) => r.id));
        const matchedConvs = conversations.filter(c => matchIds.has(c.id));
        const summary = data.results.slice(0, 5).map((r: any) => {
          const conv = conversations.find(c => c.id === r.id);
          return conv ? `• ${conv.user_name} (${conv.user_email}) — ${r.reason}` : null;
        }).filter(Boolean).join('\n');
        setTaiMessages(prev => [...prev, { role: 'tai', text: `Found ${data.results.length} match${data.results.length !== 1 ? 'es' : ''} for "${question}":\n\n${summary}`, matches: matchedConvs.slice(0, 5), timestamp: new Date().toISOString() }]);
      } else {
        setTaiMessages(prev => [...prev, { role: 'tai', text: `No conversations found matching "${question}". Try different keywords.`, timestamp: new Date().toISOString() }]);
      }
    } catch {
      setTaiMessages(prev => [...prev, { role: 'tai', text: 'Error — please try again.', timestamp: new Date().toISOString() }]);
    } finally { setTaiLoading(false); }
  };

  // ─── AI Search ────────────────────────────────────────────────────────────

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setAiSearching(true);
    try {
      const searchData = conversations.map(c => ({
        id: c.id, text: `${c.user_name} ${c.user_email} ${c.user_id} ${c.issue_type} ${c.last_message} ${c.user_location}`, user: c.user_name,
      }));
      const res = await fetch('/api/claude/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, conversations: searchData }) });
      const data = await res.json();
      if (data.success && data.results.length > 0) {
        const matchIds = new Set(data.results.map((r: any) => r.id));
        setFiltered(conversations.filter(c => matchIds.has(c.id)));
        toast.success(`Found ${data.results.length} conversations`);
      } else {
        toast('No matches found', { icon: '🔍' }); setFiltered([]);
      }
    } catch { toast.error('AI search failed'); }
    finally { setAiSearching(false); }
  };

  // ─── AI Analyze ───────────────────────────────────────────────────────────

  const analyzeConversation = async (conv: Conversation) => {
    setAnalyzingId(conv.id);
    try {
      const text = conv.full_messages?.map(m => `[${m.author_type === 'admin' ? 'Tai' : m.author_name}]: ${m.body}`).join('\n') || conv.last_message;
      const res = await fetch('/api/claude/analyze-conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationText: text, userName: conv.user_name }) });
      const data = await res.json();
      if (data.success) {
        const updated = conversations.map(c => c.id === conv.id ? { ...c, ai_summary: data.data.summary, ai_priority: data.data.priority, ai_priority_reason: data.data.priority_reason, ai_sentiment: data.data.sentiment, ai_suggested_reply: data.data.suggested_reply, ai_action_needed: data.data.action_needed, issue_type: data.data.issue_type || c.issue_type } : c);
        setConversations(updated);
        if (selected?.id === conv.id) setSelected(updated.find(c => c.id === conv.id) || null);
        toast.success('Analysis complete');
      }
    } catch { toast.error('Analysis failed'); }
    finally { setAnalyzingId(null); }
  };

  const analyzeAll = async () => {
    const toAnalyze = filtered.filter(c => !c.ai_summary).slice(0, 20);
    if (!toAnalyze.length) { toast('All already analyzed'); return; }
    toast(`Analyzing ${toAnalyze.length} conversations...`);
    for (const conv of toAnalyze) await analyzeConversation(conv);
  };

  // ─── BATCH 6: Polish reply ────────────────────────────────────────────────

  const polishReply = async () => {
    if (!replyText.trim()) { toast.error('Type something first'); return; }
    setPolishing(true);
    try {
      const context = selected?.full_messages?.slice(-3).map(m => `${m.author_name}: ${m.body}`).join('\n');
      const res = await fetch('/api/claude/polish-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText, context }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText(data.polished);
        toast.success('Reply polished ✨');
      } else {
        toast.error('Could not polish reply');
      }
    } catch { toast.error('Polish failed'); }
    finally { setPolishing(false); }
  };

  // ─── BATCH 6: Translate ───────────────────────────────────────────────────

  const translate = async (source: 'reply' | 'message') => {
    const textToTranslate = source === 'reply' ? replyText : (selected?.full_messages?.slice(-1)[0]?.body || selected?.last_message || '');
    if (!textToTranslate?.trim()) { toast.error('Nothing to translate'); return; }
    setTranslating(true);
    setTranslateSource(source);
    setShowTranslatePanel(true);
    try {
      const res = await fetch('/api/claude/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToTranslate, targetLanguage: source === 'message' ? 'English' : translateTarget, autoDetect: source === 'message' }),
      });
      const data = await res.json();
      if (data.success) {
        setTranslatedText(data.translated);
        setTranslatedFrom(data.detectedLanguage || '');
      } else {
        toast.error('Translation failed');
      }
    } catch { toast.error('Translation failed'); }
    finally { setTranslating(false); }
  };

  // ─── BATCH 6: Summarize ───────────────────────────────────────────────────

  const summarizeConversation = async () => {
    if (!selected) return;
    setSummarizing(true);
    setShowSummaryPanel(true);
    try {
      const text = selected.full_messages?.map(m => `[${m.author_type === 'admin' ? 'Tai' : m.author_name}]: ${m.body}`).join('\n') || selected.last_message;
      const res = await fetch('/api/claude/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationText: text, userName: selected.user_name, issueType: selected.issue_type }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = { ...selected, conv_summary: data.data };
        setSelected(updated);
        setConversations(prev => prev.map(c => c.id === selected.id ? updated : c));
      } else {
        toast.error('Summary failed');
        setShowSummaryPanel(false);
      }
    } catch { toast.error('Summary failed'); setShowSummaryPanel(false); }
    finally { setSummarizing(false); }
  };

  // ─── Reply ────────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch('/api/intercom/send-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: selected.id, message: replyText }) });
      const data = await res.json();
      if (data.success) {
        toast.success('Reply sent!');
        const newMsg: MessagePart = { author_type: 'admin', author_name: 'Tai', body: replyText, created_at: new Date().toISOString() };
        const updatedSelected = { ...selected, replied: true, full_messages: [...(selected.full_messages || []), newMsg] };
        setSelected(updatedSelected);
        setConversations(prev => prev.map(c => c.id === selected.id ? updatedSelected : c));
        setReplyText('');
      } else { toast.error('Failed to send reply'); }
    } catch { toast.error('Error sending reply'); }
    finally { setSendingReply(false); }
  };

  // ─── Bulk ─────────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));

  const exportCSV = () => {
    const toExport = selectedIds.size > 0 ? filtered.filter(c => selectedIds.has(c.id)) : filtered;
    const headers = ['ID', 'User', 'Email', 'Wallet', 'Location', 'Issue Type', 'Status', 'Priority', 'Sentiment', 'Tags', 'Last Message', 'AI Summary'];
    const rows = toExport.map(c => [c.id, c.user_name, c.user_email, c.user_id, c.user_location, c.issue_type, c.status, c.ai_priority || '', c.ai_sentiment || '', (c.custom_tags || []).join(';'), `"${(c.last_message || '').replace(/"/g, '""').substring(0, 200)}"`, `"${(c.ai_summary || '').replace(/"/g, '""')}"`]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `gacha-conversations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${toExport.length} conversations`);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso), now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return d.toLocaleDateString();
  };

  const issueLabel = (type: string) => type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const urgentCount = conversations.filter(c => c.ai_priority === 'urgent').length;
  const unrepliedCount = conversations.filter(c => !c.replied && c.status === 'open').length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Tai bar */}
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderBottom: '1px solid #4338ca', padding: showTai ? '12px 20px' : '8px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showTai ? 10 : 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>T</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Tai</div>
            <div style={{ color: '#a5b4fc', fontSize: 11 }}>AI Support Assistant · search by name, email, wallet, location, or any issue</div>
          </div>
          <button onClick={() => setShowTai(!showTai)} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#a5b4fc', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            {showTai ? '▲ Hide' : '▼ Ask Tai'}
          </button>
        </div>
        {showTai && (
          <>
            {taiMessages.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {taiMessages.map((msg, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '80%', background: msg.role === 'user' ? '#6366f1' : 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                        {msg.role === 'tai' && <span style={{ fontWeight: 700, color: '#a5b4fc' }}>Tai: </span>}
                        {msg.text}
                      </div>
                    </div>
                    {msg.matches && msg.matches.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 8 }}>
                        {msg.matches.map(conv => (
                          <button key={conv.id} onClick={() => { selectConversation(conv); setShowTai(false); }}
                            style={{ background: 'rgba(99,102,241,0.3)', border: '1px solid #6366f1', color: '#c7d2fe', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ISSUE_COLORS[conv.issue_type] || '#6b7280', flexShrink: 0 }} />
                            {conv.user_name} ↗
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {taiLoading && <div style={{ color: '#a5b4fc', fontSize: 13, fontStyle: 'italic' }}>Tai is thinking...</div>}
                <div ref={taiEndRef} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={taiInput} onChange={e => setTaiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') askTai(); }}
                placeholder="Ask Tai... e.g. 'find users who paid for express shipping'"
                style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }} />
              <button onClick={askTai} disabled={taiLoading || !taiInput.trim()}
                style={{ background: taiLoading ? '#4338ca' : '#6366f1', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: taiLoading ? 'not-allowed' : 'pointer' }}>
                {taiLoading ? '...' : 'Ask Tai'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Top bar */}
      <div style={{ padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Conversations</h1>
        {urgentCount > 0 && <span style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>🚨 {urgentCount} urgent</span>}
        {unrepliedCount > 0 && <span style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>💬 {unrepliedCount} unreplied</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {lastSync && <span style={{ fontSize: 11, color: '#94a3b8' }}>🟢 Live · synced {lastSync.toLocaleTimeString()}</span>}
          <button onClick={analyzeAll} style={btnStyle('#6366f1')}>🤖 AI Analyze All</button>
          <button onClick={exportCSV} style={btnStyle('#10b981')}>📊 Export CSV</button>
          <button onClick={() => loadConversations()} style={btnStyle('#64748b')}>🔄 Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 280, gap: 0 }}>
          <select value={searchMode} onChange={e => setSearchMode(e.target.value as any)} style={{ ...selectStyle, borderRadius: '6px 0 0 6px', borderRight: 'none', width: 100 }}>
            <option value="keyword">🔍 Text</option>
            <option value="ai">🤖 AI</option>
          </select>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && searchMode === 'ai') handleAiSearch(); }}
            placeholder={searchMode === 'ai' ? 'AI semantic search...' : 'Name, email, wallet, location, message...'}
            style={{ flex: 1, padding: '6px 12px', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 0, fontSize: 13, outline: 'none' }} />
          {searchMode === 'ai' && <button onClick={handleAiSearch} disabled={aiSearching} style={{ ...btnStyle('#6366f1'), borderRadius: '0 6px 6px 0', padding: '0 14px' }}>{aiSearching ? '...' : 'Search'}</button>}
          {(searchQuery || issueFilter || statusFilter || priorityFilter || locationFilter || needsResponse || handlingFilter) && <button onClick={() => { setSearchQuery(''); setIssueFilter(''); setStatusFilter(''); setPriorityFilter(''); setLocationFilter(''); setNeedsResponse(false); setHandlingFilter(''); }} style={{ ...btnStyle('#94a3b8'), borderRadius: '0 6px 6px 0', padding: '0 10px' }}>✕</button>}
        </div>
        <button onClick={() => setNeedsResponse(v => !v)}
          title="Open conversations with no agent reply yet"
          style={{ ...selectStyle, cursor: 'pointer', fontWeight: 600, background: needsResponse ? '#ef4444' : 'var(--surface)', color: needsResponse ? '#fff' : 'var(--text)', borderColor: needsResponse ? '#ef4444' : 'var(--border-strong)' }}>
          📩 Needs response
        </button>
        <select value={handlingFilter} onChange={e => setHandlingFilter(e.target.value as any)} style={selectStyle} title="Who is handling the conversation">
          <option value="">All handling</option>
          <option value="ai">🤖 AI (Fin) handling</option>
          <option value="human">🧑 Human (escalated)</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={selectStyle} title="Sort order (applies with every filter)">
          <option value="newest">↓ Newest first</option>
          <option value="oldest">↑ Oldest first</option>
          <option value="waiting">⏳ Waiting longest</option>
        </select>
        <select value={issueFilter} onChange={e => setIssueFilter(e.target.value)} style={selectStyle}>
          <option value="">All Issues</option>
          {Object.keys(ISSUE_COLORS).map(k => <option key={k} value={k}>{issueLabel(k)}</option>)}
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
        <input
          type="text"
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
          placeholder="📍 Location..."
          style={{ ...selectStyle, padding: '6px 10px', width: 120 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtered.length} / {conversations.length}{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}</span>
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* List */}
        <div style={{ width: selected ? '35%' : '100%', borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)', transition: 'width 0.2s' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Loading conversations...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>No conversations found</div>
          ) : (
            <>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={selectAll} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select all ({filtered.length})</span>
              </div>
              {filtered.map(conv => (
                <div key={conv.id} onClick={() => selectConversation(conv)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === conv.id ? 'var(--row-active)' : conv.unread ? 'var(--row-unread)' : 'var(--surface)', borderLeft: `4px solid ${conv.ai_priority ? PRIORITY_COLORS[conv.ai_priority] : ISSUE_COLORS[conv.issue_type] || 'var(--border)'}`, transition: 'background 0.1s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <input type="checkbox" checked={selectedIds.has(conv.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(conv.id)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: conv.unread ? 700 : 500, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.user_name}{conv.ai_sentiment && <span style={{ marginLeft: 4 }}>{SENTIMENT_EMOJI[conv.ai_sentiment]}</span>}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{formatTime(conv.updated_at)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ background: ISSUE_COLORS[conv.issue_type] + '20', color: ISSUE_COLORS[conv.issue_type], borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{issueLabel(conv.issue_type)}</span>
                        {conv.ai_priority && <span style={{ background: PRIORITY_COLORS[conv.ai_priority] + '20', color: PRIORITY_COLORS[conv.ai_priority], borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{conv.ai_priority}</span>}
                        <span style={{ background: conv.status === 'open' ? '#dcfce7' : '#f1f5f9', color: conv.status === 'open' ? '#16a34a' : '#64748b', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{conv.status}</span>
                        {(conv.custom_tags || []).map(t => <span key={t} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>#{t}</span>)}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.ai_summary || conv.last_message.replace(/<[^>]*>/g, '')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{selected.user_name}</div>
                <span style={{ background: ISSUE_COLORS[selected.issue_type] + '20', color: ISSUE_COLORS[selected.issue_type], borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{issueLabel(selected.issue_type)}</span>
                <a href={`https://app.intercom.com/a/apps/${process.env.NEXT_PUBLIC_INTERCOM_WORKSPACE_ID}/inbox/conversation/${selected.id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', border: '1px solid #6366f1', borderRadius: 6, padding: '3px 10px' }}>
                  Open in Intercom ↗
                </a>
                <button onClick={() => analyzeConversation(selected)} disabled={analyzingId === selected.id} style={btnStyle('#6366f1')}>
                  {analyzingId === selected.id ? '⏳ Analyzing...' : '🤖 AI Analyze'}
                </button>
                {/* Summary button */}
                <button onClick={summarizeConversation} disabled={summarizing}
                  style={{ ...btnStyle('#8b5cf6'), opacity: summarizing ? 0.6 : 1 }}>
                  {summarizing ? '⏳ Summarizing...' : '📋 Summary'}
                </button>
                <button onClick={() => setSelected(null)} style={{ ...btnStyle('#94a3b8'), marginLeft: 'auto' }}>✕</button>
              </div>

              {/* Copy chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {selected.user_email && selected.user_email !== 'Unknown' && <CopyChip label="Email" value={selected.user_email} />}
                {selected.user_id && <CopyChip label="Wallet" value={selected.user_id} color="#7c3aed" />}
                {selected.user_location && selected.user_location !== 'Unknown' && <CopyChip label="Location" value={selected.user_location} color="#0369a1" />}
                <CopyChip label="Conv ID" value={selected.id} color="#64748b" />
              </div>

              {/* Custom tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {(selected.custom_tags || []).map(tag => (
                  <span key={tag} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 20, padding: '2px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    #{tag}
                    <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', padding: 0, fontSize: 12 }}>×</button>
                  </span>
                ))}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(newTag); }}
                    placeholder="+ add tag"
                    style={{ padding: '2px 8px', border: '1px dashed #d1d5db', borderRadius: 20, fontSize: 12, outline: 'none', width: 80, color: '#64748b' }} />
                  {newTag && <button onClick={() => addTag(newTag)} style={{ ...btnStyle('#f59e0b'), padding: '2px 8px', fontSize: 11 }}>Add</button>}
                </div>
              </div>
            </div>

            {/* AI summary bar */}
            {selected.ai_summary && (
              <div style={{ padding: '10px 16px', background: '#f0f4ff', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: '#4338ca' }}>🤖 AI: </span>
                <span style={{ color: '#1e293b' }}>{selected.ai_summary}</span>
                {selected.ai_priority && <span style={{ marginLeft: 10, background: PRIORITY_COLORS[selected.ai_priority] + '20', color: PRIORITY_COLORS[selected.ai_priority], borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{selected.ai_priority} priority</span>}
              </div>
            )}

            {/* ── Summary panel ── */}
            {showSummaryPanel && (
              <div style={{ padding: '12px 16px', background: '#faf5ff', borderBottom: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>📋 Conversation Summary</span>
                  <button onClick={() => setShowSummaryPanel(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
                {summarizing ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Generating summary...</div>
                ) : selected.conv_summary ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>{selected.conv_summary.summary}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: (STATUS_COLOR[selected.conv_summary.current_status] || '#6b7280') + '20', color: STATUS_COLOR[selected.conv_summary.current_status] || '#6b7280', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                        {selected.conv_summary.current_status.replace('_', ' ')}
                      </span>
                      <span style={{ background: PRIORITY_COLORS[selected.conv_summary.urgency as keyof typeof PRIORITY_COLORS]?.concat('20') || '#f1f5f9', color: PRIORITY_COLORS[selected.conv_summary.urgency as keyof typeof PRIORITY_COLORS] || '#64748b', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                        {selected.conv_summary.urgency} urgency
                      </span>
                    </div>
                    {selected.conv_summary.next_steps.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>NEXT STEPS</div>
                        {selected.conv_summary.next_steps.map((step, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#374151', padding: '2px 0', display: 'flex', gap: 6 }}>
                            <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{i + 1}.</span> {step}
                          </div>
                        ))}
                      </div>
                    )}
                    {selected.conv_summary.suggested_reply && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginBottom: 4 }}>💡 SUGGESTED REPLY</div>
                        <div style={{ fontSize: 12, color: '#166534' }}>{selected.conv_summary.suggested_reply}</div>
                        <button onClick={() => setReplyText(selected.conv_summary!.suggested_reply)} style={{ ...btnStyle('#16a34a'), fontSize: 11, marginTop: 6, padding: '3px 10px' }}>Use this reply</button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Translate panel ── */}
            {showTranslatePanel && (
              <div style={{ padding: '12px 16px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>
                    🌐 {translateSource === 'message' ? `Translating user message → English` : `Translating your reply → ${translateTarget}`}
                    {translatedFrom && ` (detected: ${translatedFrom})`}
                  </span>
                  <button onClick={() => { setShowTranslatePanel(false); setTranslatedText(''); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
                {translating ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Translating...</div>
                ) : translatedText ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, color: '#0c4a6e', background: '#fff', border: '1px solid #bae6fd', borderRadius: 6, padding: 10, lineHeight: 1.5 }}>{translatedText}</div>
                    {translateSource === 'reply' && (
                      <button onClick={() => setReplyText(translatedText)} style={{ ...btnStyle('#0369a1'), alignSelf: 'flex-start', fontSize: 11 }}>Use translated version</button>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Loading thread */}
            {loadingThread && (
              <div style={{ padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-faint)' }}>
                ⏳ Loading full conversation thread...
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)' }}>
              {selected.full_messages && selected.full_messages.length > 0 ? (
                selected.full_messages.map((msg, i) => {
                  const isAgent = msg.author_type === 'admin';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '75%', background: isAgent ? 'var(--bubble-me-bg)' : 'var(--bubble-them-bg)', color: isAgent ? 'var(--bubble-me-text)' : 'var(--bubble-them-text)', borderRadius: isAgent ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
                        <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7 }}>
                          {isAgent ? 'Tai' : msg.author_name} · {formatTime(msg.created_at)}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.body.replace(/<[^>]*>/g, '')}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ background: 'var(--bubble-them-bg)', color: 'var(--bubble-them-text)', borderRadius: 12, padding: 16, fontSize: 13, lineHeight: 1.5 }}>
                  {selected.last_message || 'No message content'}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div style={{ padding: '12px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              {selected.ai_suggested_reply && (
                <div style={{ marginBottom: 8, padding: 10, background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                  <span style={{ fontWeight: 600 }}>💡 Tai Suggested: </span>
                  {selected.ai_suggested_reply}
                  <button onClick={() => setReplyText(selected.ai_suggested_reply || '')} style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Use this</button>
                </div>
              )}

              {/* Translate target language selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Translate to:</span>
                <select value={translateTarget} onChange={e => setTranslateTarget(e.target.value)} style={{ ...selectStyle, padding: '3px 8px', fontSize: 11 }}>
                  {['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Thai', 'Vietnamese', 'Indonesian', 'Malay'].map(l => <option key={l}>{l}</option>)}
                </select>
                <button onClick={() => translate('reply')} disabled={translating || !replyText.trim()} style={{ ...btnStyle('#0369a1'), padding: '3px 10px', fontSize: 11, opacity: !replyText.trim() ? 0.4 : 1 }}>
                  🌐 Translate my reply
                </button>
                <button onClick={() => translate('message')} disabled={translating} style={{ ...btnStyle('#0891b2'), padding: '3px 10px', fontSize: 11 }}>
                  🌐 Translate their message
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply..." rows={3}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={sendReply} disabled={sendingReply || !replyText.trim()} style={{ ...btnStyle('#6366f1'), opacity: sendingReply || !replyText.trim() ? 0.5 : 1 }}>
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button onClick={polishReply} disabled={polishing || !replyText.trim()} style={{ ...btnStyle('#f59e0b'), opacity: polishing || !replyText.trim() ? 0.5 : 1 }}>
                    {polishing ? '...' : '✨ Polish'}
                  </button>
                  <button onClick={() => setReplyText('')} style={btnStyle('#94a3b8')}>Clear</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--surface)', color: 'var(--text)', outline: 'none', cursor: 'pointer' };