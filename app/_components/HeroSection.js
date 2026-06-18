'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

const SLIDES = [
  { tag: 'Birthday Cake', after: '/hero/ejemplo-1-after.jpg', before: '/hero/ejemplo-1-before.jpg' },
  { tag: 'Cookies',       after: '/hero/ejemplo-2-after.jpg', before: '/hero/ejemplo-2-before.jpg' },
  { tag: 'Full Sheet',    after: '/hero/ejemplo-3-after.jpg', before: '/hero/ejemplo-3-before.jpg' },
  { tag: 'Cupcakes',      after: '/hero/ejemplo-4-after.jpg', before: '/hero/ejemplo-4-before.jpg' },
];

export default function HeroSection({ onOrderClick, cutoffMsg }) {
  const [current, setCurrent] = useState(0);
  const [afterErr, setAfterErr]   = useState({});
  const [beforeErr, setBeforeErr] = useState({});
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const timerRef   = useRef(null);
  const currentRef = useRef(0);
  currentRef.current = current;

  /* Detect prefers-reduced-motion */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const h = (e) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  /* Stable navigate function */
  const navigate = useCallback((idx) => {
    clearTimeout(timerRef.current);
    setCurrent(idx);
  }, []);

  /* Auto-advance (resets when current or reducedMotion changes) */
  useEffect(() => {
    if (prefersReducedMotion) return;
    timerRef.current = setTimeout(
      () => setCurrent((c) => (c + 1) % SLIDES.length),
      4500
    );
    return () => clearTimeout(timerRef.current);
  }, [current, prefersReducedMotion]);

  /* Keyboard navigation */
  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'ArrowLeft')
        navigate((currentRef.current - 1 + SLIDES.length) % SLIDES.length);
      if (e.key === 'ArrowRight')
        navigate((currentRef.current + 1) % SLIDES.length);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [navigate]);

  const slide = SLIDES[current];

  return (
    <>
      <style>{`
        .ep-hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .ep-hero-grid {
            grid-template-columns: 1fr;
            gap: 36px;
          }
          .ep-hero-right {
            order: -1;
          }
        }
        .ep-nav-btn:focus-visible,
        .ep-dot:focus-visible,
        .ep-cta-primary:focus-visible {
          outline: 3px solid #e8704a;
          outline-offset: 3px;
        }
        .ep-cta-secondary:focus-visible {
          outline: 3px solid #1f5236;
          outline-offset: 3px;
        }
      `}</style>

      <section style={{
        background: 'linear-gradient(160deg, #e8efe6 0%, #f4f6f1 55%, #f4f6f1 100%)',
        padding: '64px 24px 56px',
      }}>
        <div className="ep-hero-grid">

          {/* ══ LEFT: Copy ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>

            {/* Location badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#e8efe6', borderRadius: 40,
              padding: '6px 16px 6px 6px', marginBottom: 28,
              fontSize: 13, fontWeight: 600,
            }}>
              <span style={{
                background: '#1f5236', color: '#fff', borderRadius: 6,
                padding: '3px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
              }}>CA</span>
              <span style={{ color: '#1f5236' }}>
                Free Local Pickup · Same-Day London Delivery · Canada-Wide Shipping
              </span>
            </div>

            {/* H1 */}
            <h1 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 'clamp(40px, 4.5vw, 58px)',
              fontWeight: 500,
              lineHeight: 1.1,
              color: '#1a2420',
              margin: '0 0 20px',
              letterSpacing: '-0.5px',
            }}>
              Turn any photo into an{' '}
              <em style={{ color: '#1f5236', fontStyle: 'italic' }}>edible masterpiece</em>
            </h1>

            {/* Subtitle */}
            <p style={{
              fontSize: 17, color: '#5c6b62', lineHeight: 1.65,
              maxWidth: 460, margin: '0 0 24px',
            }}>
              Your photo, professionally printed on premium edible sheets and ready to
              decorate. No design skills, no account needed.
            </p>

            {/* Reviews pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', border: '1px solid #d9e2d6', borderRadius: 40,
              padding: '8px 18px', marginBottom: 28,
              fontSize: 13.5, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            }}>
              <span style={{ color: '#e8704a', letterSpacing: 2, fontSize: 15 }}>★★★★★</span>
              <span style={{ color: '#1a2420' }}>
                11 five-star reviews · Serving London, Ontario &amp; Canada
              </span>
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <button
                className="ep-cta-primary"
                onClick={onOrderClick}
                style={{
                  background: '#e8704a', color: '#fff', border: 'none', borderRadius: 12,
                  padding: '15px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(232,112,74,0.35)',
                  transition: 'background 0.2s, transform 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#d85a30';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#e8704a';
                  e.currentTarget.style.transform = '';
                }}
              >
                Upload Your Photo →
              </button>
              <button
                className="ep-cta-secondary"
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  background: 'transparent', color: '#1f5236',
                  border: '1px solid #d9e2d6', borderRadius: 12,
                  padding: '15px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f4f6f1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                See Pricing
              </button>
            </div>

            {/* Trust line */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              fontSize: 14, color: '#5c6b62', marginBottom: 16,
            }}>
              <span>From $9.99</span>
              <span style={{ color: '#d9e2d6', userSelect: 'none' }}>·</span>
              <span>Ships Canada-wide</span>
              <span style={{ color: '#d9e2d6', userSelect: 'none' }}>·</span>
              <span>Ready in under 2 min</span>
            </div>

            {/* Urgency pill — merges static note with dynamic cutoffMsg */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: cutoffMsg?.green ? '#ECFDF5' : '#fdf4e3',
              borderRadius: 40, padding: '7px 16px',
              fontSize: 13, fontWeight: 600,
              color: cutoffMsg?.green ? '#065F46' : '#8a5e15',
              border: cutoffMsg?.green ? '1px solid #6EE7B7' : 'none',
            }}>
              {cutoffMsg?.green ? '🟢' : '🕒'}{' '}
              {cutoffMsg?.text ?? 'Order now — production starts next business day'}
            </div>

          </div>

          {/* ══ RIGHT: Carousel ══ */}
          <div className="ep-hero-right">

            {/* Carousel frame */}
            <div style={{
              position: 'relative',
              borderRadius: 24,
              aspectRatio: '4 / 4.6',
              overflow: 'hidden',
              background: '#f4f6f1',
              boxShadow: '0 24px 64px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.06)',
            }}>

              {/* After image (full cover) */}
              {afterErr[current] ? (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: '#f4f6f1', border: '2px dashed #1f5236', gap: 8,
                }}>
                  <span style={{ color: '#1f5236', fontWeight: 700, fontSize: 15 }}>{slide.tag}</span>
                  <span style={{ color: '#5c6b62', fontSize: 12 }}>After — finished edible print</span>
                  <span style={{ color: '#5c6b62', fontSize: 11, opacity: 0.7 }}>
                    Add: /public/hero/ejemplo-{current + 1}-after.jpg
                  </span>
                </div>
              ) : (
                <Image
                  src={slide.after}
                  fill
                  sizes="(max-width: 900px) 100vw, 50vw"
                  style={{ objectFit: 'cover' }}
                  alt={`${slide.tag} — finished edible print`}
                  onError={() => setAfterErr((p) => ({ ...p, [current]: true }))}
                />
              )}

              {/* Before image + arrow wrapper */}
              <div style={{
                position: 'absolute',
                bottom: '8%',
                left: '6%',
                width: '38%',
                aspectRatio: '1 / 1',
                zIndex: 2,
              }}>
                {/* Before image container */}
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: 12,
                  border: '4px solid #fff',
                  overflow: 'hidden',
                  background: '#f4f6f1',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
                }}>
                  {beforeErr[current] ? (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: '#f4f6f1', border: '2px dashed #1f5236', gap: 4,
                    }}>
                      <span style={{ color: '#1f5236', fontWeight: 600, fontSize: 11 }}>Original photo</span>
                      <span style={{ color: '#5c6b62', fontSize: 10 }}>before</span>
                    </div>
                  ) : (
                    <Image
                      src={slide.before}
                      fill
                      sizes="(max-width: 900px) 40vw, 20vw"
                      style={{ objectFit: 'cover' }}
                      alt={`${slide.tag} — original photo`}
                      onError={() => setBeforeErr((p) => ({ ...p, [current]: true }))}
                    />
                  )}
                </div>

                {/* Coral arrow — right edge of before, centered vertically */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute', top: '50%', right: -18,
                    transform: 'translateY(-50%)',
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#e8704a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(232,112,74,0.5)',
                    pointerEvents: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              {/* Tag — top-right */}
              <div style={{
                position: 'absolute', top: 16, right: 16, zIndex: 3,
                background: '#fff', borderRadius: 40,
                padding: '5px 14px', fontSize: 13, fontWeight: 600, color: '#1f5236',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                {slide.tag}
              </div>

              {/* Prev arrow */}
              <button
                className="ep-nav-btn"
                onClick={() => navigate((current - 1 + SLIDES.length) % SLIDES.length)}
                aria-label="Previous example"
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.82)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(6px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  zIndex: 3,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M10 12L6 8l4-4" stroke="#1f5236" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Next arrow */}
              <button
                className="ep-nav-btn"
                onClick={() => navigate((current + 1) % SLIDES.length)}
                aria-label="Next example"
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.82)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(6px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  zIndex: 3,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 12l4-4-4-4" stroke="#1f5236" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

            </div>

            {/* Dots */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: 6, marginTop: 16,
            }}>
              {SLIDES.map((s, i) => (
                <button
                  key={i}
                  className="ep-dot"
                  onClick={() => navigate(i)}
                  aria-label={`Show example ${i + 1}: ${s.tag}`}
                  aria-current={i === current ? 'true' : undefined}
                  style={{
                    height: 8,
                    width: i === current ? 24 : 8,
                    borderRadius: 4,
                    background: i === current ? '#e8704a' : '#d9e2d6',
                    border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'width 0.3s ease, background 0.3s ease',
                  }}
                />
              ))}
            </div>

            {/* Caption */}
            <p style={{
              textAlign: 'center', color: '#5c6b62',
              fontSize: 13.5, marginTop: 14, lineHeight: 1.5,
              fontStyle: 'italic',
            }}>
              De tu foto al producto final — desliza para ver más ejemplos
            </p>

          </div>
        </div>
      </section>
    </>
  );
}
