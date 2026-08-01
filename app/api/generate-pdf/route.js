import { PDFDocument, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { Resend } from 'resend';
import { pageSizePtForShape, computeSheetPlacement } from '../../../lib/paper-config.js';
import { BUSINESS_ADDRESS_ONE_LINE } from '../../../lib/business-info.js';

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

  // Page size by material (A4 for icing sheet, Letter for wafer paper —
  // see lib/paper-config.js), not a single hardcoded A4 for everything.
  const pageSize = pageSizePtForShape(shape);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageSize.w, pageSize.h]);

  const base64Data = imageDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  const imageBytes = Buffer.from(base64Data, 'base64');
  const isPng = imageDataUrl.startsWith('data:image/png');
  const embeddedImage = isPng
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  // Same placement function the print-preview modal uses (app/page.js) — so
  // this can't diverge from what the customer was shown before checkout.
  const PT_PER_IN = 72;
  const placement = computeSheetPlacement(shape, { w: sizeInches }, customW, customH);
  const imgWidthPt  = placement.designW * PT_PER_IN;
  const imgHeightPt = placement.designH * PT_PER_IN;
  const x = placement.offsetX * PT_PER_IN;
  // PDF origin is bottom-left; placement.offsetY is measured from the top.
  const y = (placement.sheetH - placement.offsetY - placement.designH) * PT_PER_IN;

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
            <p>Thank you for your purchase. Attached is your custom edible print design as a print-ready PDF in ${shape === 'waferletter' ? 'Letter (8.5"×11")' : 'A4'} format.</p>
            <div style="background: #F5F5F5; padding: 14px 18px; border-radius: 8px; margin: 18px 0; font-size: 14px;">
              <strong>Order details:</strong><br>
              Shape: ${shape}${sizeLabel ? `<br>Size: ${sizeLabel}` : ''}
            </div>
            <p style="font-size: 13px; color: #666;">
              <strong>How to print:</strong> Open the attached PDF and print at 100% scale (no fit-to-page) on ${shape === 'waferletter' ? 'edible wafer paper' : 'edible icing sheets'} using a food-safe printer.
            </p>
            <p style="font-size: 12px; color: #888; margin-top: 24px;">
              Need help? Reply to this email.<br>
              EdiblePrint.net — ${BUSINESS_ADDRESS_ONE_LINE}
            </p>
          </div>
        `,
        text: `Your PDF is ready\n\n`
          + `Thank you for your purchase. Attached is your custom edible print design as a print-ready PDF in ${shape === 'waferletter' ? 'Letter (8.5"x11")' : 'A4'} format.\n\n`
          + `Order details:\nShape: ${shape}${sizeLabel ? `\nSize: ${sizeLabel}` : ''}\n\n`
          + `How to print: Open the attached PDF and print at 100% scale (no fit-to-page) on ${shape === 'waferletter' ? 'edible wafer paper' : 'edible icing sheets'} using a food-safe printer.\n\n`
          + `Need help? Reply to this email.\n`
          + `EdiblePrint.net — ${BUSINESS_ADDRESS_ONE_LINE}`,
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
