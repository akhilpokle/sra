# Long Service Award Overlay · Handoff

An overlay that plays on top of the live Liferay intranet to celebrate a
service milestone. The user holds their cursor on a button to charge it, that
sets off a firework show, and the show clears a black veil to reveal a 3D
medallion and a congratulation line.

**Status: it runs.** Little of it has been judged by eye — see "Known issues".

✅ **The lab charge was ported into production on 2026-09-04.** The counter, the
step list, the 800ms pace, the blur swap, the star and the galaxy are all in
`lsa-experience.js` now. `lab/charge-test.html` is no longer ahead of
production — it is a reference copy. Two pieces of the port are still open; see
"Still to do on the charge port".

> **This file is the current picture only.** The old 1500-line version carried
> an 850-line archive of designs that no longer exist (a fuse, a generation
> cascade, a GO button). That is gone from here. Recover it with
> `git show 890ffc7:handoff.md`; `progress.md` still holds the narrative log.

---

## What ships

Six files, **1.37 MB**. Everything is vanilla, classic scripts, no build step,
no CDN.

| File | What it is |
|---|---|
| `lsa-experience.css` | Every style. All selectors prefixed `lsa-`, scoped under `.lsa-root`. **It loads nothing** — see "One path rule". 37 KB. |
| `fireworks-engine-2.js` | The fireworks — buffers, physics, rendering. One global, `Fireworks2`. **Loads first.** 45 KB. |
| `lsa-experience.js` | The show — chrome, the tuned `cfg`, the charge, the sequence, the medallion, the sparkle on the number, teardown. Drives the engine, contains none of it. 154 KB. |
| `assets/medal-face-blank.png` | Medallion front face, **with no number on it**, since 2026-09-07. **605 KB, the heaviest thing loaded.** 2250×2260, exactly 4× the old 563×565 viewBox, so it drops into the same coordinate space and the edge stack still lines up. The milestone is drawn over it as DOM text — see "The number on the medal". `assets/medal-face-blank.svg` is the same artwork as vector at **64 KB** and is not yet used; see Known issues. |
| `assets/medal-edge.svg` | Textless silhouette, stacked 34× along Z to fake the coin's thickness — **81.6px of depth since 2026-09-07**, doubled from 40.8 because nobody could see the rim. 1.3 KB. |
| `assets/gal4.jpg` | The galaxy the counter ignites through. **565 KB.** Moved here from the repo root 2026-09-04 so there is one `ASSET_PATH` rule and not a third path convention. |

**It was 3.9 MB on the morning of 2026-09-07.** Two changes that day took 65%
off it: the face and the galaxy were recompressed, from 2.28 MB and 1.05 MB; and
the medallion's cursor-tracking shimmer was removed, taking a 542 KB mask with
it. Both are written up under Known issues.

⚠ **The face is now an INDEXED PNG** — 227 palette colours, 22 alpha levels.
It was compared against the original side by side at the shipped 320px and again
at 2×: no visible banding in the centre glow, no stepping on the edge. The
artwork is a narrow brown-and-cream range, which is why a palette survives it.
**Re-check it by eye if the medallion is ever made screen-relative** and drawn
much larger — that is the condition this was not tested under.

`lsa-mount.html` is the snippet you paste into Liferay, not a file you host.

**One more thing has to load, and it is not a file you host: Aleo, from Google
Fonts.** Three `<link>` tags at the top of `lsa-mount.html`. It is the only CDN
in this project and the one deliberate exception to the no-CDN rule — see
"Integrating with Liferay" for the two CSP entries it needs and what happens if
they are refused.

**Does NOT ship:** `assets/back.png` (no click-to-flip, nothing loads it),
`assets/Path.svg` (its path data is inlined as `SPARK_PATH` in
`lsa-experience.js`, so the file itself is never fetched — one string now feeds
both the charge star's three SVG copies and the cursor's `Path2D`),
`assets/medal.svg` (the original numberless front face, replaced 2026-09-07),
`assets/medal-face.png` (the face **with a 5 baked into it**, replaced later the
same day; kept because subtracting it from the blank one is how the number's
position was measured, and it is the only way to re-derive that), 
`assets/medal-face-blank.svg` (the vector face, not wired up yet),
`assets/shimmer.png` (the shimmer mask — the effect was removed 2026-09-07 and
nothing reads the file now; still on disk),
`fireworks-engine.js` and `lab/fireworks-lab.html` (engine 1, superseded, still
on disk), `lsa-demo.html`, `index.html`, `bg.png` (local harness — `bg.png` is a
**reference screenshot** of the intranet, standing in for the live page, and no
CSS or JS refers to it).

---

## What happens, in order

1. Overlay mounts over a blurred blue veil of the page. Everything sits behind
   an opaque black layer. **The screen is black and empty — no number.**
2. The cursor becomes a spark — sparkles launch from it and spread out.
3. A four-pointed **star** sits at the bottom, dormant: a gold outline with no
   light in it. Under it, **HOLD YOUR SPARK HERE**.
4. Holding on it fills the star **from its core outward** while the year count
   climbs, sitting **exactly where the number on the medallion is about to
   appear** — about 61px above screen centre, not on it. The star grows
   0.65× → 1.65× and the number 0.30× → 1.04×, both tied to the fill rather
   than to the step. At a full charge the counter is the same typeface, weight
   and size as the medal's number and lands on top of it to within a quarter of
   a pixel. See "The number on the medal".
5. Each number blurs and dims out, is swapped at the peak where it cannot be
   read, then blurs back in. A galaxy photo on `color-dodge` makes the letters
   come up in patches, so they read as igniting rather than appearing.
6. At full it flashes white, pauses **0.25s**, then releases. The galaxy fades
   off over 0.5s during that pause.
7. Five rockets launch **inside-out** — centre first, then the pair either side,
   then the outer pair. They all break **on the medal's number**, the same spot
   the counter just finished on. Three burst moments, ~0.5s apart. **The centre one
   breaks a second time**: six of its sparkles are shells that re-burst 0.7s
   later. On since 2026-09-07, and on that firework only.
8. The first burst takes the counter and the star away over 0.7s. Each burst
   moment clears a third of the black veil; after the third, the medallion and
   message are fully out.
9. **1.4s after the centre firework breaks** — long enough for its sparkles and
   its second break to settle — **the milestone sparkles on the medal's face**.
   Dots in the shape of its own digits come up over 0.6s, twinkle for 2.8s and
   fade out over 2.0s, so the whole beat is 6.8s from that break. The engraved
   number stays visible underneath the entire time. See "The sparkle on the
   number".
