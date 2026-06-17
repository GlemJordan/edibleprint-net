import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { imageData, fileName } = await request.json();

    if (!imageData) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    const safeName = (fileName || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80) || 'order_' + Date.now();

    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'edibleprint-orders');
    formData.append('public_id', 'order_' + Date.now() + '_' + safeName);

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
