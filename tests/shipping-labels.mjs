// Shipping labels for the orders still to be mailed (/admin/orders/labels):
// which orders get labels and how many (one per package), each address in
// Canada Post's format (uppercase, two-letter province, "A1A 1A1", two spaces
// before the postal code, units, no "#"), how labels land on partly used
// Letter sheets, the real PDF (text read back from the generated file), and
// the order loading with Cloudinary answered here.
//
// Pure functions, an in-memory PDF and a stubbed fetch — nothing external is
// touched, no dev server needed.
process.env.CLOUDINARY_CLOUD_NAME = 'stub-cloud';
process.env.CLOUDINARY_API_KEY = 'stub-key';
process.env.CLOUDINARY_API_SECRET = 'stub-secret';

const {
  provinceCode, formatPostalCode, cleanAddressLine, splitCivicAddress, formatLabelAddress,
  returnAddressLines, needsShippingLabel, describeLabelOrders, expandLabels, labelReference,
  planLabelSheets, normalizeFreeSpaces,
} = await import('../lib/shipping-labels.js');
const { generateShippingLabelsPdf } = await import('../lib/shipping-labels-pdf.js');
const { loadLabelOrders } = await import('../lib/shipping-labels-data.js');

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

const design = (quantity) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity, unitPrice: 14.99 });
const order = (orderId, over = {}) => ({
  orderId, orderNumber: orderId, createdAt: '2026-10-01T15:00:00.000Z', isTest: false,
  customer: { name: 'Maria Gonzalez', email: 'fake@example.com' },
  designs: [design(1)], shippingMethod: 'standard', shippingPackages: 1,
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail', address: { line1: '250 Yonge St', city: 'Toronto', province: 'Ontario', postalCode: 'M5B 2L7', country: 'CA' } },
  payment: { amountCents: 2998, currency: 'CAD', status: 'paid', method: 'stripe_card' },
  production: { status: 'printed', updatedAt: '2026-10-01T16:00:00.000Z' },
  ...over,
});
const withAddress = (address, over = {}) => order('EP-ADDR', { ...over, shipping: { method: 'canada_post_shipping', address: { country: 'CA', ...address } } });

// ── Provinces and postal codes ──────────────────────────────────────────────
check('province: checkout full names read as the two-letter symbol',
  provinceCode('Ontario') === 'ON' && provinceCode('British Columbia') === 'BC' && provinceCode('Newfoundland and Labrador') === 'NL' && provinceCode('Prince Edward Island') === 'PE');
check('province: codes, accents, French names and abbreviations', provinceCode('qc') === 'QC' && provinceCode('Québec') === 'QC' && provinceCode('P.E.I.') === 'PE' && provinceCode('Colombie-Britannique') === 'BC' && provinceCode(' ont ') === 'ON');
check('province: anything else is not guessed', provinceCode('Ontari') === null && provinceCode('') === null && provinceCode(undefined) === null && provinceCode('NY') === null);
check('postal code: normalized to "A1A 1A1" from any spacing/case/dash', formatPostalCode('n6a1b2') === 'N6A 1B2' && formatPostalCode(' N6A-1B2 ') === 'N6A 1B2' && formatPostalCode('N6A  1B2') === 'N6A 1B2');
check('postal code: letters Canada never uses, ZIP codes and junk are rejected',
  formatPostalCode('D6A 1B2') === null && formatPostalCode('N6A 1B0X') === null && formatPostalCode('90210') === null && formatPostalCode('') === null && formatPostalCode('W1A 1A1') === null);

// ── Address lines ───────────────────────────────────────────────────────────
check('line: uppercase, no "#", commas or periods; apostrophes, hyphens and C/O stay',
  cleanAddressLine("12 O'Brien Ave., Ste-Foy #3") === "12 O'BRIEN AVE STE-FOY 3" && cleanAddressLine('c/o  John') === 'C/O JOHN');
check('line: accents are kept (Canada Post accepts them)', cleanAddressLine('Montréal') === 'MONTRÉAL');
check('unit: a bare unit after the comma goes in front with a hyphen', splitCivicAddress('250 Yonge St, 1500').civic === '1500-250 YONGE ST');
check('unit: "#4" after the comma or on the street itself does too', splitCivicAddress('123 Main St, #4').civic === '4-123 MAIN ST' && splitCivicAddress('123 Main St #4').civic === '4-123 MAIN ST');
check('unit: with a designator it stays after the street, without "#"',
  splitCivicAddress('1234 Rue Sainte-Catherine O, Apt #4').civic === '1234 RUE SAINTE-CATHERINE O APT 4' && splitCivicAddress('9 King St W, Suite 200').civic === '9 KING ST W SUITE 200');
