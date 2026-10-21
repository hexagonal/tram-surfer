"""Character concept art: four takes on the wild dingo, and a start screen.

Characters are drawn from flat aliased shapes (no anti-aliasing) on a small
canvas, cel-shaded, then given a one-pixel outline, so they read as pixel art.
Run `python3 concept/characters.py` to regenerate the images in concept/images/.
"""
import os
import random

import numpy as np
from PIL import Image, ImageDraw

import render
from render import C, LIVERIES, OUT, jp_bitmap, jp_text, quantise, save, text, w_side, z_side


def rgb(c):
    return tuple(int(v) for v in C(c))


class Pen:
    """Draws shapes in a 96x64 design space, scaled and offset onto a canvas."""

    def __init__(s, im, k=1.0, ox=0, oy=0, flip=False, fw=96):
        s.im, s.k, s.ox, s.oy, s.flip, s.fw = im, k, ox, oy, flip, fw
        s.d = ImageDraw.Draw(im)
        s.grp = None

    def group(s, pivot=None, k=1.0, dx=0, dy=0):
        s.grp = (pivot, k, dx, dy) if pivot else None

    def P(s, pts):
        out = []
        for x, y in pts:
            if s.grp:
                (px, py), k, dx, dy = s.grp
                x, y = px + (x - px) * k + dx, py + (y - py) * k + dy
            if s.flip:
                x = s.fw - x
            out.append((round(s.ox + x * s.k), round(s.oy + y * s.k)))
        return out

    def poly(s, pts, col):
        s.d.polygon(s.P(pts), fill=rgb(col))

    def ell(s, box, col):
        (x0, y0), (x1, y1) = s.P([(box[0], box[1]), (box[2], box[3])])
        s.d.ellipse((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=rgb(col))

    def line(s, pts, col, w):
        s.d.line(s.P(pts), fill=rgb(col), width=max(1, round(w * s.k * (s.grp[1] if s.grp else 1))), joint="curve")

    def dot(s, x, y, col):
        (px, py), = s.P([(x, y)])
        if 0 <= px < s.im.width and 0 <= py < s.im.height:
            s.im.putpixel((px, py), rgb(col) + (255,))


def outline(im, col="#2a140c"):
    a = np.asarray(im).copy()
    m = a[..., 3] > 0
    d = m.copy()
    d[1:] |= m[:-1]
    d[:-1] |= m[1:]
    d[:, 1:] |= m[:, :-1]
    d[:, :-1] |= m[:, 1:]
    e = d & ~m
    a[e, :3] = C(col)
    a[e, 3] = 255
    return Image.fromarray(a)


# --------------------------------------------------------------------------
# the dingo

DINGOS = {
    "red": dict(name="RED", jp="アカ", coat="#d9822b", light="#f2a850", shade="#a65a1e", cream="#f6e6c8",
                eye="#ffcf3a", line="#2a140c", head=1.0, legs=1.0, body=1.0, snarl=False),
    "pup": dict(name="PUP", jp="チビ", coat="#e8953a", light="#ffbe68", shade="#b8682a", cream="#fff0d8",
                eye="#58c8ff", line="#2a140c", head=1.45, legs=0.72, body=0.82, snarl=False),
    "scar": dict(name="SCAR", jp="キズ", coat="#9c4a22", light="#c8703a", shade="#6e3016", cream="#e6cca4",
                 eye="#fff04a", line="#1a0a06", head=0.95, legs=1.08, body=0.9, snarl=True),
    "yokai": dict(name="YOKAI", jp="ヨウカイ", coat="#f2c46a", light="#fff0b8", shade="#c8903a", cream="#fffaf0",
                  eye="#ff3c50", line="#3a1418", head=1.05, legs=1.0, body=1.0, snarl=False),
}


def draw_dingo(im, v, k=1.0, ox=0, oy=0, flip=False, pose="run", mouth=None):
    """Wild dingo facing right in a 96x64 design space. No collar: it's wild.

    pose is "run" (flying gallop) or "stand"; mouth is None (the design's own),
    "open" or "shut" for the chomp frames."""
    V = DINGOS[v]
    p = Pen(im, k, ox, oy, flip)
    coat, light, shade, cream = V["coat"], V["light"], V["shade"], V["cream"]
    bk = V["body"]
    # tail
    p.group((28, 28), 1.0, 0, 0)
    if v == "yokai":
        p.poly([(28, 25), (16, 14), (6, 6), (10, 12), (0, 10), (8, 18), (0, 22), (12, 24), (6, 30), (18, 29), (27, 33)], coat)
        p.poly([(6, 6), (10, 12), (0, 10), (5, 15), (2, 22), (9, 21)], "#e0303a")
        p.poly([(18, 18), (10, 18), (14, 24), (22, 27)], light)
    elif v == "scar":
        p.poly([(28, 26), (20, 22), (12, 22), (4, 26), (9, 27), (5, 31), (13, 30), (11, 34), (19, 31), (27, 33)], coat)
        p.poly([(4, 26), (9, 27), (5, 31), (11, 29)], cream)
    else:
        p.poly([(28, 25), (20, 18), (10, 15), (3, 19), (8, 23), (16, 26), (26, 33)], coat)
        p.poly([(20, 19), (12, 17), (14, 20), (22, 23)], light)
        p.poly([(10, 15), (3, 19), (8, 23), (11, 21)], cream)
    # far legs (darker), behind the body
    if pose == "stand":
        p.group((62, 36), V["legs"])
        p.line([(58, 37), (57, 47), (58, 55)], shade, 4)
        p.line([(58, 52), (60, 56)], cream, 4)
        p.group((34, 36), V["legs"])
        p.line([(36, 37), (38, 46), (35, 55)], shade, 4)
        p.line([(35, 52), (37, 56)], cream, 4)
    else:
        p.group((62, 36), V["legs"])
        p.line([(58, 37), (66, 45), (75, 50)], shade, 4)
        p.line([(70, 48), (76, 51)], cream, 4)
        p.group((34, 36), V["legs"])
        p.line([(36, 37), (28, 46), (18, 51)], shade, 4)
        p.line([(22, 50), (16, 52)], cream, 4)
    # body
    p.group((46, 33), bk)
    p.ell((25, 23, 66, 42), coat)
    p.ell((50, 21, 70, 42), coat)
    p.ell((29, 34, 62, 43), shade)
    p.ell((30, 23, 60, 29), light)
    p.poly([(56, 36), (66, 34), (68, 41), (58, 42)], cream)
    if v == "scar":
        for x in (40, 45, 50):
            p.line([(x, 31), (x + 2, 37)], shade, 1)
    if v == "yokai":
        p.poly([(36, 26), (44, 24), (40, 28)], "#e0303a")
        p.poly([(46, 25), (54, 24), (50, 28)], "#e0303a")
    # near legs
    if pose == "stand":
        p.group((62, 36), V["legs"])
        p.line([(63, 37), (65, 47), (64, 55)], coat, 5)
        p.line([(64, 52), (67, 56)], cream, 5)
        p.group((34, 36), V["legs"])
        p.line([(31, 37), (28, 46), (31, 55)], coat, 5)
        p.line([(31, 52), (34, 56)], cream, 5)
    else:
        p.group((62, 36), V["legs"])
        p.line([(62, 36), (73, 41), (85, 43)], coat, 5)
        p.line([(80, 42), (88, 43)], cream, 5)
        p.group((34, 36), V["legs"])
        p.line([(32, 36), (22, 43), (8, 45)], coat, 5)
        p.line([(13, 44), (5, 45)], cream, 5)
    if v == "yokai":
        p.line([(28, 39), (20, 43)], "#e0303a", 1)
    # neck and head
    hk = V["head"]
    p.group((66, 24), 1.0)
    p.poly([(58, 27), (66, 13), (77, 16), (71, 33)], coat)
    p.group((72, 18), hk, 0, 2 * (hk - 1))
    p.poly([(58, 27), (66, 13), (77, 16), (71, 33)], coat)
    p.poly([(66, 22), (74, 25), (70, 36), (61, 37)], cream)
    p.ell((64, 8, 82, 26), coat)
    p.ell((66, 9, 78, 15), light)
    # ears (big upright dingo ears; Scar has a torn one)
    p.poly([(65, 12), (66, 0), (72, 9)], coat)
    p.poly([(66, 9), (67, 3), (70, 9)], shade)
    if v == "scar":
        p.poly([(71, 10), (74, 1), (76, 4), (75, 6), (79, 11)], coat)
    else:
        p.poly([(71, 10), (75, -1), (79, 11)], coat)
        p.poly([(73, 9), (75, 3), (77, 10)], "#e8a08a" if v == "pup" else shade)
    # muzzle
    p.poly([(75, 14), (91, 18), (91, 23), (84, 25), (75, 24)], coat)
    p.poly([(77, 20), (91, 21), (90, 24), (84, 26), (77, 25)], cream)
    p.ell((89, 17, 93, 21), "#1a1010")
    snarl = V["snarl"] if mouth is None else mouth == "shut"
    if mouth == "open":
        p.poly([(77, 22), (91, 22), (93, 33), (80, 30)], "#5a1418")
        p.poly([(79, 29), (93, 32), (91, 35), (80, 32)], coat)
        p.poly([(80, 30), (92, 33), (90, 35), (81, 33)], cream)
        p.poly([(84, 27), (90, 28), (88, 31)], "#e86a7a")
        for x in (81, 85, 89):
            p.poly([(x, 22), (x + 2, 22), (x + 1, 25)], "#ffffff")
            p.poly([(x + 1, 31), (x + 3, 32), (x + 1, 29)], "#ffffff")
    elif snarl:
        p.poly([(78, 23), (90, 23), (86, 29), (78, 27)], "#5a1418")
        p.poly([(80, 27), (90, 26), (88, 30), (80, 29)], cream)
        for x in (82, 85, 88):
            p.dot(x, 24, "#ffffff")
            p.dot(x, 27, "#ffffff")
    elif v == "pup":
        p.dot(84, 25, "#ffffff")
        p.dot(84, 26, "#ffffff")
    else:
        p.line([(80, 24), (88, 23)], V["line"], 1)
        p.dot(86, 24, "#ffffff")
    p.ell((64, 17, 70, 24), cream)  # cheek ruff
    # anime eye: almond, big iris, white highlight, fierce brow
    p.poly([(73, 13), (78, 11), (82, 13), (79, 16), (74, 15)], "#ffffff")
    p.ell((76, 11, 80, 15), V["eye"])
    p.ell((77, 12, 79, 15), "#1a1010")
    p.dot(78, 12, "#ffffff")
    if v != "pup":
        p.line([(72, 11), (81, 12)], V["line"], 1)
    if v == "scar":
        p.line([(75, 8), (79, 18)], "#f0e0d0", 1)
    if v == "yokai":
        p.line([(80, 18), (86, 18)], "#e0303a", 1)
        p.line([(80, 20), (85, 20)], "#e0303a", 1)
        p.poly([(70, 7), (73, 4), (74, 8)], "#e0303a")
    p.group(None)
    return p


def dingo_sprite(v, k=1.0, flip=False, pose="run", mouth=None):
    W, H = int(110 * k) + 2, int(80 * k) + 2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_dingo(im, v, k, int(6 * k) + 1, int(12 * k) + 1, flip, pose, mouth)
    return outline(im, DINGOS[v]["line"])


def wisps(im, cx, cy, k=1.0):
    d = ImageDraw.Draw(im)
    for dx, dy in ((-30, -10), (-38, 6), (-20, -22)):
        x, y = cx + dx * k, cy + dy * k
        d.ellipse((x - 3 * k, y - 3 * k, x + 3 * k, y + 3 * k), fill=rgb("#7ad8ff"))
        d.polygon([(x - 3 * k, y), (x + 3 * k, y), (x + 6 * k, y - 8 * k)], fill=rgb("#7ad8ff"))
        d.ellipse((x - 1.5 * k, y - 1.5 * k, x + 1.5 * k, y + 1.5 * k), fill=rgb("#e8faff"))


# --------------------------------------------------------------------------
# the runner, side view (the in-game sprite is his back)

def kid_head(p, mood="calm", hair="blown"):
    p.ell((17, 0, 31, 14), "#f4cbaa")
    if hair == "blown":
        p.poly([(15, 6), (18, -1), (26, -3), (32, 1), (33, 6), (28, 4), (24, 6), (22, 9), (19, 12), (11, 10), (15, 8), (8, 6)], "#3fb8cc")
        p.poly([(19, 0), (26, -2), (29, 1), (23, 2)], "#b0f4f4")
    else:
        p.poly([(15, 7), (16, 0), (22, -4), (29, -3), (33, 2), (33, 6), (29, 3), (26, 5), (23, 4), (20, 8), (18, 13), (14, 12)], "#3fb8cc")
        p.poly([(18, 1), (23, -2), (27, -1), (22, 1)], "#b0f4f4")
    if mood == "scared":
        p.poly([(25, 4), (31, 4), (31, 10), (25, 10)], "#ffffff")
        p.ell((27, 6, 29, 8), "#23788c")
        p.ell((26, 10, 30, 13), "#7a2030")
        for x, y in ((32, 1), (33, 3), (15, 3)):
            p.dot(x, y, "#7ad8ff")
    else:
        p.poly([(26, 6), (30, 5), (30, 9), (26, 9)], "#ffffff")
        p.ell((26, 6, 28, 9), "#23788c")
        p.dot(27, 6, "#ffffff")
        p.line([(28, 11), (30, 11)], "#a05050", 1)
        if mood == "panic":
            p.dot(31, 3, "#7ad8ff")
            p.dot(31, 4, "#7ad8ff")


def draw_kid(im, k=1.0, ox=0, oy=0, pose="run", flip=False):
    """The kid facing right in a 40x48 design space. Poses: run, run2, stand, scared."""
    p = Pen(im, k, ox, oy, flip, fw=40)
    pants, pants2, shoe, hood, hood2 = "#2a3264", "#181f40", "#f0f0f0", "#f6f2ea", "#b4aecb"
    if pose in ("run", "run2"):
        p.poly([(18, 17), (4, 14), (0, 18), (6, 18), (2, 22), (12, 21), (19, 22)], "#e8303c")
        p.poly([(4, 14), (0, 18), (6, 18)], "#a01830")
        if pose == "run":
            p.line([(18, 32), (12, 38), (6, 40)], pants2, 4)
            p.ell((1, 38, 8, 43), shoe)
        else:
            p.line([(19, 32), (16, 39), (16, 45)], pants2, 4)
            p.ell((13, 42, 21, 47), shoe)
        p.line([(19, 22), (12, 27)], hood2, 3)
        p.poly([(9, 18), (16, 16), (17, 29), (10, 30)], "#f2a41e")
        p.poly([(10, 26), (17, 25), (17, 29), (10, 30)], "#b06a10")
        p.poly([(15, 16), (25, 15), (27, 31), (15, 32)], hood)
        p.poly([(15, 26), (27, 25), (27, 31), (15, 32)], hood2)
        if pose == "run":
            p.line([(21, 31), (29, 35), (28, 43)], pants, 4)
            p.ell((26, 41, 34, 46), shoe)
            p.line([(26, 45), (34, 45)], "#e02848", 1)
        else:
            p.line([(21, 31), (28, 37), (34, 36)], pants, 4)
            p.ell((32, 33, 39, 38), shoe)
        p.line([(22, 19), (29, 24), (34, 20)], hood, 3)
        p.ell((32, 17, 36, 21), "#f4cbaa")
        p.poly([(16, 13), (26, 13), (26, 17), (16, 18)], "#e8303c")
        kid_head(p, "panic", "blown")
    elif pose == "stand":
        p.poly([(17, 14), (14, 26), (17, 27), (19, 17)], "#e8303c")
        p.line([(19, 31), (19, 44)], pants2, 4)
        p.line([(24, 31), (24, 44)], pants, 4)
        p.ell((15, 42, 22, 47), shoe)
        p.ell((21, 42, 29, 47), shoe)
        p.poly([(11, 17), (17, 15), (17, 29), (12, 30)], "#f2a41e")
        p.poly([(16, 15), (26, 15), (27, 32), (16, 32)], hood)
        p.poly([(16, 27), (27, 26), (27, 32), (16, 32)], hood2)
        p.line([(25, 18), (27, 25), (26, 30)], hood, 3)
        p.ell((24, 29, 28, 33), "#f4cbaa")
        p.poly([(17, 13), (27, 13), (27, 17), (17, 18)], "#e8303c")
        kid_head(p, "calm", "still")
    else:  # scared: leaning back, arms up, knees bent
        p.poly([(15, 14), (6, 8), (4, 13), (14, 18)], "#e8303c")
        p.line([(18, 31), (13, 38), (15, 45)], pants2, 4)
        p.line([(23, 31), (27, 38), (25, 45)], pants, 4)
        p.ell((10, 42, 18, 47), shoe)
        p.ell((22, 42, 30, 47), shoe)
        p.poly([(8, 17), (14, 15), (15, 28), (9, 29)], "#f2a41e")
        p.poly([(13, 16), (23, 14), (26, 31), (15, 32)], hood)
        p.poly([(15, 27), (26, 26), (26, 31), (15, 32)], hood2)
        p.line([(22, 18), (28, 12), (31, 6)], hood, 3)
        p.line([(15, 18), (10, 10), (11, 4)], hood2, 3)
        p.ell((29, 3, 33, 7), "#f4cbaa")
        p.ell((9, 1, 13, 5), "#f4cbaa")
        p.poly([(14, 12), (24, 11), (24, 15), (14, 16)], "#e8303c")
        p.group((24, 7), 1.0, -2, 0)
        kid_head(p, "scared", "still")
        p.group(None)
    return p


def kid_sprite(k=1.0, pose="run", flip=False):
    im = Image.new("RGBA", (int(42 * k) + 2, int(52 * k) + 2), (0, 0, 0, 0))
    draw_kid(im, k, 1, int(4 * k) + 1, pose, flip)
    return outline(im, "#1a1020")


def paste(img, spr, x, y):
    a = np.asarray(spr)
    h, w = a.shape[:2]
    H, W = img.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = a[y0 - y:y1 - y, x0 - x:x1 - x]
    m = sub[..., 3] > 0
    img[y0:y1, x0:x1][m] = sub[..., :3][m]


# --------------------------------------------------------------------------
# images

def dingo_sheet():
    W, H = 400, 200
    img = np.tile(C("#f6efe0"), (H, W, 1))
    text(img, 8, 8, "THE DINGO", "#a65a1e", 2)
    jp_text(img, 84, 7, "ワイルドディンゴ", "#a65a1e", "#f6efe0")
    text(img, 8, 22, "WILD, NO COLLAR. FOUR TAKES.", "#6a5a4a")
    for i, v in enumerate(DINGOS):
        cx = (i % 2) * 200
        cy = 36 + (i // 2) * 82
        img[cy + 68:cy + 70, cx + 20:cx + 180] = C("#dcd2c0")
        spr = dingo_sprite(v, 1.0)
        if v == "yokai":
            im = Image.fromarray(np.zeros((70, 100, 4), np.uint8))
            wisps(im, 60, 34)
            paste(img, outline(im, "#1a5a7a"), cx + 64, cy - 8)
        paste(img, spr, cx + (64 if v == "yokai" else 52), cy - 8)
        V = DINGOS[v]
        label = f"{'ABCD'[i]} {V['name']}"
        text(img, cx + 20, cy + 6, label, V["shade"])
        jp_text(img, cx + 20, cy + 14, V["jp"], V["shade"], "#f6efe0")
    img = quantise(img, 64)
    save(img, "h-dingo-designs", 4)


def start_screen():
    W, H = 320, 180
    ys = np.arange(H)[:, None, None] / H
    img = C("#2f7ee6") * (1 - ys) + C("#c8ecff") * ys
    img = np.broadcast_to(img, (H, W, 3)).copy()
    rng = random.Random(4)
    # skyline silhouette with a gold-topped tower
    for _ in range(26):
        x = rng.randrange(-10, W)
        w, h = rng.randrange(10, 26), rng.randrange(20, 60)
        img[100 - h:100, max(0, x):min(W, x + w)] = C("#8ab0d8")
    img[30:100, 262:276] = C("#8ab0d8")
    img[30:42, 262:276] = C("#e8b840")
    img[100:, :] = C("#a8c8e4")
    # cel clouds
    sky = Image.fromarray(img.astype(np.uint8))
    d = ImageDraw.Draw(sky)
    for cx, cy, r in ((200, 24, 14), (216, 18, 12), (232, 26, 11), (184, 28, 9), (30, 110, 0)):
        if r:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgb("#ffffff"))
    d.rectangle((174, 28, 244, 37), fill=rgb("#c4d4f0"))
    img = np.asarray(sky, float).copy()
    # trams side-on at 24 px per metre
    ground, ppm = 168, 24.0
    xs = np.arange(W)
    yy, xx = np.mgrid[0:H, 0:W]
    yw = (ground - yy - 0.5) / ppm
    w_end, z_start = 136, 196
    zl_w = (xx + 0.5 - (w_end - 14.1 * ppm)) / ppm
    m = (xx < w_end) & (yw >= 0) & (yw < 3.2)
    rgbw, al, _ = w_side(zl_w[m], yw[m], LIVERIES["W"], False, 1.0)
    sel = np.zeros_like(m)
    sel[m] = al
    img[sel] = rgbw[al]
    zl_z = (xx + 0.5 - z_start) / ppm
    m = (xx >= z_start) & (yw >= 0) & (yw < 3.4)
    rgbz, al, _ = z_side(zl_z[m], yw[m], LIVERIES["Z"], False, 1.0)
    sel = np.zeros_like(m)
    sel[m] = al
    img[sel] = rgbz[al]
    img[ground:, :] = C("#c4bcae")
    img[ground + 2:ground + 4, :] = C("#d4d6de")
    # anime speed streaks
    for _ in range(40):
        y = rng.randrange(40, 160)
        x = rng.randrange(0, W)
        L = rng.randrange(12, 40)
        img[y, x:x + L] = img[y, x:x + L] * 0.4 + 255 * 0.6
    # the chase: kid on the Z roof, dingo leaping the gap
    paste(img, kid_sprite(1.0), 238, int(ground - 3.4 * ppm) - 52)
    paste(img, dingo_sprite("pup", 0.72), 132, int(ground - 3.2 * ppm) - 64)
    # title and story
    text(img, 10, 10, "TRAM SURFER", "#ffd23a", 3, "#1a1020")
    jp_text(img, 10, 30, "トラムサーファー", "#ffffff")
    story = ["WHY IS THIS KID RUNNING ON", "TOP OF MELBOURNE'S TRAMS?", "",
             "HE'S RUNNING FOR HIS LIFE.", "A WILD DINGO IS RIGHT", "BEHIND HIM!"]
    for i, line in enumerate(story):
        text(img, 10, 48 + i * 8, line, "#ffffff")
    img = quantise(img, 64)
    w = len("PRESS START") * 4 * 2
    text(img, (W - w) // 2 + 40, 171 - 10, "PRESS START", "#ffd23a", 2)
    save(img, "i-start-screen", 4)


# --------------------------------------------------------------------------
# intro animation: SURFER, then the dingo chomps (DINGO), then the kid bolts

def jp_big(img, x, y, s, col, scale=2, outline="#1a1020"):
    bm = jp_bitmap(s, 16)
    if bm is None:
        return
    bm = np.kron(bm, np.ones((scale, scale), bool))
    H, W = img.shape[:2]
    ys, xs = np.nonzero(bm)
    for oy in (-1, 0, 1, 2):
        for ox in (-1, 0, 1):
            yy, xx = ys + y + oy, xs + x + ox
            ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
            img[yy[ok], xx[ok]] = C(outline)
    yy, xx = ys + y, xs + x
    ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
    img[yy[ok], xx[ok]] = C(col)


def station_bg():
    """Flinders St style station front, side-on, with the tram stop pavement."""
    W, H = 320, 180
    ys = np.arange(H)[:, None, None] / H
    img = np.broadcast_to(C("#2f7ee6") * (1 - ys) + C("#c8ecff") * ys, (H, W, 3)).copy()
    im = Image.fromarray(img.astype(np.uint8))
    d = ImageDraw.Draw(im)
    sand, cream, dark, copper = rgb("#e0a058"), rgb("#f2dcae"), rgb("#4a3028"), rgb("#5fa48c")
    d.ellipse((58, 22, 122, 86), fill=copper)
    d.ellipse((70, 28, 94, 50), fill=rgb("#9ad6b8"))
    d.rectangle((86, 12, 94, 26), fill=cream)
    d.rectangle((236, 24, 266, 140), fill=sand)
    d.ellipse((236, 8, 266, 38), fill=copper)
    d.rectangle((249, 0, 253, 10), fill=dark)
    d.ellipse((243, 40, 259, 56), fill=rgb("#f8f4e0"))
    d.line((251, 48, 251, 43), fill=dark)
    d.line((251, 48, 255, 48), fill=dark)
    d.rectangle((0, 62, 320, 140), fill=sand)
    d.rectangle((40, 54, 140, 64), fill=sand)
    for y in (62, 84, 106):
        d.rectangle((0, y, 320, y + 3), fill=cream)
    for x in range(6, 320, 22):
        for y in (68, 90):
            d.rectangle((x, y + 4, x + 10, y + 14), fill=dark)
            d.ellipse((x, y, x + 10, y + 9), fill=dark)
    d.rectangle((60, 112, 120, 140), fill=dark)
    d.ellipse((60, 100, 120, 126), fill=dark)
    for x in range(66, 120, 12):
        d.ellipse((x, 108, x + 7, 115), fill=rgb("#f8f4e0"))
    d.rectangle((0, 140, 320, 180), fill=rgb("#c4bcae"))
    d.rectangle((0, 140, 320, 142), fill=rgb("#9a9488"))
    for y in (166, 172):
        d.rectangle((0, y, 320, y), fill=rgb("#d4d6de"))
    for x in range(0, 320, 16):
        d.line((x, 143, x - 6, 179), fill=rgb("#b4ac9e"))
    return np.asarray(im, float).copy()


def bubble(img, x, y, s, col="#e8303c"):
    text(img, x, y, s, col, 4, "#ffffff")


def intro():
    bg = station_bg()
    ground = 152
    kid = {p: kid_sprite(2.0, p) for p in ("stand", "run", "run2")}
    kid["scared"] = kid_sprite(2.0, "scared", flip=True)
    dg = {m: dingo_sprite("pup", 1.3, pose="stand", mouth=m) for m in ("shut", "open")}
    drun = dingo_sprite("pup", 1.3)
    frames = []

    def frame(ms, kpose=None, kx=190, dpose=None, dx=0, words=(), streaks=False):
        img = bg.copy()
        if streaks:
            rng = random.Random(len(frames))
            for _ in range(30):
                y, x0, L = rng.randrange(20, 170), rng.randrange(0, 320), rng.randrange(14, 46)
                img[y, x0:x0 + L] = img[y, x0:x0 + L] * 0.35 + 255 * 0.65
        if dpose:
            spr = dg[dpose] if dpose in dg else drun
            paste(img, spr, dx, ground - spr.height + 14)
        if kpose:
            spr = kid[kpose]
            paste(img, spr, kx, ground - spr.height + 8)
        for fn in words:
            fn(img)
        frames.append((quantise(img, 64), ms))

    surfer = (lambda im: text(im, 16, 12, "SURFER", "#ffd23a", 4),
              lambda im: jp_big(im, 16, 38, "サーファー", "#ffffff"))
    dingo = (lambda im: text(im, 16, 12, "DINGO", "#ff8a3a", 4),
             lambda im: jp_big(im, 16, 38, "ディンゴ", "#ffffff"))
    chomp = (lambda im: bubble(im, 130, 14, "CHOMP!"), lambda im: jp_big(im, 150, 38, "ガブッ", "#e8303c", 1, "#ffffff"))
    frame(700, "stand")
    frame(1500, "stand", words=surfer)
    frame(250, "stand", dpose="shut", dx=-150)
    frame(250, "stand", dpose="shut", dx=-60)
    for i in range(4):
        frame(260, "stand", dpose="open" if i % 2 == 0 else "shut", dx=-10,
              words=dingo + (chomp if i % 2 == 0 else ()))
    frame(900, "scared", kx=196, dpose="shut", dx=-10,
          words=(lambda im: bubble(im, 236, 14, "!", "#ffd23a"), lambda im: jp_big(im, 252, 20, "ひっ", "#ffffff", 1)))
    for i in range(6):
        frame(130, "run" if i % 2 == 0 else "run2", kx=200 + i * 26, dpose="run", dx=-40 + i * 34, streaks=True)
    start = np.asarray(Image.open(os.path.join(OUT, "i-start-screen-native.png")).convert("RGB"), float)
    frames.append((start, 2600))

    big = [Image.fromarray(f.clip(0, 255).astype(np.uint8)).resize((960, 540), Image.NEAREST) for f, _ in frames]
    big[0].save(os.path.join(OUT, "j-intro.gif"), save_all=True, append_images=big[1:],
                duration=[ms for _, ms in frames], loop=0, disposal=1, optimize=True)
    print("wrote j-intro.gif", len(frames), "frames")

    # storyboard: six key frames with captions
    keys = [(0, "KID WAITS AT FLINDERS ST"), (1, "SURFER APPEARS"), (4, "DINGO! CHOMP CHOMP"),
            (8, "THE KID PANICS"), (12, "HE BOLTS, DINGO CHASES"), (len(frames) - 1, "TITLE AND PRESS START")]
    pw, ph, gap, cap = 320, 180, 8, 14
    sheet = np.tile(C("#f6efe0"), (2 * (ph + cap) + 3 * gap, 3 * pw + 4 * gap, 1))
    for n, (i, label) in enumerate(keys):
        x = gap + (n % 3) * (pw + gap)
        y = gap + (n // 3) * (ph + cap + gap)
        sheet[y:y + ph, x:x + pw] = frames[i][0]
        text(sheet, x, y + ph + 4, f"{n + 1} {label}", "#2d6a3e")
    save(sheet, "j-intro-storyboard", 2)


if __name__ == "__main__":
    dingo_sheet()
    start_screen()
    intro()