10. Background fireworks start behind the blue veil and run until close.

**The hold is as long as the milestone.** One interval per number, 800ms each,
so every milestone runs at the same pace and differs only in how many numbers
it walks. Leave the star early and it drains at half that rate, so a wobble
costs a little progress rather than all of it.

All ten, measured in a running page on 2026-09-07 by driving one charge per
milestone and counting the numbers that actually reached the screen:

| Milestone | Steps | Charge | Drain |
|---|---|---|---|
| 5 | 5 | 4.0s | 8.0s |
| 10 | 10 | 8.0s | 16.0s |
| 15 | 11 | 8.8s | 17.6s |
| 20 | 12 | 9.6s | 19.2s |
| 25 | 13 | 10.4s | 20.8s |
| 30 | 14 | 11.2s | 22.4s |
| 35 | 15 | 12.0s | 24.0s |
| 40 | 16 | 12.8s | 25.6s |
| 45 | 17 | 13.6s | 27.2s |
| 50 | 18 | 14.4s | 28.8s |

**The ladder is lopsided, and that is a consequence of the step list rather
than a choice.** 5 to 10 doubles the hold, because those are the only two
milestones inside the every-number stretch; from 10 up each milestone adds one
number and 0.8s. So a 10-year award already costs more than half of what 50
does, and the ten milestones occupy 4.0s to 14.4s with two thirds of them
crowded into the last four seconds.

**There is no click-to-skip.** Holding the spark on the button is the only route
through. That was an explicit decision, not an omission.

---

## The eight layers, front to back

```
1  galaxy     .lsa-galaxy    z  6   color-dodge, over everything. Charge only.
2  spark      .lsa-spark     z  5   the cursor
3  chrome     —              z  4   star, counter, RESET, close, dev panel
4  fireworks  .lsa-canvas    z  3   transparent composite
5  black      .lsa-black     z  2   opaque; the show clears it in thirds
6  card       .lsa-card      z  1   medallion + message + sparkle, never fades
7  blue       .lsa-backdrop  z  0   blurred veil, constant throughout
8  ambient    .lsa-ambient   z -1   background fireworks, seen THROUGH the blue
   intranet   —                     the live page, behind .lsa-root
```

**The order is the design.** The fireworks sit in *front* of the black, so they
burn at full brightness while the card behind it is still hidden. Layer 8 is the
only thing behind the blue veil — that blur is what makes it read as distance.
The card is a transparent positioning box; it has no white surface of its own.

**The sparkle field is not a stage layer.** `.lsa-medal-sparkle` is a canvas
*inside* the medallion's front face, alongside `.lsa-medal-number`, which is
what makes it ride the 3D tilt. A layer of its own at stage level would slide
off the digits the moment the cursor moved the coin.

**`.lsa-root` carries `isolation: isolate`, and it is load-bearing.** Without
it the galaxy's `color-dodge` would blend all the way through to the live
Liferay page. A blend mode is the one way a namespaced stylesheet can still
change how the host page looks, so this is part of the safety contract, not
just the effect.

### The galaxy, and the three things that kill it silently

`gal4.jpg` is laid over the whole stage on `mix-blend-mode: color-dodge`.
Dodge cannot lift black at all, so on a black stage the image is invisible
*except* where something bright is already painted — during the charge that is
the counter, the star and the cursor. **Nothing is masked and nothing is
clipped to the text.** Bright patches of the photograph dodge harder than dark
ones, so a letter comes up unevenly; the image is standing still and acting as
a timing map for the brightness the swap is already writing.

1. **A transform, a filter, `will-change`, or an opacity below 1 on any element
   BETWEEN the image and `.lsa-black`.** That seals the blend inside that
   wrapper and it stops reaching the black.
2. **Fading a container holding both the text and the image.** The browser
   flattens them together first. Fade the image itself — which is what
   `.lsa-root--released` does.
3. **Fading the number with `opacity` rather than `brightness`.** Opacity fades
   the letter against its background *after* it is drawn, which collapses the
   whole effect into an ordinary crossfade.

The text must also stay **white**, and the counter must have **no
`text-shadow`**. Pure white sits at the top of the dodge, so the image ignites
the letter on the way in and then gets out of the way. A *mid-tone* dodges
hardest — the 45%-alpha gold glow that used to be on `.lsa-count` would have
made the galaxy brightest in the ring *around* the number instead of in it.
Same failure as setting the text mid-grey, which was built and rejected.

**It leaves at the release, not at the first burst.** From the first burst on,
the fireworks are the brightest thing on the stage and dodging them would blow
them out, and then the medallion behind them. The release hook buys the whole
ascent, measured 2026-09-05 at **2.52s on 1440×900 and 2.33s on 1024×768**.

**How long it takes is now tunable**, `chargeTune.galaxyFade`, default **2.3s**,
slider in the dev panel. It was a flat 0.5s until 2026-09-05, which made the
image snap off almost the instant the spark filled; at 2.3s it fades across the
rockets' whole climb instead. The duration is read **once**, at the release, and
written to `--lsa-galaxy-fade`.

**`cutGalaxyShort()` is what makes that safe.** The slider goes to 4s and the
climb is only ~2.4s and drifts with window height, so the first burst freezes
the image at whatever opacity it has reached and takes it the rest of the way in
0.25s. It cannot simply shorten the transition — changing `transition-duration`
mid-flight does nothing, the browser committed to the original timing when it
started — so it freezes, forces a reflow, and starts a new one. `resetScene()`
clears the two inline styles it leaves, or the second run would have no galaxy
at all.

---

## The number on the medal, and the count-up that lands on it

**The face carries no number.** `medal-face.png` had a **5** and the word
**Years** baked into the artwork, which meant a 20-year award showed a medal
reading 5, and ten milestones would have needed ten 2.3 MB faces.
`medal-face-blank.png` is the same artwork with the digit removed — "Years"
stays, since that word does not change — and the milestone is drawn over it as
DOM text, `.lsa-medal-number`. **One face covers all ten milestones**, and
`setYears()` writes the digit, so the dev panel's picker changes the medal.

**The fill was levelled to the artwork, and the design spec was wrong.** The
supplied gradient, `#A18D7E → #998474`, rendered visibly darker than the digit
it replaced. Sampling the old face against the blank one at the shipped 320px
size: the printed digit's body averages **#A69384**, and **#AB9A8A** once its
antialiased edges are counted, while the spec's two stops average **#9D8879** —
about **ten levels per channel too dark**. The stops now sit on the **soft**
mean, `#AE9C8D → #A69384` — chosen by eye against the old face, and it is the
right target: what reads as the digit's colour is the average the eye takes over
the whole glyph, antialiased edges included, not the colour of its solid
interior. The straight body match, `#AA9889` / `#A28F7F`, still looked heavy.
The angle, stop positions and spread are the spec's, untouched; only the level
moved.

