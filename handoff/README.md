# Long Service Award — Milestone Overlay

An overlay that plays on top of the Liferay intranet homepage to celebrate an
employee's service milestone (5, 10 … 50 years).

1. The page goes behind a blurred blue veil and a black cover.
2. The cursor becomes a spark. A star sits at the bottom of the screen with
   the words **HOLD YOUR SPARK HERE**.
3. Holding the spark on the star fills it while a counter climbs to the
   milestone. The hold takes 4 seconds at 5 years and 10 seconds at 50.
4. When the star is full, five fireworks launch and burst on the medal's
   number. Each burst clears a third of the black cover.
5. A card is revealed: a 3D silver medal that leans toward the cursor, and
   the line *"Congratulation {name} on completing {years} years with DBS."*
   Soft fireworks keep going in the background.
6. The close button (top right) removes everything.

Plain HTML, CSS and JavaScript. No framework, no build step, no npm. It is
not an iframe: it runs inside the live page, so it is written to stay out of
the page's way (see [Safety](#safety)).

---

## What's in this folder

| File | Ships? | What it is |
|---|---|---|
| `lsa-experience.js` | **Yes** | The whole overlay, fireworks included. 77 KB. |
| `lsa-experience.css` | **Yes** | Every style. 15 KB. |
| `assets/` | **Yes** | Five images, 2.3 MB in total (list below). |
| `lsa-mount.html` | Paste into Liferay | The snippet for the Web Content fragment. |
| `index.html` | No | Local demo page. |
| `bg.png` | No | Screenshot of the intranet, the demo's background. |
| `serve.js` | No | Tiny local web server for the demo. |

The five images, all loaded by the script:

| Image | Size | Used for |
|---|---|---|
| `medal.svg` | 286 KB | The medal's face |
| `Stack.png` | 58 KB | The medal's rim (drawn 68 times, loaded once) |
| `diamond.png` | 5 KB | The diamonds on the medal, one per 5 years |
| `card-Back-l.png` | 1.4 MB | The card's silver plate |
| `gal4.jpg` | 579 KB | The galaxy that lights up the counter |

---

## See it locally

```bash
node serve.js . 8126
```

Then open `http://localhost:8126/`. The window must be **at least 1024px
wide**; below that the overlay does nothing. Opening `index.html` straight
from disk (`file://`) will not work.

To try another person or milestone, change `data-name` or `data-years` on
the `<div id="lsa-mount">` in `index.html` and reload.

---

## Putting it on Liferay

1. **Host** `lsa-experience.css`, `lsa-experience.js` and the `assets/`
   folder.
2. **Paste** `lsa-mount.html` into a Web Content fragment and replace its two
   `REPLACE_WITH_ASSET_PATH` placeholders with where the CSS and JS are
   hosted.
3. **Set `ASSET_PATH`** near the top of `lsa-experience.js` (line 68) to
   where `assets/` is hosted. It is resolved against the **page**, not the
   script. Every image goes through it.
4. **Fill in the mount element per user**, on the server:

   ```html
   <div id="lsa-mount" data-name="Priya" data-years="10"></div>
   ```

   - `data-name` is shown in the card's sentence.
   - `data-years` drives the counter, the number on the medal, the number of
     diamonds (one per 5 years), the sentence, and the length of the hold.
     Any positive whole number works.
   - If either is missing or invalid the script falls back to `"Akhil"` and
     `5`. **Always send both.**

5. **Decide who sees it, on the server.** The overlay plays every time the
   snippet is on the page. It has no "seen it" memory of its own, on
   purpose: a browser-side flag would reset per device and when the cache is
   cleared. Output the snippet only for a user who has a milestone to
   celebrate and has not seen it yet, and record that they have.

6. **Content Security Policy.** The page must allow:

   | Directive | Value | Why |
   |---|---|---|
   | `style-src` | `https://fonts.googleapis.com` | The two fonts |
   | `font-src` | `https://fonts.gstatic.com` | The two fonts |
   | `connect-src` | wherever `assets/` is hosted | `medal.svg` is loaded with `fetch()` |

   Nothing inline is used, so `'unsafe-inline'` is not needed. If the fonts
   are blocked, nothing breaks: the text falls back to the system font. If
   `connect-src` blocks the medal, the medal face is blank and the rest still
   runs.

