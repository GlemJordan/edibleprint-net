"""Builds the photo-window masks for the ready-made design catalog.

Every catalog artwork leaves a clear centre for the customer's name. This
script finds that clear area on each artwork and writes a mask PNG next to
it (<artwork>-photo-mask.png), so the design page can put the customer's
photo "behind" the artwork: the photo shows only through the clear centre,
and everything printed inside it (headline, rings, bows, bats...) stays on
top. It also writes the window's bounding box into content/design-catalog.json
as `photoZone`, which is what the photo is cover-fit into.

The mask's ALPHA channel is the window: 255 = the photo shows, 0 = the
artwork shows. Inside the window, the artwork's own lettering keeps a soft
halo of its panel colour so a headline stays readable over any photo.

Run after adding or re-rendering artwork:
    python3 scripts/build-photo-masks.py            # all designs
    python3 scripts/build-photo-masks.py <id> ...    # only these designs
Needs: pip install opencv-python-headless numpy pillow
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'content', 'design-catalog.json')
PUBLIC = os.path.join(ROOT, 'public')

MASK_LONG_SIDE = 1500   # px; plenty for a soft alpha edge at 300 DPI
FLOOD_DIFF = 1          # per-channel step the flood fill may cross (floating range)
OPEN_PCT = 1.5          # % of width: thinner panel-coloured strips (field lines...) are cut off
HALO = 0.85             # how opaque the panel-colour halo around inner lettering is

# Designs whose clear centre isn't closed off by the artwork itself (no
# panel edge — the background just continues): the window is limited to this
# circle, in % of the artwork width, centred on the text zone column.
LIMIT_CIRCLE = {
    'baby-god-bless-01': {'cx': 50, 'cy': 51, 'r': 29},
}
# Designs where a photo window doesn't make sense.
SKIP = set()


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def window_mask(img_rgb, seed_pct, limit=None):
    """Returns (alpha float32 0..1, window bool, bbox) at img_rgb's size."""
    h, w = img_rgb.shape[:2]
    work = img_rgb.copy()
    sx, sy = int(seed_pct[0] / 100 * w), int(seed_pct[1] / 100 * h)

    def flood(px, py):
        ff = np.zeros((h + 2, w + 2), np.uint8)
        flags = 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8)
        cv2.floodFill(work.copy(), ff, (px, py), 0, (FLOOD_DIFF,) * 3, (FLOOD_DIFF,) * 3, flags)
        return ff[1:-1, 1:-1] > 0

    region = flood(sx, sy)

    # Cut thin panel-coloured strips that touch the window (a pitch's white
    # halfway line, say). Everything that survives the opening is still part
    # of the same flood-filled panel — a wide headline can split it into an
    # upper and a lower part — so all sizeable parts are kept.
    k = max(3, int(w * OPEN_PCT / 100)) | 1
    opened = cv2.morphologyEx(region.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, lab_cc, stats, _ = cv2.connectedComponentsWithStats(opened, connectivity=4)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x0, y0, bw, bh, area = stats[i]
        on_edge = x0 == 0 or y0 == 0 or x0 + bw == w or y0 + bh == h
        keep[i] = area >= 0.005 * w * h and (not on_edge or limit is not None)
    region = keep[lab_cc] & region

    if limit is not None:
        yy, xx = np.mgrid[0:h, 0:w]
        lim = (xx - limit['cx'] / 100 * w) ** 2 + (yy - limit['cy'] / 100 * h) ** 2 <= (limit['r'] / 100 * w) ** 2
        region &= lim

    touches = region[0, :].any() or region[-1, :].any() or region[:, 0].any() or region[:, -1].any()
    if touches and limit is None:
        raise SystemExit(f'flood fill leaked to the artwork edge from seed {seed_pct} — add a LIMIT_CIRCLE entry')

    # Window = the panel with its holes (lettering, letter counters, small art
    # inside it) filled in. A closing first bridges a headline that splits the
    # panel in two, so the band the headline sits in is part of the window too.
    kc = max(3, int(w * 0.05)) | 1
    closed = cv2.morphologyEx(region.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kc, kc)))
    cnts, _ = cv2.findContours(closed | region.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    win = np.zeros((h, w), np.uint8)
    cv2.drawContours(win, [c for c in cnts if cv2.contourArea(c) >= 0.005 * w * h], -1, 1, thickness=cv2.FILLED)
    win = win.astype(bool)
    if limit is not None:
        win &= lim

    # Local panel colour (handles gradient panels such as a shaded moon):
    # average of the flood-filled pixels around each point.
    lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] *= 100 / 255
    lab[..., 1:] -= 128
    sig = max(4, w * 0.03)
    r32 = region.astype(np.float32)
    den = cv2.GaussianBlur(r32, (0, 0), sig) + 1e-4
    panel = np.stack([cv2.GaussianBlur(lab[..., c] * r32, (0, 0), sig) / den for c in range(3)], -1)
    dist = np.linalg.norm(lab - panel, axis=-1)

    # Panel pixels -> photo; clearly different pixels (lettering, art) -> artwork.
    alpha = 1 - smoothstep(5, 28, dist)
    alpha[region] = 1.0
    alpha[~win] = 0.0

    # Halo: keep a soft panel-coloured glow around the lettering/art that sits
    # INSIDE the window (not around the window's own edge rings).
    inner = cv2.distanceTransform(win.astype(np.uint8), cv2.DIST_L2, 5) > w * 0.03
    art_inside = ((1 - alpha) * inner).astype(np.float32)
    k = max(3, int(w * 0.012)) | 1
    glow = cv2.dilate(art_inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    glow = cv2.GaussianBlur(glow, (0, 0), w * 0.006)
    alpha *= 1 - HALO * np.clip(glow * 1.4, 0, 1)

    if limit is not None:
        # No panel edge to stop at: fade the photo out softly instead of a
        # hard circular cut.
        r_in = (limit['r'] - 1.5) / 100 * w
        core = ((xx - limit['cx'] / 100 * w) ** 2 + (yy - limit['cy'] / 100 * h) ** 2 <= r_in ** 2).astype(np.float32)
        alpha *= cv2.GaussianBlur(core, (0, 0), w * 0.01)

    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.6)
    ys, xs = np.nonzero(win)
    bbox = (xs.min() / w * 100, ys.min() / h * 100, (xs.max() + 1 - xs.min()) / w * 100, (ys.max() + 1 - ys.min()) / h * 100)
    return alpha, win, bbox


