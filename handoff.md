# Long Service Award — 5 Year Milestone Overlay · Handoff

A celebratory modal overlay that plays once on top of the live Liferay
intranet: cursor sparks, a proximity-lit fuse, a building fireworks sequence,
and an oversized centre burst that clears to reveal a congratulation card.

**Current status: Step 1 of 13 complete — scaffold only. The overlay does not
run yet.** The files exist and declare their safety contracts, but contain no
behaviour and no styles.

---

## File list

| File | Purpose | State |
| --- | --- | --- |
| `lsa-experience.css` | All overlay styles. Every selector prefixed `lsa-` and scoped under the root container. | Scaffold — contract comment only, no rules |
| `lsa-experience.js` | All overlay behaviour, wrapped in an IIFE. Viewport gate, mount, canvas, particles, teardown. | Scaffold — empty IIFE only |
| `lsa-mount.html` | The markup to paste into a Liferay Web Content fragment. | Working — includes `<link>`/`<script>` tags with placeholder asset paths |
| `handoff.md` | This document. Change log, integration steps, tweak points. | Live |
| `progress.md` | Narrative project status: idea, skills, constraints, decision log, build status. | Live |

### Local demo files — NOT part of the Liferay deliverable

| File | Purpose | State |
| --- | --- | --- |
| `lsa-demo.html` | Local test harness. Renders `bg.png` as a stand-in intranet, loads the real CSS/JS in production load order, and hosts the **fireworks tuning panel** (~58 live controls, replay button, settings export). Never deploy this. | Working |
| `bg.png` | **Placeholder.** A static screenshot of the intranet homepage, used as the demo backdrop for communication and stakeholder review. | Placeholder |

> **`bg.png` will be replaced by the actual intranet.** It is a flat screenshot
> standing in for the live page purely so the overlay can be demonstrated and
> verified locally. In production there is no background image at all: the real
> Liferay page is the backdrop, live in the DOM behind the overlay. When the
> overlay is deployed for real, `bg.png` and `lsa-demo.html` are both dropped
> and nothing about `lsa-experience.css` / `lsa-experience.js` changes.

Not yet created, because it depends on an answer still outstanding:

- The medallion component and its image assets — **you are supplying these** (see Open questions, Q-A).

---

## Change log

Updated at the end of every build step.

### Step 1 — Scaffold + handoff (complete)

- Created `lsa-experience.css` with the namespacing contract documented in a
  header comment. No rules yet.
- Created `lsa-experience.js` with the safety contract documented, containing
  a single empty IIFE in strict mode. No globals, no listeners.
- Created `lsa-mount.html` with a single `<div id="lsa-mount"></div>` and a
  note that the asset-loading tags are pending a decision (Q-I).
- Created this handoff document with all required sections seeded.
- **Defaults applied without confirmation** (all trivially reversible):
  prefix `lsa-`, files in `C:\Users\akhil\Desktop\SRA\`, no demo page.

### Step 1b — Stage setup (complete)

Inserted step, not in the original 13-step plan. Requested directly.

- Added `bg.png` (supplied, 2732x1536 screenshot of the intranet homepage) as
  the stand-in backdrop for local demos. Flagged throughout as a placeholder
  for the real intranet.
- Created `lsa-demo.html`, a local-only test harness that renders `bg.png`
  full-bleed and loads `lsa-experience.css` then `lsa-experience.js` in the
  same order production will use. Header comment states clearly that it must
  never be deployed to Liferay.
- Demo-only styling lives in a `<style>` block inside `lsa-demo.html`, kept
  out of `lsa-experience.css` so it can never reach production. The spec's
  no-inline-styles rule exists to satisfy the Liferay CSP; this file ships
  nowhere and has no CSP.
- Q-H is now answered: a demo page was wanted after all.
- No change to `lsa-experience.css` or `lsa-experience.js` — both remain
  empty scaffolds. Nothing visible happens yet beyond the backdrop.

**Verification note:** the demo page could not be rendered inside the agent's
preview pane, which rewrites local files to a `data:` URL and therefore cannot
resolve the relative `bg.png` / CSS / JS paths. This is a tooling limitation,
not a defect. Open `lsa-demo.html` directly in Chrome or Edge to verify.

### Step 2 (partial) — Backdrop, close button, modal behaviour

- Added `.lsa-root` (fixed, full viewport, `z-index: 999999`) and `.lsa-backdrop`
  (the specified gradient + `backdrop-filter: blur(8px)`), mounted by appending
  `.lsa-root` to `document.body` (resolves Q-J — avoids the transform-ancestor
  clipping trap noted at Step 1).
- Added the close control: a single circular 40x40 button, 40px from the top
  and 40px from the right, centred x icon. Confirmed sufficient — no second
  close control needed (resolves Q-B).
- `EMPLOYEE_NAME` constant and the `>= 1024px` gate added.
- Local static server used for verification instead of the agent's preview
  pane (which can't resolve relative paths) — user requested this directly.

### Step 2 (continued) — Modal + scroll lock, once-only moved to backend

- **Backdrop now blocks clicks** (`pointer-events: auto`). This is a real
  modal: the intranet cannot be interacted with while the overlay is open.
  Resolves Q-E — supersedes the spec's original "click-through where
  appropriate" default.
- **Scroll is locked** while the overlay is open: `document.body.style.overflow`
  is saved before mount and restored to its exact prior value on teardown.
  Resolves the rest of Q-E.
- **Once-only flag moved out of the front end entirely.** Removed the
  `localStorage` check/write that Step 2 had added. The experience now plays
  on every page load. See "Once-only flag" section below — this is now a
  backend responsibility, out of scope for this build.

### Step 3 — Canvas, rAF loop, fade-trail, resize

- Added `.lsa-canvas`: absolutely positioned, full size of `.lsa-root`,
  `pointer-events: none` (per spec — proximity/spark detection uses the
  global cursor position, not canvas pointer events).
- Canvas sized to `window.innerWidth` / `innerHeight` (no `devicePixelRatio`
  scaling — kept simple; flagged as an open assumption below).
- One `requestAnimationFrame` loop. Each frame paints `rgba(0,0,0,0.2)` over
  the canvas instead of clearing it — the spec's proven fade-trail pattern,
  built exactly as specified, no variation.
- Resize listener updates canvas size on window resize.
- Teardown now also cancels the rAF loop and removes the resize listener.
- **No particles yet.** Nothing is drawn except the fade fill itself.
- **Reverted:** the fade fill made the canvas go near-solid black within
  under a second with nothing yet to offset it, hiding the gradient
  backdrop — not wanted for now. The `tick()` loop still runs (rAF,
  resize, teardown all intact) but currently paints nothing, so the
  gradient backdrop stays visible as-is. The fade fill will need to come
  back once sparks/fireworks are built, since the spec's glowing-trail
  effect depends on it — noted in the code comment at `tick()`.

### Step 4 — Particle system core

- Added `spawnParticle(x, y, vx, vy, life, size, color)`: pulls a reused
  object from `particlePool` where possible instead of always allocating,
  pushes it onto the active `particles` array.
- Added `updateParticles()`: applies `GRAVITY` and `FRICTION` (both named
  constants, top of file, easy to tune), advances position, decrements
  life, derives `alpha` from remaining life, and recycles dead particles
  back into `particlePool` instead of just dropping them.
- **Not wired into the render loop yet.** No spawner calls `spawnParticle`
  and `tick()` doesn't call `updateParticles()` or draw anything — per the
  plan, this step is the model only; its first real consumer is the
  cursor spark trail (next).

### Step 5 — Cursor spark trail

- Added one global `mousemove` listener (`onMouseMove`), tracking `cursorX`/
  `cursorY`. This is the single shared cursor-position source — the fuse
  proximity check in a later step reads the same two variables, so there is
  only ever one `mousemove` listener for the whole experience.
- Rate-limited by distance, not by event count: sparks only spawn once the
  cursor has moved `SPARK_MIN_DISTANCE` (12px) since the last spawn, 2 per
  qualifying move. Colours are gold `#D4AF37` / white `#FFFFFF`, matching the
  confirmed palette.
