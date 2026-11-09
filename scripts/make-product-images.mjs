// Builds the product photos for /products/* and the Google Merchant Center
// feed for the shapes that have no shareable real photo yet. Every round and
// square print in public/gallery shows a celebrity or a trademarked character,
// and Google Shopping disapproves (or suspends over) images like that, so these
// shapes get a clean mockup made from the site's own ready-made designs.
// Re-run after changing a source design:  node scripts/make-product-images.mjs
import sharp from 'sharp';

const SIZE = 1200;
const BG = '#F6F4F0';
const OUT = 'public/products';

const shadow = (shape) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter></defs>
    ${shape}
  </svg>`);

async function round(src, out, d = 960) {
  const off = (SIZE - d) / 2;
  const mask = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
  const print = await sharp(src).resize(d, d).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
    .composite([
      { input: shadow(`<circle cx="${SIZE / 2 + 6}" cy="${SIZE / 2 + 14}" r="${d / 2}" fill="rgba(0,0,0,0.20)" filter="url(#b)"/>`) },
      { input: print, left: off, top: off },
    ])
    .jpeg({ quality: 88 }).toFile(`${OUT}/${out}`);
}

async function square(src, out, d = 920) {
  const off = (SIZE - d) / 2;
  const print = await sharp(src).resize(d, d).toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
    .composite([
      { input: shadow(`<rect x="${off + 6}" y="${off + 14}" width="${d}" height="${d}" fill="rgba(0,0,0,0.20)" filter="url(#b)"/>`) },
      { input: print, left: off, top: off },
    ])
    .jpeg({ quality: 88 }).toFile(`${OUT}/${out}`);
}

// 6.5" black-and-white square centred on an A4 sheet, to scale.
async function bwSheet(src, out) {
  const h = 1080, w = Math.round(h * 8.27 / 11.69), sq = Math.round(w * 6.5 / 8.27);
  const left = (SIZE - w) / 2, top = (SIZE - h) / 2;
  const print = await sharp(src).resize(sq, sq).grayscale().toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
    .composite([
      { input: shadow(`<rect x="${left + 6}" y="${top + 12}" width="${w}" height="${h}" fill="rgba(0,0,0,0.16)" filter="url(#b)"/>`) },
      { input: { create: { width: w, height: h, channels: 3, background: '#FFFFFF' } }, left, top },
      { input: print, left: left + (w - sq) / 2, top: top + (h - sq) / 2 },
    ])
    .jpeg({ quality: 88 }).toFile(`${OUT}/${out}`);
}

await round('public/designs/elegant/elegant-marble-gold-01.jpg', 'round-edible-cake-topper.jpg');
await square('public/designs/birthday/birthday-balloon-bouquet-01.jpg', 'square-edible-cake-topper.jpg');
await bwSheet('public/designs/kids/kids-space-adventure-01.jpg', 'black-and-white-edible-image.jpg');
console.log('done');
