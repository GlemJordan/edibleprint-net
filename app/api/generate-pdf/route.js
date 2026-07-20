import { PDFDocument, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { Resend } from 'resend';

export async function POST(request) {
  const body = await request.json();
  const { imageDataUrl, shape, sizeInches, customW, customH, paymentVerified, customerEmail } = body;

  // Verify auth: admin cookie OR payment verified flag
  const cookieStore = await cookies();
  const adminToken = cookieStore.get('ep_admin')?.value;
  let isAdmin = false;

  if (adminToken) {
    try {
      const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
      const { payload } = await jwtVerify(adminToken, secret);
      if (payload.email === process.env.ADMIN_EMAIL && payload.role === 'admin') {
        isAdmin = true;
      }
    } catch {
      // invalid token
    }
  }

  if (!isAdmin && !paymentVerified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Build A4 PDF (595.28pt × 841.89pt = 210mm × 297mm)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const pageW = page.getWidth();
  const pageH = page.getHeight();

  const base64Data = imageDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  const imageBytes = Buffer.from(base64Data, 'base64');
  const isPng = imageDataUrl.startsWith('data:image/png');
  const embeddedImage = isPng
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  // Physical size in PDF points (72pt = 1 inch)
  let imgWidthPt, imgHeightPt;
  if (shape === 'fullsheet' || shape === 'bwsheet' || shape === 'multicircle') {
    imgWidthPt = 8 * 72;
    imgHeightPt = 11 * 72;
  } else if (shape === 'custom') {
    imgWidthPt = (parseFloat(customW) || 6) * 72;
    imgHeightPt = (parseFloat(customH) || 6) * 72;
  } else {
    // circular, heart, square — sizeInches × sizeInches
    const sz = parseFloat(sizeInches) || 4;
    imgWidthPt = sz * 72;
    imgHeightPt = sz * 72;
  }

  // Clamp to page bounds with 18pt margin
  const maxW = pageW - 36;
  const maxH = pageH - 36;
  if (imgWidthPt > maxW || imgHeightPt > maxH) {
    const scale = Math.min(maxW / imgWidthPt, maxH / imgHeightPt);
    imgWidthPt *= scale;
    imgHeightPt *= scale;
  }

  const x = (pageW - imgWidthPt) / 2;
  const y = (pageH - imgHeightPt) / 2;

  page.drawImage(embeddedImage, { x, y, width: imgWidthPt, height: imgHeightPt });

  const sizeLabel = shape === 'custom'
    ? `${customW}" × ${customH}"`
    : sizeInches ? `${sizeInches}"` : '';
  page.drawText(`EdiblePrint · ${shape.toUpperCase()} ${sizeLabel}`, {
    x: 30,
    y: 18,
    size: 7,
    color: rgb(0.65, 0.65, 0.65),
  });

  const pdfBytes = await pdfDoc.save();

  // Send PDF as email attachment to paying customer (never to admin)
  if (customerEmail && !isAdmin && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
      const sizeLabel = shape === 'custom'
        ? `${customW}" × ${customH}"`
        : sizeInches ? `${sizeInches}"` : '';

      const emailResult = await resend.emails.send({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: customerEmail,
        subject: 'Your EdiblePrint PDF download',
        html: `
          <div style="font-family: sans-serif; max-width: 540px; padding: 24px;">
            <h2 style="color: #1B6B4A; margin-top: 0;">Your PDF is ready</h2>
            <p>Thank you for your purchase. Attached is your custom edible print design as a print-ready PDF in A4 format.</p>
            <div style="background: #F5F5F5; padding: 14px 18px; border-radius: 8px; margin: 18px 0; font-size: 14px;">
              <strong>Order details:</strong><br>
              Shape: ${shape}${sizeLabel ? `<br>Size: ${sizeLabel}` : ''}
            </div>
            <p style="font-size: 13px; color: #666;">
              <strong>How to print:</strong> Open the attached PDF and print at 100% scale (no fit-to-page) on edible icing sheets using a food-safe printer.
            </p>
            <p style="font-size: 12px; color: #888; margin-top: 24px;">
              Need help? Reply to this email.<br>
              EdiblePrint · London, Ontario
            </p>
          </div>
        `,
        attachments: [
          {
            filename: `edibleprint-${shape}-${Date.now()}.pdf`,
            content: pdfBase64,
          },
        ],
      });
      console.log('[GENERATE-PDF] Email sent to customer:', JSON.stringify(emailResult));
    } catch (emailError) {
      // Don't fail the download if email fails — just log it
      console.error('[GENERATE-PDF] Email send failed:', emailError);
    }
  }

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="edibleprint-${shape}-${Date.now()}.pdf"`,
    },
  });
}
