'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// ── Theme tokens ──────────────────────────────────────────────────────────────
// Defined once here and consumed via var(--token) in inline styles across the
// dashboard. Flip data-theme on <html> to switch. Default: dark.
const THEME_CSS = `
:root[data-theme="light"] {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-3: #f0f4ff;
  --text: #1e293b;
  --text-muted: #64748b;
  --text-faint: #94a3b8;
  --border: #e2e8f0;
  --border-strong: #d1d5db;
  --bubble-them-bg: #e9e9eb;
  --bubble-them-text: #1e293b;
  --bubble-me-bg: #2563eb;
  --bubble-me-text: #ffffff;
  --row-unread: #fefce8;
  --row-active: #eef2ff;
}
:root, :root[data-theme="dark"] {
  --bg: #0b1220;
  --surface: #1e293b;
  --surface-2: #162032;
  --surface-3: #1f2a44;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --text-faint: #64748b;
  --border: #334155;
  --border-strong: #475569;
  --bubble-them-bg: #334155;
  --bubble-them-text: #e2e8f0;
  --bubble-me-bg: #2563eb;
  --bubble-me-text: #ffffff;
  --row-unread: #2a2410;
  --row-active: #1e2a4d;
}
body { background: var(--bg); }
input, textarea, select { color-scheme: light dark; }
`;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const router = useRouter();
  const pathname = usePathname();

  // Apply persisted theme (default dark) before showing content.
  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'light' | 'dark' | null) || 'dark';
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  };

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/conversations', label: 'Conversations' },
    { href: '/dashboard/analytics', label: 'Analytics' },
  ];

  if (loading) {
    return (
      <>
        <style>{THEME_CSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text)' }}>
          <p>Loading...</p>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return <style>{THEME_CSS}</style>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{THEME_CSS}</style>

      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>
          Support Hub
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              padding: '8px 12px',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        display: 'flex',
        gap: '2rem',
      }}>
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            style={{
              padding: '1rem 0',
              borderBottom: pathname === item.href ? '3px solid #3b82f6' : '3px solid transparent',
              color: pathname === item.href ? '#3b82f6' : 'var(--text-muted)',
              fontWeight: pathname === item.href ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottomWidth: '3px',
              borderBottomStyle: 'solid',
              borderBottomColor: pathname === item.href ? '#3b82f6' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '14px',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={{ padding: '2rem' }}>
        {children}
      </main>
    </div>
  );
}
