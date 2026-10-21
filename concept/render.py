"""Concept-art renderer for Tram Surfer.

A tiny numpy software renderer in the spirit of Doom: axis-aligned walls,
floors and billboards, a z-buffer, distance fog, then palette quantisation and
a nearest-neighbour upscale. Run `python3 concept/render.py` to regenerate
every image in concept/images/.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")

ROAD, FOOT, BUILD, OBJ, RUN_TAG = 1, 2, 3, 4, 5


def C(s):
    return np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)


def hsh(a, b, c=0):
    a = np.asarray(a).astype(np.int64)
    b = np.asarray(b).astype(np.int64)
    v = (a * 73856093) ^ (b * 19349663) ^ (np.int64(c) * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return ((v >> 7) & 1023) / 1023.0


def fill(n, col):
    return np.tile(C(col) if isinstance(col, str) else np.asarray(col, float), (n, 1))


# --------------------------------------------------------------------------
# renderer

class Scene:
    def __init__(s, W, H, f, hor, cam, night=False):
        s.W, s.H, s.f, s.hor = W, H, f, hor
        s.cx, s.cy, s.cz = cam
        s.night = night
        s.mirror = False
        s.reset()
        ys, xs = np.mgrid[0:H, 0:W]
        s.dx = (xs + 0.5 - W / 2) / f
        s.dy = (ys + 0.5 - hor) / f

    def reset(s):
        s.img = np.zeros((s.H, s.W, 3))
        s.zb = np.full((s.H, s.W), np.inf)
        s.emis = np.zeros((s.H, s.W), bool)
        s.tag = np.zeros((s.H, s.W), np.int8)

    def _commit(s, m, t, A, B, tex, tag):
        idx = np.nonzero(m)
        tt = t[idx]
        keep = tt < s.zb[idx]
        idx = (idx[0][keep], idx[1][keep])
        if len(idx[0]) == 0:
            return
        a, b, tt = A[idx], B[idx], tt[keep]
        rgb, al, em = tex(a, b, tt)
        if em is None:
            em = np.zeros(len(tt), bool)
        if al is not None:
            idx = (idx[0][al], idx[1][al])
            rgb, tt, em = rgb[al], tt[al], em[al]
        s.img[idx] = rgb
        s.zb[idx] = tt
        s.emis[idx] = em
        s.tag[idx] = tag

    def hplane(s, h, x0, x1, z0, z1, tex, tag=0):
        hh = -h if s.mirror else h
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (s.cy - hh) / s.dy
        x = s.cx + t * s.dx
        z = s.cz + t
        m = np.isfinite(t) & (t > 0.05) & (x >= x0) & (x < x1) & (z >= z0) & (z < z1)
        s._commit(m, t, x, z, tex, tag)

    def vplane(s, X, z0, z1, y0, y1, tex, tag=0):
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (X - s.cx) / s.dx
        y = s.cy - t * s.dy
        if s.mirror:
            y = -y
        z = s.cz + t
        m = np.isfinite(t) & (t > 0.05) & (z >= z0) & (z < z1) & (y >= y0) & (y < y1)
        s._commit(m, t, z, y, tex, tag)

    def zplane(s, Z, x0, x1, y0, y1, tex, tag=0):
        t0 = Z - s.cz
        if t0 <= 0.05:
            return
        t = np.full((s.H, s.W), t0)
        x = s.cx + t * s.dx
        y = s.cy - t * s.dy
        if s.mirror:
            y = -y
        m = (x >= x0) & (x < x1) & (y >= y0) & (y < y1)
        s._commit(m, t, x, y, tex, tag)

    def sprite(s, spr, x, y, z, w, tag=OBJ, flip=False, glow=False):
        """Billboard: spr is an (h, w, 4) uint8 array; (x, y) is bottom centre."""
        sh, sw = spr.shape[:2]
        h = w * sh / sw
        x0 = x - w / 2

        def tex(a, b, t):
            u = np.clip(((a - x0) / w * sw).astype(int), 0, sw - 1)
            if flip:
                u = sw - 1 - u
            v = np.clip(((y + h - b) / h * sh).astype(int), 0, sh - 1)
            px = spr[v, u]
            return px[:, :3].astype(float), px[:, 3] > 0, np.full(len(a), glow)

        s.zplane(z, x0, x0 + w, y, y + h, tex, tag)


# --------------------------------------------------------------------------
# sprites (hand-drawn pixel art)

PAL = {
    "k": "#1a1020", "h": "#3fb8cc", "H": "#b0f4f4", "d": "#23788c", "s": "#f4cbaa",
    "r": "#e8303c", "R": "#a01830", "j": "#f6f2ea", "J": "#b4aecb", "g": "#f2a41e",
    "G": "#b06a10", "p": "#2a3264", "P": "#181f40", "b": "#f0f0f0", "B": "#e02848",
    "y": "#ffd23a", "Y": "#c88a10", "w": "#fffbe0", "o": "#f07820",
}

RUNNER_ART = """
.......kkkk.........
.....kkhhhhkk.......
....khhHHhhhhk......
...khhHHhhhhhhk.....
...khhhhhhhhhhhk....
..khhhhhhhhhhhhk....
..khhhhdhhhhhhhhk...
.kkhhhhhhhhdhhhhkk..
..khhhhhhhhhhhhhk...
.khkhhhhdhhhhhhkhk..
.k.khhkhhhhhkhhk.k..
....kk.kssssk.kk....
......krrrrrrk..rrk.
.....krrrrrrrkrrRRk.
....kjjrrrrRRRRRk...
...kjjjjrRRjjjjjk...
..kjjjkggggggkjjjk..
..kjjkgGggggGgkjjk..
.kssjkgggggggkjJk...
.kssjkgGGGGGgkjJsk..
..kkjkgggggggkJJssk.
...kjjkkkkkkkJJJkk..
....kppppppppppk....
....kpppPkppppPk....
....kpppk.kpppk.....
...kpppk...kpppk....
...kpppk....kPPk....
..kbbbbk....kbbk....
..kBBBBk....kBBk....
...kkkk......kk.....
"""

COIN_ART = """
..kkkk..
.kyyyyk.
kywyyyYk
kywyyyYk
kyyyyyYk
kyyyyyYk
.kYYYYk.
..kkkk..
"""


def make_sprite(art):
    rows = [r for r in art.strip("\n").split("\n")]
    w = max(len(r) for r in rows)
    a = np.zeros((len(rows), w, 4), np.uint8)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch in PAL:
                a[j, i, :3] = C(PAL[ch])
                a[j, i, 3] = 255
    return a


RUNNER = make_sprite(RUNNER_ART)
COIN = make_sprite(COIN_ART)


# --------------------------------------------------------------------------
# trams

LIVERIES = {
    "W": dict(body="#2d6a3e", band="#e8c050", door="#245a35", roof="#6e665e", walk="#8c7658"),
    "Wcc": dict(body="#7c1f28", band="#ead08a", door="#63161e", roof="#5e544e", walk="#8c7658"),
    "G": dict(body="#efefea", stripe="#6cb02c", roof="#c4c8cc"),
    "Z": dict(body="#d2a02a", band="#5a3c1e", door="#b8861e", roof="#8a847a"),
    "E": dict(body="#f2f2ee", stripe="#78be20", roof="#c4c8cc"),
}


def round_top(lx, y, W, H, r):
    cxr = np.clip(lx, r, W - r)
    return (y > H - r) & (np.hypot(lx - cxr, y - (H - r)) > r)


def w_front(lx, y, liv, night):
    W, H = 2.7, 3.2
    n = len(lx)
    rgb = fill(n, liv["body"])
    al = np.ones(n, bool)
    em = np.zeros(n, bool)
    under = y < 0.35
    rgb[under] = C("#18181c")
    al[under & ((lx < 0.4) | (lx > W - 0.4))] = False
    rgb[(y >= 0.3) & (y < 0.52)] = C("#34343a")
    rgb[(y >= 1.35) & (y < 1.55)] = C(liv["band"])
    win = (y >= 1.75) & (y < 2.6) & (((lx > 0.18) & (lx < 0.85)) | ((lx > 0.95) & (lx < 1.75)) | ((lx > 1.85) & (lx < 2.52)))
    if night:
        rgb[win] = C("#ffd98a")
        em |= win
    else:
        rgb[win] = C("#5d7f99")
        rgb[win & (((lx * 1.3 + y * 0.9) % 1.0) < 0.2)] = C("#b8d4e6")
    rgb[(y >= 2.66) & (y < 2.76)] = C(liv["band"])
    box = (y >= 2.82) & (y < 3.06) & (((lx > 0.8) & (lx < 1.9)) | ((lx > 2.0) & (lx < 2.4)))
    rgb[box] = C("#101014")
    txt = box & (y > 2.88) & (y < 3.0) & (hsh(lx * 16, y * 30) > 0.5) & ((lx < 1.8) | (lx > 2.08)) & (lx > 0.9)
    rgb[txt] = C("#fff2c0")
    em |= txt & night
    d = np.hypot(lx - W / 2, y - 1.0)
    rgb[d < 0.2] = C("#2a2a2a")
    rgb[d < 0.14] = C("#fff6c8")
    em |= (d < 0.14) & night
    al &= ~round_top(lx, y, W, H, 0.35)
    return rgb, al, em


def w_side(zl, y, liv, night, shade):
    n = len(zl)
    rgb = fill(n, liv["body"])
    al = np.ones(n, bool)
    em = np.zeros(n, bool)
    under = y < 0.35
    rgb[under] = C("#141416")
    keep = np.zeros(n, bool)
    for bc in (2.6, 11.5):
        keep |= under & (np.abs(zl - bc) < 1.2) & (y > 0.22)
        for off in (-0.75, 0.75):
            d = np.hypot(zl - (bc + off), y - 0.3)
            rgb[under & (d < 0.3)] = C("#262628")
            rgb[under & (d < 0.1)] = C("#8a8a8a")
            keep |= under & (d < 0.3)
    al[under & ~keep] = False
    rgb[(y >= 0.35) & (y < 0.5)] = C("#2a2a2e")
    rgb[(y >= 1.35) & (y < 1.55)] = C(liv["band"])
    door = np.zeros(n, bool)
    for a, b in ((0.9, 2.1), (6.45, 7.65), (12.0, 13.2)):
        door |= (zl > a) & (zl < b) & (y >= 0.5) & (y < 2.7)
    rgb[door] = C(liv["door"])
    wz = (zl - 0.2) % 1.05
    win = (y >= 1.75) & (y < 2.6) & (wz > 0.14)
    dwin = door & (y >= 1.7) & (y < 2.55) & (((zl * 10).astype(int) % 6) != 0)
    glass = (win & ~door) | dwin
    if night:
        rgb[glass] = C("#ffd98a")
        em |= glass
    else:
        rgb[glass] = C("#5d7f99")
        rgb[glass & (((zl * 0.7 + y * 0.9) % 1.0) < 0.18)] = C("#b8d4e6")
    rgb[(y >= 2.66) & (y < 2.76)] = C(liv["band"])
    rgb[y >= 3.08] = C(liv["roof"])
    rgb[~em] *= shade
    return rgb, al, em


def w_roof(lx, zl, liv):
    n = len(lx)
    rgb = fill(n, liv["roof"])
    rgb[(zl % 1.2) < 0.08] *= 0.8
    walk = np.abs(lx - 1.35) < 0.4
    rgb[walk] = C(liv["walk"])
    rgb[walk & ((zl % 0.5) < 0.05)] *= 0.75
    rgb *= 1.1
    return rgb


def g_front(lx, y, liv, night):
    W, H = 2.65, 3.45
    n = len(lx)
    rgb = fill(n, liv["body"])
    al = y >= 0.1
    em = np.zeros(n, bool)
    rgb[y < 0.55] = C("#3c4048")
    rgb[(y >= 0.7) & (y < 0.95)] = C(liv["stripe"])
    for hx in (0.42, W - 0.42):
        d = np.hypot(lx - hx, y - 1.15)
        rgb[d < 0.16] = C("#2a2e34")
        rgb[d < 0.11] = C("#fffbe0")
        em |= (d < 0.11) & night
    marg = 0.15 + (y - 1.35) * 0.15
    ws = (y >= 1.35) & (y < 2.85) & (lx > marg) & (lx < W - marg)
    rgb[ws] = C("#1e2a36")
    rgb[ws & (((lx * 1.1 - y * 0.8) % 1.0) < 0.12)] = C("#4a6478")
    dest = (y >= 2.95) & (y < 3.22) & (lx > 0.4) & (lx < W - 0.4)
    rgb[dest] = C("#0c0c0e")
    dots = dest & ((lx * 22) % 1 < 0.55) & ((y * 40) % 1 < 0.6) & (hsh(lx * 8, y * 12) > 0.35) & (y > 3.0) & (y < 3.17)
    rgb[dots] = C("#ffa828")
    em |= dots
    al &= ~round_top(lx, y, W, H, 0.6)
    return rgb, al, em


def g_side(zl, y, liv, night, shade):
    n = len(zl)
    rgb = fill(n, liv["body"])
    al = y >= 0.1
    em = np.zeros(n, bool)
    rgb[y < 0.5] = C("#3c4048")
    rgb[(y >= 0.55) & (y < 0.8)] = C(liv["stripe"])
    win = (y >= 1.05) & (y < 2.6) & ((zl % 1.5) > 0.14)
    door = np.zeros(n, bool)
    for k in range(5):
        c = 3.3 + 6.6 * k
        door |= (np.abs(zl - c) < 0.68) & (y >= 0.45) & (y < 2.75)
    glass = win | door
    if night:
        rgb[glass] = C("#ffe6b0")
        em |= glass
    else:
        rgb[glass] = C("#2a3644")
        rgb[glass & (((zl * 0.5 + y * 0.9) % 1.0) < 0.15)] = C("#56708a")
    for k in range(5):
        c = 3.3 + 6.6 * k
        edge = door & ((np.abs(np.abs(zl - c) - 0.64) < 0.05) | (np.abs(zl - c) < 0.03))
        rgb[edge] = C(liv["stripe"])
    for k in range(1, 5):
        rgb[np.abs(zl - 6.6 * k) < 0.18] = C("#2a2c30")
    rgb[y >= 3.3] = C(liv["roof"])
    rgb[~em] *= shade
    return rgb, al, em


def g_roof(lx, zl, liv):
    n = len(lx)
    rgb = fill(n, liv["roof"])
    for k in range(5):
        c = 3.3 + 6.6 * k
        box = (np.abs(zl - c) < 1.2) & (np.abs(lx - 1.325) < 0.7)
        rgb[box] = C("#9ea4aa")
        rgb[box & ((zl * 5) % 1 < 0.3)] = C("#7e848a")
    for k in range(1, 5):
        rgb[np.abs(zl - 6.6 * k) < 0.2] = C("#3a3c40")
    return rgb * 1.08


def z_front(lx, y, liv, night):
    W, H = 2.67, 3.4
    n = len(lx)
    rgb = fill(n, liv["body"])
    al = np.ones(n, bool)
    em = np.zeros(n, bool)
    under = y < 0.3
    rgb[under] = C("#18181c")
    al[under & ((lx < 0.4) | (lx > W - 0.4))] = False
    rgb[(y >= 0.3) & (y < 0.55)] = C("#3a2e22")
    rgb[(y >= 1.15) & (y < 1.27)] = C(liv["band"])
    for hx in (0.45, W - 0.45):
        hl = (np.abs(lx - hx) < 0.16) & (np.abs(y - 0.85) < 0.09)
        rgb[(np.abs(lx - hx) < 0.2) & (np.abs(y - 0.85) < 0.13)] = C("#2a2a2a")
        rgb[hl] = C("#fff6c8")
        em |= hl & night
    ws = (y >= 1.5) & (y < 2.65) & (lx > 0.14) & (lx < W - 0.14)
    split = np.abs(lx - W / 2) < 0.05
    if night:
        rgb[ws] = C("#ffd98a")
        em |= ws & ~split
    else:
        rgb[ws] = C("#4e6e88")
        rgb[ws & (((lx * 1.2 + y * 0.9) % 1.0) < 0.2)] = C("#a8c8e0")
    rgb[ws & split] = C("#2a2a2a")
    rgb[(y >= 2.65) & (y < 2.75)] = C(liv["band"])
    box = (y >= 2.82) & (y < 3.18) & (((lx > 0.3) & (lx < 1.9)) | ((lx > 2.0) & (lx < 2.4)))
    rgb[box] = C("#101014")
    txt = box & (y > 2.9) & (y < 3.1) & (hsh(lx * 16, y * 30) > 0.5) & ((lx < 1.8) | (lx > 2.08)) & (lx > 0.4)
    rgb[txt] = C("#fff2c0")
    em |= txt & night
    al &= ~round_top(lx, y, W, H, 0.18)
    return rgb, al, em


def z_side(zl, y, liv, night, shade):
    n = len(zl)
    rgb = fill(n, liv["body"])
    al = np.ones(n, bool)
    em = np.zeros(n, bool)
    under = y < 0.3
    rgb[under] = C("#141416")
    keep = np.zeros(n, bool)
    for bc in (3.4, 13.2):
        keep |= under & (np.abs(zl - bc) < 1.3) & (y > 0.18)
        for off in (-0.85, 0.85):
            d = np.hypot(zl - (bc + off), y - 0.28)
            rgb[under & (d < 0.28)] = C("#262628")
            rgb[under & (d < 0.09)] = C("#8a8a8a")
            keep |= under & (d < 0.28)
    al[under & ~keep] = False
    rgb[(y >= 0.3) & (y < 0.55)] = C("#3a2e22")
    rgb[(y >= 1.15) & (y < 1.27)] = C(liv["band"])
    door = np.zeros(n, bool)
    for a, b in ((1.0, 2.3), (7.6, 9.0), (14.3, 15.6)):
        door |= (zl > a) & (zl < b) & (y >= 0.55) & (y < 2.7)
    rgb[door] = C(liv["door"])
    win = (y >= 1.5) & (y < 2.6) & (((zl - 0.3) % 1.3) > 0.14) & ~door
    dwin = door & (y >= 1.0) & (y < 2.55) & (np.abs(zl - np.round(zl * 2) / 2) > 0.04)
    glass = win | dwin
    if night:
        rgb[glass] = C("#ffd98a")
        em |= glass
    else:
        rgb[glass] = C("#4e6e88")
        rgb[glass & (((zl * 0.7 + y * 0.9) % 1.0) < 0.18)] = C("#a8c8e0")
    rgb[(y >= 2.65) & (y < 2.75)] = C(liv["band"])
    rgb[y >= 3.15] = C(liv["roof"])
    rgb[~em] *= shade
    return rgb, al, em


def z_roof(lx, zl, liv):
    n = len(lx)
    rgb = fill(n, liv["roof"])
    rgb[(zl % 1.6) < 0.08] *= 0.8
    vent = (np.abs(lx - 1.33) < 0.35) & ((zl % 4.0) > 1.2) & ((zl % 4.0) < 2.2)
    rgb[vent] = C("#6a665e")
    return rgb * 1.1


def e_front(lx, y, liv, night):
    W, H = 2.65, 3.45
    n = len(lx)
    rgb = fill(n, liv["body"])
    al = y >= 0.1
    em = np.zeros(n, bool)
    rgb[y < 0.6] = C("#34383e")
    swoosh = np.abs(y - (0.72 + 0.4 * lx / W)) < 0.11
    rgb[swoosh] = C(liv["stripe"])
    mask = (y >= 1.25) & (y < 3.28) & (lx > 0.08) & (lx < W - 0.08)
    rgb[mask] = C("#121418")
    marg = 0.2 + (y - 1.4) * 0.1
    ws = (y >= 1.4) & (y < 2.85) & (lx > marg) & (lx < W - marg)
    rgb[ws] = C("#24323e")
    rgb[ws & (((lx * 1.1 - y * 0.8) % 1.0) < 0.12)] = C("#4a6478")
    for hx in (0.3, W - 0.3):
        hl = (np.abs(lx - hx) < 0.17) & (np.abs(y - (1.32 + 0.0)) < 0.05)
        rgb[hl] = C("#fffbe0")
        em |= hl & night
    dest = (y >= 2.95) & (y < 3.2) & (lx > 0.35) & (lx < W - 0.35)
    dots = dest & ((lx * 22) % 1 < 0.55) & ((y * 40) % 1 < 0.6) & (hsh(lx * 8, y * 12) > 0.35)
    rgb[dots] = C("#ffa828")
    em |= dots
    al &= ~round_top(lx, y, W, H, 0.45)
    return rgb, al, em


def e_side(zl, y, liv, night, shade):
    n = len(zl)
    rgb = fill(n, liv["body"])
    al = y >= 0.1
    em = np.zeros(n, bool)
    rgb[y < 0.5] = C("#34383e")
    rgb[np.abs(y - (0.72 + 0.012 * (zl % 11.0))) < 0.1] = C(liv["stripe"])
    band = (y >= 1.0) & (y < 2.7)
    rgb[band] = C("#121418")
    door = np.zeros(n, bool)
    for c in (2.6, 8.4, 16.5, 24.6, 30.4):
        door |= (np.abs(zl - c) < 0.68) & (y >= 0.45) & (y < 2.75)
    glass = (band & ((zl % 1.6) > 0.12)) | door
    if night:
        rgb[glass] = C("#ffe6b0")
        em |= glass
    else:
        rgb[glass] = C("#24323e")
        rgb[glass & (((zl * 0.5 + y * 0.9) % 1.0) < 0.15)] = C("#4a6478")
    for c in (2.6, 8.4, 16.5, 24.6, 30.4):
        edge = door & ((np.abs(np.abs(zl - c) - 0.64) < 0.05) | (np.abs(zl - c) < 0.03))
        rgb[edge] = C(liv["stripe"])
    for c in (11.0, 22.0):
        rgb[np.abs(zl - c) < 0.18] = C("#2a2c30")
    rgb[y >= 3.3] = C(liv["roof"])
    rgb[~em] *= shade
    return rgb, al, em


def add_tram(s, kind, lane, zf, livery=None):
    liv = LIVERIES[livery or kind]
    if kind == "W":
        L, Wd, Hh, front, side, roof = 14.1, 2.7, 3.2, w_front, w_side, w_roof
    elif kind == "Z":
        L, Wd, Hh, front, side, roof = 16.6, 2.67, 3.4, z_front, z_side, z_roof
    elif kind == "E":
        L, Wd, Hh, front, side, roof = 33.5, 2.65, 3.45, e_front, e_side, g_roof
    else:
        L, Wd, Hh, front, side, roof = 33.0, 2.65, 3.45, g_front, g_side, g_roof
    x0, x1 = lane - Wd / 2, lane + Wd / 2
    s.zplane(zf, x0, x1, 0, Hh, lambda a, b, t: front(a - x0, b, liv, s.night), OBJ)
    if s.cx < x0:
        s.vplane(x0, zf, zf + L, 0, Hh - 0.15, lambda a, b, t: side(a - zf, b, liv, s.night, 0.92), OBJ)
    if s.cx > x1:
        s.vplane(x1, zf, zf + L, 0, Hh - 0.15, lambda a, b, t: side(a - zf, b, liv, s.night, 0.78), OBJ)
    s.hplane(Hh - 0.12, x0 + 0.05, x1 - 0.05, zf + 0.2, zf + L - 0.05,
             lambda a, b, t: (roof(a - x0, b - zf, liv), None, None), OBJ)
    return Hh


# --------------------------------------------------------------------------
# street

LANES = (-3.0, 0.0, 3.0)
XR, XV, XB = 6.3, 7.4, 10.0  # road edge, verandah edge, building line


def road_tex(night, wet, tram_only=False):
    def tex(x, z, t):
        n = len(x)
        base = C("#24262e") if night else C("#5a5a62")
        if tram_only:
            base = C("#c4bcae")
        rgb = np.tile(base, (n, 1))
        nz = hsh(np.floor(x * 6), np.floor(z * 6))
        rgb *= (0.92 + 0.12 * nz)[:, None]
        if tram_only:
            pave = ((x % 1.2) < 0.06) | ((z % 0.6) < 0.05)
            rgb[pave & (t < 60)] *= 0.88
        rw = np.maximum(0.06, t * 0.7 / 260)
        for L in LANES:
            dl = x - L
            if tram_only:
                rgb[np.abs(dl) < 0.95] = C("#8a8680") * (0.95 + 0.08 * nz[np.abs(dl) < 0.95])[:, None]
            else:
                rgb[np.abs(dl) < 0.72] *= 0.9
            for g in (-0.7175, 0.7175):
                rail = np.abs(dl - g) < rw
                rgb[rail] = C("#9a9ca8") if night else C("#d4d6de")
        if tram_only:
            return rgb, None, None
        for xl in (-1.5, 1.5):
            dash = (np.abs(x - xl) < np.maximum(0.08, t * 0.5 / 260)) & ((z % 6) < 3)
            rgb[dash] = C("#c8c8c0") if night else C("#f2f2ea")
        for xl in (-XR + 0.4, XR - 0.4):
            rgb[np.abs(x - xl) < np.maximum(0.08, t * 0.5 / 260)] = C("#e8c040")
        return rgb, None, None
    return tex


def foot_tex(night):
    def tex(x, z, t):
        n = len(x)
        rgb = fill(n, "#3a3c46" if night else "#a8a49c")
        grid = ((x % 0.9) < 0.06) | ((z % 0.9) < 0.06)
        rgb[grid] *= 0.82
        return rgb, None, None
    return tex


def kerb_tex(a, b, t):
    return fill(len(a), "#3c4050"), None, None


STYLES = {
    "heritage": ["#e6cfa0", "#d8b888", "#efe0c0"],
    "brick": ["#a8483a", "#8e3c32", "#b85a48"],
    "glass": ["#4a7890", "#3a6880", "#5a90a0"],
    "deco": ["#b8e0d0", "#f0c0c8", "#f4e0a8"],
}
SIGNS = ["#e03040", "#2050c0", "#f0b020", "#20a080", "#e060a0", "#303030"]
NEON = ["#ff3ca0", "#30f0ff", "#ffd040", "#a060ff"]


def make_block(seed, zmax, tall=1.0):
    rng = random.Random(seed)
    segs, z = [], -10.0
    while z < zmax:
        style = rng.choice(["heritage", "heritage", "brick", "glass", "deco"])
        L = rng.uniform(7, 16)
        hgt = {"heritage": rng.uniform(8, 15), "brick": rng.uniform(7, 13),
               "glass": rng.uniform(18, 34) * tall, "deco": rng.uniform(10, 18)}[style] * min(1.0, tall)
        segs.append(dict(z=z, L=L, h=hgt, style=style, wall=C(rng.choice(STYLES[style])),
                         sign=C(rng.choice(SIGNS)), neon=C(rng.choice(NEON)),
                         hasneon=rng.random() < 0.5, ver=style in ("heritage", "brick") and rng.random() < 0.8))
        z += L
    return segs


def facade_tex(segs, night):
    starts = np.array([g["z"] for g in segs])
    H = np.array([g["h"] for g in segs])
    WALL = np.array([g["wall"] for g in segs])
    SIGN = np.array([g["sign"] for g in segs])
    NE = np.array([g["neon"] for g in segs])
    HASN = np.array([g["hasneon"] for g in segs])
    STY = np.array([list(STYLES).index(g["style"]) for g in segs])

    def tex(z, y, t):
        i = np.clip(np.searchsorted(starts, z, side="right") - 1, 0, len(segs) - 1)
        lz = z - starts[i]
        hgt = H[i]
        al = y < hgt
        rgb = WALL[i].copy()
        em = np.zeros(len(z), bool)
        sty = STY[i]
        fl = np.floor(y / 3.6)
        fy = y - fl * 3.6
        wc = lz % 2.4
        win = (fl >= 1) & (fy > 1.0) & (fy < 2.8) & (wc > 0.6) & (wc < 1.8) & (y < hgt - 1.3)
        arch = (sty == 0) & (fy > 2.4) & (np.hypot(wc - 1.2, fy - 2.4) > 0.6)
        win &= ~arch
        glass_sty = sty == 2
        gwin = glass_sty & (y > 3.6) & ~(((lz % 1.5) < 0.12) | (fy < 0.18))
        lit = hsh(fl, np.floor(lz / 2.4), i) > (0.45 if night else 2)
        wcol = np.where(lit[:, None], C("#ffcf7a"), C("#18202e") if night else C("#3a4a5e"))
        rgb[win] = wcol[win]
        rgb[win & ~lit & ~np.bool_(night) & (fy > 2.2)] = C("#8aa2b8")
        if night:
            rgb[gwin] = np.where(lit[gwin, None], C("#ffe0a0"), C("#141a28"))
        else:
            sky = np.clip((y - 3.6) / 40, 0, 1)[:, None]
            rgb[gwin] = C("#2c5068") * (1 - sky[gwin]) + C("#6aa0c0") * sky[gwin]
        em |= (win | gwin) & lit
        cor = (y > hgt - 0.7) & (sty != 2)
        rgb[cor] = rgb[cor] * 0.75 + 50
        rgb[(np.abs(y - (hgt - 1.0)) < 0.12) & (sty != 2)] *= 0.7
        # ground floor shops
        shop = (y > 0.25) & (y < 2.7) & ((lz % 4.0) > 0.4) & (lz > 0.4)
        if night:
            rgb[shop] = C("#c88a48")
            rgb[shop & (y > 2.2)] = C("#ffd890")
            em |= shop
        else:
            rgb[shop] = C("#30384a")
            rgb[shop & (((lz * 0.8 + y) % 1.6) < 0.25)] = C("#7088a0")
        band = (y >= 2.7) & (y < 3.6)
        rgb[band] = SIGN[i][band]
        letters = band & (y > 2.9) & (y < 3.4) & (lz > 1) & (lz < 6) & (hsh(lz * 3, y * 6, i) > 0.5)
        rgb[letters] = C("#f8f4e8")
        em |= letters & night
        if night:
            neon = HASN[i] & (lz > 0.8) & (lz < 1.7) & (y > 4.2) & (y < 10) & (y < hgt - 1)
            ring = neon & ((lz < 0.95) | (lz > 1.55) | ((y % 1.2) < 0.15))
            glyph = neon & (hsh(lz * 4, y * 2.5, i) > 0.55)
            rgb[neon] = NE[i][neon] * 0.25
            rgb[ring | glyph] = NE[i][ring | glyph]
            em |= ring | glyph
        rgb[lz < 0.25] *= 0.8
        return rgb, al, em
    return tex


def add_street(s, zmax, seed=1, tall=1.0, verandah_top=("#c03030", "#f0e8d8"), tram_only=False):
    night = s.night
    if not s.mirror:
        s.hplane(0, -XR, XR, -50, zmax, road_tex(night, False, tram_only), ROAD)
        for sg in (-1, 1):
            s.hplane(0.15, *sorted((sg * XR, sg * XB)), -50, zmax, foot_tex(night), FOOT)
    for sg in (-1, 1):
        s.vplane(sg * XR, -50, zmax, 0, 0.15, kerb_tex, FOOT)
        segs = make_block(seed * 10 + (sg > 0), zmax, tall)
        s.vplane(sg * XB, -50, zmax, 0, 200, facade_tex(segs, night), BUILD)
        for g in segs:
            if not g["ver"] or g["z"] > min(zmax, 140):
                continue
            z0, z1 = g["z"] + 0.3, g["z"] + g["L"] - 0.3
            up = s.cy > 3.35

            def vtex(a, b, t, up=up):
                if up:
                    rgb = np.where(((b * 3) % 1 < 0.5)[:, None], C(verandah_top[0]), C(verandah_top[1]))
                else:
                    rgb = fill(len(a), "#2e2622" if not night else "#1a1412")
                return rgb, None, None
            s.hplane(3.35, *sorted((sg * XV, sg * XB)), z0, z1, vtex, BUILD)
            trim = g["wall"] * 0.6

            def ftex(a, b, t, trim=trim):
                rgb = np.tile(trim, (len(a), 1))
                lace = (b < 3.2) & (((a * 5) % 1 < 0.5) ^ ((b * 10) % 1 < 0.5))
                rgb[lace] = C("#efe6d4")
                return rgb, (b > 3.2) | ((b < 3.2) & lace), None
            s.vplane(sg * XV, z0, z1, 2.9, 3.5, ftex, BUILD)
            zp = z0
            while zp < z1:
                xp = sg * (XV - 0.05)
                s.zplane(zp, xp - 0.06, xp + 0.06, 0.15, 3.35,
                         lambda a, b, t, trim=trim: (np.tile(trim, (len(a), 1)), None, None), BUILD)
                zp += 3.2


def add_runner(s, x, z, y=0.0, jump=0.0):
    w = 0.95
    if not s.mirror:
        def sh(a, b, t):
            d = ((a - x) / 0.55) ** 2 + ((b - z) / 0.3) ** 2
            return fill(len(a), "#101018"), d < 1, None
        s.hplane(y + 0.02, x - 0.6, x + 0.6, z - 0.4, z + 0.4,
                 lambda a, b, t: (sh(a, b, t)[0] * (0.3 if s.night else 0.45), sh(a, b, t)[1], None), OBJ)
    s.sprite(RUNNER, x, y + jump, z, w, RUN_TAG)


def add_coin(s, x, y, z):
    s.sprite(COIN, x, y, z, 0.55, OBJ, glow=True)


def add_barrier(s, lane, z, high=False):
    y0 = 1.5 if high else 0.55
    y1 = y0 + (0.6 if high else 0.5)
    top = y1 + 0.2

    def tex(a, b, t):
        lx = a - lane
        n = len(a)
        rgb = fill(n, "#2a2a30")
        board = (b >= y0) & (b < y1)
        stripe = (((lx + b) * 2.2) % 1) < 0.5
        rgb[board] = np.where(stripe[board, None], C("#e8303a"), C("#f4f0e8"))
        legs = (b < y0) & (np.abs(np.abs(lx) - 0.85) < 0.07)
        lamp = np.hypot(lx - 0.85, b - (y1 + 0.1)) < 0.11
        lamp |= np.hypot(lx + 0.85, b - (y1 + 0.1)) < 0.11
        rgb[lamp] = C("#ffb020")
        rgb[legs] = C("#d8d8d8")
        return rgb, board | legs | lamp, lamp
    s.zplane(z, lane - 1.15, lane + 1.15, 0, top, tex, OBJ)


def add_stop_sign(s, x, z):
    def tex(a, b, t):
        lx = a - x
        rgb = fill(len(a), "#c8c8c8")
        pole = np.abs(lx) < 0.05
        sign = (b > 2.0) & (b < 2.9) & (np.abs(lx) < 0.32)
        rgb[sign] = C("#2a8a3a")
        icon = sign & (b > 2.15) & (b < 2.6) & (np.abs(lx) < 0.2)
        rgb[icon] = C("#f4f4f0")
        rgb[icon & (b > 2.35) & (b < 2.5) & (np.abs(lx) < 0.16) & ((lx * 20 % 2) < 1)] = C("#2a8a3a")
        num = sign & (b > 2.65) & (b < 2.82) & (np.abs(lx) < 0.12)
        rgb[num] = C("#f4f4f0")
        return rgb, pole | sign, None
    s.zplane(z, x - 0.35, x + 0.35, 0.15, 2.9, tex, OBJ)


PLANE_TREE = ("#3f7a34", "#7cbc48", "#b4e070", "#285024")
SAKURA = ("#e27ea0", "#ffbcd2", "#fff0f6", "#b8587a")


def add_tree(s, x, z, h=8.0, seed=0, leaves=PLANE_TREE):
    rng = random.Random(seed)
    blobs = [(rng.uniform(-0.3, 0.3), rng.uniform(0.55, 0.85), rng.uniform(0.18, 0.3)) for _ in range(7)]
    blobs.append((0, 0.7, 0.32))
    w = h * 0.85

    def tex(a, b, t):
        u = (a - x) / w
        v = (b - 0.15) / h
        n = len(a)
        rgb = fill(n, "#5a3a28")
        trunk = (np.abs(u) < 0.035 + 0.02 * (v < 0.1)) & (v < 0.6)
        br = (v > 0.35) & (v < 0.62) & (np.abs(np.abs(u) - (v - 0.35) * 0.8) < 0.025)
        can = np.zeros(n, bool)
        lit = np.zeros(n, bool)
        for bx, by, r in blobs:
            d = np.hypot(u - bx, v - by)
            can |= d < r
            lit |= np.hypot(u - bx + r * 0.25, v - by - r * 0.3) < r * 0.75
        rgb[can] = C(leaves[0])
        rgb[can & lit] = C(leaves[1])
        rgb[can & lit & (hsh(u * 40, v * 40) > 0.85)] = C(leaves[2])
        rgb[can & ~lit & (hsh(u * 30, v * 30) > 0.8)] = C(leaves[3])
        return rgb, trunk | br | can, None
    s.zplane(z, x - w / 2, x + w / 2, 0.15, h + 0.15, tex, OBJ)


def add_station(s, Z):
    def tex(x, y, t):
        n = len(x)
        rgb = fill(n, "#e0a058")
        main = (np.abs(x) < 45) & (y < 14)
        drum = (np.abs(x) < 7.5) & (y < 19)
        dome = np.hypot(x, (y - 19) * 1.05) < 7.5
        lantern = (np.abs(x) < 1.2) & (y < 29.5) & (y > 25)
        tower = (np.abs(x + 26) < 3.5) & (y < 30)
        tcap = np.hypot(x + 26, y - 30) < 3.5
        spire = (np.abs(x + 26) < 0.3) & (y < 37)
        al = main | drum | dome | lantern | tower | tcap | spire
        rgb[((y % 3.5) < 0.4)] = C("#f2dcae")
        aw = ((x + 100) % 4.2)
        archwin = (y % 7 > 2) & (y % 7 < 5.5) & (aw > 1.2) & (aw < 3)
        archwin &= ~(((y % 7) > 4.6) & (np.hypot(aw - 2.1, (y % 7) - 4.6) > 0.9))
        rgb[archwin & (main | tower)] = C("#3a2a2a")
        domec = dome & ~drum
        rgb[domec] = C("#5fa48c")
        rgb[domec & (np.hypot(x + 2.5, y - 22) < 3.2)] = C("#9ad6b8")
        rgb[domec & ((np.abs(x) % 2.5) < 0.3)] = C("#3f7a68")
        rgb[lantern] = C("#e8c880")
        rgb[tcap & ~tower] = C("#5fa48c")
        rgb[spire] = C("#404040")
        ent = (np.abs(x) < 6) & (y < 10) & ~((y > 7) & (np.hypot(x, y - 7) > 6))
        rgb[ent] = C("#2a1c18")
        for cxk in range(-4, 5, 2):
            clk = np.hypot(x - cxk * 1.1, y - 8.6) < 0.45
            rgb[ent & clk] = C("#f8f4e0")
        tclk = np.hypot(x + 26, y - 24) < 1.6
        rgb[tclk] = C("#f8f4e0")
        rgb[tclk & (np.hypot(x + 26, y - 24) < 0.25)] = C("#202020")
        return rgb, al, None
    s.zplane(Z, -45, 45, 0, 40, tex, BUILD)


LANTERN_ART = """
..kk..
.kRRk.
krrrrk
kkkkkk
krrrrk
krrrrk
kkkkkk
.kRRk.
..kk..
..yy..
"""


def add_library(s, Z):
    """A State Library style frontage: portico, pediment and a big copper dome."""
    def tex(x, y, t):
        n = len(x)
        rgb = fill(n, "#e6dcc8")
        wing = (np.abs(x) < 40) & (y < 13)
        port = (np.abs(x) < 11) & (y < 16)
        ped = (np.abs(x) < 12) & (y >= 16) & (y < 16 + 5 * (1 - np.abs(x) / 12))
        drum = (np.abs(x) < 13) & (y < 24)
        dome = np.hypot(x / 1.0, (y - 24) * 1.25) < 13
        lantern = (np.abs(x) < 2.2) & (y < 37) & (y > 30)
        al = wing | port | ped | drum | dome | lantern
        rgb[(y % 4.3) < 0.35] = C("#f6f0e2")
        win = wing & ~port & (((x + 100) % 4) > 1.2) & (((x + 100) % 4) < 2.8) & ((y % 6.5) > 2) & ((y % 6.5) < 5)
        rgb[win] = C("#4a5664")
        col = port & (y < 14) & (((x + 11) % 2.75) < 0.8)
        rgb[port & (y < 14) & ~col] = C("#9a9080")
        rgb[col] = C("#f6f0e2")
        rgb[port & (y >= 14)] = C("#f6f0e2")
        rgb[ped] = C("#ece2cc")
        rgb[ped & (np.abs(y - (16 + 5 * (1 - np.abs(x) / 12))) < 0.5)] = C("#c8bca4")
        rgb[drum & ~port & ~ped & (y > 16)] = C("#d8ccb4")
        dm = dome & ~drum
        rgb[dm] = C("#6e9c90")
        rgb[dm & (np.hypot(x + 4, y - 30) < 5)] = C("#a8d4c4")
        rgb[dm & ((np.abs(x) % 3.2) < 0.35)] = C("#4e7a70")
        rgb[lantern] = C("#e8e0cc")
        return rgb, al, None
    s.zplane(Z, -40, 40, 0, 40, tex, BUILD)
    lawn = lambda a, b, t: (np.where(((b * 0.5).astype(int) % 2 == 0)[:, None], C("#7cbc48"), C("#6aac3c")), None, None)
    s.hplane(0.16, -40, -XR - 4, Z - 25, Z, lawn, FOOT)
    s.hplane(0.16, XR + 4, 40, Z - 25, Z, lawn, FOOT)


JP_FONTS = {
    16: ("/usr/share/fonts/opentype/unifont/unifont_jp.otf", 0),
    12: ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 1),  # Zen Hei Sharp bitmap strike
}


def jp_font(size):
    from PIL import ImageFont
    path, index = JP_FONTS[size]
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return None


def jp_bitmap(text, size=16, vertical=False):
    """1-bit pixel render of Japanese text (no anti-aliasing), as a bool array."""
    font = jp_font(size)
    if font is None:
        return None
    if vertical:
        text = text.replace("ー", "｜")
        im = Image.new("L", (size, size * len(text)), 0)
        d = ImageDraw.Draw(im)
        d.fontmode = "1"
        for i, ch in enumerate(text):
            d.text((0, i * size), ch, font=font, fill=255)
    else:
        im = Image.new("L", (size * len(text), size), 0)
        d = ImageDraw.Draw(im)
        d.fontmode = "1"
        d.text((0, 0), text, font=font, fill=255)
    return np.asarray(im) > 127


def sign_sprite(text, bg, fg, vertical=True, pad=3, border="#140c1c"):
    bm = jp_bitmap(text, 16, vertical)
    if bm is None:
        return None
    h, w = bm.shape
    a = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
    a[..., :3] = C(border)
    a[..., 3] = 255
    a[1:-1, 1:-1, :3] = C(bg)
    a[pad:pad + h, pad:pad + w][bm, :3] = C(fg)
    return a


def jp_text(img, x, y, text, col, outline="#140c1c"):
    bm = jp_bitmap(text, 12)
    if bm is None:
        return
    H, W = img.shape[:2]
    ys, xs = np.nonzero(bm)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            yy, xx = ys + y + oy, xs + x + ox
            ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
            img[yy[ok], xx[ok]] = C(outline)
    yy, xx = ys + y, xs + x
    ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
    img[yy[ok], xx[ok]] = C(col)


KANBAN = [  # vertical projecting shop signs: text, background, ink
    ("ラーメン", "#e8303c", "#fff6e8"),
    ("寿司", "#f6f0e2", "#1a1020"),
    ("居酒屋", "#4a2c1c", "#ffe8b0"),
    ("喫茶", "#2d6a3e", "#f6f0e2"),
    ("カラオケ", "#ff5aa8", "#ffffff"),
    ("たこ焼き", "#f2a41e", "#1a1020"),
]


def add_kanban(s, sg, z, idx):
    text, bg, fg = KANBAN[idx % len(KANBAN)]
    spr = sign_sprite(text, bg, fg)
    if spr is not None:
        s.sprite(spr, sg * (XB - 0.6), 3.9, z, 1.05, OBJ)


def add_noren(s, sg, z, text="らーめん", cloth="#22306a"):
    """Split curtain over a restaurant door, facing up the street."""
    bm = jp_bitmap(text, 16)
    if bm is None:
        return
    h, w = bm.shape
    a = np.zeros((h + 10, w + 4, 4), np.uint8)
    a[..., :3] = C(cloth)
    a[..., 3] = 255
    a[:2, :, :3] = C("#5a3a28")
    a[5:5 + h, 2:2 + w][bm, :3] = C("#f6f0e2")
    for k in range(1, len(text)):
        a[h // 2 + 6:, 2 + k * 16 - 1, 3] = 0
    s.sprite(a, sg * (XB - 1.4), 1.7, z, 2.3, OBJ)


def petals(img, n=70, seed=6):
    H, W = img.shape[:2]
    rng = random.Random(seed)
    for _ in range(n):
        x, y = rng.randrange(W - 1), rng.randrange(H - 1)
        img[y, x] = C("#ffc4d8")
        if rng.random() < 0.5:
            img[y, x + 1] = C("#f08ab0")
    return img


def add_skyline(s, Z, seed=5, spire=False, eureka=True):
    rng = random.Random(seed)
    towers = [(rng.uniform(-900, 900), rng.uniform(30, 80), rng.uniform(60, 220)) for _ in range(40)]
    if eureka:
        towers.append((-260, 42, 300))
    T = np.array(towers)
    night = s.night

    def tex(x, y, t):
        n = len(x)
        rgb = fill(n, "#141a2a" if night else "#8aa8c8")
        al = np.zeros(n, bool)
        lit = np.zeros(n, bool)
        for k, (tx, tw, th) in enumerate(T):
            inn = (np.abs(x - tx) < tw / 2) & (y < th)
            al |= inn
            shade = 0.9 + 0.1 * (k % 3)
            rgb[inn] = (C("#141a2a") if night else C("#7896b8")) * shade
            w = inn & ((x - tx) % 9 < 5) & (y % 8 < 4) & (hsh(np.floor((x - tx) / 9), np.floor(y / 8), k) > 0.6)
            lit |= w
        if eureka:
            top = (np.abs(x + 260) < 21) & (y > 255) & (y < 300)
            rgb[top] = C("#e8b840") if not night else C("#ffd060")
            lit |= top & night
        if spire:
            sx = np.abs(x - 120)
            sp = (y < 160) & (sx < 18 * (1 - y / 162))
            band = sp & ((y % 14) < 3)
            lattice = sp & ((((x - 120) + y) % 8 < 1.5) | (((x - 120) - y) % 8 < 1.5))
            rgb[sp] = C("#d0d8e8")
            rgb[lattice] = C("#9aa8c0")
            rgb[band] = C("#f4f4ff")
            base = (np.abs(x - 120) < 40) & (y < 22) & (np.abs(x - 120) < 40 - y)
            rgb[base] = C("#c8a888")
            al |= sp | base
        if night:
            rgb[lit] = C("#ffd890")
        return rgb, al, lit if night else None
    s.zplane(Z, -1500, 1500, 0, 400, tex, BUILD)


# --------------------------------------------------------------------------
# sky, post-processing

def sky_fill(s, stops, clouds=(), sun=None, stars=False):
    H, W = s.H, s.W
    ys, xs = np.mgrid[0:H, 0:W]
    v = ys / max(1, s.hor)
    pos = np.array([p for p, _ in stops])
    cols = np.array([C(c) for _, c in stops])
    sky = np.stack([np.interp(v, pos, cols[:, k]) for k in range(3)], -1)
    if sun:
        sx, sy, r, col = sun
        d = np.hypot(xs - sx, ys - sy)
        sky = np.where((d < r)[..., None], C(col), sky)
        glow = np.clip(1 - (d - r) / (r * 3), 0, 1)[..., None] * 0.5
        sky = sky * (1 - glow) + C(col) * glow * (d >= r)[..., None] + sky * glow * (d < r)[..., None]
    if stars:
        st = hsh(xs, ys, 7) > 0.995
        sky[st & (ys < s.hor * 0.7)] = C("#e0e8ff")
    for (blobs, lit_col, sh_col, rim) in clouds:
        inside = np.zeros((H, W), bool)
        lit = np.zeros((H, W), bool)
        for bx, by, r in blobs:
            inside |= np.hypot((xs - bx), (ys - by) * 1.15) < r
            lit |= np.hypot((xs - bx + r * 0.15), (ys - by + r * 0.35) * 1.15) < r * 0.92
        base = inside & (ys < max(by + r * 0.35 for bx, by, r in blobs))
        sky[base] = C(sh_col)
        sky[base & lit] = C(lit_col)
        if rim:
            edge = base & ~np.roll(base, 1, 0)
            sky[edge] = C(rim)
    m = np.isinf(s.zb)
    s.img[m] = sky[m]


def cloud(cx, cy, scale, rng):
    blobs = [(cx, cy, 14 * scale)]
    for _ in range(9):
        blobs.append((cx + rng.uniform(-30, 30) * scale, cy + rng.uniform(-10, 4) * scale, rng.uniform(7, 15) * scale))
    return blobs


def light_and_fog(s, fog, fogd, dim=None):
    t = np.where(np.isinf(s.zb), 0, s.zb)
    solid = ~np.isinf(s.zb)
    img = s.img
    if dim is not None:
        lit = np.clip(dim[0] - t / dim[1], dim[2], 1.0)
        lit = np.where(s.emis, 1.0, lit)
        img = img * lit[..., None]
    k = (1 - np.exp(-t / fogd))
    k = np.where(s.emis, k * 0.4, k)[..., None]
    img = np.where(solid[..., None], img * (1 - k) + C(fog) * k, img)
    s.img = img


def outlines(s, col="#140c1c"):
    zb = np.where(np.isinf(s.zb), 1e9, s.zb)
    obj = (s.tag == OBJ) | (s.tag == RUN_TAG)
    edge = np.zeros_like(obj)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nz = np.roll(np.roll(zb, dy, 0), dx, 1)
        edge |= nz > zb * 1.3 + 0.3
    edge &= obj & (s.tag != RUN_TAG)
    s.img[edge] = C(col)


def bloom(s, strength=0.8, radius=2):
    em = (s.img * s.emis[..., None]).clip(0, 255).astype(np.uint8)
    b = np.asarray(Image.fromarray(em).filter(ImageFilter.GaussianBlur(radius)), float)
    s.img = s.img + b * strength


def reflect(s, refl, amount=0.55):
    m = (s.tag == ROAD) | (s.tag == FOOT)
    ripple = 0.75 + 0.25 * hsh(np.arange(s.W)[None, :] // 2, np.arange(s.H)[:, None], 3)
    a = (amount * ripple)[..., None] * m[..., None] * (s.tag == ROAD)[..., None] + (amount * 0.4) * (s.tag == FOOT)[..., None]
    s.img = s.img * (1 - a * 0.5) + refl * a


def speed_lines(img, hor, n=26, seed=3, alpha=0.55, col=(255, 255, 255)):
    H, W = img.shape[:2]
    rng = random.Random(seed)
    over = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(over)
    cx, cy = W / 2, hor
    R = math.hypot(W, H)
    for _ in range(n):
        a = rng.uniform(-0.6, math.pi + 0.6)
        r0 = rng.uniform(0.42, 0.6) * min(W, H) / 0.9
        d.line([(cx + math.cos(a) * r0, cy + math.sin(a) * r0 * 0.8), (cx + math.cos(a) * R, cy + math.sin(a) * R)],
               fill=255, width=1)
    m = (np.asarray(over, float) / 255 * alpha)[..., None]
    return img * (1 - m) + np.array(col, float) * m


def rain(img, n=220, seed=4, col=(170, 190, 230)):
    H, W = img.shape[:2]
    rng = random.Random(seed)
    over = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(over)
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        d.line([(x, y), (x - 1.5, y + 5)], fill=rng.randint(90, 200))
    m = (np.asarray(over, float) / 255 * 0.6)[..., None]
    return img * (1 - m) + np.array(col, float) * m


KEEP = ["#ffd23a", "#c88a10", "#fffbe0"]
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def quantise(img, colors, dither=0.0, palette=None):
    H, W = img.shape[:2]
    if dither:
        img = img + (np.tile(BAYER, (H // 4 + 1, W // 4 + 1))[:H, :W, None] - 0.5) * dither
    im = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    if palette:
        p = Image.new("P", (1, 1))
        flat = [int(v) for c in palette for v in C(c)]
        p.putpalette(flat + flat[:3] * (256 - len(palette)))
        q = im.quantize(palette=p, dither=Image.Dither.NONE)
    else:
        # median-cut palette, plus the coin colours so pickups never get muddied
        mc = im.quantize(colors=colors - len(KEEP), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        flat = mc.getpalette()[:3 * (colors - len(KEEP))] + [int(v) for c in KEEP for v in C(c)]
        p = Image.new("P", (1, 1))
        p.putpalette(flat + flat[:3] * (256 - colors))
        q = im.quantize(palette=p, dither=Image.Dither.NONE)
    return np.asarray(q.convert("RGB"), float)


# --------------------------------------------------------------------------
# HUD (3x5 pixel font)

FONT = {
    'A': ".#.#.#####.##.#",
    'B': "##.#.###.#.###.",
    'C': ".###..#..#...##",
    'D': "##.#.##.##.###.",
    'E': "####..##.#..###",
    'F': "####..##.#..#..",
    'G': ".###..#.##.#.##",
    'H': "#.##.#####.##.#",
    'I': "###.#..#..#.###",
    'J': "..#..#..##.#.#.",
    'K': "#.##.###.#.##.#",
    'L': "#..#..#..#..###",
    'M': "#...###.###.#.##...##...#",
    'N': "##.#.##.##.##.#",
    'O': ".#.#.##.##.#.#.",
    'P': "##.#.###.#..#..",
    'Q': ".#.#.##.###..##",
    'R': "##.#.###.#.##.#",
    'S': ".###...#...###.",
    'T': "###.#..#..#..#.",
    'U': "#.##.##.##.####",
    'V': "#.##.##.##.#.#.",
    'W': "#...##...##.#.##.#.#.#.#.",
    'X': "#.##.#.#.#.##.#",
    'Y': "#.##.#.#..#..#.",
    'Z': "###..#.#.#..###",
    '0': "####.##.##.####",
    '1': ".#.##..#..#.###",
    '2': "##...#.#.#..###",
    '3': "##...#.#...###.",
    '4': "#.##.####..#..#",
    '5': "####..##...###.",
    '6': ".###..####.####",
    '7': "###..#.#..#..#.",
    '8': "####.#####.####",
    '9': "####.####..###.",
    'x': "...#.#.#.#.#...",
    ':': ".....#.....#...",
    '-': "......###......",
    '.': "............#..",
    '!': ".#..#..#.....#.",
}
FONT[" "] = "." * 15


def text(img, x, y, s, col, scale=1, outline="#140c1c"):
    H, W = img.shape[:2]
    oc = C(outline)
    c = C(col)
    glyphs = []
    for ch in s:
        g = FONT.get(ch, FONT[" "])
        glyphs.append(np.array([ch2 == "#" for ch2 in g]).reshape(5, len(g) // 5))
    for pass_ in (0, 1):
        cx = x
        for g in glyphs:
            for j in range(5):
                for i in range(g.shape[1]):
                    if not g[j, i]:
                        continue
                    for a in range(scale):
                        for b in range(scale):
                            px, py = cx + i * scale + a, y + j * scale + b
                            if pass_ == 0:
                                for ox in (-1, 0, 1):
                                    for oy in (-1, 0, 1, 2):
                                        if 0 <= px + ox < W and 0 <= py + oy < H:
                                            img[py + oy, px + ox] = oc
                            elif 0 <= px < W and 0 <= py < H:
                                img[py, px] = c * (0.8 if j >= 3 else 1.0)
            cx += (g.shape[1] + 1) * scale
    return cx


def blit(img, spr, x, y, scale=1):
    sh, sw = spr.shape[:2]
    for j in range(sh * scale):
        for i in range(sw * scale):
            p = spr[j // scale, i // scale]
            if p[3] and 0 <= y + j < img.shape[0] and 0 <= x + i < img.shape[1]:
                img[y + j, x + i] = p[:3]


def panel(img, x0, y0, x1, y1, col="#140c1c", alpha=0.55):
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - alpha) + C(col) * alpha


def hud_standard(img, score, coins, mult, street=None, big=2):
    H, W = img.shape[:2]
    text(img, 4, 4, "SCORE", "#ffffff")
    text(img, 4, 12, score, "#ffd23a", big)
    xr = W - 4 - (len(coins) * 4 + 2) * big
    blit(img, COIN, xr - 10, 5 + big, 1)
    text(img, xr, 4 + big, coins, "#ffffff", big)
    mx = 4 + len(score) * 4 * big + 4
    panel(img, mx - 2, 11, mx + 4 * len(mult) * big + 1, 13 + 5 * big + 1, "#e8303c", 0.9)
    text(img, mx, 12, mult, "#ffffff", big)
    if street:
        w = len(street) * 4
        text(img, (W - w) // 2, H - 10, street, "#f0f0f0")


def save(img, name, scale):
    os.makedirs(OUT, exist_ok=True)
    im = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    im.save(os.path.join(OUT, f"{name}-native.png"))
    im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(os.path.join(OUT, f"{name}.png"))
    print("wrote", name, im.size)


# --------------------------------------------------------------------------
# scenes

def scene_a():
    """Swanston St at noon: classic 320x200 Doom framing, runner-cam."""
    s = Scene(320, 200, 250, 86, (0, 2.3, -4.0))
    add_runner(s, 0, 1.5)
    add_barrier(s, 0, 13)
    for k in range(6):
        z = 4 + k * 2
        add_coin(s, 0, 0.6 + max(0, 1.4 - abs(z - 13) * 0.35), z)
    add_tram(s, "W", -3.0, 20)
    add_tram(s, "G", 3.0, 16)
    add_tram(s, "W", 0.0, 58, "Wcc")
    add_tram(s, "Z", -3.0, 84)
    add_stop_sign(s, -6.8, 30)
    add_street(s, 150, seed=1, tall=0.6)
    add_station(s, 150)
    rng = random.Random(2)
    sky_fill(s, [(0, "#3f8fe0"), (0.7, "#86c4f2"), (1.0, "#d6eefa")],
             clouds=[(cloud(70, 28, 1.0, rng), "#ffffff", "#c4d4f0", None),
                     (cloud(250, 20, 0.8, rng), "#ffffff", "#c4d4f0", None)])
    light_and_fog(s, "#c8dcec", 220)
    outlines(s)
    img = quantise(s.img, 64)
    hud_standard(img, "0042350", "0128", "x6", "SWANSTON ST")
    save(img, "a-swanston-noon", 4)


def scene_b():
    """Collins St at dusk: high chase-cam on the tram roofs, 16:9, 32 colours."""
    cam = (3.0, 6.4, -6.5)
    s = Scene(320, 180, 200, 58, cam)
    add_runner(s, 3.0, 1.0, y=3.33, jump=0.0)
    for k in range(7):
        add_coin(s, 3.0, 3.75, 5 + k * 3.2)
    for k in range(4):
        add_coin(s, 0.0, 3.6 + 0.4 * math.sin(k), 30 + k * 2.4)
    add_tram(s, "G", 3.0, -20)
    add_tram(s, "W", 0.0, 6)
    add_tram(s, "W", 0.0, 27, "Wcc")
    add_tram(s, "E", -3.0, 14)
    add_tram(s, "W", 3.0, 26)
    add_tram(s, "G", 3.0, 52)
    add_barrier(s, -3.0, 52, high=True)
    add_street(s, 260, seed=3, tall=0.75, verandah_top=("#2d6a3e", "#e8dcc0"))
    add_skyline(s, 1600, seed=8)
    rng = random.Random(9)
    sky_fill(s, [(0, "#2a1e5a"), (0.45, "#8a3a7a"), (0.8, "#f07a50"), (1.0, "#ffc070")],
             sun=(160, 50, 13, "#fff0b0"),
             clouds=[(cloud(60, 18, 0.7, rng), "#ffb0a0", "#9a4a8a", "#ffe0c0"),
                     (cloud(270, 26, 0.9, rng), "#ffa890", "#8a3a7a", "#ffe0c0")])
    light_and_fog(s, "#d87a6a", 160)
    s.img = s.img * np.array([1.05, 0.92, 0.95])
    outlines(s, "#1c0c24")
    img = speed_lines(s.img, s.hor, n=30, alpha=0.45, col=(255, 230, 220))
    img = quantise(img, 32, dither=18)
    hud_standard(img, "0118400", "0342", "x8", "COLLINS ST")
    save(img, "b-collins-dusk", 4)


def build_c(s):
    add_runner(s, 0.0, 1.2)
    add_tram(s, "G", 0.0, 17)
    add_tram(s, "W", -3.0, 10)
    add_tram(s, "W", 3.0, 40, "Wcc")
    for k in range(5):
        add_coin(s, 3.0, 0.6, 5 + k * 2)
    add_barrier(s, 3.0, 18)
    add_street(s, 180, seed=5, tall=1.2)
    add_skyline(s, 1500, seed=11)


NIGHT16 = ["#07060f", "#151229", "#2a2248", "#4a3a6a", "#7a6a9a", "#c8b8e0", "#fff4d0", "#ffd060",
           "#e08a30", "#ff3ca0", "#8a1e5a", "#30f0ff", "#1a7a9a", "#2d6a3e", "#f4cbaa", "#e8303c"]


def scene_c():
    """Bourke St at night in the rain: 160x120, 16 colours, ordered dither."""
    cam = (0.0, 1.9, -3.2)
    W, H, f, hor = 160, 120, 125, 52
    r = Scene(W, H, f, hor, cam, night=True)
    r.mirror = True
    build_c(r)
    sky_fill(r, [(0, "#05060e"), (1, "#1a1430")])
    light_and_fog(r, "#120e22", 50, dim=(1.2, 30, 0.2))
    bloom(r, 0.6, 1.5)
    refl = r.img.copy()

    s = Scene(W, H, f, hor, cam, night=True)
    build_c(s)
    sky_fill(s, [(0, "#05060e"), (0.8, "#1a1430"), (1, "#3a2050")], stars=False)
    light_and_fog(s, "#1e1636", 55, dim=(1.25, 32, 0.22))
    reflect(s, refl, 0.6)
    outlines(s, "#06040c")
    bloom(s, 0.5, 1.5)
    img = rain(s.img, n=110)
    img = quantise(img, 16, dither=14, palette=NIGHT16)
    text(img, 3, 3, "0007725", "#ffd23a")
    blit(img, COIN, W - 30, 2)
    text(img, W - 20, 3, "064", "#ffffff")
    text(img, 3, 11, "x3", "#ff6ab0")
    text(img, (W - 9 * 4) // 2, H - 8, "BOURKE ST", "#30f0ff")
    save(img, "c-bourke-night", 8)


def scene_d():
    """St Kilda Rd boulevard: portrait mobile layout, flat cel palette, mid-jump."""
    s = Scene(180, 320, 165, 150, (0.0, 2.7, -3.2))
    add_runner(s, 0.0, 1.6, jump=1.0)
    for k in range(5):
        add_coin(s, 3.0, 0.7 + 1.6 * math.sin(k / 4 * math.pi), 3.0 + k * 1.8)
    add_barrier(s, 3.0, 6.6)
    add_tram(s, "W", -3.0, 11, "Wcc")
    add_tram(s, "W", 3.0, 34)
    add_tram(s, "G", 0.0, 46)
    for k in range(18):
        z = 6 + k * 9
        add_tree(s, -8.2, z, 9.0, seed=k)
        add_tree(s, 8.2, z + 4.5, 9.0, seed=100 + k)
    add_street(s, 220, seed=7)
    add_skyline(s, 1300, seed=4, spire=True, eureka=False)
    rng = random.Random(1)
    sky_fill(s, [(0, "#1a5ed8"), (0.6, "#4aa0f0"), (1.0, "#bfe6ff")],
             clouds=[(cloud(40, 70, 1.7, rng), "#ffffff", "#a8c0ec", None),
                     (cloud(150, 40, 1.3, rng), "#ffffff", "#a8c0ec", None),
                     (cloud(110, 118, 0.9, rng), "#ffffff", "#b8ccf0", None)])
    light_and_fog(s, "#b8dcf4", 140)
    outlines(s)
    img = speed_lines(s.img, s.hor, n=22, alpha=0.5)
    img = quantise(img, 24)
    text(img, 4, 4, "SCORE", "#ffffff")
    text(img, 4, 12, "0096120", "#ffd23a", 2)
    blit(img, COIN, 4, 27)
    text(img, 15, 27, "0211", "#ffffff")
    panel(img, 150, 10, 176, 24, "#e8303c", 0.9)
    text(img, 152, 12, "x5", "#ffffff", 2)
    text(img, (180 - 11 * 4) // 2, 306, "ST KILDA RD", "#ffffff")
    save(img, "d-stkilda-portrait", 3)


def scene_roster():
    """Line-up of the five tram designs plus the runner, 3/4 view."""
    cam = (-0.5, 4.0, -40.0)
    s = Scene(400, 160, 620, 52, cam)
    xs = (-11.5, -7.0, -2.5, 2.0, 6.5)
    for x, (kind, liv) in zip(xs, (("W", None), ("W", "Wcc"), ("Z", None), ("E", None), ("G", None))):
        add_tram(s, kind, x, 0, liv)
    add_runner(s, 10.0, -0.5)
    add_coin(s, 11.0, 1.0, -0.5)
    s.hplane(0, -60, 60, -40, 80, lambda a, b, t: (fill(len(a), "#dcd4c4"), None, None), ROAD)
    sky_fill(s, [(0, "#f6efe0"), (1, "#f6efe0")])
    outlines(s)
    img = quantise(s.img, 56)
    text(img, 6, 6, "THE ROSTER", "#2d6a3e", 2)
    labels = (("W CLASS", "#2d6a3e"), ("W CITY CIRCLE", "#7c1f28"), ("Z CLASS", "#9a6c10"),
              ("E CLASS", "#4a8a20"), ("G CLASS", "#4a8a20"), ("RUNNER", "#23788c"))
    for x, (label, col) in zip(xs + (10.0,), labels):
        sx = s.W / 2 + (x - cam[0]) * s.f / (0 - cam[2])
        text(img, int(sx - len(label) * 2), 124, label, col)
    save(img, "e-roster", 4)


def scene_f():
    """Chosen direction: Swanston St (trams only) at noon, 16:9, 64 colours, no dither,
    6.4 m chase-cam pitched down, Melbourne with an anime Japan flavour."""
    cam = (3.0, 6.4, -6.5)
    s = Scene(320, 180, 200, 58, cam)
    add_runner(s, 3.0, 1.0, y=3.33)
    for k in range(5):
        add_coin(s, 3.0, 3.75, 5 + k * 3.2)
    for k in range(5):
        add_coin(s, -3.0, 0.7 + 1.2 * math.sin(k / 4 * math.pi), 9 + k * 2.4)
    add_tram(s, "G", 3.0, -20)
    add_tram(s, "Z", 0.0, 7)
    add_tram(s, "W", 0.0, 34)
    add_tram(s, "E", -3.0, 30)
    add_tram(s, "W", 3.0, 26, "Wcc")
    add_tram(s, "Z", 3.0, 62)
    add_barrier(s, -3.0, 21)
    lantern = make_sprite(LANTERN_ART)
    for sg in (-1, 1):
        for k in range(7):
            z = 14 + k * 17 + (8 if sg > 0 else 0)
            add_tree(s, sg * 6.95, z, 6.5, seed=200 + k + (sg > 0) * 50, leaves=SAKURA)
        for k in range(14):
            s.sprite(lantern, sg * 7.35, 2.35, 3 + k * 3.2, 0.42, OBJ)
    for k, (sg, z) in enumerate(((1, 8), (-1, 6), (1, 26), (-1, 24), (1, 44), (-1, 40), (1, 66), (-1, 60))):
        add_kanban(s, sg, z, k)
    add_noren(s, 1, 5.5)
    add_noren(s, -1, 11, "すし", "#7c1f28")
    add_street(s, 232, seed=12, tall=0.65, verandah_top=("#e8303c", "#f4f0e8"), tram_only=True)
    add_library(s, 232)
    rng = random.Random(21)
    sky_fill(s, [(0, "#2f7ee6"), (0.65, "#78c0f4"), (1.0, "#d8f0ff")],
             clouds=[(cloud(70, 16, 0.9, rng), "#ffffff", "#b8ccf0", None),
                     (cloud(250, 24, 1.0, rng), "#ffffff", "#b8ccf0", None)])
    light_and_fog(s, "#cfe4f2", 230)
    outlines(s)
    img = speed_lines(s.img, s.hor, n=24, alpha=0.4)
    img = quantise(img, 64)
    img = petals(img)
    hud_standard(img, "0064280", "0187", "x4", "SWANSTON ST")
    jp_text(img, (320 - 8 * 12) // 2, 5, "スワンストン通り", "#ffffff")
    save(img, "f-swanston-direction", 4)


if __name__ == "__main__":
    scene_a()
    scene_b()
    scene_c()
    scene_d()
    scene_roster()
    scene_f()