⚠ **`background-image`, never the `background` shorthand, on this rule.** The
shorthand resets `background-clip` to `border-box`, so a `background:` written
after the clip silently un-clips the gradient and paints a **filled rectangle**
behind the digit. The longhand makes the order irrelevant.

The number is **Aleo 700 italic**, filled with a gradient clipped to the text.
That is not a match by eye: the old face and the blank one are the same artwork
at the same size, so subtracting one from the other gives the printed digit's
exact box — **x 948–1296, y 774–1256 in a 2250×2260 export**. As fractions of
the medal that is centre **0.4989 / 0.4493** and an ink height of **0.2137**.
Aleo 700 italic digits are 0.74em of ink, and 161 × 0.74 = 119 against 117–121
measured off the pixels, so the typeface and the size are confirmed rather than
guessed.

**Every value is a fraction of the medal, never a pixel.** `.lsa-medal-scene`
carries `--lsa-medal-w`, and both the number's `font-size` (161/563 of it) and
the count-up's aim are derived from that. Resize the medallion — which is a
flagged open item — and the number and the counter both follow. Change it in
one place.

### The 0.055em nudge is not a fudge

Centring puts an element's **box** on a point. What has to land there is its
**ink**. Aleo sits its digits' ink centre **0.055em above the box centre**, so
`.lsa-medal-number` moves its box down by that much to bring the ink up to the
mark, and `aimCounterAtMedal()` adds the same correction back at the size the
counter ends at. It is independent of `line-height`. **Re-measure it if the
typeface ever changes; do not carry the number over.**

### How the counter is aimed

`aimCounterAtMedal()` reads `.lsa-medal-number`'s own **computed `font-size` and
`top`** straight back out of the stylesheet, so no fraction is written twice. It
then sets two things:

- **`chargeTune.scale1`**, the size at a full charge — 1.04 today. **Derived,
  not tuned.** Editing the literal does nothing.
- **`--lsa-count-y`** on `.lsa-count`, −60.83px today, which lifts the counter
  off screen centre onto the medal's digit.

**It does not use the medal's `getBoundingClientRect()`, on purpose.**
`lsa-experience.js` writes a tilt transform onto `.lsa-medal-scene` on every
mousemove, and a rotated element's rect is the box *around* the rotation, which
grows and shrinks as the cursor moves. `offsetTop` / `offsetWidth` are layout
values and ignore transforms, so they are stable mid-tilt.

**Nothing recomputes it on resize, and that is correct rather than an
omission.** `.lsa-count` and `.lsa-card` are both centred on the same point, and
the medal's offset inside the card is set by the card's own layout, so the
offset is viewport-independent. The one thing that *can* move it is the card's
sentence reflowing, which is why `setYears()` re-aims.

Measured at a full charge, at 5 years and again at 50: **ΔX 0.00px, ΔY 0.23px,
height ratio 1.0000.**

### The fireworks burst on it too

`runSequence()` takes its burst height from `burstY()`, which reads the same
`medalNumberY()` the counter is aimed with. So the counter finishes on the
number, the rockets break on the number, and the veil then clears to show the
number — three things on one anchor, with nothing to keep in step by hand.

**`cfg.goHeight` is now a fallback only**, used if the number cannot be
measured. **A fraction of the height cannot express this**, which is why it
stopped being the answer: the number sits a fixed ~66px above the viewport
centre, so the fraction that hits it is 0.418 at 800px tall and 0.439 at 1080.
Any single value is wrong on most screens. The old 0.5 was the same intent one
step coarser — "the vertical middle, which is roughly where the medallion is".

Read at press time, not cached, which is also why this needs no resize listener.

Measured at 1280×800: all five bursts land at **y 337.6** against the number's
ink at **334.1**. The 3.5px is the engine's own apex quantisation — a rocket
breaks on the frame its `vy` turns positive — not an aiming error, and it is
4% of the digit's height.

⚠ **Side effect: the first burst arrives later.** Aiming ~66px higher is about
8% more climb, roughly 0.19s on a 2.4s ascent. `cutGalaxyShort()` already
covers the galaxy fade for it.

### Two type settings that had to give way

- **`letter-spacing` on `.lsa-count` is now `normal`.** It was −0.02em, tuned
  against the system sans the counter no longer uses. The medal's number has
  none, and at these sizes it cost "50" 3.5px of width, which is a 1.8px
  sideways slip once both boxes are centred.
- **`font-variant-numeric: tabular-nums` stays, and is inert.** Aleo's figures
  are the same width either way — measured, not assumed — so it costs nothing
  and still guards a future typeface change.

### The counter is still white, and the gradient cannot come across

The medal's digit is a brown gradient. The counter is pure white and must stay
that way: `.lsa-galaxy`'s `color-dodge` needs white to ignite the letters, and a
mid-tone brown is exactly what dodges hardest, which inverts the effect. The two
numbers match in face, weight, slant and size — **not in colour**, deliberately.
See "The galaxy, and the three things that kill it silently".

---

## The sparkle on the number

Added 2026-09-07. When the centre firework breaks and its sparkles have
settled, the milestone twinkles on the medal's face: a field of dots sitting in
the shape of its own digits, holding for a few seconds and fading out.

**The engraved number stays visible under it the whole time.** The dots are a
flare over a digit that is already there, not the thing that puts it on the
medal. Hiding the number and handing off to the sparkles was built as an option
and rejected.

**The dots never fly in.** They are in place from the first frame and the field
fades up as a whole. That was an explicit call — an assembling effect was
proposed and dropped — and it is why the twinkle sits on a floor rather than
going to zero: a dot that goes fully dark makes the digits come apart and
reassemble, which is the effect that was not wanted.

### The shape comes from the font

The digits are drawn to an offscreen canvas in `.lsa-medal-number`'s own
computed font, and every grid square with ink under it becomes a dot. **One
code path covers all ten milestones**, there is no eleventh asset to keep in
step, and a change to the typeface or the medal's size carries through on its
own. 88 dots at 5 years, 185 at 50, at the default 4px spacing.

A hand-authored point list was the alternative. It would have been ten lists,
each of them wrong the day the artwork moved.

**Aimed by one read of the stylesheet.** `top` on `.lsa-medal-number` IS the ink
line — the 0.055em nudge in the CSS is what makes that true — and the canvas
shares `coinFront`'s box, so that value is the target with nothing to convert.
Same single source `medalNumberY()` and `burstY()` already use.

