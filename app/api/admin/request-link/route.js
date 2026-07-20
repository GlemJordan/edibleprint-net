import { SignJWT } from 'jose';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request) {
  console.log('[MAGIC LINK] Request received');

  try {
    const body = await request.json();
    const { email } = body;
    console.log('[MAGIC LINK] Email requested:', email);

    if (!email) {
      console.error('[MAGIC LINK] No email provided');
      return NextResponse.json({ ok: false, error: 'No email' }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    console.log('[MAGIC LINK] Admin email configured:', adminEmail ? 'yes' : 'NO - missing env var');

    if (!adminEmail) {
      console.error('[MAGIC LINK] ADMIN_EMAIL env var missing');
      return NextResponse.json({ ok: false, error: 'Server config error' }, { status: 500 });
    }

    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      console.log('[MAGIC LINK] Email does not match admin. Returning silent OK.');
      return NextResponse.json({ ok: true });
    }

    const jwtSecret = process.env.ADMIN_JWT_SECRET;
    if (!jwtSecret) {
      console.error('[MAGIC LINK] ADMIN_JWT_SECRET env var missing');
      return NextResponse.json({ ok: false, error: 'Server config error' }, { status: 500 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    console.log('[MAGIC LINK] Resend API key present:', resendKey ? 'yes' : 'NO');

    if (!resendKey) {
      console.error('[MAGIC LINK] RESEND_API_KEY env var missing');
      return NextResponse.json({ ok: false, error: 'Email service not configured' }, { status: 500 });
    }

    // Generar JWT
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({ email, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);

    console.log('[MAGIC LINK] JWT generated, length:', token.length);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';
    const magicLink = `${baseUrl}/api/admin/verify-link?token=${token}`;

    console.log('[MAGIC LINK] Sending email to:', email);

    const resend = new Resend(resendKey);

    const result = await resend.emails.send({
      from: 'EdiblePrint.net <orders@edibleprint.net>',
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
          <p style="color: #888; font-size: 12px; word-break: break-all;">
            Or copy this link: ${magicLink}
          </p>
          <p style="color: #888; font-size: 12px;">
            This link expires in 15 minutes.
          </p>
        </div>
      `,
    });

    console.log('[MAGIC LINK] Resend response:', JSON.stringify(result));

    if (result.error) {
      console.error('[MAGIC LINK] Resend returned error:', result.error);
      return NextResponse.json({
        ok: false,
        error: 'Email send failed',
        details: result.error,
      }, { status: 500 });
    }

    if (!result.data || !result.data.id) {
      console.error('[MAGIC LINK] Resend returned no email ID');
      return NextResponse.json({
        ok: false,
        error: 'Email send failed (no ID)',
      }, { status: 500 });
    }

    console.log('[MAGIC LINK] Email sent successfully. ID:', result.data.id);
    return NextResponse.json({ ok: true, emailId: result.data.id });

  } catch (e) {
    console.error('[MAGIC LINK] Unexpected error:', e);
    console.error('[MAGIC LINK] Error stack:', e.stack);
    return NextResponse.json({
      ok: false,
      error: 'Internal error',
      message: e.message,
    }, { status: 500 });
  }
}
