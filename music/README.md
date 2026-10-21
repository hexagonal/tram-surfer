# Music

`lofi.js` is the game's music engine: endless procedural lofi, synthesised with
Web Audio (no samples, no dependencies).

- Two styles take turns about every 90 seconds: dusty **hip-hop** (minor 9ths,
  swung boom-bap, Rhodes, vinyl crackle) and 80s Japanese **city pop**
  (major 7ths, the royal road and Just the Two of Us progressions, DX-style
  keys, funky bass, bell arpeggios).
- Everything is seeded. The same game seed always plays the same music, so a
  new run gets new music and a replay can get the old music back.
- A tram bell rings at the start of every track.

```js
import { LofiMusic } from './music/lofi.js';

const music = new LofiMusic({ seed: runSeed });   // or { context } to share the game's AudioContext
startButton.onclick = () => music.start();         // first start must follow a user gesture

music.newGame(nextSeed);    // new run, new music
music.setTempoScale(1.15);  // speed the music up with the runner
music.setMuffle(0.8);       // pause menu, game over, tunnels
music.setStyle('citypop');  // or 'hiphop', or 'auto' to alternate
music.on('note', (n) => {}); // { part, midi, time, dur, vel } for beat-synced visuals
music.getState();           // current track, chord, bar, seconds to the next track
```

`playground.html` is a page for trying it out. It is the source of the
published Artifact; to run it locally, serve this folder over HTTP (ES modules
don't load from `file://`), e.g. `python3 -m http.server` and open
`/playground.html`.
