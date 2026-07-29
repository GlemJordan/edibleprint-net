import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

/**
 * Verifies the ep_admin session cookie — the same magic-link session
 * mechanism used by app/api/admin/check, request-link, and verify-link.
 * Any route that returns customer/order data must call this and reject
 * the request if it returns null; there is no other valid way to
 * authenticate as admin in this app.
 *
 * @returns {Promise<{ email: string, role: string } | null>}
 */
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ep_admin')?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.email === process.env.ADMIN_EMAIL && payload.role === 'admin') {
      return payload;
    }
  } catch {
    // invalid or expired token
  }
  return null;
}
