// Validates content/design-catalog.json before it can ship. Chained into
// `npm run build` (see package.json) so a broken manifest entry — a typo'd
// sourceFile, a shape with a price but no size list, an out-of-range
// textZone — fails the deploy instead of going live as a $0.00 or blank-page
// design. Run it directly any time with `npm run validate:catalog`.
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import catalog from '../content/design-catalog.json' with { type: 'json' };
import { CATALOG_PRICES } from '../lib/catalog-prices.js';
import { CATALOG_DESIGN_SIZES } from '../lib/catalog-design-sizes.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ALIGN_VALUES = ['left', 'center', 'right'];
const errors = [];
const warnings = [];
const categoryIds = new Set(catalog.categories.map((c) => c.id));
const seenIds = new Set();

function checkZone(tag, z) {
  if (!z?.position || typeof z.position.x !== 'number' || typeof z.position.y !== 'number') {
    errors.push(`${tag}: textZone.position debe ser {x,y} numérico`);
  } else {
    if (z.position.x < 0 || z.position.x > 100) errors.push(`${tag}: textZone.position.x fuera de 0-100`);
    if (z.position.y < 0 || z.position.y > 100) errors.push(`${tag}: textZone.position.y fuera de 0-100`);
  }
  if (typeof z?.maxWidthPercent !== 'number' || z.maxWidthPercent <= 0 || z.maxWidthPercent > 100) {
    errors.push(`${tag}: textZone.maxWidthPercent debe ser numérico entre 0 y 100`);
  }
  if (z?.align && !ALIGN_VALUES.includes(z.align)) {
    errors.push(`${tag}: textZone.align "${z.align}" inválido (usar left/center/right)`);
  }
}

// Ventana para la foto del cliente (scripts/build-photo-masks.py): la
// máscara debe existir y la caja estar en % del arte.
function checkPhotoZone(tag, z) {
  if (typeof z.mask !== 'string' || !existsSync(path.join(PUBLIC_DIR, z.mask.replace(/^\//, '')))) {
    errors.push(`${tag}: photoZone.mask "${z.mask}" no existe en public`);
  }
  const b = z.box || {};
  if (!['x', 'y', 'w', 'h'].every((k) => typeof b[k] === 'number' && b[k] >= 0 && b[k] <= 100) || !(b.w > 0 && b.h > 0)) {
    errors.push(`${tag}: photoZone.box debe ser {x,y,w,h} en % (0-100)`);
  }
}

for (const d of catalog.designs) {
  const tag = `design "${d.id || '(sin id)'}"`;

  if (!d.id) errors.push(`${tag}: falta id`);
  else if (seenIds.has(d.id)) errors.push(`${tag}: id duplicado`);
  seenIds.add(d.id);

  if (!d.name) errors.push(`${tag}: falta name`);
  if (!categoryIds.has(d.category)) errors.push(`${tag}: category "${d.category}" no existe en categories[]`);

  if (!d.sourceFile) {
    errors.push(`${tag}: falta sourceFile`);
  } else if (!existsSync(path.join(PUBLIC_DIR, d.sourceFile.replace(/^\//, '')))) {
    errors.push(`${tag}: sourceFile "${d.sourceFile}" no existe en public${d.sourceFile}`);
  }

  if (!d.supportedShapes?.length) {
    errors.push(`${tag}: supportedShapes vacío`);
  } else {
    for (const shape of d.supportedShapes) {
      if (!CATALOG_PRICES[shape]) errors.push(`${tag}: shape "${shape}" no tiene precio en CATALOG_PRICES`);
      // A shape with a price but no size list renders a broken picker (empty
      // dropdown, $0.00 price) — this is a hard error, not a warning.
      if (!CATALOG_DESIGN_SIZES[shape]) errors.push(`${tag}: shape "${shape}" no tiene tamaños en CATALOG_DESIGN_SIZES (quedaría sin tamaños seleccionables y precio $0.00)`);
    }
  }

  checkZone(tag, d.textZone);

  // Arte/zona de texto propios para una forma (p. ej. la versión vertical
  // para "fullsheet"): la forma debe estar soportada y el archivo existir.
  for (const [shape, o] of Object.entries(d.shapeOverrides || {})) {
    const otag = `${tag} (override "${shape}")`;
    if (!d.supportedShapes?.includes(shape)) errors.push(`${otag}: la forma no está en supportedShapes`);
    if (o.sourceFile && !existsSync(path.join(PUBLIC_DIR, o.sourceFile.replace(/^\//, '')))) {
      errors.push(`${otag}: sourceFile "${o.sourceFile}" no existe en public${o.sourceFile}`);
    }
    if (o.textZone) checkZone(otag, o.textZone);
    if (o.photoZone) checkPhotoZone(otag, o.photoZone);
  }
  if (d.photoZone) checkPhotoZone(tag, d.photoZone);

  if (d.active === false) warnings.push(`${tag}: inactive — no aparecerá en el catálogo`);
}

if (warnings.length) { console.log('Avisos:'); warnings.forEach((w) => console.log('  - ' + w)); }
if (errors.length) {
  console.log('\nErrores:');
  errors.forEach((e) => console.log('  - ' + e));
  console.log(`\n${errors.length} error(es).`);
  process.exit(1);
}
console.log(`✓ ${catalog.designs.length} diseno(s) validados, sin errores.`);