⚠ **Then re-centred on measured ink, not on where `fillText` was told to put
it.** `textBaseline: middle` centres the EM BOX, which is not the ink centre and
is off by a different amount for every typeface — the same distinction the
0.055em nudge exists for. So the ink's real bounding box is read back out of the
pixels and the whole field is shifted onto the target. **That shift is why "50"
centres as well as "5"**, and it is what makes the `fillText` placement above it
merely need to be close enough to keep the glyphs on the canvas.

The bounding box is taken from **every** pixel while the dots are taken on the
grid, in one pass. A box measured off the grid samples alone is coarse by up to
a whole step, which would throw the centring by half of one.

### Why the dots are sprites and not arcs

The first build drew hard-edged cream discs. On a cream medal face they read as
the digit being **eroded**, not lit — texture, not light. What separates a point
of light from a coloured dot is the falloff around it.

Every dot is now one soft radial blob — white core, warm gold edge, transparent
at the rim — built once into a 64px canvas and stamped with `drawImage`. A
gradient per dot per frame would be ~185 gradient objects every frame for the
same picture. Drawn with `globalCompositeOperation: 'lighter'` so overlapping
dots **add**, which is what makes the denser parts of a glyph read as hotter.

Alongside it the resting level dropped from 0.32 to 0.16, so the flashes have
something to stand out from.

### Every dot on its own clock

One shared curve, a random phase and a random rate multiplier per dot, both
rolled once at sample time. That costs nothing and is what stops the field
pulsing as a single object.

**Sharpness is what makes it sparkle rather than breathe.** A raw sine spends
half its time near the top, so every dot looks lit at once. Raising it to a
power squashes the curve down and leaves short bright peaks with long dim gaps.
`SPARKLE_SHARP` is 3; below about 2 it goes back to breathing.

**Size moves with brightness too.** A point of light that grows as it brightens
reads as a spark catching; one that only changes alpha reads as a pixel being
faded, which is what it actually is.

**The twinkle keeps running through the fade out**, which is what stops the exit
reading as one object being turned down. Dots that happen to be flashing as the
level drops hang on a moment longer than dots that happen to be dim, so the
field thins unevenly and the last few wink out on their own. Free here; it would
have cost a per-dot exit time to fake.

### It hangs off the centre firework, not off a clock

`fw.onBurst` again, the same hook the veil steps on, testing `spec.n === 3`.

**The centre is number 3 and it goes FIRST.** `goSequence` is inside-out — 3 at
`at: 0`, then 2+4, then 1+5 — so this is the show's opening break, not its last.
It is also the only firework carrying sub-bursts, which re-break 0.7s after the
main one, so "its sparkles have settled" is a good deal later than the burst
itself. That is what `settle` is buying.

⚠ **Armed ABOVE the one-burst-per-frame guard, deliberately.** That guard exists
so two rockets breaking on the same frame only move the veil once; this wants
the opposite — it asks "did *this* firework break", and the answer must not
depend on whether something else broke first on the same frame. Today firework 3
breaks alone and the two agree, but that is a fact about the current
`goSequence`, not a thing to rely on.

⚠ **The end of the field is tested on elapsed time, not on the level.**
`env <= 0` was the obvious test and it was **wrong**: the envelope is zero at
*both* ends, so on the very first frame — age 0, still climbing — it read as
finished and wiped the field before a single dot was ever drawn. The effect
silently did nothing, with no error. Caught by driving a full run through
`step()` and logging the canvas's total alpha per frame, not by reading.

### Its values

`sparkleTune` holds everything an eye has to judge, and **all seven have sliders
in the dev panel** under **The sparkle on the number**.

| Key | Default | What it does |
|---|---|---|
| `settle` | 1.4 | seconds from the centre break to the dots arriving |
| `fadeIn` | 0.6 | seconds for the field to come up — **no slider** |
| `hold` | 2.8 | seconds at full |
| `fadeOut` | 2.0 | seconds to go |
| `grid` | 4 | CSS px between dots — the density |
| `floor` | 0.16 | the level an unlit dot rests at |
| `rate` | 1.1 | flashes per second |
| `halo` | 3.4 | glow width, against the dot's own radius |

Everything lands **live** except `grid`, which is read while sampling rather
than while drawing — it is in the cache key instead, so moving it re-samples on
the next frame. The practical result is that the whole section can be judged
during one press of `Play show` rather than a run per value.

The rest are constants in the file and were not given controls: `SPARKLE_INK`
0.55 (the alpha a pixel must clear to count), `SPARKLE_JITTER` 0.85,
`SPARKLE_R` 1.15 and `SPARKLE_R_VARY` 0.55 (dot size), `SPARKLE_SHARP` 3, and
`SPARKLE_R_LIT` 0.45.

**Jitter is not decoration.** Dots on an exact grid read as a dot-matrix display
— the eye finds the rows instantly. Just under half a step of scatter in each
axis breaks the rows while every dot stays inside the glyph it came from. Rolled
once, at sample time, so the field does not crawl.

### What it costs, and what it does not

185 stamps on a 320px canvas per frame at the largest milestone, on a canvas
that is only painted for 6.8 seconds of the run. The sprite is built once. The
sample is cached on milestone, canvas size, font and spacing, so a second run
re-uses it.

**Teardown needs nothing.** The canvas is a child of `.lsa-root` and goes with
`root.remove()`; no listener is added and no timer is set. `resetScene()`
disarms the clock and wipes the canvas — it deliberately does **not** drop the
sampled dots, which are still correct. Verified: RESET wipes it, a second run
reproduces it exactly, and close leaves zero `.lsa-medal-sparkle` nodes.

---

## Architecture in one page

- **One IIFE**, no globals, full teardown. Every listener has a matching remove
  and the rAF loop is cancelled.
- **Desktop only**, `MIN_WIDTH = 1024`. Below that the script does nothing at all.
- **`cfg` IS the engine's config**, not a copy. Engine 2 deep-copies what it is
  handed, so `cfg = fw.cfg` right after the constructor is load-bearing. Skip it
  and every dev-panel slider writes to a dead object.
- **`cfg.background: null`** is what makes the engine an overlay instead of a
  standalone stage. Give it a colour and it paints over the intranet.
- **Anything about how the fireworks behave goes in the engine**, never in
  `lsa-experience.js`. That duplication has already cost this project its burst
  shapes and sub-blasts once.

### Two engine instances

The main show and the ambient layer are separate `Fireworks2` instances, because
the engine draws to the one canvas it is handed. They share nothing — no
buffers, no pool, no settings. Both get their `dt` from the one rAF loop.

