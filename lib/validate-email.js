// Server-side email format check for the two Stripe checkout routes —
// previously nothing validated format server-side; it relied entirely on
// the browser's native type="email" input and whatever Stripe's own
// customer_email field does downstream. A simple, deliberately permissive
// RFC 5322-ish check: reject obvious garbage (no @, no domain, whitespace)
// without trying to be a full spec-compliant validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}
