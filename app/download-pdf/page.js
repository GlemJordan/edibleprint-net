'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function DownloadPdfContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState('verifying'); // verifying | ready | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setError('Missing session ID');
      return;
    }

    (async () => {
      try {
        const verifyResp = await fetch(`/api/verify-download-session?session_id=${sessionId}`);
        const verified = await verifyResp.json();

        if (!verified.verified) {
          setStatus('error');
          setError('Payment not verified. Please contact support@edibleprint.net.');
          return;
        }

        // Fetch image from Cloudinary
        const imgResp = await fetch(verified.cloudinaryUrl);
        const blob = await imgResp.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Generate PDF
        const pdfResp = await fetch('/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: dataUrl,
            shape: verified.shape,
            sizeInches: verified.sizeInches,
            customW: verified.customW,
            customH: verified.customH,
            paymentVerified: true,
          }),
        });

        if (!pdfResp.ok) throw new Error('PDF generation failed');

        const pdfBlob = await pdfResp.blob();
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edibleprint-${verified.shape}-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);

        setStatus('ready');
      } catch (e) {
        console.error(e);
        setStatus('error');
        setError(e.message || 'Unknown error');
      }
    })();
  }, [sessionId]);

  return (
    <div style={{
      maxWidth: 480, margin: '80px auto', padding: 32,
      textAlign: 'center', fontFamily: 'sans-serif',
    }}>
      {status === 'verifying' && (
        <>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: '#1B6B4A' }}>Generating your PDF…</h2>
          <p style={{ color: '#6B7280' }}>This usually takes a few seconds. Please don't close this page.</p>
        </>
      )}
      {status === 'ready' && (
        <>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: '#1B6B4A' }}>Download started!</h2>
          <p style={{ color: '#374151' }}>Your PDF should be in your downloads folder.</p>
          <p style={{ marginTop: 24 }}>
            <a href="/" style={{ color: '#1B6B4A', fontWeight: 600 }}>← Back to EdiblePrint</a>
          </p>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2 style={{ color: '#DC2626' }}>Something went wrong</h2>
          <p style={{ color: '#374151' }}>{error}</p>
          <p style={{ color: '#6B7280', fontSize: 13 }}>
            Email us at <a href="mailto:support@edibleprint.net" style={{ color: '#1B6B4A' }}>support@edibleprint.net</a> with your session ID:
          </p>
          <code style={{
            display: 'block', background: '#F3F4F6', padding: '8px 12px',
            borderRadius: 6, fontSize: 12, marginTop: 8, wordBreak: 'break-all',
          }}>{sessionId}</code>
        </>
      )}
    </div>
  );
}

export default function DownloadPdfPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Loading…</div>}>
      <DownloadPdfContent />
    </Suspense>
  );
}
