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
| `images/e-roster.png` | W class, City Circle W, G class, runner | 320×160 | 48 colours |

Each image also has a `-native.png` copy at its real resolution.

Regenerate with:

```sh
pip install numpy pillow
python3 concept/render.py
```
