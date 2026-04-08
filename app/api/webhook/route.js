import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { imageData, fileName } = await request.json();

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'edibleprint-orders');
    formData.append('public_id', 'order_' + Date.now() + '_' + fileName.replace(/[^a-zA-Z0-9]/g, '_'));

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    const result = await cloudinaryResponse.json();

    if (result.secure_url) {
      return NextResponse.json({ url: result.secure_url });
    } else {
      console.error('Cloudinary error:', result);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
