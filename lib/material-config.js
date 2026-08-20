// Single source of truth for the "material" concept — icing sheet vs wafer
// paper — now that it's a choice crossing every shape instead of being a
// shape of its own ('waferletter'). Parallel to lib/paper-config.js
// centralizing physical-sheet logic: no 'use client' here, so both the
// client editor and server routes/PDF generation import this directly.
//
// Price is NOT a function of material — both cost exactly the same for a
// given shape+size (see lib/catalog-prices.js, which stays keyed by
// shape+sizeId only). Material only affects which physical stock gets
// loaded into the printer, so it's surfaced prominently wherever a human
// decides what to print on (production slip, print-ready PDF footer,
// order emails) — see resolveMaterial()/materialDisplayLabel() below.
export const MATERIALS = {
  icing: {
    label: 'Icing Sheet',
    recommended: true,
    description: 'Flexible and soft, with the most vivid, saturated colour. The classic choice — works great on any cake or cookie.',
  },
  wafer: {
    label: 'Wafer Paper',
    recommended: false,
    description: "Thinner and more brittle than icing sheets, absorbs moisture more easily, prints slightly less vivid colour, and needs no transfer step.",
  },
};

// Shapes that offer a material choice. bwsheet is deliberately excluded —
// it's a fixed grayscale-on-icing economy product, not a full catalog item.
export const MATERIAL_SHAPES = ['circular', 'heart', 'square', 'multicircle', 'fullsheet', 'custom'];

export function shapeSupportsMaterial(shape) {
  return MATERIAL_SHAPES.includes(shape);
}

// Backward-compat resolver — the ONE place "is this design wafer or icing?"
// gets decided. New orders carry design.material directly ('icing'|'wafer').
// Two kinds of legacy order have no material field:
//  - Old Stripe-flow orders: shape === 'waferletter' unambiguously meant
//    wafer paper back then.
//  - Old MANUAL orders (cash/marketplace, admin-entered — see
//    lib/order-record.js's buildManualOrderRecord): shape/material there
//    were always free text (e.g. shape: 'Wafer Paper', or a hand-typed
//    material field), never the 'waferletter' key — so a loose
//    case-insensitive substring check is the safety net for those,
//    deliberately looser than the exact checks above since a false
//    positive here ("labeled wafer, icing loaded as an unnecessary
//    precaution") is far cheaper than a false negative (wafer paper
//    printed on the wrong stock).
// Every consumer (production slip, print-ready PDF footer, owner/customer
// emails, Stripe line-item descriptions, admin order detail) calls this
// instead of re-deriving any of the three cases itself, so a legacy order
// and a new order can never be judged inconsistently.
export function resolveMaterial(design) {
  if (design?.material === 'wafer' || design?.material === 'icing') return design.material;
  if (design?.shape === 'waferletter') return 'wafer';
  const legacyText = `${design?.shape || ''} ${design?.material || ''}`.toLowerCase();
  return legacyText.includes('wafer') ? 'wafer' : 'icing';
}

export function materialDisplayLabel(material) {
  return MATERIALS[material]?.label || MATERIALS.icing.label;
}
