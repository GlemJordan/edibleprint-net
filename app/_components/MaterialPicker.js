'use client';

import { MATERIALS, shapeSupportsMaterial } from '../../lib/material-config.js';

/**
 * Icing Sheet vs Wafer Paper selector. Renders nothing for shapes that
 * don't offer a material choice (bwsheet — fixed grayscale-on-icing economy
 * product), so callers don't need their own guard around it.
 *
 * Same component used by the main editor (app/page.js) and the ready-made
 * design page (app/designs/[id]/page.js) — each passes its own local color
 * palette (the two pages define slightly different `C` objects) so this
 * reads as native to whichever page it's embedded in.
 *
 * @param {{ shape: string, material: string, onChange: (m: string) => void,
 *   colors: { brand: string, brandLight: string, border: string, text: string, muted: string, white: string } }} props
 */
export default function MaterialPicker({ shape, material, onChange, colors: C }) {
  if (!shapeSupportsMaterial(shape)) return null;

  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Material</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(MATERIALS).map(([key, m]) => {
          const selected = material === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              style={{
                flex: '1 1 200px', minWidth: 180, textAlign: 'left', padding: '12px 14px',
                borderRadius: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                border: selected ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                background: selected ? C.brandLight : C.white,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{m.label}</span>
                {m.recommended && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: C.brand, background: C.brandLight,
                    border: '1px solid ' + C.brand, borderRadius: 4, padding: '1px 6px',
                    textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>Recommended</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{m.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
