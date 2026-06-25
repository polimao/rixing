#!/usr/bin/env python3
"""Generate the Todos app icon + menu-bar (template) icon.

Design: a stack of cards with a checkmark on the front card — drawn with full
alpha control and 4x supersampling for crisp anti-aliased edges.
"""
import os
from PIL import Image, ImageDraw

S = 4            # supersample factor
SIZE = 1024      # logical canvas
GY = -12         # vertical nudge so the whole glyph sits optically centered

HERE = os.path.dirname(os.path.abspath(__file__))


def _xy(v):
    return v * S


def round_caps(draw, pts, width, fill):
    """Draw a polyline with rounded joints + rounded end caps."""
    w = width * S
    p = [(_xy(x), _xy(y)) for (x, y) in pts]
    draw.line(p, fill=fill, width=int(round(w)), joint="curve")
    r = w / 2.0
    for (x, y) in (p[0], p[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def draw_glyph(layer, white, stack_alpha=(150, 92)):
    """Draw the stacked-cards-with-check glyph onto an RGBA layer.

    `white` is the (r,g,b) of the glyph; stack layers use the given alphas.
    """
    d = ImageDraw.Draw(layer)
    cr, cg, cb = white
    g = GY

    # --- stacked cards peeking out below the front card ---
    round_caps(d, [(392, 690 + g), (632, 690 + g)], 34, (cr, cg, cb, stack_alpha[0]))
    round_caps(d, [(424, 758 + g), (600, 758 + g)], 34, (cr, cg, cb, stack_alpha[1]))

    # --- front card (rounded square outline) ---
    sw = int(round(38 * S))
    d.rounded_rectangle(
        [_xy(336), _xy(284 + g), _xy(688), _xy(636 + g)],
        radius=_xy(86), outline=(cr, cg, cb, 255), width=sw,
    )

    # --- checkmark ---
    round_caps(d, [(420, 458 + g), (486, 526 + g), (616, 384 + g)], 46, (cr, cg, cb, 255))


def vertical_gradient(size, stops):
    """1px-wide vertical gradient (list of (pos0..1, (r,g,b))) scaled to size x size."""
    col = Image.new("RGBA", (1, size))
    pxs = col.load()
    for y in range(size):
        t = y / (size - 1)
        # find surrounding stops
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                f = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                r = round(c0[0] + (c1[0] - c0[0]) * f)
                gg = round(c0[1] + (c1[1] - c0[1]) * f)
                b = round(c0[2] + (c1[2] - c0[2]) * f)
                pxs[0, y] = (r, gg, b, 255)
                break
    return col.resize((size, size))


def squircle_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def build_app_icon():
    big = SIZE * S
    # background squircle: 824 content within 1024, transparent margins
    margin = 100 * S
    inner = big - 2 * margin
    grad = vertical_gradient(inner, [
        (0.0, (43, 43, 46)),
        (0.5, (20, 20, 22)),
        (1.0, (0, 0, 0)),
    ])
    mask = squircle_mask(inner, int(round(184 * S)))
    bg = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bg.paste(grad, (margin, margin), mask)

    glyph = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw_glyph(glyph, (255, 255, 255))

    out = Image.alpha_composite(bg, glyph)
    out = out.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(HERE, "icon-master.png")
    out.save(path)
    print("wrote", path, out.size)
    return out


def build_tray_icon():
    big = SIZE * S
    glyph = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    # black template glyph; macOS tints it for light/dark menu bars
    draw_glyph(glyph, (0, 0, 0), stack_alpha=(160, 110))
    glyph = glyph.resize((SIZE, SIZE), Image.LANCZOS)

    # crop tight to content, add a little uniform padding, keep square
    bbox = glyph.getbbox()
    pad = int(0.07 * max(bbox[2] - bbox[0], bbox[3] - bbox[1]))
    crop = glyph.crop((bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad))

    # output at a retina-friendly height (scaled to 18pt in the menu bar)
    target_h = 132
    w, h = crop.size
    out = crop.resize((round(w * target_h / h), target_h), Image.LANCZOS)

    out_dir = os.path.join(HERE, "..", "src-tauri", "icons")
    path = os.path.join(out_dir, "tray.png")
    out.save(path)
    print("wrote", path, out.size)
    # also a master for previewing
    pmaster = os.path.join(HERE, "tray-master.png")
    crop.save(pmaster)
    return out


if __name__ == "__main__":
    build_app_icon()
    build_tray_icon()
