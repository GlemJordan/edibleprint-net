import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/admin-login?error=missing', request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    if (payload.email !== process.env.ADMIN_EMAIL || payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin-login?error=invalid', request.url));
    }

    // Long-lived session token signed with same secret
    const sessionToken = await new (await import('jose')).SignJWT({ email: payload.email, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const cookieStore = await cookies();
    cookieStore.set('ep_admin', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return NextResponse.redirect(new URL('/?admin=enabled', request.url));
  } catch {
    return NextResponse.redirect(new URL('/admin-login?error=expired', request.url));
  }
}
