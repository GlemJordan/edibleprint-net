import catalog from '../content/design-catalog.json';
import { CATALOG_PRICES } from './catalog-prices.js';

// Single source of truth for the ready-made design catalog. To add a new
// design: drop its PNG in public/designs/<category>/ and add an entry to
// content/design-catalog.json — no component needs to change. Validated
// once at import time so a malformed manifest entry (bad category, a shape
// that doesn't actually exist in CATALOG_PRICES) fails loudly here instead
// of silently breaking the catalog page or, worse, checkout.

const CATEGORY_IDS = new Set(catalog.categories.map((c) => c.id));
const seenIds = new Set();

for (const d of catalog.designs) {
  if (seenIds.has(d.id)) throw new Error(`[design-catalog] duplicate design id "${d.id}"`);
  seenIds.add(d.id);
  if (!CATEGORY_IDS.has(d.category)) {
    throw new Error(`[design-catalog] design "${d.id}" has unknown category "${d.category}"`);
  }
  if (!d.supportedShapes || d.supportedShapes.length === 0) {
    throw new Error(`[design-catalog] design "${d.id}" has no supportedShapes`);
  }
  for (const shape of d.supportedShapes) {
    if (!CATALOG_PRICES[shape]) {
      throw new Error(`[design-catalog] design "${d.id}" supports unknown shape "${shape}"`);
    }
  }
  if (!d.textZone || !d.textZone.position) {
    throw new Error(`[design-catalog] design "${d.id}" has no textZone`);
  }
}

export function getCategories() {
  return catalog.categories;
}

export function getActiveDesigns() {
  return catalog.designs.filter((d) => d.active !== false);
}

export function getDesignById(id) {
  return catalog.designs.find((d) => d.id === id && d.active !== false) || null;
}

export function searchDesigns({ query = '', categoryId = '' } = {}) {
  const q = query.trim().toLowerCase();
  return getActiveDesigns().filter((d) => {
    if (categoryId && d.category !== categoryId) return false;
    if (q && !d.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
