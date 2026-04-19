import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ep_admin')?.value;

  if (!token) return NextResponse.json({ isAdmin: false });

  try {
    const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.email === process.env.ADMIN_EMAIL && payload.role === 'admin') {
      return NextResponse.json({ isAdmin: true });
    }
  } catch {
    // invalid or expired token
  }

  return NextResponse.json({ isAdmin: false });
}
