'use client';

export default function DashboardHome() {
  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ fontSize: '24px', marginBottom: '1rem' }}>
          Welcome to Support Hub
        </h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          ✅ Authentication is working!
        </p>
        <p style={{ color: '#999', fontSize: '14px' }}>
          Next: We'll build the conversation fetching and dashboard interface.
        </p>
      </div>
    </div>
  );
}