### Per-firework settings

A firework's settings ride on its own `spec`. `runSequence()` attaches the live
`cfg.fireworkCfg[n]` row as `spec.settings`; the engine's `withSettings()` swaps
those keys into `cfg`, runs the work, swaps them back under `try/finally`.

Applied at two moments, and it has to be both: the whole body of `burst()`, and
the `spawnSparkles()` call inside `updatePending()` — which happens
`blast.lead` ms later, in a different `update()` call.

`fw.onBurst(x, y, spec)` is how the engine tells the overlay a rocket broke.
That drives the veil steps and clears the charge button. It lives on the
instance, **not on `cfg`** — `Copy config` runs `JSON.stringify` and a function
there would vanish silently.

### Screen scaling — `cfg.scaleToScreen`

Off by default in the engine, **on** in the overlay, `reference: 900`. The
factor is `min(w, h) / 900`, measured on the smaller side.

It scales **how far sparks fly** and **flash radius**. It deliberately does
**not** scale **spark thickness** or **rocket head**. A firework on a big display
should be wider, not chunkier. Do not fold this into one multiply.

The medallion, charge button and counter are all still fixed pixel sizes.

---

## Personalising it

`#lsa-mount` carries two attributes, both optional:

```html
<div id="lsa-mount" data-name="Akhil" data-years="5"></div>
```

They fall back to constants at the top of `lsa-experience.js` if absent, so the
demo page still works with no mount element.

`data-years` is not just the sentence on the card. It is the number the charge
button counts up to, so it is on screen for three seconds before the card
appears. It is parsed and rejected unless positive — otherwise a bad template
puts `NaN` on screen two inches tall. It is **not** clamped to multiples of five;
a seven-year award should count to seven.

---

## Integrating with Liferay

1. Host `lsa-experience.css`, `fireworks-engine-2.js`, `lsa-experience.js` and
   the `assets/` folder.
2. Paste `lsa-mount.html` into a Web Content fragment and replace its three
   `REPLACE_WITH_ASSET_PATH` placeholders.
3. Set `ASSET_PATH` at the top of `lsa-experience.js` to wherever `assets/` ended up.

**Load order matters three times over.** The Google Fonts stylesheet must load
before `lsa-experience.css`, so the `@font-face` is known by the time
`.lsa-count` is styled; the stylesheet must load before the script runs, so the
overlay never renders unstyled for a frame; and the engine must load before
`lsa-experience.js`, which calls into it. Both scripts are deferred, and
deferred scripts run in document order — do not reorder them.

### Aleo, and the one CDN in this project

The count-up and the medal's number are both **Aleo 700 italic**, loaded from
Google Fonts by three `<link>` tags at the top of `lsa-mount.html`. This is the
only external dependency the overlay has and the only exception to the no-CDN
rule. **It was a deliberate choice over self-hosting a woff2 in `assets/`.**

Two things to confirm with whoever owns the page's Content Security Policy:

- `https://fonts.googleapis.com` allowed as a **style-src**
- `https://fonts.gstatic.com` allowed as a **font-src**

**If either is refused, nothing breaks and nothing warns you.** The counter
silently falls back to the system sans in `.lsa-count`'s stack and stops
matching the medal, while the medal's own number falls back to Georgia. The fix
is to delete the three tags and self-host the woff2 with an `@font-face`; the
CSS needs no other change. Check it by eye on the real page rather than
assuming, because a fallback font renders perfectly happily.

### One path rule, since 2026-09-07

All three images — `medal-face-blank.png`, `medal-edge.svg`, `gal4.jpg` — are
`img.src`, built from `ASSET_PATH`, which resolves **against the page**. Set
that one constant and every image is found.

**This used to be two rules and it was the easiest thing here to get wrong.**
`shimmer.png` was a `mask-image` url() in the stylesheet, which resolves against
the *stylesheet* rather than the page, so the CSS file and `assets/` were forced
to stay siblings wherever they were hosted. The shimmer was removed and that
constraint went with it. **`lsa-experience.css` now loads nothing at all**, so it
can sit anywhere.

**Serve SVG as `image/svg+xml`.** Served as `application/octet-stream` an SVG in
an `<img>` renders as nothing, which would silently blank all 34 of the
medallion's edge layers and leave the face floating with no rim.

**Keep asset filenames free of spaces.** The face arrived as `Medal face.png`
and was renamed on the way in. A space has to be percent-encoded in a URL, and
this path is assembled by string concatenation in JS and then re-rooted by hand
at `ASSET_PATH` on Liferay, which is two chances to lose the encoding and one
silent blank medallion.

No inline `<script>` and no inline `style` carrying logic — the page enforces a CSP.

### The once-only flag — backend, not built here

"Show once" gating is deliberately **not** implemented. No `localStorage` check.
As shipped it runs on every page load at ≥1024px.

It needs a per-user flag persisted **server-side** — a browser-local one resets
per device and does not survive a cleared cache. The integration point is the
top of the IIFE, right after the `MIN_WIDTH` check: an early `return` driven by
whatever the backend exposes. One line, once the contract exists.

For local testing there is nothing to reset. It always shows.

---

## Running it locally

```bash
node .claude/serve.js . 8126
```

Then open `http://localhost:8126/lsa-demo.html`.

- **`file://` will not work.** It reports `innerWidth === 0`, which trips the
  `MIN_WIDTH` guard, so the overlay never mounts.
- The bundled server exists because the previous one had **no `.svg` MIME type**,
  which blanks the medallion. It also sends `Cache-Control: no-store`, so tuning
  reloads never serve a stale stylesheet.
- `data-lsa-dev` on `<html>` exposes `window.__lsaDev` —
  `{cfg, fw, amb, burst, launch, stats, go, step, sparkle}` — and the tuning
  panel. `sparkle` is `{show(env, age), hide(), dots(), tune}`, which paints one
  frame of the medal's dot field at any point in its life with no run and no
  waiting — the only way to look at it standing still.
  `lsa-demo.html` sets it; `lsa-mount.html` deliberately does not, so no panel
  and no global ever exist on the intranet.
- **A milestone picker and a `Play show` button**, added 2026-09-07, at the
  bottom of the panel under **The milestone**. The picker walks 5 to 50 and is
  the only thing in the file that moves `YEARS` after mount — it calls
  `setYears()`, which rebuilds the counter's step list and rewrites the card
  line, then resets the stage. `Play show` resets and runs the sequence with no
  hold, because judging fireworks at 50 years through a 14.4-second hold every
  time makes the comparison useless. It resets first on purpose: `onGo()`
  returns early while anything is still scheduled, so without that it would do
  nothing mid-show and read as a broken button.
  **Neither exists on Liferay.** `YEARS` there comes from `data-years` and
  cannot move.