- `tick()` now calls `updateParticles()` and draws each live particle as a
  filled circle at `p.alpha` opacity, then clears the canvas fresh next
  frame (`clearRect`, not the fade fill — see Step 3's revert above).
- Listener removed in teardown.

**Known trade-off:** losing the fade fill means sparks fade individually
(their own alpha shrinks over their ~30-frame life) but leave no glowing
motion-blur tail behind the cursor — a straight `clearRect` can't produce
that on its own. If the fade-trail look is wanted later, it needs a
low-alpha fill kept short enough not to wash out the gradient over a full
run, or a separate darker "stage" only during the fireworks segment.

**Follow-up:** switched from move-triggered to continuous emission. Sparks
now spawn every `SPARK_SPAWN_INTERVAL` (3) frames at the cursor's current
position, whenever a position is known — including while the cursor is
completely still. `onMouseMove` now only records `cursorX`/`cursorY`; the
old distance-based throttle was removed since it no longer applies.

### Step 6 — Prompt message + fuse + proximity ignition

- Added `.lsa-prompt`: "Move your cursor to light the fuse ✨", centred near
  the top, gold-glow white text, system font stack. Fades out (CSS
  transition) once the fuse is lit — no re-appearance.
- Fuse cord is drawn on the canvas (not DOM/CSS), procedurally: a curved
  line from `fuseBase` (bottom-centre launch point) to `fuseTip` (the free
  end the user lights), via `ctx.quadraticCurveTo`. Positions are recomputed
  from `canvas.width`/`height` on load and on every resize, so the fuse
  stays correctly placed at any viewport size (resolves the design note
  from Q-2 in the prior round — "yes for now" on a procedural design).
- Proximity ignition: `checkFuseIgnition()` runs every frame, comparing the
  shared `cursorX`/`cursorY` (same variables the spark trail already uses —
  still only one `mousemove` listener) against `fuseTip` within
  `FUSE_IGNITE_RADIUS` (40px). No click involved.
- **Waits indefinitely if never lit** — no timeout, per confirmed decision.
  `fuseLit` is a one-way flag; once true, ignition can't retrigger.
- Tip marker glows gold before ignition, turns white once lit (canvas-drawn,
  `shadowBlur` glow) — a visible cue, though the actual burn-down animation
  is the next step.

### Step 7 — Fuse burn

- Added `pointOnFuseCurve(t)`: reuses the same quadratic curve the fuse is
  drawn with (`fuseBase`/`fuseControl`/`fuseTip`) to find any point along it,
  `t=0` at the base, `t=1` at the tip.
- Added `updateFuseBurn()`: once lit, computes elapsed time since ignition
  against `FUSE_BURN_DURATION` (1500ms, one named constant), and draws a
  glowing white spark travelling from the tip down to the base
  (`pointOnFuseCurve(1 - progress)`).
- Sets `fuseBurned = true` exactly once, when `progress >= 1`. Guarded so it
  can't refire. Nothing consumes `fuseBurned` yet — that's the launch
  scheduler, next step.

### Step 8 — Rockets, bursts, and the launch scheduler

- Added `rockets[]`: each rocket rises (`vy` + `ROCKET_GRAVITY`), spawns a
  trailing spark every frame via the existing particle pool, and is drawn as
  a small glowing head. On reaching `targetY` it explodes once (`spawnBurst`)
  and is removed — no re-triggering.
- `spawnBurst(x, y, count, speedMin, speedMax, colors, size, life)` radiates
  particles outward at random angles/speeds, reusing `spawnParticle`/
  `updateParticles` from Step 4 — no new particle-drawing code needed.
- `spawnFlash` + `updateFlashes()` add the big centre burst's "bright flash /
  shockwave": a quick fading white flash plus an expanding, fading ring.
- **Timed launch scheduler**, exactly as specced: small LEFT rocket
  (`LEFT_LAUNCH_DELAY` 0ms) → small RIGHT (`RIGHT_LAUNCH_DELAY` 700ms) →
  oversized CENTER (`CENTER_LAUNCH_DELAY` 1500ms). Center burst gets more
  particles (160 vs 40), a wider speed/radius range, the red accent added to
  its colour set (`BURST_COLORS_CENTER`), and the flash/shockwave the small
  bursts don't get.
- Triggered from `updateFuseBurn()` — replaces the Step 7 placeholder
  comment with a real call to `startFireworksSequence()`.
- `setTimeout` IDs are tracked in `launchTimeouts` and cleared in teardown
  (`launchTimeouts.forEach(clearTimeout)`), so closing mid-sequence can't
  leave a rocket launching into a torn-down overlay.
- **Not yet built:** the card reveal that's supposed to appear as the center
  burst clears (Step 9). Right now the sequence just ends after the center
  burst fades.

### Step 9 — Congratulation card reveal

- Added `.lsa-card`: centred, starts at `opacity: 0` / `scale(0.85)`,
  transitions to visible on `.lsa-card--visible` (CSS transition — the "soft
  scale + fade" the spec asks for).
- Card contents, in order: `.lsa-card__medallion` (the placeholder white
  rectangle decided earlier — swap point for the real component is commented
  in the code and in "Medallion assets" below), line 1
  ("Congratulations, " + `EMPLOYEE_NAME` + "!"), a small red `.lsa-card__accent`
  bar, line 2 ("Celebrating 5 Years with us"). Gold/white text, red accent,
  large and centred — matches the spec's visual style section.
- `EMPLOYEE_NAME` is referenced in exactly one place (line 1's text), as
  required — still a one-line change to retarget.
- `revealCard()` is scheduled via the same `launchTimeouts` array as the
  fireworks (`CENTER_LAUNCH_DELAY + CARD_REVEAL_DELAY`, 1800ms after the
  center rocket launches) — an estimate of when its burst/flash has mostly
  cleared, not a hard sync to the animation. Named and commented so it's
  easy to retime if the center burst's own timing changes.
- Cleared correctly on early close: it's just another `launchTimeouts` entry,
  already covered by teardown's `clearTimeout` sweep.

### Follow-up decisions (Q-A, Q-F, Q-G, Q-I confirmed)

- **Q-A (medallion):** real component still pending, deferred by the client.
  Decided placeholder: a plain white rectangle in the card's medallion slot,
  to be built at Step 9 and swapped later.
- **Q-F (reduced motion):** reconfirmed out of scope. No change.
- **Q-G (resize below 1024px mid-show):** reconfirmed tear down. No change —
  not yet implemented, applies once Step 3 builds resize handling.
- **Q-I (mount snippet asset tags):** resolved yes. `lsa-mount.html` updated
  to include `<link>`/`<script>` tags with `REPLACE_WITH_ASSET_PATH`
  placeholders for the real hosted URLs.

### Step 8 (revised) — Single-wave colour-cascade redesign

The client shared real fireworks footage as a storyboard and flagged that
the original left → right → center scheduler read as three separate pops,
not a real display. Corrected reading of the footage: it's **one wave** — a
single barrage of rockets launched together, whose different flight times
make them burst in a rolling colour cascade — not three time-separated
beats. Replaces the Step 8 scheduler entirely; `LEFT_LAUNCH_DELAY` /
`RIGHT_LAUNCH_DELAY` / `CENTER_LAUNCH_DELAY` are gone.

- `startFireworksSequence()` now launches all rockets in one pass, no
  `setTimeout` stagger between launches. They're grouped into four colour
  "cohorts" (`FIREWORK_COHORTS`) whose ascent speed is tuned so they reach
  burst height at different times: **A gold/white** (bursts first) → **B
  blue** (second) → **C red/gold climax**, biggest, with the flash/shockwave
  (third) → **D gold** cooldown (last, settles the display). `spawnBurst`,
  `spawnFlash`, `launchRocket`, `updateRockets`, `updateFlashes` are all
  unchanged — reused as-is.
- **Palette remapped to DBS brand colours**, per client decision — this
  **supersedes** the earlier "spec defaults" palette decision (progress.md
  decision log #9): red `#E11931` = DBS main, gold `#D4AF37` = DBS
  Treasures, blue = POSB. Red/gold hex values were already confirmed
  project colours, reused as-is. **Blue is a placeholder** — no confirmed
  POSB brand hex exists in this project yet; using `#1C6FD1` until the
  client supplies the real one. See Open questions, new row K.
- **Speed is computed as a margin over the physically-required minimum**
  (`Math.sqrt(2 * ROCKET_GRAVITY * distance)`), not a fixed pixel/frame
  value. A fixed `vy` tuned for one viewport height can fall short on a
  taller one — the rocket decelerates to 0 before reaching `targetY` and
  never bursts. Margin-based speed always clears the target regardless of
  viewport size, verified analytically against 700px, 800px, 1600px, and
  2160px canvas heights. Cohort D's margin is kept close to 1 on purpose
  (it just barely makes it) — that's what makes it read as the slow,
  lingering "cooldown" rocket, rather than needing a separate mechanism.
- **Card reveal delay is computed dynamically**, not a fixed constant —
  `predictBurstFrames()` analytically predicts each rocket's burst time
  (mirrors `updateRockets`' own integration exactly) and the reveal is
  scheduled after the *latest* burst's frame + that cohort's `life`, plus a
  small `CARD_REVEAL_BUFFER` (400ms). Necessary because burst timing now
  legitimately scales with `canvas.height`; a fixed delay would reveal the
  card mid-burst on a tall viewport.
- Added `ctx.globalCompositeOperation = 'lighter'` (additive blending)
  around the particle draw loop in `tick()`, reset via `ctx.save()`/
  `ctx.restore()` — overlapping bursts glow brighter and blend colour,
  matching the reference footage's dense bloom. One-line addition, doesn't
  touch the backdrop div underneath (canvas-only compositing).
- **Verification note:** the agent's browser preview pane in this
  environment doesn't actually composite the tab (`document.hidden` stays
  `true`), so `requestAnimationFrame` never fires there and nothing
  renders — a sandbox limitation, not a defect. Verified instead by
  running the exact ascent-physics formulas as a standalone simulation
  against the real `lsa-experience.js` constants, confirming: every
  cohort reaches its target at every tested viewport height (no
  never-bursts case), burst order is consistently A → B → C → D, and the
  dynamic card-reveal delay tracks the true last burst at every size
  tested. **Still needs a real visual check** (open `lsa-demo.html` in an
  actual browser via `http://localhost:8080/`) to confirm the cascade
  *looks* right, not just that the timing math is correct.

### Step 8 (revised 2) — 6-scene show + bloom-masked card reveal

The client flagged the card reveal as disjointed: it zoomed/faded in over the
fireworks. Root cause was structural, not animation tuning — see below. This
round restructures the whole post-fuse sequence into the client's six scenes
and changes how the card arrives.

**The z-order bug (root cause).** Neither `.lsa-card` nor `.lsa-canvas` set a
`z-index`, so they painted in DOM order — and the card is appended *after*
the canvas. The card was always **on top of** the fireworks, so it could
never be revealed by them clearing away; the only thing it could do was
animate in. Fixed with an explicit stack in `lsa-experience.css`:
`0 backdrop < 1 card < 2 canvas < 3 prompt < 4 close`. **These z-indexes are
load-bearing** — a comment in the CSS says so. Change them and the reveal
breaks.

**How the reveal works now.** The canvas is `clearRect`-ed each frame, so it
is transparent between particles — particle density alone will never hide a
white card. So a **full-viewport bloom** (`updateScreenBloom()`) spikes over
140ms to 0.96 alpha, and the card's opacity flips to 1 at that peak,
underneath it. The switch-on is never visible. The bloom then decays over
800ms and the card is simply *there* as it clears. All `scale()` was removed
from `.lsa-card` — no zoom, opacity only, and the 250ms fade completes while
the bloom is still at ~0.87 alpha.

**Scene 6 is event-driven, not timed.** This was the subtle one. The finale
originally fired on a fixed timestamp, which was wrong: rockets are launched
until the climax ends, but they are still *in flight* for another ~1.5s, and
flight time scales with viewport height (~1.4s on a laptop vs ~2.0s on a 4K
display). A hardcoded beat flashed and revealed the card while rockets were
still climbing — they then burst on top of the revealed card. The bloom now
fires when `rockets.length === 0` after the last phase has ended, i.e. when
the final firework has actually gone off. `BLOOM_FALLBACK_AT` (9s) is a
safety net so the card can never be left unrevealed.

**Timeline replaces the scheduler.** `startFireworksSequence()` no longer
fires a volley; it starts a clock. A `PHASES` table (scene 3 open → 4 build
→ 5 climax) escalates rocket rate (230→150→80ms), spread (0.45→0.95 of
width), burst size (45→110 particles) and palette. Launches are *paced
within* each phase so fire is continuous and the build is legible — this
supersedes the single-volley model of the previous round, which could not
sustain escalation across seconds. Scene 6 is simply "no phase active".

- **Colours:** brand trio + lighter tints (`TINT_GOLD`/`TINT_BLUE`/
  `TINT_RED`), per client decision, widening per phase — gold only, then
  gold+red, then the full trio + tints at the climax. No off-brand hues.
  `TINT_BLUE` derives from `POSB_BLUE`, so both swap together when the real
  POSB hex lands (still open, row K).
- **Card:** white surface at placeholder 800×460, flex-centred.
- **Text colours are a STOPGAP, not a design decision.** The card contents
  were white-on-transparent; on a now-white card they would have rendered it
  blank. Copy was darkened only enough to stay legible. Card content/design
  remains explicitly deferred at the client's request.
- **Fuse now disappears once burned**, so no cord is left sitting over the
  card during the reveal.
- **Performance** (the show is ~5× the old particle load): `updateParticles`
  swapped `splice` (O(n) shifting per death) for swap-and-pop (O(1)) — draw
  order is irrelevant under additive blending. Added `MAX_PARTICLES` (2800)
  so a slow machine loses density rather than framerate. Measured peak in
  simulation is ~2150–2330, leaving headroom.
- **Teardown is simpler and safer:** with the show fully rAF-driven there are
  no timers left, so `launchTimeouts` and its `clearTimeout` sweep are gone.
  Cancelling the rAF loop now stops the entire show outright. Side benefit:
  rAF pauses on a hidden tab, so backgrounding the page no longer burns
  through the reveal unseen.
- **Removed as dead code:** `FIREWORK_COHORTS`, `predictBurstFrames`,
  `CARD_REVEAL_BUFFER`, `ASSUMED_FPS`, `VOLLEY_SPREAD`, `launchTimeouts`.

**Verification.** The agent's browser pane in this environment never
composites the tab (`document.hidden` stays `true`), so rAF never fires and
nothing renders there — a sandbox limit, not a defect. Verified instead with
a frame-accurate simulation replaying the real constants and the same
integration, at 1024×700 / 1280×800 / 1440×1600 / 1920×2160. All pass:
every rocket bursts; **zero bursts occur after the card switches on**; bloom
alpha is 0.87 when the card finishes fading (switch-on stays hidden); sparks
linger 627ms past the bloom clearing (card emerges from fading sparks, not a
blank screen); peak particles stay under the cap. Total show 8.2–9.3s after
the fuse, against the ~8s target. **Still needs a real visual check in a
browser** — the maths is right, but density, colour balance and whether the
escalation *reads* can only be judged by eye.

### Step 8 (revised 3) — Milestone-scaled rockets, multi-break sparkles, organic reveal

**Vocabulary** (client's terms, now used throughout code and docs):
a **rocket** is the firework that goes up; **sparkles** are the elements
thrown out when it bursts. The `particles` pool keeps its generic name
because it also backs rocket trails and cursor sparks, which are *not*
sparkles — there's a comment at the top of the JS saying exactly this.

**1. Rocket count is now the milestone.** `YEARS` sits beside
`EMPLOYEE_NAME` and is the single source of truth: it drives one rocket per
year *and* the card copy (previously the copy hardcoded "5 Years", which
would have silently desynced). `PHASES` — the time-window, rate-based
launcher — is gone; it could not express "exactly N rockets". Rockets are
now spread evenly across `LAUNCH_WINDOW` (4200ms), so 5 years fires one
every ~1050ms and 25 years one every ~175ms: same window, denser show.
Escalation moved from time-phases to **rocket index** (`progress = i/(N-1)`),
scaling sparkle count, palette width, break depth, spread and shockwave
chance — so one curve covers 5 rockets and 25 alike.

Because 5 rockets would otherwise be far sparser than the show approved
last round, **each rocket is a multi-break shell**: ~12% of its sparkles
carry a `breakInto` spec and, when they die, spawn a further burst of
different colour and shape. Chain depth is capped at
`MAX_BREAK_DEPTH` (2), so one rocket yields ~2.5s of cascading activity
without exploding. Note `spawnParticle` now *resets* `breakInto`/
`gravityScale`/`breakDepth` — pooled objects otherwise carry stale values
and a recycled sparkle would re-break forever.

**2. Sparkles shift colour, and come in four shapes.** Colour is no longer
a fixed string per sparkle: each carries a **LUT** (lookup table) of
prebuilt colour strings interpolating birth → death (white-hot → brand
pigment, etc), indexed by remaining life in the draw loop. Built this way
because the obvious approach — composing an `rgb()` string per sparkle per
frame — would allocate thousands of strings a second at these densities.
Shapes: **peony** (even spray), **ring** (evenly spaced angles, clean
circle), **willow** (slow, long-lived, `gravityScale` 1.5 so it droops and
hangs), **palm** (7 thick spokes). `gravityScale` is a new per-particle
field, defaulting to 1.

**3. The white flash is gone.** The client rejected it as inorganic — "the
screen changes to white and then the card is shown". Replaced by three
things working together:

- The finale is a **barrage of 9 bursts laid out in a loose 3×3 across the
  card's footprint** (`FINALE_BARRAGE`), not a single burst. This was the
  key fix: simulation showed one central finale burst covered only ~9–25%
  of the card, leaving it plainly visible through the gaps. The 3×3 spread
  measures ~66%.
- A soft **radial** glow sized to the card (`GLOW_RADIUS`, ~card
  half-diagonal + margin), drawn additively so it reads as the burst's own
  light pooling over the card. It never reaches the viewport edges.
- The card fades up over **1.2s** (was 0.25s) *while* the sparkles are
  still dense and already fading, so the two overlap and there is no
  discrete moment where the card appears.

The barrage is queued in a `pendingBursts` array drained by `updateShow`,
**not** `setTimeout` — the show stays entirely rAF-driven, so teardown still
needs no timer sweep and a backgrounded tab pauses instead of firing unseen.

**Tuning knobs.** `sparkleScale` (`clamp(6/YEARS, 0.4, 1)`) shrinks
per-burst counts as the milestone grows, so 25 years lands ~2× denser than
5 rather than 5× over budget; the finale is `scaleExempt` because it must
blanket the card at every milestone. `MAX_PARTICLES` (2800) is the hard
backstop — measured peak is 2246–2434.

**Verification.** Simulated frame-accurately against the real constants
across **4 viewport sizes × 5 milestones — all 20 pass**: rocket count
equals `YEARS`; every rocket bursts; break chains terminate at depth 2;
peak sparkles stay under the cap; no *rocket* bursts after the card starts
fading; sparkles outlive the glow by ~1.75s (so the card emerges from
fading sparkles, not a blank screen); card coverage ~64–68% at the moment
the card begins fading. Show ends 9.8–10.5s including the fading tail; the
card is fully visible from ~7.6s. **Still needs a real visual check** — the
agent's browser pane cannot composite in this environment, so nothing here
has been seen rendering.

### Step 8 (revised 4) — Simultaneous launch, generation-driven cascade

Restructured around a simpler idea: **all rockets launch at once, and the
cascade generations _are_ the scenes.**

| Scene | What happens | In code |
| --- | --- | --- |
| 1 | All rockets go off at once | `launchAllRockets()` on the first frame |
| 2 | They burst into sparkles | Generation 0 |
| 3 | Those sparkles burst again, new colours | Generation 1 |
| 4 | Another round; density covers the middle | Generation 2 |
| 5 | Sparkles fade, card revealed | Gen-2 sparkles dying |

**The show's whole structure is now one table.** `GENERATIONS` has one row
per scene (shapes, count, speeds, size, life, palette, breakFraction). A
sparkle carries only `breakGen`; on death it spawns that generation where it
died. The chain terminates because the last generation has no successor —
there is no separate depth cap to keep in sync.

**Deleted as obsolete** (this change removes far more than it adds):
`FINALE_BARRAGE` and its `pendingBursts` / `scheduleFinaleBarrage` /
`drainPendingBursts` machinery, `LAUNCH_WINDOW` and the staggered launch
loop, `buildBreakChain`, `rocketSpec`, `launchShowRocket`, `ROCKET_SHAPES`,
`MAX_BREAK_DEPTH`, the `breakInto`/`breakDepth` particle fields, and
`ROCKET_SPEED_MARGIN_MIN/MAX`. Rockets no longer carry a burst spec at all —
every rocket bursts as generation 0.

**Two defects the simulation caught, both viewport-dependent:**

1. **Burst geometry was viewport-relative, the card is not.** Rocket heights
   were fractions of viewport height, so on a large display they burst far
   above a fixed 800×460 card; the cascade arrived late and thin and card
   coverage was still *climbing* when the fade began (40% at 4K, rising to
   58%). Burst heights are now anchored to the card's own geometry
   (`BURST_ABOVE_CARD` / `BURST_DEPTH_INTO_CARD`), and the launch fan is
   capped relative to card width — so the cascade lands on the card at any
   screen size.
2. **Choosing a launch speed coupled burst height to burst time.** Varying
   heights for visual interest inflated scene 2's spread to 400–533ms, and
   it drifted with viewport size. Flight time is now specified directly and
   the velocity solved exactly for it (`velocityForFlight`, matching
   `updateRockets`' own integration). Heights stay free, the spread is
   exactly `FLIGHT_JITTER`, and it is identical on every screen. It also
   cannot stall short of its target, which is what the old margin-based
   speed existed to prevent — so that guard is no longer needed.

**Also added:** ±10% life jitter per sparkle. Without it every sparkle in a
generation dies on the same frame and the next generation spawns as one
mechanical pop; the jitter spreads each scene into a short wave while
keeping the generations clearly separate.

**`sparkleScale` now holds the generation-0 total roughly constant (~450)
across milestones** rather than scaling density up with years. This is
deliberate and worth understanding before "fixing" it: measured peaks sit at
the `MAX_PARTICLES` ceiling at *every* milestone, so the particle budget —
not the milestone — is the binding constraint. Letting counts scale up just
means the cap clips them unpredictably, dropping sparkles and tearing gaps
in the very coverage the reveal depends on. What visibly scales with the
milestone is the number of rockets you see go up, which is the point.

**Verification.** Frame-accurate simulation against the real constants,
**4 viewport sizes × 5 milestones = 20 configs, all passing**: exactly
`YEARS` rockets all launched on one frame and all bursting; scene-2 spread
150–200ms everywhere; exactly three generations with the chain terminating;
peak sparkles at/under the cap with few drops; card coverage 60–77% when the
fade starts and holding through it; middle-band density 3–10× the edges
(the confirmed "dense middle, thinner edges"); sparkles outliving the glow
so the card emerges from fading sparkles. Total length **6.07–6.17s**,
now essentially viewport-independent.

**Length note:** ~6.1s is shorter than the ~8s agreed for the previous
design — three generations is a tighter shape than a 4.2s launch window plus
a finale barrage. Stretch `GENERATIONS[*].life` if it feels rushed. Flagged
rather than silently changed.

**Still needs a real visual check** — the agent's browser pane cannot
composite in this environment, so none of this has been seen rendering.

### Step 8 (revised 5) — CFG object + local tuning panel

**All tunables consolidated into one `CFG` object** at the top of
`lsa-experience.js` — physics, rocket, sparkle, colours, the generation
table, glow, card timing, cursor sparks, fuse. Values are read *live* (per
frame / per spawn) rather than cached into locals, which costs a property
lookup in the hot loops — immaterial next to the canvas work, and it is what
makes live tuning possible. This also finally delivers the single
"tweak points" surface this document has promised since Step 1.

Colours are stored as hex and compiled into LUTs by **`rebuildPalettes()`**;
call it after changing any colour or the change won't appear.

**New per-sparkle effects**, both in `CFG.sparkle`:
- `glowSize` / `glowAlpha` — a larger, dimmer halo drawn behind each
  sparkle. **On by default (2.2 / 0.35), and it doubles the draw calls** —
  the first thing to turn down if framerate suffers.
- `trailLength` — draws each sparkle as a short line from where it was to
  where it is, instead of a dot. Done by *stretching the existing sparkle*
  rather than spawning trail particles: a trail particle per sparkle per
  frame would multiply the particle count several-fold and blow the budget
  outright. Default 0 (plain dots).

**`restartShow()`** replays the show from the first rocket without a page
reload — recycles live particles back into the pool, clears rockets and
flashes, resets the scene flags, hides the card, and restarts the clock.

#### The dev hook — the one deliberate exception to the no-globals rule

`lsa-experience.js` exposes `window.__lsaDev` **only** when the page sets
`data-lsa-dev` on `<html>`. `lsa-demo.html` sets it; `lsa-mount.html` does
not, so on the Liferay page that branch never executes and no global is
ever created — the safety contract still holds in production. It is roughly
ten lines, clearly marked, and can be deleted outright if you want zero dev
code in the deployed file; the only thing lost is the local tuning panel.

#### The tuning panel

Lives entirely in `lsa-demo.html` (demo-only, never deployed). Right-hand
collapsible panel, 35 controls in five sections: **Show / Rocket / Sparkles
/ Shapes / Colours**. Header has **Replay**, **Reset**, **Copy settings**,
and a live `fps · particles · rockets` readout — the fps number is the
feedback loop for the glow/density cost above.

**Sparkle settings are uniform across all three scenes.** An earlier version
exposed a separate panel per generation; that was rejected as too complex
and inconsistent to reason about. Everything under Sparkles is now a
*multiplier* — `densityScale`, `sizeScale`, `lifeScale`, `speedScale`,
`breakScale` — applied identically to every generation, so one control moves
the whole show by the same proportion.

The per-generation base values still live in `CFG.generations` and still
differ from each other, because the cascade is multiplicative: generation 0
spawns ~90 sparkles per rocket, generation 1 ~12 per break, generation 2 ~10.
Flattening those to a single shared number would multiply out to tens of
thousands of sparkles and blow the budget several times over. They are just
no longer tuned individually.

The **Settings** box emits only what the panel exposes (~47 lines), built
from the panel's own schema so the two can never drift apart. Untuned parts
of `CFG` stay at their code defaults and are not printed, which keeps the
export short enough to paste comfortably.

Note `Reset` deep-assigns into the existing `CFG` object rather than
replacing it — the experience holds a reference, so it must be mutated in
place or tuning would silently detach from the running show.

**Verified in a real browser** (unlike the show itself, this part could be
tested here — it is DOM wiring, not canvas rendering): sliders mutate `CFG`
live, generation sliders target the correct generation without touching
siblings, colour inputs rebuild the palettes, shape chips add/remove and
refuse to leave a generation shapeless, the exported JSON is valid and
reflects every edit, `Reset` restores all values including nested arrays
while preserving object identity, and `restart()` clears particles and
rockets. Behaviour of the show itself is unchanged — the full simulation
still passes all 20 configurations.

### Step 8 (revised 6) — Hanabi rendering model + physics

Adopted from `avanderw.co.za/hanabi` (source: `github.com/avanderw/hanabi`,
a Svelte/TS port of a Flash effect). Read from the actual source, so the
constants below are the real ones.

**Layered rendering.** One visible canvas, four offscreen buffers composited
each frame: `trailBuf` (full res, persistent), `particleBuf` (full res, also
the glow's source), `glowBuf` (quarter res, smoothing off), `smokeBuf` (half
res). The reference stacks four `<canvas>` elements; we composite instead
because the card sits *behind* the canvas in the z-stack and four DOM layers
would each need their own z-index, teardown and resize handling for no gain.

Fuse, rocket heads and sparkles all draw into `particleBuf`, so they feed
the trail and glow together. Flashes and the card glow are composite-level
only — they would smear badly through the trail.

**Physics adopted and retuned:** gravity `0.05 → 0.2`, drag `0.98 → 0.9`.
Because displacement is `v/(1-drag)`, that drag reaches a fifth as far for
the same speed, so generation speeds were scaled up ~5× (`8–26`, `6–17`,
`5–13`) to hold burst radius while gaining the snap-and-hang motion.
Terminal fall settles at `gravity/(1-drag)` = 1.8 px/frame — the "hang".
Note the reference's "die below velocity 0.01" check is effectively dead
code once gravity applies, since velocity converges to 1.8; **life remains
the limiter**, which is why our death-triggered cascade still works.

**Also adopted:** `sqrt(random())` burst radius (uniform-area distribution —
a plain uniform radius piles particles toward the centre); HSL per-sparkle
jitter (±5° hue, ±10 sat/light) but around the **DBS brand hues**, not the
reference's Fire/Blue/Purple — pre-built as variants at init so the LUT
system keeps its no-per-frame-allocation property, with variant 0 always the
exact brand colour; and the full smoke system, unmodified.

**Smoke deviates in one way, for performance:** the reference builds a radial
gradient per smoke particle per frame (500 gradient objects/frame at cap).
We bake one soft-puff sprite at init and blit it scaled — same result, far
cheaper. The `multiply` wisp pass is kept.

#### Three defects found and fixed during this work

**1. Decision Log #7 was wrong about *why* the fade-trail failed.** Step 3
reverted it as "darkens the canvas to near-black". The cause was the
operation, not the idea: `fillRect` with `rgba(0,0,0,0.2)` *paints black*.
`destination-out` *erases alpha*, so faded regions go transparent, not
black. The trail is therefore achievable, and is now built.

**2. But a proportional fade can never reach zero on an 8-bit canvas.**
Measured in-browser: alpha rounds `a*(1-fade)` back up to `a` once
`a*fade < 0.5`, so it stalls at ~`0.5/fade` — 9/255 at fade 0.05, 25/255 at
0.02, **127/255 at 0.005** (half opacity, permanently). Over a full show at
the reference's 0.05, **88% of the screen ended up permanently lit**. Fixed
two ways: default fade raised to `0.12` (floor ~4/255, measured residue
0.13% of screen instead of 21%), and the buffer gets one hard `clearRect`
once nothing is left to trail — verified to leave 99.8% of pixels at zero.
The panel's fade slider is floored at 0.05 for the same reason.

**3. Random flight jitter could collapse the burst spread.** With only five
rockets, independent random draws sometimes produced five near-identical
flight times — measured as low as **17ms** spread, making scene 2 a single
mechanical pop. Flight times are now a deterministic ladder across the
jitter range, shuffled so burst order stays uncorrelated from position.
Spread is now a reliable 150–200ms.

Also narrowed the launch fan (`0.55 → 0.45` of viewport width): at 0.55 on a
1024px display the fan was wider than the central half of the screen, so
rockets launched into the edge bands and diluted the dense-middle shape.

#### Panel

New sections: **Trail** (enabled, fade, stamp opacity) and **Smoke** (11
controls). **Show** gains two enum selects — *Show layer*
(composite/particles/trail/glow/smoke, the reference's isolation toggles)
and *Glow style* (gradient/sparkle). Sparkles gains drag, gravity, the
sparkle-mode pixel size and the three colour-jitter controls. 56 controls
total; export is 78 lines.

**Glow is a mode, not a replacement** — the linear gradient glow added last
round is still the default; the downscale/upscale sparkle sits alongside it.

#### Verification

Simulation: all 20 configurations (5 milestones × 4 viewports) pass, run
repeatedly to catch the intermittent failures the randomisation exposes.
Coverage 70% at fade start, dense-middle ratio ~3×, show ends ~6.1s.

Rendering was verified *in the browser* this time, which previous rounds
could not do: a dev-only `step()` on the dev hook runs frames synchronously,
so the pipeline can be exercised where `requestAnimationFrame` never fires.
Confirmed the buffers are the right resolutions, every layer produces
pixels, and the trail residue behaves as described above.

**One expectation not met, worth knowing:** smoke does **not** reach the
card. It spawns at the rocket burst (~1.3s) and lives ~83 frames (~1.4s), so
it has cleared by ~2.7s, while the card only begins fading at ~4.1s. The
grey-haze-over-the-card tradeoff accepted when choosing "unmodified" simply
does not arise at these timings. If smoke over the card is actually wanted,
its `lifeDecay` needs lowering substantially.

---

## Liferay integration steps

**Not yet written.** These will be filled in at Step 13, once the asset
loading method is decided (Q-I) and the mount behaviour is built (Step 2).
Writing them now would mean documenting something that does not exist.

What is already settled and will shape them:

- Two separate files, one `.css` and one `.js`. No inline `<script>` and no
  inline `style` attributes carrying logic, because the page enforces a CSP.
- The CSS must load before the JS mounts, so the overlay never renders unstyled.
- The mount markup goes in a Web Content fragment.

---

## How to change the employee name and the milestone

Two constants at the top of `lsa-experience.js`, inside the IIFE:

```js
var EMPLOYEE_NAME = 'Timothy Tan';
var YEARS = 5;
```

- **`EMPLOYEE_NAME`** is referenced in exactly one place (the card's first
  line), so retargeting the celebration is a one-line edit.
- **`YEARS`** is the single source of truth for the milestone. It drives
  **both** the card copy ("Celebrating N Years with us") **and** the number
  of rockets — one per year. Do not hardcode the year anywhere else; that is
  precisely how the two would drift apart.

Supported values: **5, 10, 15, 20, 25.** `MAX_SUPPORTED_YEARS` clamps the
rocket count at 25 so nothing breaks above that, but a 30-year award would
then fire 25 rockets while the card reads "30 Years" — wrong, and tracked as
an open TODO in `progress.md`. Milestones past 25 need a different visual
approach, not a bigger number.

---

## The once-only flag — BACKEND RESPONSIBILITY, NOT IMPLEMENTED HERE

**Decision (explicit, from the client):** the "show once" gating is deliberately
**not** implemented in `lsa-experience.js`. There is no `localStorage` check.
As shipped, the experience runs on **every page load** where the viewport is
`>= 1024px` wide. This is intentional for now, not an oversight.

**What the backend developer needs to build:** a per-user flag (e.g. "has
seen LSA 5-year experience") persisted server-side against the user's account
— not a browser-local flag, since that resets per device/browser and doesn't
survive a cleared cache. The developer decides the mechanism (a Liferay user
attribute, a database row, a session service call, etc.) — that is entirely
outside this front-end deliverable.

**The integration point for that flag**, once it exists, is simple: gate
whether `lsa-experience.js` runs at all. The cleanest hook is the top of the
IIFE in `lsa-experience.js`, right after the `MIN_WIDTH` check — an early
`return` there, driven by whatever the backend exposes (e.g. a data attribute
on `#lsa-mount` rendered server-side only for users who haven't seen it, or a
small inline JSON value the Liferay template already has access to). This
front end does not currently read any such flag; it is a one-line addition
once the backend contract exists.

**For local testing right now:** nothing to reset. It always shows.

---

## Medallion assets

**Placeholder built, real component still pending.** The card (Step 9) now
contains `.lsa-card__medallion` — a plain white 160x160 rectangle — in the
`medallionEl` element in `lsa-experience.js`. Q-A itself (the real component
+ images) is still open, explicitly deferred by the client ("we will handle
it later").

**How to swap it in later:** replace the `medallionEl` block (creates a
single `div.lsa-card__medallion`) with the supplied medallion markup, and
move its styles into `lsa-experience.css` under prefixed selectors so they
can't leak into Liferay or collide with the rest of the overlay. This section
will then record every image asset path and how to swap them.

---

## Planned follow-ups

- [ ] **Enhance fireworks visual quality** — flagged by the client after
  Step 8, not yet scoped or scheduled. Current rockets/bursts/flash are
  functionally complete (left → right → oversized center, per spec) but are
  a first pass; revisit density, trail quality, and burst shape polish later.

---

## Assumptions

Applied so far. Each is cheap to reverse; say the word.

1. **Prefix is `lsa-`.** Taken from the example in the spec.
2. **Files live in `C:\Users\akhil\Desktop\SRA\`** — flat, no subfolder.
3. **Filenames** `lsa-experience.css` / `lsa-experience.js` — from the spec's examples.
4. ~~**No local demo page.**~~ Superseded at Step 1b — a demo page was
   requested and now exists (`lsa-demo.html`).
5. **`bg.png` is a placeholder only.** It stands in for the live intranet for
   demo and communication purposes, and will be replaced by the actual
   intranet page. The overlay code makes no reference to it.

---

## Open questions

Only Q-A remains genuinely open (with a placeholder decided so work isn't
blocked). Everything else below is resolved and kept for record — struck
through, with the decision noted.

| # | Question | Resolution |
| --- | --- | --- |
| A | Medallion code + image assets, and how the images are served in Liferay (Documents & Media URL, theme path, or base64). | **Still open — hard blocker for the real medallion.** Explicitly deferred by the client: "we will handle it later." Placeholder decided: a plain white rectangle in the card's medallion slot until then. |
| ~~B~~ | ~~One close control or two?~~ | **Resolved.** One circular × button, top-right, 40px/40px offset, present from launch. Confirmed sufficient. |
| ~~C~~ | ~~When is the once-only flag written?~~ | **Resolved — moved off the front end entirely.** See "Once-only flag" section: this is now a backend responsibility. The front end has no gating logic and shows every time. |
| ~~D~~ | ~~Fuse never lit — timeout or wait?~~ | **Resolved: wait indefinitely.** No auto-light timeout. The user closes via the close button if they don't want to proceed. |
| ~~E~~ | ~~Backdrop click-through vs. modal; scroll lock?~~ | **Resolved: true modal.** Backdrop blocks clicks (`pointer-events: auto`), and page scroll is locked while open, restored exactly on teardown. |
| F | Respect `prefers-reduced-motion`? | **Resolved: explicitly out of scope.** Not implemented, not planned. |
| G | Resize below 1024px mid-show — tear down, or keep running? | **Resolved: tear down.** Not yet implemented (canvas/resize handling is Step 3, not built yet) — recorded here as the decision to build against when that step happens. |
| ~~H~~ | ~~Prefix, file location, demo page.~~ | **Resolved** at Step 1b. |
| ~~I~~ | ~~Should `lsa-mount.html` include the `<link>` / `<script>` tags, or are assets deployed via the theme?~~ | **Resolved: yes, include them.** Implemented — `lsa-mount.html` now has `<link>`/`<script>` tags with `REPLACE_WITH_ASSET_PATH` placeholders, to be swapped for the real hosted URLs once known. |
| ~~J~~ | ~~Root inside `#lsa-mount` or on `document.body`?~~ | **Resolved: `document.body`.** Implemented — avoids the transform-ancestor clipping trap. |
| K | POSB brand blue — exact hex? | **Open, placeholder in place.** The fireworks palette was remapped to DBS brand colours (see Step 8 revised): red = DBS main, gold = DBS Treasures, blue = POSB. Red/gold already had confirmed hexes; blue does not. Using `#1C6FD1` as a placeholder in `BURST_COLORS_BLUE` until the client supplies the real POSB brand hex — same shape as Q-A's medallion placeholder. |

### New decisions, not previously tracked as questions

- **Fuse shape/position:** no reference supplied — designing a simple
  procedural curved fuse cord near bottom-centre myself, per the spec's
  description. Not yet built.
- ~~**Colours:** confirmed — using the spec's defaults as-is: red `#E11931`,
  gold `#D4AF37`, white `#FFFFFF`.~~ **Superseded at Step 8 (revised).** The
  fireworks burst palette is now mapped to DBS brand colours instead of
  generic defaults — see Open questions row K and the Step 8 (revised)
  changelog entry. Red/gold hex values carried over unchanged; blue is new.
