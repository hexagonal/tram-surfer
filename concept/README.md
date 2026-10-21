# Concept art

Mockups of how Tram Surfer could look, made before any game code. Every image
is rendered at its true low resolution by `render.py`, a small Doom-style
software renderer (walls, floors and billboard sprites with a z-buffer, fog,
cel outlines, palette quantisation), then upscaled with nearest-neighbour.

| File | Look | Native size | Palette |
| --- | --- | --- | --- |
| `images/a-swanston-noon.png` | Runner-cam, daytime | 320×200 | 64 colours |
| `images/b-collins-dusk.png` | Rooftop chase-cam, dusk | 320×180 | 32 colours, dithered |
| `images/c-bourke-night.png` | Night, rain, neon | 160×120 | 16 fixed colours, dithered |
| `images/d-stkilda-portrait.png` | Portrait / phone, summer | 180×320 | 24 colours |
| `images/f-swanston-direction.png` | **Chosen direction:** trams-only Swanston St, 6.4 m chase-cam, Japanese signage | 320×180 | 64 colours, no dither |
| `images/g-stkilda-direction.png` | Chosen direction on tree-lined St Kilda Rd | 320×180 | 64 colours, no dither |
| `images/e-roster.png` | W class, City Circle W, Z class, E class, G class, runner | 400×160 | 56 colours |

Each image also has a `-native.png` copy at its real resolution.

Japanese text uses the Unifont JP and WenQuanYi Zen Hei Sharp pixel fonts (Debian packages `fonts-unifont` and `fonts-wqy-zenhei`); without them the signs are skipped.

Regenerate with:

```sh
pip install numpy pillow
python3 concept/render.py
```
