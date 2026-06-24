'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Conversation } from '@/types/index';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Filters
  const [issueFilter, setIssueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
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
    } catch (error) {
      toast.error('Error fetching conversations');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = conversations;

    if (issueFilter) {
      result = result.filter((c) => c.issue_type === issueFilter);
    }

    if (statusFilter) {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.user_name.toLowerCase().includes(q) ||
          c.user_email.toLowerCase().includes(q) ||
          c.last_message.toLowerCase().includes(q)
      );
    }

    setFiltered(result);
  }, [issueFilter, statusFilter, searchQuery, conversations]);

  const handleSendReply = async () => {
    if (!selectedConv || !reply.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setSendingReply(true);
    try {
      const res = await fetch('/api/intercom/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConv.id,
          message: reply,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Reply sent!');
        setReply('');
      } else {
        toast.error('Failed to send reply');
      }
    } catch (error) {
      toast.error('Error sending reply');
      console.error(error);
    } finally {
      setSendingReply(false);
    }
  };

  const getIssueColor = (type: string) => {
    const colors: Record<string, string> = {
      withdrawal: '#3b82f6',
      deposit: '#f59e0b',
      shipping: '#10b981',
      complaint: '#ef4444',
      card_redemption: '#8b5cf6',
      kyc: '#6366f1',
      general: '#6b7280',
    };
    return colors[type] || '#6b7280';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Left: Conversations List */}
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '18px', fontWeight: '600' }}>Conversations</h2>

          {/* Search */}
          <input
            type="text"
            placeholder="Search by name, email, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '14px',
            }}
          />

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value)}
              style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="">All issue types</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="deposit">Deposit</option>
              <option value="shipping">Shipping</option>
              <option value="complaint">Complaint</option>
              <option value="card_redemption">Card Redemption</option>
              <option value="kyc">KYC</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Conversation List */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e0e0e0',
            maxHeight: '600px',
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Loading conversations...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>No conversations found</div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  background: selectedConv?.id === conv.id ? '#f9f9f9' : 'white',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseOut={(e) =>
                  (e.currentTarget.style.background =
                    selectedConv?.id === conv.id ? '#f9f9f9' : 'white')
                }
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{conv.user_name}</div>
                  <span
                    style={{
                      background: getIssueColor(conv.issue_type),
                      color: 'white',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500',
                    }}
                  >
                    {conv.issue_type}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                  {conv.last_message.substring(0, 60)}...
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>
                  {new Date(conv.updated_at).toLocaleDateString()} • {conv.user_location}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Details & Reply */}
      <div>
        {selectedConv ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e0e0e0',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '1rem', fontSize: '16px', fontWeight: '600' }}>Conversation Details</h3>

            <div style={{ marginBottom: '1.5rem', fontSize: '14px' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>Name:</strong> {selectedConv.user_name}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Email:</strong> {selectedConv.user_email}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Location:</strong> {selectedConv.user_location}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Issue Type:</strong> {selectedConv.issue_type}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Status:</strong> {selectedConv.status}
              </div>
              <div>
                <strong>Last Updated:</strong> {new Date(selectedConv.updated_at).toLocaleString()}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Last Message:</div>
              <div style={{ fontSize: '14px', color: '#333' }}>{selectedConv.last_message}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                Your Reply
              </label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your response..."
                style={{
                  width: '100%',
                  height: '100px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  marginBottom: '1rem',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleSendReply}
                disabled={sendingReply}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: sendingReply ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: sendingReply ? 0.7 : 1,
                }}
              >
                {sendingReply ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e0e0e0',
              padding: '2rem',
              textAlign: 'center',
              color: '#999',
            }}
          >
            Select a conversation to view details
          </div>
        )}
      </div>
    </div>
  );
}