- **`step(n, dt)` drives the whole show synchronously**, no real-time waiting.
  Argument order is `(n, dt)` here but `(dt, n)` in the engine-1 lab.

---

## Tuning

`lab/fireworks-lab-2.html` is the tuning lab for engine 2. Debug hook is
`window.lab2`.

Config moves through the clipboard in both directions, and neither is a
whole-object paste:

- **lab → overlay**: `Copy for overlay` emits only engine-owned keys, with
  `background` forced to null. That stops two accidents at once — carrying the
  lab's opaque sky into the overlay, and wiping the show-only keys
  (`goColors`, `fireworkSize`, `goHeight`, `goSequence`, `fireworkCfg`).
- **overlay → file**: `Copy config` in the dev panel dumps the whole `cfg`.
  Paste it over the literal. It is the only way tuning survives a reload.

**Gotcha:** a `fireworkCfg` already in the literal wins over fresh base values at
load. Pasting new lab values leaves the per-firework rows stale unless you delete
`fireworkCfg` from the literal first.

**Neither route carries `chargeTune` or `sparkleTune`.** Both belong to the
show's chrome rather than to the engine, and `Copy config` dumps `cfg` for the
engine's benefit. Values dialled in on those two sections of the dev panel have
to be written into the file by hand or they are gone on reload.

**`cfg.scale` does not reach the show.** `scaleOf(spec)` is
`(spec && spec.scale) || cfg.scale` — it *replaces*, never multiplies — and every
sequence firework passes its own from `fireworkSize`. `cfg.scale` only affects
plain canvas clicks.

---

## The charge, and where its values live

All of it is in `lsa-experience.js` now. **`chargeTune` is the one object that
holds every tuned value**, and every one of them was dialled in by eye on
2026-09-04 rather than guessed. Do not round them off.

| Key | What it does |
|---|---|
| `stepMs` 800 | how long one number is on screen. **Sets the whole charge length.** |
| `scale0` 0.30 | the size the number starts at, against the stylesheet's 88px. Taste; has a slider |
| `scale1` 1.04 | the size it finishes at. **DERIVED — overwritten by `aimCounterAtMedal()` so it matches the medal's number. Editing it does nothing** |
| `spark0/1` 0.65 → 1.65 | the star's size, against its 140px box |
| `glow` 1, `glowBlur` 0.6 | the bloom behind the star, and its radius |
| `hot` 0.5 | extra brightness on the star's fill at full |
| `blur` 0.1em, `floor` 0.45 | the number swap's depth. **A cap, not a taste — see below** |
| `maxMs` 250, `frac` 0.85 | the swap's length: `min(maxMs, stepMs × frac)` |
| `peak` 0.65, `power` 1 | where in the swap the text changes, and the curve |
| `pop` **false** | the charged flash. **Off** — it renders as a black disc, see Known issues |
| `galaxyFade` 2.3 | seconds for the galaxy to leave, against a ~2.4s climb |

`blur` has a control under **The number swap**, `scale0` under **The counter
grows**, and the last two under **The release**. `scale1` does not need one and
should not get one. The other eleven still do not — see below.

**`blur` has a ceiling, and 0.34em was over it.** It was 0.34 until 2026-09-05,
which is ~30px of blur on an 88px digit whose bold strokes are only ~11px wide.
Past the stroke width a Gaussian blur does not soften a letter, it dissolves
it: the strokes bleed into each other and average out, and the number becomes a
round grey cloud the size of its own box. That was the "radial blur spot" — it
was the blur, not the galaxy. Confirmed by hiding `.lsa-galaxy` and blurring
anyway; the blob was still there, the dodge only made it glow. **Keep it under
about 0.12em.** At 0.18 the digit is already a smear; at 0.1 it reads as out of
focus, which is what the effect wants.

Alongside it: `SOFT_BAND` 0.18 is the gap between the star gradient's two
stops, which **is** the soft edge of the growing light, and `DRAIN_RATIO` 2.

**Three rules the charge is built on, all of which have already been got wrong
once:**

- **The art grows, the target never does.** The star's `<svg>` is scaled;
  `.lsa-charge` is a fixed 140px circle. It is what a held cursor has to stay
  inside, for up to 14 seconds at 50 years, and a target that moves mid-gesture
  is a bug wearing a feature's clothes. This is why `CHARGE_SWELL` was removed.
- **One writer per property.** `swapTick()` owns `filter` on the number;
  `drawCharge()` owns `transform`. No CSS transition on either — the loop
  already writes them every frame.
- **`swapTick()` is called from `frame()`, not from `chargeTick()`.** That one
  returns early the moment the button is charged, and the last number's swap is
  still playing then. Running it from there freezes the milestone half-blurred
  at the moment it matters most.

⚠ **The top end has still not been watched.** 800ms was tuned at 5 years, where
it is a 4-second hold. At 50 it is 14.4 seconds of holding a cursor motionless
and 28.8s to drain, which makes slipping off near the top close to
unrecoverable. This is the single value most likely to need moving.

### Still to do on the charge port

- [ ] **11 of the 16 sliders are still not in the dev panel.** `scale0` went in
  on 2026-09-07 under **The counter grows**, and like `blur` it lands mid-hold.
  `scale1` was struck off the list rather than built: it is derived from the
  medal now, so a control would be overwritten on the next milestone change and
  would read as broken. `pop` and
  `galaxyFade` went in on 2026-09-05, under a **The release** heading, on a new
  `kind: 'charge'` that writes to `chargeTune` rather than to `cfg` — the charge
  belongs to the show's chrome, and `Copy config` dumps `cfg` for the engine's
  benefit. `blur` followed the same day, under **The number swap**, and unlike
  the release pair it lands mid-hold: `swapTick()` reads it every frame, so the
  next number to change uses whatever the slider says. The other eleven can
  still only be changed by editing the file, so `lab/charge-test.html` remains
  the only place to tune those live — and it is now behind production on the
  counter's type and size, since the Aleo swap and the medal match never went
  into it.
- [ ] **Teardown and `resetScene()` have not been re-audited** against the new
  nodes. `resetScene()` does clear the swap state, the stale filter and the
  galaxy; the star's SVG and the galaxy `<img>` are both children of `.lsa-root`
  and go with it, but nobody has walked the whole teardown since.
