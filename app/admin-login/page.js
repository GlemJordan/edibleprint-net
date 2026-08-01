'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const ERROR_MESSAGES = {
  missing: 'Invalid link — token missing.',
  invalid: 'Invalid link — unauthorized.',
  expired: 'Link has expired. Request a new one.',
};

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | sent | error
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  // Same /api/admin/check every other admin page uses — if there's already
  // a valid ep_admin session, skip straight to a link into the order view
  // instead of asking for a magic link that isn't needed.
  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => setAlreadySignedIn(!!d.isAdmin))
      .catch(() => setAlreadySignedIn(false))
      .finally(() => setSessionChecked(true));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const resp = await fetch('/api/admin/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      if (data.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
        const detail = data.details ? JSON.stringify(data.details) : data.message || 'check server logs';
        setErrorMsg(`Error: ${data.error || 'Unknown'} — ${detail}`);
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg(`Network error: ${e.message}`);
    }
  }

  return (
    <>
    <meta name="robots" content="noindex, nofollow" />
    <div style={{
      maxWidth: 400,
      margin: '100px auto',
      padding: 32,
      fontFamily: 'sans-serif',
      textAlign: 'center',
    }}>
      <h1 style={{ color: '#1B6B4A', marginBottom: 8 }}>Admin Login</h1>

      {sessionChecked && alreadySignedIn ? (
        <>
          <p style={{ color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
            You&apos;re already signed in as admin.
          </p>
          <Link href="/admin/orders" style={{
            display: 'inline-block', padding: '11px 24px',
            background: '#1B6B4A', color: 'white', borderRadius: 8,
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            Go to Orders →
          </Link>
        </>
      ) : (
        <>
          <p style={{ color: '#6B7280', marginBottom: 32, fontSize: 14 }}>
            Enter your email to receive a magic link.
          </p>

          {errorParam && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5',
              color: '#DC2626', borderRadius: 8, padding: '10px 14px',
              marginBottom: 20, fontSize: 13,
            }}>
              {ERROR_MESSAGES[errorParam] || 'An error occurred.'}
            </div>
          )}

          {status === 'sent' ? (
            <div style={{
              background: '#ECFDF5', border: '1px solid #6EE7B7',
              color: '#065F46', borderRadius: 8, padding: '16px 20px', fontSize: 14,
            }}>
              Check your inbox — the link expires in 15 minutes.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px', borderRadius: 8,
                  border: '1.5px solid #D1D5DB', fontSize: 14,
                  marginBottom: 12, outline: 'none',
                }}
              />
              {errorMsg && (
                <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{errorMsg}</p>
              )}
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%', padding: '11px 0',
                  background: '#1B6B4A', color: 'white',
                  border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: status === 'loading' ? 0.6 : 1,
                }}
              >
                {status === 'loading' ? 'Sending…' : 'Send Magic Link'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
    </>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Loading…</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
