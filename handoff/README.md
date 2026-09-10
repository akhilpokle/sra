# Long Service Award — Milestone Overlay

An overlay that plays on top of the live Liferay intranet. The user holds their
cursor on a star to charge it; that sets off a firework show, and the fireworks
clear a black veil to reveal a 3D medallion and the milestone message.

Vanilla HTML/CSS/JS. No framework, no build step, no npm. One IIFE, no globals,
full teardown on close. Desktop only — below **1024px** the script does nothing
at all.

---

## To see it

From this folder:

```bash
node serve.js . 8126
```

Then open `http://localhost:8126/`.

**Do not double-click `index.html`.** Over `file://` the page reports
`innerWidth === 0`, which trips the width guard and the overlay never mounts.
The bundled server also sets the `.svg` MIME type (without it the medallion's
rim goes blank) and `Cache-Control: no-store`.

- **Hold your cursor on the star at the bottom.** It fills from its core
  outward while the year count climbs above it. Let go early and it drains at
  half the fill rate. At full it flashes, pauses, and launches the show.
- **Watch the medal's number after the centre firework breaks.** It sparkles —
  a field of dots in the shape of its own digits, holding a few seconds and
  fading out. See "The sparkle on the number".
- **RESET** puts the stage back. **×** top-right tears the overlay down.
- **Click the stage** to send up a single rocket.
- There is **no click-to-skip**. Holding is the only route through. Deliberate.
- Your cursor is a spark; the real pointer is hidden.

---

## What ships

| File | What it is |
|---|---|
| `lsa-experience.css` | Every style. All selectors prefixed `lsa-`, scoped under `.lsa-root`. |
| `fireworks-engine-2.js` | The fireworks — buffers, physics, rendering. One global, `Fireworks2`. **Loads first.** |
| `lsa-experience.js` | The show — chrome, the tuned `cfg`, the charge, the sequence, the medallion, the sparkle on the number, teardown. Drives the engine, contains none of it. |
| `assets/medal-face-blank.png` | Medallion front face, **no number on it**. The milestone is drawn over it as DOM text, so one asset covers all ten. 605 KB. |
| `assets/medal-edge.svg` | Textless silhouette, stacked 34× along Z for the coin's thickness — 81.6px of depth. |
| `assets/gal4.jpg` | The galaxy the counter ignites through. 565 KB. |

`lsa-mount.html` is the snippet you paste into Liferay, not a file you host.

**`index.html`, `serve.js` and `bg.png` ship nowhere.** They are the local demo.
**`bg.png` in particular is a REFERENCE IMAGE ONLY** — a screenshot of the
intranet homepage, standing in for the live page so you can see that this is an
overlay. Nothing in the CSS or the JS refers to it. In production there is no
background image at all; the live Liferay page is the backdrop, sitting in the
DOM behind the overlay. Delete those three files on deployment and nothing else
changes.

### What it weighs

The folder is **2.4 MB**; the **live payload is 1.37 MB**, since 983 KB of the
folder is the demo-only `bg.png`.

| | |
|---|---|
| `assets/medal-face-blank.png` | 605 KB — 2250×2260, rendered into a 320px box. |
| `assets/gal4.jpg` | 565 KB — only ever seen through `color-dodge` on a handful of glyphs. |
| `lsa-experience.js` | 154 KB. |
| `fireworks-engine-2.js` | 45 KB. |
| `lsa-experience.css` | 38 KB. |
| `assets/medal-edge.svg` | 1.3 KB. |
| `bg.png` | 983 KB — the reference screenshot. **Ships nowhere**, so the live page never pays for it. |

**It was 3.9 MB on the morning of 2026-09-07.** Two changes that day took 65%
off it:

- **The face and the galaxy were recompressed**, from 2.28 MB and 1.05 MB. The
  face is now an indexed PNG (227 colours, 22 alpha levels) and it holds up:
  compared against the original side by side at the shipped 320px and again at
  2×, there is no visible banding in the centre glow and no stepping on the
  edge. The artwork is a narrow brown-and-cream range, which is why the palette
  survives it. **Worth re-checking if the medallion is ever made
  screen-relative** and rendered much larger.
- **The shimmer came out**, taking a 542 KB mask with it. See below.

One win still on the table: **`medal-face-blank.svg` is the same artwork as
vector at 64 KB.** Not free — it has to be served as `image/svg+xml`, and its
filters would be rasterised by the browser rather than baked.

**One more thing loads and it is not a file you host: Aleo, from Google Fonts.**
Three `<link>` tags at the top of `lsa-mount.html`. See CSP below.

---

## The sparkle on the number

Added 2026-09-07. When the **centre** firework breaks and its sparkles have
settled, the milestone twinkles on the medal's face: dots sitting in the shape
of its own digits, holding a few seconds and fading out. **The engraved number
stays visible under them the whole time** — the dots are a flare over a digit
that is already there, not the thing that puts it on the medal.

Three things worth knowing before touching it:

- **The shape comes from the font, not from a point list.** The digits are drawn
  to an offscreen canvas in `.lsa-medal-number`'s own computed style and every
  inked grid square becomes a dot. One code path covers all ten milestones, and
  a change to the typeface or to `--lsa-medal-w` carries through on its own.
- **It lives inside the coin's front face**, next to `.lsa-medal-number`, which
  is what makes it ride the 3D tilt. A stage-level layer would slide off the
  digits the moment the cursor moved the coin.
- **It hangs off `fw.onBurst`**, not a clock — the same hook the veil steps on.

Its values are in `sparkleTune` near the top of the sparkle section in
`lsa-experience.js`:

| Key | Default | What it does |
|---|---|---|
| `settle` | 1.4 | seconds from the centre break to the dots arriving |
| `fadeIn` | 0.6 | seconds for the field to come up |
| `hold` | 2.8 | seconds at full |
| `fadeOut` | 2.0 | seconds to go |
| `grid` | 4 | CSS px between dots — the density |
| `floor` | 0.16 | the level an unlit dot rests at |
| `rate` | 1.1 | flashes per second |
| `halo` | 3.4 | glow width, against the dot's own radius |

The whole beat is **6.8 seconds** from the centre firework breaking. Nothing
else in the show reads any of these.

---

## Integrating with Liferay

1. Host `lsa-experience.css`, `fireworks-engine-2.js`, `lsa-experience.js` and
   the `assets/` folder.
2. Paste `lsa-mount.html` into a Web Content fragment and replace its three
   `REPLACE_WITH_ASSET_PATH` placeholders.
3. Set `ASSET_PATH` at the top of `lsa-experience.js` to wherever `assets/`
   ended up.

**Load order matters three times over.** The Google Fonts stylesheet before
`lsa-experience.css`, so the `@font-face` is known when `.lsa-count` is styled;
the stylesheet before the script, so the overlay never renders unstyled for a
frame; the engine before `lsa-experience.js`, which calls into it. Both scripts
are deferred and deferred scripts run in document order — do not reorder them.

**One path rule, not two, since 2026-09-07.** All three images —
`medal-face-blank.png`, `medal-edge.svg`, `gal4.jpg` — are `img.src`, built from
`ASSET_PATH`, which resolves **against the page**. There used to be an
exception: `shimmer.png` was a `mask-image` url() in the CSS, which resolves
against the *stylesheet* and so forced the CSS file and `assets/` to stay
siblings. The shimmer was removed and that constraint went with it. The
stylesheet now loads nothing.

**Serve SVG as `image/svg+xml`.** As `application/octet-stream` an SVG in an
`<img>` renders as nothing, silently blanking all 34 edge layers.

**Keep asset filenames free of spaces.** The paths are assembled by string
concatenation and re-rooted by hand, which is two chances to lose the
percent-encoding and one silent blank medallion.

No inline `<script>` and no inline `style` carrying logic — the page enforces a
CSP.

### Two CSP entries to get approved

- `https://fonts.googleapis.com` as a **style-src**
- `https://fonts.gstatic.com` as a **font-src**

**If either is refused, nothing breaks and nothing warns you.** The counter
falls back to the system sans and stops matching the medal's number. The fix is
to delete the three `<link>` tags and self-host the woff2 in `assets/` with an
`@font-face`; the CSS needs no other change. Check it by eye on the real page —
a fallback font renders perfectly happily.

---

## Personalising it

```html
<div id="lsa-mount" data-name="Akhil" data-years="5"></div>
```

Both optional; they fall back to constants at the top of `lsa-experience.js`.

`data-years` is not just the sentence on the card. It is the number the charge
button counts up to and the number written onto the medal. Any positive whole
number works — it is not restricted to multiples of five.

**The hold is as long as the milestone**: one number every 800ms, so 5 years is
a 4.0s hold and 50 years is 14.4s. That is a real open question — see below.

### The once-only flag — backend, not built here

"Show once" gating is deliberately **not** implemented. No `localStorage` check.
As shipped it runs on every page load at ≥1024px. It needs a per-user flag
persisted server-side; a browser-local one resets per device. The integration
point is the top of the IIFE, right after the `MIN_WIDTH` check — one early
`return`, once the contract exists.

---

## Known issues, flagged not fixed

- **Very little of this has been judged by eye.** Most claims about the show are
  numbers read back out of the DOM. This is the largest open risk.
- **50 years has never been watched.** 800ms per number was tuned at 5 years,
  where it is a 4-second hold. At 50 it is 14.4s of holding a cursor still and
  28.8s to drain, so slipping off near the top is close to unrecoverable.
- **The fireworks are identical at every milestone.** Only the counter and the
  medal scale. Sub-bursts on the centre firework are the agreed mechanism and
  are switched on; the mapping from years to shell count is not written.
- **1.14 MB of images**, down from 3.9 MB on 2026-09-07. The remaining win is
  the vector face. See "What it weighs" above.
- **The sparkle's density has not been settled.** At the default 4px spacing it
  reads as "the 5 is *built out of* lights" rather than "the 5 has lights on
  it". That is what was asked for, but it is one value in `sparkleTune` and the
  one most likely to move. It has only been judged in still frames at 2.4×
  magnification, never watched running at its real size.
- **The sparkle runs past the end of the reveal.** It starts 1.4s after the
  centre break and lasts 6.8s, while the veil finishes about 1.9s after that
  break — so it is still going for roughly five seconds after the medallion has
  landed, over the top of the background fireworks. Whether those fight is
  unjudged.
- **The medallion's cursor-tracking shimmer was removed on 2026-09-07** — it was
  not earning its 542 KB mask. The 3D tilt stays. Nothing else used the effect,
  and no other code referenced the file.
- **The medallion does not scale with the screen.** Fixed 320×321px, so it is a
  comfortable centrepiece at 1024 and a small object at 2560. `--lsa-medal-w` on
  `.lsa-medal-scene` is the one source for the size, and the number and the
  count-up's aim both derive from it, so this is a change to one value.
- **Resize below 1024px does not tear down.** Decided, never implemented.
- **`prefers-reduced-motion` is out of scope**, explicitly.
- **Integration safety audit never started.** Confirm no globals leak, every
  listener is removed, no selector can reach Liferay markup.
