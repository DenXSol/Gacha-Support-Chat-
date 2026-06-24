'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

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

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
            Support Hub
          </h1>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            background: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Logout
        </button>
      </header>

      {/* Navigation */}
      <nav style={{
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 2rem',
        display: 'flex',
        gap: '2rem',
      }}>
        <Link href="/dashboard">
          <a style={{
            padding: '1rem 0',
            borderBottom: pathname === '/dashboard' ? '3px solid #3b82f6' : 'none',
            color: pathname === '/dashboard' ? '#3b82f6' : '#666',
            fontWeight: pathname === '/dashboard' ? '600' : '400',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            Dashboard
          </a>
        </Link>
        <Link href="/dashboard/conversations">
          <a style={{
            padding: '1rem 0',
            borderBottom: pathname === '/dashboard/conversations' ? '3px solid #3b82f6' : 'none',
            color: pathname === '/dashboard/conversations' ? '#3b82f6' : '#666',
            fontWeight: pathname === '/dashboard/conversations' ? '600' : '400',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            Conversations
          </a>
        </Link>
        <Link href="/dashboard/analytics">
          <a style={{
            padding: '1rem 0',
            borderBottom: pathname === '/dashboard/analytics' ? '3px solid #3b82f6' : 'none',
            color: pathname === '/dashboard/analytics' ? '#3b82f6' : '#666',
            fontWeight: pathname === '/dashboard/analytics' ? '600' : '400',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            Analytics
          </a>
        </Link>
      </nav>

      {/* Main Content */}
      <main style={{ padding: '2rem' }}>
        {children}
      </main>
    </div>
  );
}
