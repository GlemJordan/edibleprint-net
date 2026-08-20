import { generateProductionSlip, generatePrintPdf, extractPdfPage } from './generate-pdf.js';
import { uploadRaw, orderFolderPath, updateResourceContext } from './cloudinary-ops.js';
import { withRetry } from './with-retry.js';
import { resolveMaterial } from './material-config.js';

/**
 * Generates the production slip + per-design print-ready PDFs for an order,
 * uploads them, and persists the resulting URLs onto order.json (assets +
 * the searchable `missingAssets` context flag the admin order list reads).
 * This is the ONE place that does this — both the webhook (right after
 * saveOrderRecord) and the admin "Regenerate PDFs" action call it, so they
 * can't produce two different answers about what a given order's PDFs are.
 *
 * Takes an already-loaded OrderRecord (order.json shape) rather than
 * re-fetching internally, so callers that already have a fresh copy (the
 * webhook, right after saveOrderRecord()'s own upload) don't risk reading
 * back a stale pre-write version — Cloudinary's raw storage has been
 * observed to lag on an immediate re-fetch (see updateOrderStatus's comment
 * in lib/order-record.js).
 *
 * @param {import('../types/order.js').OrderRecord} record
 * @returns {Promise<{ pdfUrl: string, printPdfUrls: Array<{url:string,label:string}>, missingAssets: boolean, updatedRecord: object }>}
 */
export async function generateOrderPdfs(record) {
  const orderId = record.orderId;
  const folder = orderFolderPath(orderId);
  const isPickup = record.shipping?.method === 'pickup';

  // 1. Production slip
  const pdfOrder = {
    orderNumber: orderId,
    isTest: record.isTest,
    createdAt: record.createdAt,
    customerName: record.customer?.name,
    customerEmail: record.customer?.email,
    customerPhone: record.customer?.phone || '',
    designs: record.designs,
    shippingLabel: record.shipping?.label,
    isPickup,
    shippingLine1: record.shipping?.address?.line1,
    shippingCity: record.shipping?.address?.city,
    shippingProv: record.shipping?.address?.province,
    shippingPostal: record.shipping?.address?.postalCode,
    allNotes: record.notes,
  };
  const pdfBytes = await withRetry(() => generateProductionSlip(pdfOrder), 'generatePDF:' + orderId);
  const pdfPublicId = `${folder}/production-slip.pdf`;
  const pdfUrl = await withRetry(() => uploadRaw(pdfBytes, pdfPublicId), 'uploadPDF:' + orderId);

  // 2. Per-design print-ready PDFs (one per design with an image). Each
  // design's own failure is caught and logged individually so one bad
  // design can't take down the rest of the order's PDFs.
  const designs = record.designs || [];
  const printPdfUrls = [];
  for (let i = 0; i < designs.length; i++) {
    const d = designs[i];
    if (!d.imageUrl) continue;
    const baseLabel = designs.length > 1 ? 'Design ' + (i + 1) : 'Print-Ready';

    if (d.sourceType === 'upload') {
      // Customer-supplied file: the ORIGINAL is always the print-ready asset
      // (byte-for-byte, no re-encoding) unless it's a multi-page PDF, in
      // which case the one selected page gets structurally extracted.
      try {
        if (d.pageCount > 1) {
          const extractedBytes = await withRetry(
            () => extractPdfPage(d.imageUrl, d.selectedPage),
            'extractPdfPage:' + orderId + ':' + i,
          );
          const printPublicId = `${folder}/print-design${designs.length > 1 ? '-' + (i + 1) : ''}.pdf`;
          const printUrl = await withRetry(
            () => uploadRaw(extractedBytes, printPublicId),
            'uploadExtractedPage:' + orderId + ':' + i,
          );
          printPdfUrls.push({ url: printUrl, label: baseLabel + ' (page ' + d.selectedPage + ' of ' + d.pageCount + ', extracted)' });
        } else {
          printPdfUrls.push({ url: d.imageUrl, label: baseLabel + ' (customer’s original file)' });
        }
      } catch (printErr) {
        console.error('[order-pdf-pipeline] page extraction failed for design', i, printErr.message);
      }
      continue;
    }

    const sizeInches = parseFloat(d.size) || 6;
    const customW = d.shape === 'custom' ? parseFloat(d.size.split('"x')[0]) : undefined;
    const customH = d.shape === 'custom' ? parseFloat(d.size.split('"x')[1]) : undefined;
    try {
      const printBytes = await withRetry(
        () => generatePrintPdf({ imageUrl: d.imageUrl, shape: d.shape, material: resolveMaterial(d), sizeInches, customW, customH }),
        'generatePrintPdf:' + orderId + ':' + i,
      );
      const printPublicId = `${folder}/print-design${designs.length > 1 ? '-' + (i + 1) : ''}.pdf`;
      const printUrl = await withRetry(
        () => uploadRaw(printBytes, printPublicId),
        'uploadPrintPdf:' + orderId + ':' + i,
      );
      printPdfUrls.push({ url: printUrl, label: baseLabel });
    } catch (printErr) {
      console.error('[order-pdf-pipeline] print PDF failed for design', i, printErr.message);
    }
  }

  const neededPrintReadyCount = designs.filter((d) => d.imageUrl).length;
  const missingAssets = !pdfUrl || printPdfUrls.length < neededPrintReadyCount;

  const updatedRecord = {
    ...record,
    assets: { ...record.assets, productionSlipUrl: pdfUrl, printReadyUrls: printPdfUrls },
  };

  // Persist onto order.json + keep the list's searchable flag in sync. Best
  // effort — the PDFs themselves already uploaded successfully above, so a
  // failure here shouldn't read as "the whole thing failed".
  try {
    const jsonPublicId = `${folder}/order`;
    await uploadRaw(JSON.stringify(updatedRecord, null, 2), jsonPublicId);
    await updateResourceContext(jsonPublicId, { missingAssets: String(missingAssets) });
  } catch (persistErr) {
    console.error('[order-pdf-pipeline] failed to persist asset URLs for', orderId, persistErr.message);
  }

  return { pdfUrl, printPdfUrls, missingAssets, updatedRecord };
}