def build(source_file, text_zone, design_id):
    src = os.path.join(PUBLIC, source_file.lstrip('/'))
    im = Image.open(src).convert('RGB')
    s = MASK_LONG_SIDE / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    rgb = np.array(im)
    alpha, win, bbox = window_mask(rgb, (text_zone['position']['x'], text_zone['position']['y']), LIMIT_CIRCLE.get(design_id))
    a8 = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    out = Image.merge('LA', (Image.new('L', im.size, 255), Image.fromarray(a8)))
    rel = os.path.splitext(source_file)[0] + '-photo-mask.png'
    out.save(os.path.join(PUBLIC, rel.lstrip('/')), optimize=True)
    zone = {'mask': rel, 'box': {k: round(v, 2) for k, v in zip(('x', 'y', 'w', 'h'), bbox)}}
    return zone, rgb, alpha


def main(only):
    manifest = json.load(open(MANIFEST))
    for d in manifest['designs']:
        if only and d['id'] not in only:
            continue
        if d['id'] in SKIP:
            d.pop('photoZone', None)
            continue
        d['photoZone'], _, _ = build(d['sourceFile'], d['textZone'], d['id'])
        for shape, o in (d.get('shapeOverrides') or {}).items():
            if o.get('sourceFile'):
                o['photoZone'], _, _ = build(o['sourceFile'], o.get('textZone') or d['textZone'], d['id'])
        print('ok', d['id'], d['photoZone']['box'])
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