check('unit: a street that already has one is not given a second prefix', splitCivicAddress('7-40 Burslem St, 3').civic === '7-40 BURSLEM ST UNIT 3');
check('extra info (buzzer, c/o) is kept on its own line, never dropped', (() => {
  const s = splitCivicAddress('742 Evergreen Terr., Buzzer 1234');
  return s.civic === '742 EVERGREEN TERR' && s.extraLines.join('|') === 'BUZZER 1234';
})());
check('a separate line2 is read too', splitCivicAddress('10 Elm St', 'Unit 5').civic === '10 ELM ST UNIT 5');

// ── The destination block ───────────────────────────────────────────────────
{
  const { lines, problems } = formatLabelAddress(withAddress({ line1: '250 Yonge St, 1500', city: 'Toronto', province: 'Ontario', postalCode: 'm5b2l7' }));
  check('block: name, civic, then "CITY PROV  POSTAL" with one and two spaces', lines.join('|') === 'MARIA GONZALEZ|1500-250 YONGE ST|TORONTO ON  M5B 2L7' && problems.length === 0, lines);
}
{
  const { lines } = formatLabelAddress(withAddress({ line1: '742 Evergreen Terr, Buzzer 1234', city: 'Kelowna', province: 'British Columbia', postalCode: 'V1Y 7V8' }));
  check('block: extra info sits between the name and the civic line; city line is last', lines.join('|') === 'MARIA GONZALEZ|BUZZER 1234|742 EVERGREEN TERR|KELOWNA BC  V1Y 7V8', lines);
}
check('block: never says CANADA on a domestic address', !formatLabelAddress(order('EP-X')).lines.some((l) => /CANADA/.test(l)));
{
  const { lines } = formatLabelAddress(withAddress({ line1: '1 Rue Principale', city: 'Saint-Jean-Baptiste-de-Rouville-sur-Richelieu', province: 'QC', postalCode: 'J0L 1E0' }));
  check('block: a municipality line over 40 characters puts the postal code alone on the last line',
    lines[lines.length - 1] === 'J0L 1E0' && lines[lines.length - 2] === 'SAINT-JEAN-BAPTISTE-DE-ROUVILLE-SUR-RICHELIEU QC', lines);
}
{
  const { problems } = formatLabelAddress(withAddress({ line1: '', city: '', province: 'Ontari', postalCode: '1234' }, { customer: { name: '' } }));
  const all = problems.join(' | ');
  check('problems: every missing or wrong part is named for the admin',
    /Missing customer name/.test(all) && /Missing street address/.test(all) && /Missing city/.test(all) && /Province not recognized: "Ontari"/.test(all) && /Postal code doesn't look Canadian: "1234"/.test(all), problems);
}
check('problems: an order with no address at all says so instead of failing', (() => {
  const r = formatLabelAddress(order('EP-NOADDR', { shipping: { method: 'canada_post_shipping' } }));
  return r.problems.includes('Missing street address') && r.problems.includes('Missing postal code');
})());
check('return address: business name, civic line and city line in the same format',
  returnAddressLines().join('|') === 'EDIBLEPRINT|40 BURSLEM ST UNIT 7|LONDON ON  N5W 2V7', returnAddressLines());

// ── Which orders, how many labels ───────────────────────────────────────────
const STD3 = order('EP-STD3', { designs: [design(5)], shippingPackages: 3, committedDate: '2026-10-06' });
const TRK = order('EP-TRK1', { shippingMethod: 'tracked', shippingPackages: 1, designs: [design(4)], committedDate: '2026-10-05' });
const PICK = order('EP-PICK', { shippingMethod: 'pickup', shippingPackages: 0, shipping: { method: 'pickup', label: 'Pickup — East London, ON' } });
const SHIPPED = order('EP-SHPD', { production: { status: 'shipped', updatedAt: '' } });
const REFUNDED = order('EP-REFD', { payment: { amountCents: 1, currency: 'CAD', status: 'refunded' } });
const LEGACY = order('EP-OLD1', { shippingMethod: undefined, shippingPackages: undefined, designs: [design(2), design(1)], createdAt: '2026-07-01T00:00:00Z' });
const PAID = order('EP-PAID', { production: { status: 'paid', updatedAt: '' }, createdAt: '2026-10-02T00:00:00Z' });

check('needs a label: shipping orders not yet mailed, at any production stage', needsShippingLabel(STD3) && needsShippingLabel(TRK) && needsShippingLabel(PAID) && needsShippingLabel(LEGACY));
check('no label: pickup, already shipped, refunded', !needsShippingLabel(PICK) && !needsShippingLabel(SHIPPED) && !needsShippingLabel(REFUNDED) && !needsShippingLabel(null));
const reviewed = describeLabelOrders([PAID, SHIPPED, STD3, PICK, LEGACY, TRK, REFUNDED]);
check('review list: only the 4 orders still to mail', reviewed.map((o) => o.orderId).sort().join() === 'EP-OLD1,EP-PAID,EP-STD3,EP-TRK1', reviewed.map((o) => o.orderId));
check('review list: soonest ship-by date first, then oldest order', reviewed.map((o) => o.orderId).join() === 'EP-TRK1,EP-STD3,EP-OLD1,EP-PAID', reviewed.map((o) => o.orderId));
check('one label per package: standard 3, tracked 1, an old order worked out from its 3 sheets = 2',
  (() => { const by = Object.fromEntries(reviewed.map((o) => [o.orderId, o])); return by['EP-STD3'].packages === 3 && by['EP-TRK1'].packages === 1 && by['EP-OLD1'].packages === 2; })());
check('service names: LETTERMAIL / XPRESSPOST', reviewed.find((o) => o.orderId === 'EP-TRK1').service === 'XPRESSPOST' && reviewed.find((o) => o.orderId === 'EP-STD3').service === 'LETTERMAIL');
const labels = expandLabels(reviewed);
check('expanded: 1 + 3 + 2 + 1 = 7 labels, packages numbered within each order', labels.length === 7
  && labels.filter((l) => l.orderId === 'EP-STD3').map((l) => l.packageNumber).join() === '1,2,3', labels.map((l) => l.orderId + '/' + l.packageNumber));
check('reference line: order, service, and the package count only when there are several',
  labelReference(labels.find((l) => l.orderId === 'EP-STD3' && l.packageNumber === 2)) === 'EP-STD3 · LETTERMAIL · PKG 2 OF 3'
  && labelReference(labels.find((l) => l.orderId === 'EP-TRK1')) === 'EP-TRK1 · XPRESSPOST');

// ── Sheets ──────────────────────────────────────────────────────────────────
const plan = (n, free) => planLabelSheets(n, free);
check('sheets: 1 label on a new sheet leaves 3 spaces to reuse', (() => { const p = plan(1, 4); return p.pages.join() === '1' && p.newSheets === 1 && p.leftoverSpaces === 3 && p.leftoverFeedable; })());
check('sheets: 7 labels on new sheets = 4 + 3, 1 space left that cannot feed', (() => { const p = plan(7, 4); return p.pages.join() === '4,3' && p.newSheets === 2 && p.leftoverSpaces === 1 && !p.leftoverFeedable; })());
check('sheets: a sheet with 2 spaces left takes 2 first, then new sheets', (() => { const p = plan(5, 2); return p.pages.join() === '2,3' && p.newSheets === 1 && p.leftoverSpaces === 1; })());
check('sheets: filling a partly used sheet exactly uses no new sheet', (() => { const p = plan(3, 3); return p.pages.join() === '3' && p.newSheets === 0 && p.leftoverSpaces === 0; })());
check('sheets: nothing to print, nothing used', (() => { const p = plan(0, 4); return p.pages.length === 0 && p.newSheets === 0; })());
check('free spaces: only 4, 3 or 2 (one strip is too short to feed); anything else is a new sheet',
  normalizeFreeSpaces('3') === 3 && normalizeFreeSpaces(2) === 2 && normalizeFreeSpaces('1') === 4 && normalizeFreeSpaces(null) === 4 && normalizeFreeSpaces('abc') === 4);

// ── The real PDF ────────────────────────────────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function readPdf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push({ text: content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' '), view: page.view });
  }
  return pages;
}
{
  const pages = await readPdf(await generateShippingLabelsPdf(labels, { firstSheetFree: 3 }));
  check('PDF: Letter pages, 7 labels on a 3-space sheet = 3 + 4', pages.length === 2 && pages.every((p) => p.view[2] === 612 && p.view[3] === 792)
    && (pages[0].text.match(/TO \/ À/g) || []).length === 3 && (pages[1].text.match(/TO \/ À/g) || []).length === 4, pages.map((p) => p.text.slice(0, 80)));
  const all = pages.map((p) => p.text).join(' ');
  check('PDF: destination printed in Canada Post format', all.includes('MARIA GONZALEZ') && all.includes('TORONTO ON M5B 2L7'), all.slice(0, 300));
  check('PDF: return address, note and references on the labels', all.includes('EDIBLEPRINT') && all.includes('LONDON ON N5W 2V7') && all.includes('DO NOT BEND / NE PAS PLIER') && all.includes('EP-STD3 · LETTERMAIL · PKG 3 OF 3'));
}
{
  const fancy = expandLabels(describeLabelOrders([order('EP-UNIC', { customer: { name: 'Zoë Łukasz 王' } })]));
  let ok = true; let text = '';
  try { text = (await readPdf(await generateShippingLabelsPdf(fancy))).map((p) => p.text).join(' '); } catch (e) { ok = false; text = e.message; }
  check('PDF: a name with letters Helvetica lacks still prints (Ł → L, unknown dropped) instead of failing', ok && text.includes('ZOË LUKASZ'), text.slice(0, 200));
}
check('PDF: refuses to make an empty file', await generateShippingLabelsPdf([]).then(() => false, () => true));

