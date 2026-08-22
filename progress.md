# Long Service Award — 5 Year Milestone Overlay · Progress Log

Full project context and status. `handoff.md` is the developer-facing
integration reference (file list, Liferay steps, tweak points); this file is
the narrative record of what this is, what's been decided, and where the
build stands.

---

## What this is

A celebratory modal overlay that plays on top of the live Liferay intranet,
celebrating a 5-year service milestone for **Timothy Tan**. Flow: a small
prompt appears → the cursor emits a gold/white spark trail → the user lights
a curved fuse by hovering near its tip (no click) → the fuse burns down over
~1.5s → a timed fireworks sequence fires (small LEFT, then small RIGHT, then
an oversized CENTER burst with a flash/shockwave) → as the center burst
clears, a congratulation card fades and scales in with a medallion and two
lines of copy.

## Skills in effect

- **`karpathy-guidelines`**, installed at
  `C:\Users\akhil\.claude\skills\karpathy-guidelines\SKILL.md`, sourced from
  `https://github.com/multica-ai/andrej-karpathy-skills` (verified
  byte-identical to the repo via SHA-256 before use). Active for this whole
  build.
- Four principles it enforces on this project: **Think Before Coding** (state
  assumptions, ask when unclear, surface tradeoffs — used throughout, see
  Decision Log below), **Simplicity First** (no libraries, no speculative
  abstractions, minimum code for what was asked), **Surgical Changes** (each
  step touches only what that step requires; unused code removed when a
  later step makes it obsolete, e.g. the distance-throttle removed when spark
  emission became continuous), **Goal-Driven Execution** (every step has a
  stated "done" condition and is verified — syntax-checked at minimum, and
  the client verifies visually via the local server — before moving on).

## Non-negotiable constraints (from the original spec)

- **Not an iframe.** Shares the live Liferay page's DOM/CSS/JS.
- **Vanilla HTML/CSS/JS only.** No frameworks, build tools, bundlers, npm,
  CDNs, TypeScript, or server-side code.
- **CSS namespacing:** every selector prefixed `lsa-`, scoped under one root
  container, no bare tag selectors, nothing that can leak into or override
  Liferay's own styles.
- **JS safety:** everything inside one IIFE, zero globals, no monkey-patching.
- **CSP-compliant delivery:** separate `.css` and `.js` files, no inline
  `<script>`, no inline `style` attributes carrying logic.
- **Desktop only, `>= 1024px`.** Below that, the script does nothing at all —
  no DOM insertion, no listeners, no storage writes.
- **Full teardown on close:** every listener removed, every timer/rAF loop
  cancelled, the root node removed, page state restored exactly.
- **Rendering approach:** one full-viewport `<canvas>`, one `requestAnimationFrame`
  loop, one particle system with object pooling.

## File list

| File | Role |
| --- | --- |
| `lsa-experience.css` | All overlay styles, prefixed, scoped under `.lsa-root` |
| `lsa-experience.js` | All overlay behaviour, IIFE-wrapped |
| `lsa-mount.html` | Mount markup + `<link>`/`<script>` tags for the Liferay Web Content fragment (placeholder asset paths — see handoff.md) |
| `handoff.md` | Developer-facing integration reference, updated every step |
| `progress.md` | This file |
| `lsa-demo.html` | **Local-only**, not for Liferay. Test harness loading the real CSS/JS against a stand-in backdrop |
| `bg.png` | **Placeholder only** — a screenshot of the intranet homepage, stands in for the live page in the local demo. Will be replaced by the real intranet; not referenced by the overlay code itself |

## How it's being verified

The agent's own browser preview pane rewrites local files to a `data:` URL
and can't resolve relative asset paths, so a small Node-based static file
server (built-ins only, no packages) was started to serve the project folder
at **`http://localhost:8080/`**. The client verifies each step visually
there, in a real browser, rather than through the agent's preview tool — set
up this way at the client's explicit request.

---

## Build status (13-step plan + one inserted stage-setup step)