- [ ] **`--lsa-near` is written every frame and nothing reads it.** The
  proximity glow was a `box-shadow` on the pill; removed on 2026-09-04, because
  on a transparent circle it was a round gold blob behind a star-shaped object.
  The approach signal is still worth having and the star's halo is where it
  should live if it comes back.
- [ ] **The dev panel and the close button sit UNDER the galaxy** at z 4. Both
  are mid-tones, which is what dodges hardest, so both wash out during the
  charge. The panel never ships to Liferay, but it is the workbench for the
  slider work above. Lifting both to z 7 was proposed and not yet answered.

### `lab/charge-test.html` — now a reference, not a frontier

**Production is no longer behind it.** The file keeps its 14-slider panel, its
milestone picker and its own copy of the spark cursor, which makes it the fast
way to judge a value before editing `chargeTune`. **Do not delete it**, and do
not tune the cursor there — the overlay owns that.

⚠ **It is now behind production on the counter's type and size**, as of
2026-09-07: it still runs the system sans at the old 0.55 → 1.2 ramp, and it has
no medallion to aim at, so anything judged there about the number's size or
position will not match what ships. The blur, the pace and the star are still
worth judging in it.

Its `<img>` was repointed to `../assets/gal4.jpg` when the photo moved.
`lab/charge-test.step4.html` is a checkpoint from before the galaxy went in.

---

## Known issues, flagged not fixed

- **Nothing here has been judged by eye.** Not by the developer, not by anyone.
  Every claim about engine 2 is a number. Still-unanswered: whether the show
  reads right against solid black (it was tuned against the blue veil), whether
  the counter at 50 years reads as impressive or as broken, whether the new
  spark cursor lands.
- **Everything tuned before 2026-09-01 is suspect.** Per-firework settings were
  silently not applying, by an amount that flipped with viewport height — at
  1024×768 all five fireworks ran the whole-show config. Fixed, but the values
  chosen under the bug were never re-judged.
- **The medallion does not scale with the screen.** Fixed 320×321 px, so it is a
  comfortable centrepiece at 1024 and a small object at 2560. The fireworks were
  made screen-relative and this deliberately was not.
  **The groundwork is now in**: `--lsa-medal-w` on `.lsa-medal-scene` is the one
  source for the size, and the medal's number and the count-up's aim are both
  derived from it, so making the medallion screen-relative is a change to that
  one value rather than to three. Its `height` is still a hardcoded 321px and
  would have to follow.
- ✅ **The medallion's shimmer was removed.** Resolved 2026-09-07, by deletion
  rather than by fixing it. It was a warm gradient masked by `shimmer.png` and
  swept across the face by the cursor, and it carried a standing open question:
  the blend mode was `overlay`, chosen back when the card had a white surface,
  and the card has been transparent over black since 08-30, which is what
  `screen` wants. Rather than answer that, the client's call was that the effect
  was not earning its place — and it cost **542 KB** for a mask whose three
  colour channels the browser threw away, the heaviest asset in the project.
  Gone from the JS (the div, the two `--lsa-sx`/`--lsa-sy` writes on mousemove,
  the opacity reset on leave), gone from the CSS, gone from `lsa-mount.html`'s
  hosting list. **The medal's 3D tilt is untouched** — verified it still writes
  `rotateX(10.11deg) rotateY(12.45deg)` over the medal and resets to zero off it.
  `assets/shimmer.png` is still on disk and nothing reads it.
- **The sparkle's density has not been settled.** At the default 4px spacing it
  reads as "the 5 is *built out of* lights" rather than "the 5 has lights on
  it". That is what was asked for — dots that come together to make up the
  number — but it is the value most likely to move, and it is one slider. It has
  only been judged in still frames and at 2.4× magnification; it has not been
  watched running at its real size on a real screen.
- **The sparkle beat runs past the end of the reveal.** It starts 1.4s after the
  centre break and lasts 6.8s, while the veil finishes about 1.9s after that
  break. So it is still going for roughly five seconds after the medallion has
  fully landed, over the top of the background fireworks. Nobody has judged
  whether those two fight.
- **The glow is nearly inert at `devicePixelRatio: 1`** — total composite energy
  moves 7824 → 7832 turning it on. Correct engine behaviour, but the glow
  sliders look broken on a non-retina display.
- **Resize below 1024px does not tear down.** Decided, never implemented.
- **`prefers-reduced-motion` is out of scope**, explicitly.
- ✅ **The payload came down from 3.9 MB to 1.37 MB** on 2026-09-07 — a 65% cut,
  from recompressing the face and the galaxy and from deleting the shimmer's
  mask. The images are 1.14 MB of that and the code 237 KB. See "What ships",
  and the indexed-PNG caveat there.
- **`medal-face-blank.svg` is on disk, unused, and 64 KB against the PNG's
  605 KB.** It is the same artwork as vector, so switching `medalImg.src` to it
  would take another **40%** off the whole payload and make the medallion crisp
  at any size — which matters more now that the medallion being fixed at 320px is
  a flagged item. Not done, and not free: SVG in an `<img>` must be served as
  `image/svg+xml`, the face's filters would be rasterised by the browser rather
  than baked, and it has not been compared against the PNG by eye. **Worth
  doing**, and it is now the only real win left on the payload.
- **A CSS comment error hid `@keyframes lsa-charge-pop` entirely.** Found and
  fixed 2026-09-04: a comment block closed, ran on for three more lines and
  closed again, so the parser read the prose as a selector and swallowed the
  whole keyframe as its body. `.lsa-charge--pop` had been applying an animation
  that did not exist — **the snap had never once played.** Caught by listing
  `document.styleSheets[…].cssRules` in a browser, not by reading. Worth
  repeating on this stylesheet after any large comment edit; nothing warns you.
- ✅ **The snap drew a black disc, and it is now off.** Resolved 2026-09-05.
  Under the galaxy the `box-shadow` flash rendered as a hard-edged black circle
  the size of the button, with a bright halo around it. **An outer box-shadow is
  never painted inside the element's own border box** — ordinary CSS, invisible
  on an opaque control because the control fills the gap. This button is
  transparent, so the flash was a gold RING with a hole in it; `color-dodge`
  multiplied the ring into bright nebula and left the hole pure black, and the
  eye read the hole as an object sitting behind the star.
  `chargeTune.pop` is now **false**. The keyframe and its switch stay.
  **Do not turn it back on in this form.** A replacement has to come from the
  star's own silhouette — the halo path — because a round shadow on a four-point
  star is the same mismatch that deleted the proximity glow on 09-04, and it has
  now caused two separate bugs.
  ⚠ **Nothing in the DOM was painting anything dark.** Every computed style on
  that element is transparent, there are no pseudo-elements, and both canvases
  read fully transparent at every sampled pixel. Six mechanisms were ruled out
  by inspection first — stacking contexts, `z-index`, both transforms,
  `will-change`, the `<button>` tag, `appearance`, DOM order — and every one of
  them was wrong. It was found by removing the shadow and taking two
  screenshots. **On this stylesheet, look before you reason.** That is now the
  second bug here that only a rendered frame could have caught; the missing
  `@keyframes` below is the first.
