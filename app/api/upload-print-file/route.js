import { NextResponse } from 'next/server';
import { signRawUploadParams } from '../../../lib/cloudinary-ops.js';

// Must match UPLOAD_MAX_FILE_MB / UPLOAD_ACCEPTED types in app/page.js.
const MAX_FILE_MB = 25;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

// Only ISSUES A SIGNATURE — never receives the file itself. The browser
// uses this to upload the customer's file DIRECTLY to Cloudinary as a raw
// resource (byte-exact, no transformation pipeline). Keeping the file off
// our own serverless function avoids Vercel's ~4.5MB request body limit,
// which is well under the 25MB we tell customers is the cap.
export async function POST(request) {
  try {
    const { fileName, fileSizeBytes, mimeType } = await request.json();

    if (!fileName || !fileSizeBytes || !mimeType) {
      return NextResponse.json({ error: 'Missing file info' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }
    if (fileSizeBytes > MAX_FILE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File exceeds the ${MAX_FILE_MB}MB limit` }, { status: 400 });
    }

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const publicId = `edibleprint/customer-files/${Date.now()}_${safeName}`;
    const params = signRawUploadParams(publicId);

    return NextResponse.json(params);
  } catch (error) {
    console.error('upload-print-file signing error:', error);
    return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
  }
}