| Step | What | Status |
| --- | --- | --- |
| 1 | Scaffold (4 files) + handoff.md skeleton | ✅ Done |
| 1b | Stage setup — `bg.png` + `lsa-demo.html` local harness | ✅ Done |
| 2 | Gate (`>=1024px`), mount, backdrop, close button, teardown | ✅ Done |
| 3 | Canvas, rAF loop, resize handling | ✅ Done (fade-trail fill built, then reverted — see Decision Log) |
| 4 | Particle system core (pool, gravity, friction, life/alpha) | ✅ Done |
| 5 | Cursor spark trail | ✅ Done (continuous emission, not move-triggered — see Decision Log) |
| 6 | Prompt message + procedural fuse + proximity ignition | ✅ Done |
| 7 | Fuse burn (~1.5s travelling spark) | ✅ Done |
| 8 | Rockets + bursts + show sequencing | ✅ Done — simultaneous launch, generation-driven cascade (Decision Log #20); needs a real visual check, see below |
| 9 | Congratulation card reveal (placeholder medallion + copy) | ✅ Done — reveal mechanism rebuilt at #15 (no zoom; revealed by fireworks fading off it). Card *design* still to come, see working list |
| 10 | Real medallion integration | ⛔ **Blocked** — client will supply assets later |
| 11 | Performance pass | ⏳ Not started — **next step** |
| 12 | Integration safety audit | ⏳ Not started |
| 13 | Finalize handoff.md | ⏳ Ongoing (updated every step so far), final pass pending |

### Flagged for later

- [ ] **Enhance fireworks visual quality** — functionally complete (correct
  sequence, colours, flash/shockwave) but flagged by the client as a first
  pass to revisit later (density, trail quality, burst shape).

---

## Decision log

Condensed record of the calls made during the build, in order. Full detail
and rationale for each lives in `handoff.md`'s "Open questions" table and
per-step change log entries.

1. **Prefix `lsa-`, files flat in `C:\Users\akhil\Desktop\SRA\`, local demo
   page built** (Step 1 / 1b).
2. **`bg.png` is an explicit placeholder** for the real intranet — flagged in
   multiple places so it can't be mistaken for part of the deliverable.
3. **Backdrop gradient/blur** (`linear-gradient(180deg, rgba(23,39,51,.6) 0%,
   rgba(69,118,153,.6) 100%)`, `backdrop-filter: blur(8px)`) supplied
   directly by the client and applied as the overlay's dark stage.
4. **Backdrop is a true modal** — blocks clicks (`pointer-events: auto`), and
   page scroll is locked while open, restored exactly on close. Supersedes
   the original spec's "click-through where appropriate" default.
5. **Once-only gating moved entirely to the backend.** The front end has no
   `localStorage` check and currently plays on every load. The client is a
   designer handing this off to developers for backend integration; the
   integration point is documented in `handoff.md`.
6. **Single close control** — one circular 40×40 button, top-right, 40px
   offsets, cross icon, live from launch. Confirmed sufficient.
7. ~~**Fade-trail canvas fill (the spec's proven glow-trail technique) was
   built, then reverted**~~ — it darkened the canvas to near-black within
   under a second, hiding the gradient backdrop. **Diagnosis was wrong, and
   this is now built (see #23).** The cause was the *operation*, not the
   idea: we used `fillRect` with `rgba(0,0,0,0.2)`, which paints black.
   `destination-out` erases alpha instead, so faded regions go transparent
   rather than black and the backdrop cannot be darkened.
8. **Sparks emit continuously**, not only on cursor movement — every 3
   frames at the cursor's current position, including while stationary.
9. **Fuse never lit → wait indefinitely**, no auto-light timeout. Fuse shape
   is a procedurally drawn curved cord (no reference asset supplied).
   ~~Palette confirmed as the spec's defaults: red `#E11931`, gold
   `#D4AF37`, white `#FFFFFF`.~~ **Superseded, see #14a below** — palette
   now mapped to DBS brand colours instead of generic defaults.
10. **Medallion placeholder: a plain white rectangle**, in the card's
    medallion slot, until the client supplies the real component + assets
    (still open, deferred: "we will handle it later").
11. **Resize below 1024px mid-show → tear down** (decided, not yet
    implemented — applies once resize-during-show handling is built).
12. **`prefers-reduced-motion` is explicitly out of scope.**
13. **`lsa-mount.html` includes the `<link>`/`<script>` tags directly**
    (placeholder `REPLACE_WITH_ASSET_PATH` hrefs/srcs), rather than relying
    on the theme to load them.
14. **Fireworks flagged for future visual enhancement** (see above) — noted
    so it isn't mistaken for an oversight later.
14a. **Fireworks redesigned from three timed beats to one single-wave
    colour cascade**, using real fireworks footage the client supplied as a
    storyboard. Corrected mid-design: initially misread the footage as
    several waves spread over time; client clarified it's one barrage
    whose shells burst in a colour cascade due to differing flight times,
    not separate launches. Now one simultaneous volley, grouped into four
    colour "cohorts" (gold/white → blue → red/gold climax+flash → gold
    cooldown) ordered purely by ascent physics, no setTimeout stagger
    between launches. Palette remapped to DBS brand colours (red = DBS
    main, gold = DBS Treasures, blue = POSB) — supersedes decision #9.
    Blue has no confirmed brand hex yet; placeholder in place (`#1C6FD1`),
    same shape as the medallion placeholder. Full technical detail in
    handoff.md's "Step 8 (revised)" changelog entry.
15. **Show restructured into the client's 6 scenes, and the card reveal
    re-engineered.** The zoom-in reveal was called out as disjointed; root
    cause was structural — no `z-index` on `.lsa-card`/`.lsa-canvas` meant
    the card painted *above* the fireworks (DOM order), so it could only
    ever animate in on top, never be revealed by them clearing. Now:
    explicit stacking (backdrop < **card** < canvas < prompt < close), and
    the card is switched on underneath a full-viewport bloom at its
    brightest, then revealed as the bloom and the last sparks fade off it.
    No scale/zoom at all. Confirmed this round: **~8s** show; climax uses
    the **brand trio + lighter tints** (no off-brand hues); card is a
    **white 800×460** surface (placeholder size). Card *content* —
    medallion, copy — explicitly deferred by the client: "don't bother me
    with the card content for now," fireworks first. Text colours were
    darkened purely as a legibility stopgap so the white card isn't blank.
    Supersedes the single-volley model in #14a: escalation across scenes
    3→4→5 needs sustained paced fire, which one volley cannot produce.
    Scene 6 is event-driven (fires when the last rocket has burst) rather
    than timed, because rocket flight time varies by ~600ms across viewport
    heights and a fixed beat let fireworks burst on top of the revealed
    card. Full technical detail in handoff.md's "Step 8 (revised 2)".
16. **Shared vocabulary agreed with the client**, now used in code and docs:
    a **rocket** is the firework that goes up; **sparkles** are the elements
    thrown out when it bursts. (The particle pool keeps its generic name —
    it also backs rocket trails and cursor sparks, which are not sparkles.)
17. **Rocket count = years, with multi-break shells.** `YEARS` drives one
    rocket per year (5 → 5 rockets) and the card copy. Because 5 rockets
    alone would be far sparser than the show approved in #15, each rocket is
    now a multi-break shell: a fraction of its sparkles re-burst into further
    bursts of different colour and shape, up to 2 chained breaks, so one
    rocket produces ~2.5s of cascading activity. Escalation moved from
    time-phases to **rocket index** (progress 0→1), so the same curve works
    at 5 rockets or 25. Show stays ~8s at every milestone — denser, not
    longer. Beyond 25 years is explicitly unsolved; see the working list.
18. **Sparkles now shift colour across their life** (white-hot → brand
    pigment, etc), via precomputed colour lookup tables — building colour
    strings per sparkle per frame would have allocated thousands of strings a
    second at these densities. Four burst **shapes** confirmed and built:
    peony, ring, willow, palm.
19. **The white-flash reveal was replaced.** The client called it
    inorganic: "the screen changes to white and then the card is shown."
    The full-viewport white wash is gone. Instead the finale is a **barrage
    of 9 bursts positioned in a 3×3 across the card's footprint**, so
    sparkles genuinely blanket the middle of the screen (measured at ~66%
    coverage, up from ~9–25% with a single finale burst); a soft **radial**
    glow sized to the card pools over it instead of washing the viewport;
    and the card now fades up over **1.2s** while those sparkles are still
    dense and already fading, so the two overlap and there is no discrete
    moment where the card appears.
20. **Restructured again: simultaneous launch + generation cascade.** All
    rockets now go off at once, and the cascade generations *are* the
    scenes — 1 launch, 2 gen-0 burst, 3 gen-1 (new colours), 4 gen-2 (peak
    density over the card), 5 sparkles fade and the card is revealed. This
    supersedes the staggered-launch/rocket-index-escalation model in #17 and
    the 9-burst finale barrage in #19: the cascade itself now produces the
    coverage, so both were deleted along with `LAUNCH_WINDOW`,
    `buildBreakChain`, `rocketSpec` and the pending-burst queue. The whole
    show now lives in one `GENERATIONS` table, one row per scene.
    Confirmed this round: density **dense in the middle, thinner at the
    edges** (protects framerate; the card is what must be covered), and the
    rockets burst with **slight ~150-200ms variation** rather than on one
    frame. Two viewport-dependent defects were found and fixed in the
    process: burst geometry is now anchored to the card rather than to
    viewport fractions (on a large screen the rockets were bursting far
    above a fixed-size card and coverage was still climbing when the fade
    began), and flight time is now specified directly with the launch
    velocity solved for it (choosing a speed coupled burst height to burst
    time, inflating scene 2's spread to 400-533ms and drifting with screen
    size). The show is now essentially viewport-independent.
    **Length is ~6.1s**, shorter than the ~8s agreed at #15 — a natural
    consequence of the tighter three-generation shape; stretch the
    generation lifetimes if it feels rushed.
21. **All tunables consolidated into one `CFG` object, plus a local tuning
    panel.** Every knob — physics, rocket, sparkle, colours, the generation
    table, glow, card timing, cursor sparks, fuse — now lives in one place
    and is read live, so it can be tuned while the show runs. The panel
    itself lives entirely in `lsa-demo.html` (never deployed): ~58 controls,
    a Replay button, live fps/particle readout, and a settings box that
    emits the whole config as JSON for pasting back into a conversation.
    Two new sparkle effects came with it: an optional **glow halo** (on by
    default — it doubles the draw calls, so it's the first thing to turn
    down if framerate suffers) and an optional **sparkle trail**, built by
    stretching the existing sparkle into a short line rather than spawning
    trail particles, which would have multiplied the particle count.
    **One deliberate exception to the no-globals safety rule:** the
    experience exposes `window.__lsaDev` only when the page sets
    `data-lsa-dev` on `<html>`. The demo page sets it; `lsa-mount.html`
    does not, so the branch never runs on Liferay and no global is created
    there. ~10 lines, clearly marked, deletable if zero dev code in
    production is preferred.
22. **Panel simplified to five sections with uniform sparkle settings.**
    The first version exposed a section per generation (scene 2/3/4) plus
    Reveal, Cursor sparks and Fuse — rejected as too complex and
    inconsistent to reason about. Now: **Show / Rocket / Sparkles / Shapes /
    Colours**, 35 controls. Every sparkle setting is a *multiplier* applied
    identically to all three scenes, so one control moves the whole show
    consistently. The per-scene base values still differ internally and have
    to — the cascade is multiplicative, so flattening them to one shared
    number would multiply out to tens of thousands of sparkles — but they
    are no longer tuned individually. The settings export now emits only
    panel-exposed values (~47 lines instead of 116), generated from the
    panel's own schema so the two cannot drift apart.
23. **Adopted the Hanabi rendering model and physics** (reference:
    `avanderw.co.za/hanabi`, source read from its GitHub repo). Four-layer
    pipeline — particles, trail, glow, smoke — composited from offscreen
    buffers onto the single visible canvas, with per-layer isolation
    toggles in the panel. Physics moved to the reference's heavier model
    (gravity 0.2, drag 0.9) and the whole cascade retuned around it: burst
    speeds scaled ~5x, because that drag reaches a fifth as far for the same
    speed. Also adopted the sqrt-radius spawn distribution, HSL per-sparkle
    jitter (around DBS brand hues, not the reference's palettes), and the
    smoke system. **Un-blocks decision #7** — the fade-trail is now built,
    correctly this time.
    Three defects found in the process, all verified in-browser: an 8-bit
    canvas fade can never reach zero (it stalls at ~0.5/fade, leaving 88% of
    the screen permanently lit at the reference's fade value); random flight
    jitter could collapse the burst spread to 17ms with only five rockets;
    and the launch fan was wider than the central band on a 1024px display.
    All fixed — see handoff.md "Step 8 (revised 6)".
    **Note:** smoke clears by ~2.7s but the card only fades at ~4.1s, so
    smoke never actually reaches the card — the haze tradeoff accepted when
    choosing "unmodified" does not arise. Lower `smoke.lifeDecay` if smoke
    over the card is genuinely wanted.

---

## Next up — things we need to work on

Logged as a working list, not yet scoped into build steps.

- [x] **Fireworks — scale for 5/10/15/20/25 years.** Done: `YEARS` is now a
  parameter beside `EMPLOYEE_NAME` and is the single source of truth —
  it drives **one rocket per year** and the card copy, so the two can't
  disagree. Show length stays ~8s at every milestone; more years means
  denser and more overlapping, not longer.
- [ ] **Milestones beyond 25 years need a different way to show rockets.**
  One-rocket-per-year stops working past 25 — 30+ rockets is neither
  readable as a count nor comfortably affordable to render, and the launch
  window would have to get so tight the rockets stop being distinguishable.
  `MAX_SUPPORTED_YEARS` (25) currently clamps the rocket count so nothing
  breaks, but a 30-year award would then show 25 rockets, which is wrong.
  Needs a genuinely different visual idea (grouped shells? a different
  counting metaphor? tiers?) — parked at the client's request until the
  core fireworks are settled.
- [x] **Fireworks — further work on the sequence itself.** Rebuilt twice:
  first into a single-wave colour cascade (#14a), then into the client's
  6-scene escalating show with a bloom-masked card reveal (#15). Timing and
  density verified by frame-accurate simulation against the real code's
  constants at four viewport sizes; **still needs a real visual check** in
  an actual browser — the agent's preview pane can't render it in this
  environment (`requestAnimationFrame` never fires on the non-composited
  tab). See handoff.md's "Step 8 (revised 2)".
- [ ] **Work on the card.** Design/polish pass on the congratulation card —
  medallion, copy, layout, real dimensions. Deferred at the client's
  explicit request until the fireworks are settled. Current state: white
  800×460 placeholder box; text colours darkened only as a legibility
  stopgap so the white card isn't blank.
- [ ] **Add the medallion.** The real component + image assets — still
  blocked on the client (Q-A). Placeholder box is in place until then.
- [x] **Mechanism to retrigger fireworks.** Done for local testing: the
  tuning panel in `lsa-demo.html` has a **Replay** button driving
  `restartShow()`, which replays from the first rocket with no page reload.
  Note this is a *dev* control — if a replay control is ever wanted on the
  live intranet, that is a separate piece of work with its own UI decision.

---

## Open items

- **Q-A (hard blocker for Step 10):** real medallion component (HTML/CSS/JS)
  + image assets, and how those images will be served in Liferay (Documents
  & Media URL, theme path, or base64). Placeholder is in place so this
  doesn't block anything else.
- **Backend work required, outside this deliverable:** a per-user,
  server-persisted "has seen this experience" flag, gating whether
  `lsa-experience.js` runs at all. Integration point documented in
  `handoff.md`.
- **Final Liferay asset paths** for `lsa-mount.html`'s `<link>`/`<script>`
  tags — currently placeholders, to be filled in once hosting is decided.
- **POSB brand blue hex** — placeholder `#1C6FD1` in use for the fireworks'
  blue cohort until the client supplies the real brand colour. See
  handoff.md Open questions, row K.
- **The show needs a real visual check.** Verified by frame-accurate
  simulation (physics, timing, sparkle density, card coverage, break-chain
  termination) across 4 viewport sizes × 5 milestones — all 20 pass — but
  not yet watched rendering in an actual browser, because the agent's
  preview pane cannot composite in this environment. Open `lsa-demo.html`
  via `http://localhost:8080/` and confirm by eye: the card is never seen
  *appearing*, the four burst shapes and the colour shifts are
  distinguishable, the 5-rocket show feels full rather than sparse, and
  framerate holds at `YEARS = 25`.
