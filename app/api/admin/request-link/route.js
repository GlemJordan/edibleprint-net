import { SignJWT } from 'jose';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { email } = await request.json();

  if (email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ ok: true });
  }

  const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
  const token = await new SignJWT({ email, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';
  const magicLink = `${baseUrl}/api/admin/verify-link?token=${token}`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'EdiblePrint.net <onboarding@resend.dev>',
    to: email,
    subject: 'Your EdiblePrint admin login link',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; padding: 24px;">
        <h2 style="color: #1B6B4A;">Admin Login</h2>
        <p>Click the link below to enable admin mode for the next 30 days:</p>
        <p>
          <a href="${magicLink}" style="
            display: inline-block;
            background: #1B6B4A;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
          ">Enable Admin Mode</a>
        </p>
        <p style="color: #888; font-size: 12px;">
          This link expires in 15 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