- One throwaway lab file to delete: `lab/milestone-test.html`.
  **`lab/charge-test.html` is NOT a throwaway** — see above.

---

## Open questions

| # | Question | State |
|---|---|---|
| A | How does Liferay actually serve the three images? | **Half open.** Assets are in hand; the serving mechanism is not decided. It was four until the shimmer went on 2026-09-07. |
| K | POSB brand blue — exact hex? | **Open.** Placeholder `#1C6FD1`. Nothing shipped depends on it; `goColors` are red/gold. |
| M | How should the show scale from 5 to 50 years? | **Counter answered and PORTED** 2026-09-04. **Fireworks: shape agreed 2026-09-07, ladder not built.** See below. |
| N | Should `index.html` be a landing page linking demo and lab, instead of a redirect? | **Offered, unanswered.** |
| O | Whole-show values conflict between two old tuning sessions — `trailFade`, `trailAlpha`. | **Open.** `gravity` 0.2 / `drag` 0.9 stand. Note `gravity` also drives the rocket climb. |

### M is the big one, and half of it is now built

**Solved by the counter rather than by the fireworks, and in production since
2026-09-04.** Every milestone runs at one pace and differs only in how many
numbers it walks — 5 steps at 5 years, 18 at 50. Bigger milestones feel bigger
because you watch the number climb longer, which was the original plan; fixing
the charge at 3 seconds had removed the mechanism and nothing replaced it.

Two designs were built and rejected on the way:

- **A flat 3s for every milestone.** 50 years ran at 16.7 numbers a second.
- **A 3s-to-5s curve.** Still too quick at the top: *"wayy too quick."*

The reason both failed is the same. A number needs roughly **200ms to be read**,
and 50 numbers at that pace is a 10-second hold. Showing fewer numbers was the
only lever left, which is what the step list does.

⚠ **The fireworks are still identical at every milestone.** Everything above
changes the counter and the charge, nothing else.

One finding that makes this cheaper than expected:

- `YEARS` reaches the copy and the counter, and nothing else.

✅ **The medallion art carries the milestone again, and it is one asset.**
Briefly broken on 2026-09-07, when `medal-face.png` arrived with **5** and
**Years** baked into it and a 20-year award showed a medal reading 5. Fixed the
same day by the second of the three options that were on the table — a
numberless face with the digits laid over it as DOM text. `setYears()` writes
the digit, so the milestone reaches the artwork. See "The number on the medal".

The other two are recorded because they were real choices, not strawmen. **Ten
PNGs picked by `YEARS`** was rejected for multiplying an asset that is already
the heaviest thing loaded, and for needing ten sets of measurements that all
have to stay true when the artwork is revised. **Back to SVG with the number as
a text node** is still the tidiest end state and is now cheaper than it was —
`medal-face-blank.svg` exists — but it needs the SVG inlined into the DOM, since
an SVG inside an `<img>` is a closed document JS cannot reach into.

### The fireworks half — agreed 2026-09-07, not built

**The rocket count stays at five at every milestone. The milestone rides on
sub-bursts instead, on the centre firework only.**

A ladder that changed the *rocket count* was proposed first and dropped, for
two reasons that are worth keeping:

- **It went backwards at half the milestones.** 5 rockets for years ending in
  5 and 10 for years ending in 0 makes a 15-year award smaller than a 10-year
  one, and 25 smaller than 20.
- **Ten rockets does not fit.** 10 × 200 is exactly `poolMax`, with nothing
  spare, and ~3800 with sub-bursts on. Past the cap `spawn()` returns null
  silently, so the biggest milestones would render the *sparsest*.

Sub-bursts were switched on for firework 3 on 2026-09-07 and looked at, which
settled the thing the design was waiting on:

- **The effect is loud, not subtle.** Six clear secondary pops spread wide off
  the parent. At the same instant, 345 particles and 7 blasts alive against 164
  and 1 with it off. An earlier guess in this file that 6 shells might be too
  quiet to carry a milestone was **wrong**.
- **It buys the centre firework a second beat**, 0.7s after the main break, and
  a longer tail. Whether that fights the medallion as the veil clears has not
  been judged.
- **Cost is comfortable.** The whole show peaked at **1059 of 2000**. Nothing
  was dropped.

The shape still to build is `sub.count` on firework 3 as a function of `YEARS`
— roughly `Math.floor(years / 10)`, which gives 5 → 0 shells (today's show
unchanged), 10 and 15 → 1, up to 50 → 5. **The top end is not settled**: 6 is
what was looked at and it is already strong, so whether 5 is the right ceiling
and whether 1 against 5 reads across ten milestones are both open.

Constraints any design has to respect:

- **`poolMax` 2000, `count` 200.** Five fireworks = 1000 today, 1180 with the
  centre one's shells. Past the cap, `spawn()` returns null and sparkles
  silently thin out — no error.
- **Sub-bursts cost more than they look** — 200 + shells × 30 per firework, so
  ~380 at 6 shells. All five carrying them would be ~1900, already 95% of the
  pool. On one firework there is room.
- **`sub.count`, `sub.enabled` and `sub.delay` are per-firework; `sub.particles`,
  `sub.scale` and `sub.glow` are NOT.** The first three are read in
  `spawnSparkles()`, inside `withSettings()`. The others are read in
  `spawnSub()`, which runs from the `subQueue` drain in `update()` a fuse
  later, outside the swap — so a per-firework value there is silently ignored.
- **Sub-bursts cannot move the veil.** `onBurst` fires only from the rocket
  path, never from `spawnSub`, so a second break cannot eat a reveal step.
- **Fixed stage width.** More fireworks and bigger fireworks fight each other on
  one stage. Spending *time* — more waves, further apart — is the cheaper lever.

---

## Hosting

`master` → https://github.com/akhilpokle/sra. **Public**, so this file and the
brand hexes are publicly readable. There is no `main` branch.

| | |
|---|---|
| Overlay demo | https://akhilpokle.github.io/sra/ |
| Fireworks lab | https://akhilpokle.github.io/sra/lab/fireworks-lab.html |

Pushes work non-interactively via Git Credential Manager. No `gh` CLI, no SSH keys.