7. **Serve with the right file types**: `.svg` as `image/svg+xml`, `.js` as
   `text/javascript`, `.css` as `text/css`.

8. **Mind the capital B** in `card-Back-l.png` on a case-sensitive server.

### Fonts

Aleo 700 italic (the counter and the medal's number) and Public Sans 600 (the
sentence) come from Google Fonts, in one request, in `lsa-mount.html`. This
is the only outside dependency. To avoid it, self-host the two fonts with
`@font-face` and delete the three font tags; the CSS needs no other change.
Only weight 600 of Public Sans is loaded, so restyling the sentence to
another weight means changing that link too.

---

## Safety

The overlay shares the page with Liferay, so it follows these rules. Please
keep them if you change it.

- **No globals.** Everything is inside one function. It adds nothing to
  `window`.
- **Clean close.** Every event listener is removed, the animation loop stops,
  the overlay's elements are removed, and the page's scrolling comes back.
- **Scoped styles.** Every CSS rule starts with `.lsa-`. No bare tag
  selectors. Nothing changes Liferay's own styles.
- **Contained blend.** `.lsa-root` has `isolation: isolate`. Without it, the
  galaxy's blend mode would reach through and change how the Liferay page
  behind looks. Do not remove it.
- **Desktop only.** Below 1024px wide the script does nothing at all.
- **No timers, no storage, no cookies.**
- `medal.svg` is placed into the page as markup (so the script can move a
  layer inside it). Host it somewhere trusted, like any script.

Checked on 2026-09-30: no globals, nothing left after close, no errors.

---

## How the code is laid out

`lsa-experience.js` reads top to bottom. The main sections:

| Section | What it does |
|---|---|
| Name and milestone | Reads `data-name` and `data-years`. |
| The card, the medal | Builds the card, the 3D medal, the diamonds and the number on the medal. |
| The medal's tilt | Leans the medal toward the cursor, and turns its texture. |
| The counter and the star | Builds the counter and the star button. |
| The galaxy | The photo that makes the numbers light up. |
| Aiming the counter | Sizes and places the counter so it lands exactly on the medal's number. |
| **The show's settings** | **Every tuned value: colours, sizes, launch order, how each firework looks, the background fireworks.** |
| The fireworks engine | Draws fireworks on a canvas. Two copies run: the show, and the background. |
| The show's timing, revealing the card | Launches the five fireworks and clears the black cover on each burst. |
| The charge | Filling and draining the star, the counter's numbers and the blur between them (`chargeTune`). |
| The spark cursor | The glowing cursor and its sparks. |
| The animation loop | One loop runs everything, in order. |
| Close | Removes everything. |

All values were tuned by eye and are final. The code comments say what each
one does.

### Three things that silently break the galaxy effect

The counter lights up because a galaxy photo sits over the screen with
`mix-blend-mode: color-dodge`. It stops working, with no error, if you:

1. put a `transform`, `filter`, `will-change` or `opacity` below 1 on any
   element between `.lsa-galaxy` and `.lsa-black`;
2. fade a container that holds both the counter and the galaxy;
3. fade the counter with `opacity` instead of `brightness`, or make its text
   anything but pure white.

### Other things to know

- The card is a **fixed 800 × 540**, the plate image's own shape. Content
  that grows taller spills over the edge with no warning. There is about
  80px to spare today.
- The medal is a **fixed 320px** wide and does not grow on big screens. Its
  size is set once, `--lsa-medal-w` in the CSS, and the number and counter
  follow it.
- The medal's rim is 68 stacked images. 34 would probably look the same and
  cost half as much; not tried.
- Resizing the window below 1024px while the overlay is open does not close
  it.
- `prefers-reduced-motion` is not handled; this was out of scope.
- There is no way to skip the hold (no click fallback). That was a decision.

---

## Open items for your team

- [ ] Where the files are hosted, and the two placeholders plus `ASSET_PATH`.
- [ ] The CSP entries above.
- [ ] The server-side "has seen it" flag, and who gets the snippet.
- [ ] Filling `data-name` and `data-years` per user.
- [ ] Hosting the fonts yourselves, if Google Fonts is not allowed.
