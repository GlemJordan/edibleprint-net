/* Off-main-thread white-background removal.
 *
 * Runs the exact same flood-fill + edge-feather pixel algorithm that used to
 * run synchronously on the main thread (see the removed `removeWhiteBackground`
 * function in app/page.js) — only where it executes changed, not what it does
 * or what `tolerance` means.
 *
 * Protocol: postMessage({ requestId, bitmap, tolerance }, [bitmap]) in;
 * postMessage({ requestId, ok, bitmap? , error? }, [bitmap]) out.
 */

function removeWhiteBackgroundPixels(data, w, h, tolerance) {
  const visited = new Uint8Array(w * h);

  function isWhiteish(idx) {
    return Math.min(data[idx], data[idx + 1], data[idx + 2]) >= 255 - tolerance;
  }

  const queue = [];
  for (let x = 0; x < w; x++) { queue.push(x, 0); queue.push(x, h - 1); }
  for (let y = 0; y < h; y++) { queue.push(0, y); queue.push(w - 1, y); }

  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const pixelIdx = y * w + x;
    if (visited[pixelIdx]) continue;
    const dataIdx = pixelIdx * 4;
    if (!isWhiteish(dataIdx)) continue;
    visited[pixelIdx] = 1;
    data[dataIdx + 3] = 0;
    queue.push(x + 1, y); queue.push(x - 1, y);
    queue.push(x, y + 1); queue.push(x, y - 1);
  }

  /* Anti-aliasing pass on border pixels */
  const dataCopy = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (dataCopy[idx + 3] === 0 || dataCopy[idx + 3] < 255) continue;
      let transparentNeighbors = 0;
      for (const off of [-4, 4, -w * 4, w * 4]) {
        if (dataCopy[idx + off + 3] === 0) transparentNeighbors++;
      }
      if (transparentNeighbors >= 2) {
        const minCh = Math.min(data[idx], data[idx + 1], data[idx + 2]);
        if (minCh < 200) continue;
        const edge = 255 - tolerance - 20;
        if (minCh >= edge) {
          const fade = (minCh - edge) / 20;
          data[idx + 3] = Math.round(255 * (1 - Math.min(1, fade)));
        }
      }
    }
  }
}

self.onmessage = (e) => {
  const { requestId, bitmap, tolerance } = e.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    removeWhiteBackgroundPixels(imageData.data, canvas.width, canvas.height, tolerance);
    ctx.putImageData(imageData, 0, 0);

    const outBitmap = canvas.transferToImageBitmap();
    self.postMessage({ requestId, ok: true, bitmap: outBitmap }, [outBitmap]);
  } catch (err) {
    self.postMessage({ requestId, ok: false, error: (err && err.message) || String(err) });
  }
};