// ── Loading orders (Cloudinary answered here) ───────────────────────────────
{
  const bodies = { 'EP-STD3': STD3, 'EP-TRK1': TRK, 'EP-SHPD': SHIPPED, 'EP-STAL': order('EP-STAL', { production: { status: 'shipped', updatedAt: '' } }) };
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/resources/search')) {
      const res = (id, ctx) => ({ public_id: `edibleprint/orders/${id}/order`, context: { custom: ctx } });
      return new Response(JSON.stringify({ resources: [
        res('EP-STD3', { status: 'printed', shippingMethod: 'standard' }),
        res('EP-TRK1', { status: 'paid', shippingMethod: 'tracked' }),
        res('EP-PICK', { status: 'printed', shippingMethod: 'pickup', isPickup: 'true' }),
        res('EP-SHPD', { status: 'shipped', shippingMethod: 'standard' }),
        res('EP-REFD', { status: 'printed', paymentStatus: 'refunded' }),
        // Context says printed but the body says shipped: the body wins.
        res('EP-STAL', { status: 'printed', shippingMethod: 'standard' }),
        { public_id: 'edibleprint/orders/EP-STD3/production-slip.pdf', context: {} },
      ] }), { status: 200 });
    }
    const m = /orders\/([^/]+)\/order\?/.exec(u);
    if (m) {
      fetched.push(m[1]);
      return bodies[m[1]] ? new Response(JSON.stringify(bodies[m[1]]), { status: 200 }) : new Response('nope', { status: 404, statusText: 'Not Found' });
    }
    throw new Error('unexpected fetch ' + u);
  };
  try {
    const all = await loadLabelOrders();
    check('loading: context skips pickup, shipped and refunded orders without reading their bodies',
      !fetched.includes('EP-PICK') && !fetched.includes('EP-SHPD') && !fetched.includes('EP-REFD'), fetched);
    check('loading: the order body has the last word (stale context, really shipped → left out)',
      all.orders.map((o) => o.orderId).join() === 'EP-TRK1,EP-STD3', all.orders.map((o) => o.orderId));
    fetched.length = 0;
    const picked = await loadLabelOrders(['EP-STD3', 'EP-SHPD', 'EP-GONE', 'EP-TRK1']);
    check('chosen ids: kept in the order chosen; a shipped or unreadable one is left out, not printed twice',
      picked.orders.map((o) => o.orderId).join() === 'EP-STD3,EP-TRK1', picked.orders.map((o) => o.orderId));
  } finally {
    globalThis.fetch = realFetch;
  }
}

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
