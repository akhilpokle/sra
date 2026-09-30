# Long Service Award — 5 Year Milestone Overlay · Progress Log

Full project context and status. `handoff.md` is the developer-facing
integration reference (file list, Liferay steps, tweak points); this file is
the narrative record of what this is, what's been decided, and where the
build stands.

---

## What this is

A modal overlay that plays on top of the live Liferay intranet, celebrating a
service milestone.

**Current flow:** the overlay mounts over a blurred gradient veil of the page →
a gold **GO** button sits bottom-centre → pressing it launches five rockets in
three waves (outside-in, growing: red 1× at the edges, gold 1.5× inboard, a
red/gold/white 2× burst at centre) → each rocket rises and bursts at apex →
the close button tears everything down. Clicking the canvas launches a single
rocket to that point, for judging one firework in isolation.

> **This is not the flow described in the decision log below.** The overlay was
> rebuilt from scratch on the fireworks lab's engine (decision #24). The fuse,
> cursor sparks, generation cascade and congratulation card are all gone.
> **Nothing currently displays the employee's name or the milestone** — the card
> that carried them no longer exists. Decisions #1–#23 are the historical record
> of how the design got here, not a description of what runs today.

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
| `fireworks-engine.js` | The fireworks engine — buffers, physics, rendering. Loaded by *both* the overlay and the lab; there is no second copy (~1230 lines) |
| `lsa-experience.js` | Overlay behaviour, IIFE-wrapped — chrome, tuned `cfg`, GO sequence, teardown. Drives the engine, contains none of it (~430 lines) |
| `lsa-experience.css` | All overlay styles, prefixed, scoped under `.lsa-root` |
| `lsa-mount.html` | Mount markup + `<link>`/`<script>` tags for the Liferay Web Content fragment (placeholder asset paths — see handoff.md) |
| `handoff.md` | Developer-facing integration reference |
| `progress.md` | This file |
| `lsa-demo.html` | **Not for Liferay.** 27-line harness loading the real CSS/JS over `bg.png`, with `data-lsa-dev` set. Zero inline scripts, so it cannot drift from the shipped code |
| `index.html` | GitHub Pages entry point — a redirect to `lsa-demo.html`, deliberately not a second copy |
| `bg.png` | **Placeholder only** — a screenshot of the intranet homepage. Not referenced by the overlay code itself |
| `lab/fireworks-lab.html` | The fireworks lab — slider panel, FPS readout, auto-fire, and a `Copy config` button. Loads the same `fireworks-engine.js` the overlay does (see handoff.md) |

## How it's being verified

A small Node-based static file server (built-ins only, no packages) serves the
project folder over HTTP; the client then opens `lsa-demo.html` in a real
browser. `file://` does not work — it renders as a static snapshot with no JS
and reports `innerWidth === 0`, which trips the `MIN_WIDTH = 1024` guard so the
overlay never mounts.

Since the GitHub push, the hosted demo at **https://akhilpokle.github.io/sra/**
is the easier route and needs no local server at all.

**Nothing in this project has ever been confirmed visually.** Every check to
date has been numeric, driven through `window.__lsaDev` — the agent's browser
pane cannot composite frames in this environment. This remains the single
largest open risk and is called out again under Open items.

---

## Build status

**The original 13-step plan no longer applies.** It was written for the
fuse → cascade → card design, and the clean-slate rebuild (#24) removed most of
what it tracked. Steps 6, 7 and 9 described features that have since been
deleted; step 11's performance work was superseded by adopting the lab engine
wholesale. Kept below as the historical plan, not as a live tracker.

### Where things actually stand

| Area | Status |
| --- | --- |
| Viewport gate, mount, backdrop, scroll lock, close, teardown | ✅ Working |
| Canvas, four-buffer render pipeline, rAF loop, resize | ✅ Working |
| Fireworks engine (Hanabi look + confetti physics, FPS_REF converted) | ✅ Working — now one shared `fireworks-engine.js`, no longer copied into the overlay |
| Lab ↔ overlay config transport (`Copy config`) | ✅ Working both ways — values travel, the engine never does |
| Rocket ascent + burst at apex | ✅ Working |
| GO button + five-firework sequence | ✅ Working |
| Click-to-launch (single rocket) | ✅ Working |
| Repo pushed, GitHub Pages serving demo + lab | ✅ Live |
| **Real visual confirmation** | ❌ **Never done.** All verification has been numeric |
| Congratulation card | ⛔ **Removed.** Nothing shows the name or the milestone |
| Medallion | ⛔ Blocked — needs client assets *and* a card to live in |
| Milestone scaling (10/15/20/25 years) | ⛔ Reopened — show is hard-wired to five fireworks |
| Liferay asset paths | ⏳ Placeholders in `lsa-mount.html` |
| Integration safety audit | ⏳ Not started |

### The original 13-step plan (historical)

| Step | What | Then | Now |
| --- | --- | --- | --- |
| 1 | Scaffold + handoff skeleton | ✅ | still valid |
| 1b | `bg.png` + `lsa-demo.html` harness | ✅ | harness rewritten, 493 → 27 lines |
| 2 | Gate, mount, backdrop, close, teardown | ✅ | still valid |
| 3 | Canvas, rAF loop, resize | ✅ | rebuilt as the four-buffer pipeline |
| 4 | Particle system core | ✅ | replaced by the lab engine |
| 5 | Cursor spark trail | ✅ | **deleted** |
| 6 | Prompt + fuse + proximity ignition | ✅ | **deleted** |
| 7 | Fuse burn | ✅ | **deleted** |
| 8 | Rockets + bursts + sequencing | ✅ | rebuilt as the GO sequence |
| 9 | Congratulation card reveal | ✅ | **deleted** |
| 10 | Real medallion integration | ⛔ | still blocked, now doubly |
| 11 | Performance pass | ⏳ | superseded — the lab engine is the performance answer |
| 12 | Integration safety audit | ⏳ | still outstanding |
| 13 | Finalize handoff | ⏳ | rewritten against the current code |

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

> **Decisions #1–#23 above describe a design that no longer exists.** They are
> kept as the record of what was tried and why. Everything from #24 down
> describes the code that actually runs.

24. **Clean slate, then rebuild on the lab engine.** Three attempts to bring
    fireworks into production failed and were thrown away. The client's verdict:
    *"i am not sure which part are you confused about, and why are you
    hallucinating. I had asked you to remove all the code, yet you kept the
    previous wrong fireworks. i asked you to bring in the settings for fireworks
    which you failed to... I want a clean slate start."*
    `lsa-experience.js` was emptied to 57 lines — safety-contract header,
    `MIN_WIDTH` guard, `.lsa-root`, `.lsa-backdrop`, close button, `teardown` —
    and `lsa-experience.css` trimmed to match. The **fireworks lab's engine was
    then brought over verbatim, settings and all**, rather than re-derived.
    Three process lessons came out of this and are recorded outside the repo:
    a menu is not obedience when an instruction is already total; "bring over X"
    means port X including its tuned values; don't remove what wasn't mentioned
    and don't re-add it to compensate.
25. **The fuse is gone; a GO button replaces it.** The client's call. With it
    went `computeFusePoints` / `drawFuse` / `checkFuseIgnition` /
    `pointOnFuseCurve` / `updateFuseBurn`, `CFG.fuse`, the `.lsa-prompt`
    element and its CSS. The show is now five fireworks in three waves
    (outside-in, growing), driven by a `goSequence` table read on the rAF clock
    — not `setTimeout`, so it stays in step with the sim and pauses with a
    backgrounded tab.
26. **The rocket is a real ascent, solved rather than tuned.** One node drawn
    the same way a sparkle is, into the same buffer, so it gets the trail and
    glow for free. No wink (the flicker reads as a fault on a single ember) and
    no drag (it would eat the launch velocity), so launch speed solves exactly
    from the target height: `v = sqrt(2·g·rise)`. It bursts at apex — the frame
    `vy` turns positive — so it can never stall short or sail past. Measured
    apex error ~9px on a 500px rise; ascent ~2.25s.
27. **Per-burst colour and size, threaded as an optional `spec`.** Each
    sequence row carries its own hue set and scale through
    `burst → spawnSparkles → spawn` and `burst → spawnBlast`. Optional
    throughout, so a plain canvas click still falls back to
    `cfg.hanabi.palette` — the lab's behaviour, unchanged. **White cannot be a
    hue** (every sparkle otherwise takes `BASE_SAT`), so it is a *fraction* of
    the burst drawn desaturated instead; only the centre burst uses it, which
    keeps white exclusive to the finale.
28. **One deliberate deviation from the lab, and only one.** The lab composites
    onto an opaque navy fill because additive blending needs real pixels to add
    to. As an overlay that would hide the page, so the composite clears to
    transparent and the browser layers it over the backdrop. Commented in place
    and in the file header, so it cannot be mistaken for drift.
29. **The card was removed and has not come back.** Nothing currently displays
    the employee's name or the milestone; `EMPLOYEE_NAME`, `YEARS` and
    `MAX_SUPPORTED_YEARS` are all gone. This also reopens milestone scaling —
    the show is hard-wired to five fireworks, so the one-rocket-per-year model
    from #17 no longer applies. Flagged rather than silently accepted.
30. **Pushed to GitHub and served from Pages.** `master` →
    `github.com/akhilpokle/sra`; there is no `main` branch. The repo is
    **public**, so `handoff.md`, `progress.md` and the brand hexes are publicly
    readable — raised with the client, who proceeded anyway. `lsa-demo.html`
    was a stale 493-line private copy of the lab engine that never loaded
    `lsa-experience.js`; it is now a 27-line harness loading the real CSS+JS,
    with zero inline scripts so it cannot drift again. `index.html` is a
    redirect, deliberately not a second copy of the harness. The
    `fireworks-lab` branch is **not** pushed — only the lab file was copied onto
    `master` so Pages could serve it, which means the two copies must be kept in
    sync by hand.
31. **The lab was frozen.** Client's words: *"DO NOT TOUCH THE FIREWORKS LABS,
    ITS WORKING PERFECTLY."* Superseded by #32 — the freeze was lifted on
    request.
32. **Burst shapes and sub-blasts added to the lab** (lab only; production
    still fires the plain radial burst). Five shapes — `normal`, `ring`,
    `star burst`, `concentric`, `squiggle` — plus a sub-blast section for
    secondary breaks. Built so that a shape decides **only** the launch angle
    and speed fraction of each particle, in one function; physics, colour, life
    and rendering are untouched, so the shapes cannot disturb anything already
    tuned and `normal` is byte-for-byte the old behaviour.
    Two implementation calls worth recording. **Sub-blast shells use their own
    life as the fuse**, so they break when they die — no extra countdown field,
    and the shard visibly dims on the way to the second break; fuses carry ±15%
    jitter, without which every shell breaks on the same frame and reads as one
    mechanical pop. **The squiggle weaves via sideways velocity, not
    acceleration**: accelerating measured only ±9px of ripple because drag eats
    it and the width collapses as 1/freq², whereas as a velocity the swing width
    is exactly `waveAmp/(2·waveFreq)` px and drag-independent — measured 83px
    and 167px against predictions of 83 and 167.
    Verified headlessly against the real engine: star burst shows exact 5-fold
    symmetry, concentric
    produces separated launch-speed bands, and 10 shells × 5 children spawns
    exactly 50 particles with no shell breaking twice. **Not verified visually**,
    like everything else in this project.

25. **One engine file, two consumers.** The engine existed twice — inline in
    `lab/fireworks-lab.html` and re-typed in `lsa-experience.js` — and the two
    had already drifted: shapes and sub-blasts (decision #24) went into the lab
    and never reached production, with nothing to flag it. Extracted verbatim
    into `fireworks-engine.js`, which both now load. The lab keeps its slider
    panel, FPS readout and auto-fire; the overlay keeps its chrome, GO sequence
    and teardown. **A change to the engine now reaches both on save.**
    The two copies had diverged in signature as well as in features, so the
    extracted version takes the union: `spec` (hue set, white fraction,
    per-firework scale) from the overlay, shapes and sub-blasts from the lab,
    the rocket from the overlay. Where the lab passed a bare hue or scale, the
    engine takes a `spec` — the lab passes none, so it falls back to
    `cfg.hanabi.palette` and `cfg.scale` exactly as before. Two behavioural
    seams that were hardcoded became config: the opaque navy composite is now
    `cfg.background` (the overlay sets `null` for transparent, which was the one
    thing it had had to change by hand), and the centre glow's hard edge is
    `cfg.core.edge` (the overlay hardcoded 0.62, which is the lab's default).
    **Deployment cost:** the Liferay fragment now hosts three assets, not two,
    and the engine must load first. Alternative considered and deferred — a
    concat step emitting one file — which buys a single asset at the price of a
    build step this project otherwise does not have.

26. **`Copy config` in the lab.** Slider state died with the tab, and the only
    route into a project was reading a number off the panel and retyping it.
    The button serialises the live `cfg` to a pasteable JS literal with a dated
    header. **It exports values, not code** — the engine is already shared, so
    values are the only thing a tuning session has to carry. The obvious larger
    version (copy the engine *and* the config *and* integration instructions, so
    fireworks can be pasted into any project) is deliberately deferred until
    there is a second consumer: it is an addition on top of this extraction, not
    an alternative to it, and it needs the engine separated from the lab chrome
    before it can emit anything clean. Clipboard write falls back to
    `execCommand` because the lab is routinely opened over `file://`.

27. **Config transport runs both ways, and lives in the engine.** #26 only
    carried values lab → project. The reverse was the gap that mattered day to
    day: the overlay's dev panel writes into `cfg` in memory, so anything tuned
    there died on reload with no way back to the lab or into the source file.
    The overlay's panel now has the same `Copy config` button, and the lab has
    a paste box with **Apply pasted**.
    The serialiser, parser and clipboard helper sit in `fireworks-engine.js`
    rather than in either consumer — putting a second copy of them in the
    overlay would have been the same mistake as the engine itself, at smaller
    scale. They are dev-only; nothing in a running show calls them.
    **Coming into the lab, only paths the panel has a control for are applied**
    — 46 of 63 from a config lifted out of the overlay's source, all 63 from a
    running one, since the engine deep-fills the rest at construction. The
    filter is what stops an overlay's `background: null` from stripping the
    lab's night sky, and it drops the show-only keys (`goColors`,
    `fireworkSize`, `goSequence`) for free.
    The parser **normalises to JSON instead of evaluating** — `new Function`
    would have been a third of the code, but this page is served on the public
    web and "it is only a dev tool" is not a good enough reason to put an
    arbitrary-code path in it. Verified by round-tripping the overlay's real
    `cfg` — comments, numeric `fireworkSize` keys, the nested `goSequence`
    array and `null` all survive intact.

---

## Next up — things we need to work on

Logged as a working list, not yet scoped into build steps.

> ⚠ **This list was written 2026-08-27 and several items below were already done
> by 2026-09-01** — the card came back, the medallion went in, GO was replaced by
> the hold-to-charge spark. `handoff.md` is the current picture; this file is the
> narrative log. Corrected items are struck through.

- [x] ~~**Get the milestone onto the medallion.**~~ **Done 2026-09-07.** The face
  is blank and the number is DOM text, so a 20-year award shows 20. One asset
  covers all ten milestones. The count-up now finishes on top of that number, at
  the same size, measured to a quarter of a pixel.

- [ ] **Look at it.** The single most overdue item, and still true. Open
  https://akhilpokle.github.io/sra/ and confirm by eye. None of this can be
  settled numerically.
- [x] ~~Decide whether the card comes back.~~ **Done.** The card and the 3D
  medallion are both in, revealed as the veil clears in thirds.
- [x] ~~**Milestone scaling** for the counter.~~ **Ported 2026-09-04.** One pace
  for every milestone, differing only in how many numbers it walks.
  **The fireworks themselves are still identical at every milestone** — that
  half is open. See "M is the big one" in `handoff.md`.
- [x] ~~Add the medallion.~~ **Done.** `medal.svg` plus `medal-edge.svg` stacked
  34x along Z for the coin's thickness.
- [x] ~~**Port the lab charge into production.**~~ **Done 2026-09-04.** Counter
  step list, blur swap, galaxy blend, spark growth and charge duration are all
  in `lsa-experience.js`, plus the counter moved to centre screen. Two steps of
  the port remain: the sliders, and a teardown audit. `pop`, `galaxyFade` and
  `blur` have controls as of 2026-09-05; thirteen of the sixteen do not.
- [ ] **Watch 50 years.** `steps × 800ms` is a 14.4s hold at 50 and 28.8s to
  drain from full. Tuned at 5. **The dev panel now has a milestone picker**, so
  this is a dropdown rather than an edit-and-reload — see 2026-09-07 below.
  Also worth judging now the numbers exist: 5 to 10 doubles the hold and every
  milestone after that adds only 0.8s.
- [ ] **Build the sub-burst ladder.** Shape agreed 2026-09-07 — five rockets at
  every milestone, `sub.count` on firework 3 scaling with `YEARS`. The mechanism
  is on and looked at; the mapping is not written. Top end unsettled.
- [ ] **Final Liferay asset paths** for `lsa-mount.html`'s three
  `REPLACE_WITH_ASSET_PATH` placeholders — the CSS, the engine, and
  `lsa-experience.js`, in that load order.
- [ ] **Get two CSP entries approved**, added 2026-09-07 with the Aleo font:
  `fonts.googleapis.com` as a style-src and `fonts.gstatic.com` as a font-src.
  If they are refused the overlay still runs — the counter just falls back to
  the system sans and stops matching the medal, silently. The fallback is to
  self-host the woff2 in `assets/`, which needs no CSS change.
- [ ] **Try `medal-face-blank.svg` in place of the PNG.** 64 KB against the
  PNG's 605 KB, same artwork, and it would make the medallion crisp at any size
  — which matters more now the rim is 81.6px deep. Needs `image/svg+xml` serving
  and a look by eye; the face's filters would be rasterised by the browser
  rather than baked. **Now the only real win left on the payload**, since the
  face and the galaxy were compressed on 2026-09-07.
- [ ] **Integration safety audit** — never started. Confirm no globals leak
  (beyond the opt-in `__lsaDev`), every listener is torn down, no selector can
  reach Liferay markup.
- [ ] **Rocket ascent speed** is coupled to `cfg.hanabi.gravity`, shared with
  the sparkles. Speeding up the climb without changing how sparkles fall needs
  the rocket to carry its own gravity value. Flagged, not added.
- [ ] **Decide on `index.html`** — currently a bare redirect to the demo. A
  landing page linking both the demo and the lab was offered and not answered.

---

## Open items

- **Barely confirmed visually.** Almost every check in this project's history —
  physics, timing, colour, density, coverage — has been numeric, run through
  `window.__lsaDev`, because the agent's browser pane throttles
  `requestAnimationFrame` hard when it is hidden (measured 2026-09-04 at roughly
  2% of a charge per second instead of 33%, so a 3-second hold takes ~50s of
  wall clock).
  ⚠ **The "screenshots return a stale frame" half of this was wrong**, and
  believing it cost a whole day on 2026-09-05. Screenshots from the hidden pane
  are current and usable; it is only the *clock* that is slow, which means an
  animation cannot be caught mid-flight but a state frozen by hand can be shot
  perfectly well. Both of the bugs found on 09-05 were found that way.
  **This is the largest open risk and has been carried through every round.**
  The counter work of 2026-09-04 is the first part of this project tuned by eye
  rather than by measurement.
- **Q-A:** real medallion component + image assets, and how those images will
  be served in Liferay (Documents & Media URL, theme path, or base64).
- **Backend work required, outside this deliverable:** a per-user,
  server-persisted "has seen this experience" flag gating whether
  `lsa-experience.js` runs at all. Integration point documented in `handoff.md`.
- **Final Liferay asset paths** for `lsa-mount.html` — placeholders until
  hosting is decided.
- **POSB brand blue hex** — still unsupplied. The current `goColors` are
  red/gold only, so nothing shipped depends on it right now; it becomes live
  again the moment a blue firework or the POSB hex placeholder is wanted.
- **The lab exists in two places and must be kept in sync by hand** — canonical
  on the unpushed `fireworks-lab` branch, byte-identical copy on `master` for
  Pages. Compare blob hashes, not appearances.
- **The repo is public.** These docs and the brand hexes are readable by anyone.

---

## 2026-09-04 — the counter reveal

Worked entirely in `lab/charge-test.html`. **Production is untouched.**

**The charge duration changed twice more.** The flat 3s became a 3s-to-5s curve
on 09-03, and that was rejected the next day as still too quick at the top:
*"roll back on the decision to keep 50s short, its not working, just wayy too
quick. keep the time between 2 numbers consistent."* It is now one interval per
number, `steps × 800ms`, so every milestone runs at the same pace and differs
only in how many numbers it walks.

**The counter stopped showing every number.** A number needs roughly 200ms to be
read; 50 numbers at that pace is a 10-second hold, and 6s had already been
rejected as too long. So the list became every number to 10, then every five,
always landing on the milestone. 5 steps at 5 years, 18 at 50. Stepping by ten
was built first and rejected — every milestone is a multiple of five, so tens
made the odd ones stutter at the end (…20, 30, **35**).

**Each step now blurs out and back in**, on a single arc rather than an out
animation followed by an in: blur and brightness rise to a peak, the text is
swapped at that peak where it cannot be seen, then both come back down. Driven
from the frame loop, guarded by a change detector so the animation is not
restarted 60 times a second.

**The galaxy.** `gal4.jpg` sits over the whole stage on `mix-blend-mode:
color-dodge`. It brightens and cannot lift black, so it is invisible except
where the letters are, with no mask and nothing clipped to their shape. Because
bright patches of the image dodge harder than dark ones, a letter comes up in
patches rather than evenly — it reads as igniting. Nothing animates that; the
image is acting as a timing map. The text must stay white and the fade must use
`brightness`, not `opacity`, or the whole thing flattens into a crossfade.

**The spark grew and got its glow back.** 0.65x to 1.65x, scaling the `<svg>`
and never the `.charge` div, so the hit target stays fixed under a held cursor.
The glow is a third, blurred copy of the path behind the outline — not the
`drop-shadow` that was rejected on 09-03, which hung a halo off the hairline
and read as a brown smudge on black.

**A 14-slider tuning panel** went into the lab, and the values dialled in by eye
are baked in as the file's defaults.

⚠ **Open, and the reason to stop here:** 800ms per number makes 50 years a
**14.4-second hold**, with a 28.8-second drain. It was tuned at 5 years and the
top end has not been watched.

---

## 2026-09-04 (later) — the charge port

**The lab charge is in production.** Everything in the section above now runs in
`lsa-experience.js`. Done as nine steps, one at a time, each checked before the
next — because the galaxy fails silently and building it all at once would have
left no way to tell which change killed it. Seven are in.

**The counter moved to dead centre**, the one change asked for beyond a straight
port. It lands exactly on the medallion's footprint, which costs 0.7s of overlap
— the counter fades on the first burst and the veil starts lifting on that same
burst. Accepted deliberately.

**It shows nothing at rest.** At the bottom of the screen a `0` was small
furniture; at 88px in the middle of a black stage it would be the first and
loudest thing anyone sees. Blank until there is something to count, and a full
drain returns it to blank rather than to zero.

**Three things were dropped, and none of them was tidying.**

- **The pill.** Replaced wholesale by the star, so `.lsa-charge-fill` went with
  it, and the label's `mix-blend-mode: difference` went with that — there is no
  filled surface left to invert against, so the label sits underneath now.
- **The sheen.** A bar of light sweeping a 232×52 capsule, clipped to its
  rounded rectangle. A 140px circle holding a thin star outline has no surface
  for it to cross; all that would be left is a rectangle of light passing over
  empty black.
- **`CHARGE_SWELL`.** It grew the button 6% over the hold, saying the same thing
  the star's 154% growth says, 25 times more quietly — and it grew **the hit
  target**, under a hand being held deliberately still for up to 14 seconds. The
  rule that replaced it: the art grows, the target never does.

**The counter's `text-shadow` had to go, and that one is mechanical rather than
aesthetic.** `color-dodge` is a volume knob on what is already painted, and
mid-tones dodge hardest. A 45%-alpha gold glow is exactly a mid-tone, so the
galaxy would have come up brightest in the ring *around* the number instead of
in it — inverting the effect. Same failure as setting the text mid-grey, which
had already been built and rejected.

**The galaxy leaves at the release, not at the first burst.** From the first
burst on, the fireworks are the brightest thing on the stage and dodging them
would blow them out, then the medallion behind them. Hooking it to the release
buys the whole ~2s ascent, and the fade happens during the pause while nothing
else is moving.

**`gal4.jpg` moved into `assets/`.** It is a shipped asset now, and the Liferay
integration already has two different path conventions without inventing a
third. The lab's `<img src>` was repointed in the same change. It is 1.05 MB and
uncompressed, which is logged as work, not as a decision.

**`SPARK_PATH` was extracted.** The path data existed only inside the cursor's
`Path2D` constructor; the star's three SVG copies needed it too, and a second
hand-transcription of 700 characters of bezier data is the kind of duplication
that goes wrong silently. One string, two consumers — the same lesson as the
engine extraction, at smaller scale.

### A bug that had been hiding in plain sight

**`@keyframes lsa-charge-pop` did not exist.** An unbalanced comment directly
above it — a block that closed, ran on for three more lines of prose, and closed
again — made the CSS parser read that prose as a selector and swallow the entire
keyframe block as its declaration body. `.lsa-charge--pop` was being added on
schedule and applying an animation the document did not have.

**So the snap had never played, once, in any version of this.** It was in the
uncommitted working tree, and nothing anywhere reports it: not the console, not
the JS, not a linter that only reads syntax. It was found by listing
`document.styleSheets[…].cssRules` in a real browser and noticing the keyframe
was not in the list — 52 rules parsed, and only `lsa-charge-sheen` among them.

Fixed. The snap is now a white flash with no scale, because the star already
grows 154% over the hold and another 13% at the end is invisible. Dropping the
transform also removed a live trap: that element carries the `translateX(-50%)`
that centres it, and any keyframe touching `transform` would have had to restate
it at every stop or the button would jump to the left edge mid-animation.

### The proximity glow came out

The `box-shadow` on `.lsa-charge` was the button answering the cursor from a
distance, which is the whole reason a hold-to-charge gesture is discoverable.
On the pill it worked — a capsule with a rim, glowing at its own edge. On a
transparent circle it is a round gold blob behind a star-shaped object, and the
star's own halo already does that job from inside the shape.

`--lsa-near` is still written every frame and nothing reads it. Left in place
deliberately: the signal is worth having and the star is where it belongs.

### Two steps not done, and two questions not answered

- **The 14 sliders are not in the dev panel.** `chargeTune` can only be changed
  by editing the file; the lab is still the only place to tune these live.
- **Teardown and `resetScene()` have not been re-audited** against the new
  nodes. `resetScene()` does clear the swap state, the stale filter and the
  galaxy class; nobody has walked the whole teardown since the star went in.
- **The dev panel and the close button sit under the galaxy** at z 4. Both are
  mid-tones, so both wash out during the charge. The panel never ships, but it
  is the workbench for the slider work above.
- **The snap's flash is still a round `box-shadow`** on a star-shaped object —
  the same mismatch that got the proximity glow removed, for a quarter second
  instead of permanently.

### Still not looked at

Everything above was verified by driving `__lsaDev.step()` and reading values
back out of the DOM: the star growing 0.65 → 1.65, both gradient stops reaching
1.0 at a full charge, the counter walking 1-5 over exactly 4.0s, the release
class landing, the keyframe parsing. **All of that is numbers again.** Whether
the galaxy actually reads as ignition on this stage, whether the star at 231px
is right, and whether 14.4 seconds at 50 years is tolerable are all still
unanswered — and the last one has been flagged in three documents now.

---

## 2026-09-05 — the galaxy fade, and the black disc

Two things, and the second one ate the day.

### The galaxy now fades across the rockets' climb

The image used to leave in a flat 0.5s starting at the release, which meant it
snapped off almost the instant the spark filled. The ask was to stretch it over
the ascent instead, on the chance the rockets dodging through it would be worth
having: *"it might have unintended good effects."*

**The climb was measured first, not guessed** — 2.52s at 1440×900, 2.33s at
1024×768, taken by stepping frames from the release to `--fired`. The fade is
now `chargeTune.galaxyFade`, default 2.3s, read once at the release and written
to a CSS variable so the stylesheet can use it.

**The first burst cuts it short whatever the slider says.** The slider goes to
4s, the climb is only ~2.4s and drifts with window height, and a dodge over a
live burst blows the burst out and then the medallion behind it. That guarantee
used to come for free from the 0.5s being far shorter than the climb; now it is
enforced by `cutGalaxyShort()`. It cannot just shorten the running transition —
**changing `transition-duration` mid-flight does nothing**, the browser
committed to the original timing when the transition began — so it freezes the
opacity where it actually is, forces a reflow, and starts a new 0.25s one. A
plain cut was rejected: at a long setting the image can still be at half
strength when the shell breaks, and dropping that in one frame is a visible
flinch on the brightest moment of the show.

**Two controls went into the dev panel**, under a new **The release** heading,
on a new `kind: 'charge'` that writes to `chargeTune` rather than to `cfg`.
The charge is the show's chrome; `Copy config` dumps `cfg` for the engine.

### The black disc — the flash was drawing a hole

The complaint was a disruptive moment when the spark fills: a brightness spike,
and *"a weird circle behind it."*

**It was the `box-shadow` on `@keyframes lsa-charge-pop`, and the mechanism is
the opposite of what it looks like.** An outer box-shadow is never painted
inside the element's own border box. That is ordinary CSS and nobody notices it
on an opaque control, because the control fills the gap. This button is a
transparent 140px circle, so the flash was a gold **ring with a hole in it**.
`color-dodge` multiplied the ring into bright nebula and left the hole pure
black, and the eye read the hole as a solid object sitting behind the star.

`chargeTune.pop` is now **false**. The keyframe and its switch stay, with the
mechanism written where the keyframe lives so it cannot be rebuilt by accident.

**It should be rebuilt, but not out of a box.** The flash is the only beat that
says the hold is finished; without it, full and nearly-full look the same and
you keep holding. A round shadow on a four-point star is the same shape
mismatch that deleted the proximity glow on 09-04, and it has now caused two
separate bugs. The halo path is where a replacement belongs.

### How it was found, which is the part worth keeping

**Six mechanisms were ruled out by reasoning, and every one of them was wrong**
— stacking contexts, `z-index`, the button's transform, the star's transform,
`will-change`, the `<button>` tag, `appearance: none`, and rebuilding the whole
layer stack on DOM order instead of z-index. Each wrong guess cost the client a
reload and a hold.

Nothing in the DOM was painting anything dark. Every computed style on that
element is transparent, there are no pseudo-elements, `.lsa-black` is pure
`rgb(0,0,0)` at opacity 1, and both canvases read `0,0,0 a0` at every sampled
pixel. **The bug was invisible to every form of inspection short of looking at
it.** It was found by removing the shadow and taking two screenshots.

The agent had assumed for the whole session that its browser pane could not
produce usable frames, because CSS transitions were frozen while the pane was
hidden — and never tested the assumption. Screenshots worked the entire time.
The client's own screenshot, sent early, carried more information than every
test that followed it.

**This is the second bug in this file that only a rendered frame could catch.**
The first was the `@keyframes` block that a comment error had swallowed whole,
found on 09-04 by listing `cssRules` in a browser. On this stylesheet, look
before you reason.

---

## 2026-09-05 (later) — the number was blurring into a disc

The complaint, against the imported `text-blur-reveal` skill: *"in the skill the
blur is limited to the text. in the implementation the text blurs out and blurs
back in creating a radial blur spot which is very weird."*

### The blur was wider than the strokes it was blurring

`chargeTune.blur` was `0.34`. That is 0.34em of an 88px digit — **about 30px of
blur**. The bold strokes of that digit are only **about 11px wide**.

Past the stroke width a Gaussian blur stops softening a letter and starts
dissolving it. Every stroke spreads well past its neighbours, they average
together, and what is left is a round grey cloud the size of the glyph's box
with no letterform in it at all. That is the "radial blur spot", and it is
ordinary optics rather than anything specific to this stylesheet.

The skill does not hit this because its default is 10px, or `0.22em` on display
type — under the stroke width, so the shape survives and the letter reads as out
of focus.

**It is a ceiling, not a preference.** Measured on screen: 0.34em is a blob with
no digit in it, 0.18em is a smear you can barely call a 2, 0.1em is clearly a 2
and simply soft. Set to **0.1**. Keep it under about 0.12.

### It was NOT the galaxy, and that was worth proving

The obvious suspect was `color-dodge`. A blurred letter at `brightness(45%)` is
a mid-tone, and a mid-tone is exactly what dodges hardest — the same reasoning
that got the 45%-alpha gold `text-shadow` removed from `.lsa-count`, and the
same reasoning that explained the black disc the day before.

It was wrong. Hiding `.lsa-galaxy` entirely and blurring anyway still produced
the blob. **The dodge was only making the blob glow.** Two screenshots, one with
the image and one without, settled in a minute what an argument about blend
modes would not have settled at all.

That is now the third bug here found by looking rather than reasoning, and the
first time the rule was followed on purpose instead of after six wrong guesses.

### A slider, because the value had to be judged not calculated

`blur` now has a control in the dev panel under a new **The number swap**
heading, on the existing `kind: 'charge'`. Range 0.02 to 0.4.

Unlike `pop` and `galaxyFade`, which are read once when the charge completes and
therefore only land on the *next* run, this one lands **mid-hold**: `swapTick()`
reads `chargeTune.blur` on every frame it runs, so the next number to change
already uses the new value. Drag it while the counter climbs.

Three of the sixteen charge values now have controls. Thirteen still do not.

### A note on verifying this in the Browser pane

The pane throttles `requestAnimationFrame` hard — 25 seconds of wall time
advanced a 4-second charge to a fill of 0.036, which makes a swap span one or
two frames and makes catching one by sampling close to useless. Two things that
did work: freezing `countValue.style.filter` by hand between swaps (the loop
only writes that property while a swap is running, so a value set in the gap
survives long enough to screenshot), and reading the peak blur back out of the
inline style to confirm the slider reaches the loop.

Also: the overlay does not mount in the pane until the viewport is set
explicitly. A hidden pane reports `innerWidth === 0`, which trips `MIN_WIDTH`
exactly the way `file://` does.

---

## 2026-09-07 — how the milestone reaches the fireworks

The counter has scaled with the milestone since 09-04. The fireworks never
have. This session settled how they will, switched the mechanism on, and built
the controls needed to judge it. **The ladder itself is not built.**

### A rocket-count ladder was proposed and dropped

The first shape on the table: years ending in 5 get 5 rockets, years ending in
0 get 10, with sub-bursts scaling on top. It was dropped for two reasons found
by reading the code rather than by argument.

**It goes backwards at half the milestones.** 10 years would get ten rockets
and 15 would get five, so a 15-year award reads smaller than a 10-year one.
Same at 20 against 25, 30 against 35, 40 against 45. Five of the ten milestones
are a step down from the one before.

**Ten rockets does not fit.** `count` is 200 and `poolMax` is 2000, so ten
rockets is exactly the pool with nothing spare, and about 3800 with sub-bursts
on. Past the cap `spawn()` returns null and the rest of the burst is silently
dropped — no error, no warning. The biggest milestones would have rendered the
*sparsest*, which is the opposite of the whole point.

**Sub-bursts also cannot chain**, so "4 sub-bursts" could never have meant four
generations. `spawn()` clears the shell flag on children on purpose, and the
comment at that line says so. The only number available is `sub.count` — how
many of the 200 sparkles become shells.

### The agreed shape: five rockets always, sub-bursts on the centre one

Rocket count is fixed at five at every milestone. The milestone rides on
`sub.count` for firework 3 alone, roughly `Math.floor(years / 10)` — 5 years
keeps today's show untouched at 0 shells, 50 gets 5.

It costs nothing structurally: still five rockets, still three burst moments,
so the veil logic is untouched. And it *cannot* disturb the veil by accident —
`onBurst` fires only from the rocket path in `update()`, never from
`spawnSub()`, so a second break can never eat a reveal step.

### Sub-bursts were switched on and looked at

They had never once run in this show. One value, `fireworkCfg[3]`'s
`'sub.enabled'`, false to true.

**The effect is loud.** At the same instant after the same burst: 345 particles
and 7 blasts with them on, against 164 and 1 with them off — six clear
secondary pops spread wide off the parent. Verified with two screenshots of
firework 3 alone, `goSequence` cut to one row so nothing else was on the stage.

**That corrects a guess made earlier the same session.** The estimate here was
that five shells out of 200 sparkles would be too quiet to carry a milestone.
It is not close to too quiet, which widens the usable ladder rather than
narrowing it.

**Cost is comfortable.** The full show peaked at **1059 of 2000**. Nothing was
dropped. It also gives the centre firework a second beat 0.7s after the main
break and a longer tail — whether that fights the medallion as the veil clears
is not yet judged.

Open at the top end: 6 shells is what was looked at, and it is already strong.
Whether 5 is the right ceiling, and whether 1 shell against 5 reads across ten
milestones, are both unanswered.

### Two dev controls, because the ladder cannot be judged without them

**A milestone picker**, 5 through 50, at the bottom of the dev panel under
**The milestone**. It is the only thing in the file that moves `YEARS` after
mount. `setYears()` rebuilds the counter's step list and rewrites the card
line; the picker then resets the stage, because a control that looks like it
did nothing is worse than no control.

`YEARS` had been a build-time constant with a comment saying there was nothing
to recompute for. That comment is now wrong on the demo page and still right on
Liferay, and says so.

**A `Play show` button**, next to `Copy config`. Resets, then runs the sequence
with no hold. Judging fireworks at 50 years through a 14.4-second hold every
time makes the comparison useless, and the hold tells you nothing about the
fireworks. It resets *first* on purpose: `onGo()` returns early while anything
is still scheduled, so without that it would silently do nothing mid-show.

The card sentence was also pulled into one `cardLine()`, since the picker
rewrites it and two copies of that string would drift the moment either is
reworded.

### The hold table, measured rather than calculated

Driven one charge per milestone in a real page, counting the numbers that
actually reached the screen: 5 → 5 steps → 4.0s, 10 → 10 → 8.0s, then one more
number and 0.8s per milestone up to 50 → 18 → 14.4s. Full table in
`handoff.md`.

**The ladder is lopsided.** 5 to 10 doubles the hold, because those are the
only two milestones inside the every-number stretch. After that each milestone
adds 0.8s. So a 10-year award already costs more than half of what 50 does, and
eight of the ten milestones are crowded into the last four seconds. That is a
consequence of the step list rather than a decision anyone made, and it is worth
a look now that the numbers are on paper.

---

## 2026-09-07 (later) — a real medal face, and the number is baked into it

A finished badge arrived as `assets/Medal face.png` and replaced `medal.svg` as
the medallion's front. One line in `lsa-experience.js`, one rename, nothing
else.

### It dropped straight in

The PNG is 2250×2260. The old artwork's viewBox is 563×565. That is exactly 4×
on both axes, so the two occupy the same coordinate space and the swap needed
no CSS at all — `.lsa-medal-img` is already `width: 100%; height: 100%`, and the
34 stacked copies of `medal-edge.svg` still line up under the new face because
the silhouette is unchanged.

Verified in a running page rather than assumed: the image loads at its full
2250×2260, the src resolves, the console is clean, and the medal renders with
its rim intact.

**Judging it needed the stage taken apart first.** Dropping `.lsa-black` to
opacity 0 to expose the card left the medal blown out to pure white — the
galaxy sits at z 6 on `color-dodge` over everything, and with the black gone
the blue veil underneath was bright enough for the image to dodge across the
whole screen. That is the black doing its job, not a bug. Hiding `.lsa-galaxy`
and the shimmer as well gave a clean look at the artwork.

### Renamed on the way in

`Medal face.png` → `medal-face.png`. A space has to be percent-encoded in a
URL, and this particular path is built by string concatenation in JS and then
re-rooted by hand at `ASSET_PATH` during the Liferay integration. Two chances
to drop the encoding, and the failure is a silently blank medallion.

### What it costs

**2.3 MB.** It is now the heaviest thing the overlay loads, more than double
`gal4.jpg`, and it renders into a 320px box — roughly 7× the pixels it can ever
show. Total image payload is 3.9 MB and none of the three files has been
compressed. The handoff's compression note used to name only the galaxy; it now
names all of it.

### The thing it breaks: the milestone is in the artwork

The badge reads **SERVICE RECOGNITION AWARD** around the ring, with a large
**5** over **Years** at the centre.

`medal.svg` had no text and no number anywhere, and the handoff leaned on that
— *"the medallion art is milestone-agnostic, ten milestones need no new
assets."* That sentence is now wrong. **As it stands a 20-year award shows a
medal reading 5.**

Known and accepted: the face was swapped in to be looked at, not to ship. Three
ways out are written up in `handoff.md` and none is chosen — ten PNGs picked by
`YEARS`, one numberless PNG with the digits laid over it in CSS, or back to SVG
with the number as a text node. The first multiplies a payload that is already
the problem; the third is cleanest and needs the face re-authored as vector.

`medal.svg` stays on disk, unused.

> **Solved later the same day** by the second option. See the next entry.

---

## 2026-09-07 (later still) — the count-up lands on the medal

The ask was a font change and a size ramp on the counter. Answering it properly
meant taking the number out of the artwork first, because "the final size and
position should match the medal" is not a thing you can tune by eye when the
target is a picture.

### Aleo, and the project's first CDN

The counter was the system sans. It is now **Aleo 700 italic**, loaded from
Google Fonts by three `<link>` tags in `lsa-mount.html` and `lsa-demo.html`.

Self-hosting a woff2 in `assets/` was offered first and the client chose the CDN.
It is the only external dependency the overlay has and the only break in the
no-CDN constraint. **Liferay's CSP has to allow `fonts.googleapis.com` as a
style-src and `fonts.gstatic.com` as a font-src**, and if it does not, nothing
warns anyone — the counter quietly falls back to the old sans and stops matching
the medal. Written up in `handoff.md`.

Weight is **700, not the semibold that was asked for**. The medal's digit is
700, and at 91px a half-step lighter shows against the artwork when the two are
superimposed. Flagged rather than silently substituted.

### Deciding the shape before building any of it

The first proposal on the table was to keep the ten baked-in faces and measure
each one. It was dropped by argument rather than by trying it: ten faces means
ten sets of constants, the "5" and the "50" do not sit the same, and every one of
them has to stay true the next time the artwork is revised.

**One numberless face plus DOM text was the answer, and the payoff is that the
alignment problem disappears rather than gets solved.** Give the counter and the
medal's number the same box and the same size rule and they superimpose by
construction — no offset to derive, nothing to redo when the medallion becomes
screen-relative. It also fixed the 20-years-shows-a-5 bug for free.

They cannot be literally one element: the counter sits above the black veil at
z 4 and the medal's number below it at z 1. They share the constants instead.

Three other ideas were raised and are worth keeping for the next time this comes
up — a fixed offset measured **from screen centre rather than from the top**
(which is viewport-independent here, and is what the final code relies on), an
id'd node in an inlined SVG read with `getBoundingClientRect()` (blocked: an SVG
inside `<img>` is a closed document), and a zero-size marker div inside the medal
(unnecessary once the number itself is DOM).

### The measurement, which is the part worth keeping

The client supplied a blank face and a vector copy, but no id'd number and no
position — only the type spec.

**The position came from subtracting one image from the other.** The old face
and the blank one are the same artwork at the same size, so a per-pixel diff of
the two PNGs is exactly the printed digit and nothing else: **x 948–1296,
y 774–1256 in 2250×2260**, stable across four thresholds. As fractions of the
medal, centre **0.4989 / 0.4493**, ink height **0.2137**.

**It cross-checked against the type spec, which is why it can be trusted.**
`font-size: 161px` in the 563 viewBox predicts an ink height of 161 × 0.74 =
119px; the pixels measured 117–121 depending on how much of the drop shadow is
counted. Two independent sources agreeing is the difference between a measurement
and a guess.

### The 0.055em nudge

Centring puts an element's **box** on a point; what has to land there is its
**ink**. Aleo sits its digits' ink centre 0.055em above the box centre. Both the
medal's number and the counter's aim correct for it, and the correction is
independent of `line-height` — derived, then confirmed on screen.

This was the one place the work could have gone wrong invisibly. A 5px error at
91px looks like a rendering quirk rather than a bug.

### Aiming the counter without hard-coding anything

`aimCounterAtMedal()` reads `.lsa-medal-number`'s **computed `font-size` and
`top`** back out of the stylesheet, so no fraction is written in two places. It
writes `chargeTune.scale1` (now derived, 1.04, down from a tuned 1.2) and
`--lsa-count-y` (−60.83px, lifting the counter off screen centre onto the
medal's digit).

Two calls that matter:

- **It uses `offsetTop`/`offsetWidth`, not the medal's rect.** The medal is
  tilt-transformed on every mousemove, and a rotated element's rect is the box
  *around* the rotation — it changes as the cursor moves. Layout values ignore
  transforms.
- **Nothing recomputes on resize, and that is correct.** The counter and the
  card are centred on the same point and the medal's offset inside the card is
  layout-driven, so the offset is viewport-independent. `setYears()` re-aims
  because a longer sentence can reflow the card.

Verified at 5 years and again at 50: **ΔX 0.00px, ΔY 0.23px, height ratio
1.0000** — and confirmed by eye, with the counter tinted red over the brown
printed digit, showing one number rather than two.

### Two type settings that had to give way

`letter-spacing` on `.lsa-count` went from −0.02em to `normal`: the medal's
number has none, and it cost "50" 3.5px of width, which is a 1.8px sideways slip
once both boxes are centred. The old value was tuned against a typeface the
counter no longer uses.

`font-variant-numeric: tabular-nums` stayed, and is **inert** — Aleo's figures
are the same width either way. Measured rather than assumed, and kept as a guard
against a future typeface change.

### The ramp, and the fourth slider

`scale0` went 0.55 → **0.30**, so the number arrives at 26px and grows 3.5× into
the medal's digit instead of 1.9×. It is the only taste value left in that pair
and it now has a control, under **The counter grows**, landing mid-hold like the
blur does.

**`scale1` was struck off the slider list rather than built.** It is derived from
the medal now, so a control would be overwritten on the next milestone change
and would read as broken. Four of the sixteen charge values have controls;
eleven still do not.

### What was deliberately not matched

The medal's digit is a brown gradient. **The counter stays pure white**, because
`.lsa-galaxy`'s `color-dodge` needs white to ignite the letters and a mid-tone
brown is exactly what dodges hardest — the same mechanism that removed the gold
`text-shadow` on 09-04 and explained the black disc on 09-05. The two numbers
match in face, weight, slant and size, and not in colour, on purpose.

### The fireworks were pointed at it too

`runSequence()` now takes its burst height from `burstY()`, which reads the same
`medalNumberY()` the counter is aimed with. The counter finishes on the number,
the rockets break on the number, the veil clears to show the number — **three
things on one anchor.**

`cfg.goHeight` is a fallback now. **A fraction of the height cannot express
this**: the number sits a fixed ~66px above the viewport centre, so the fraction
that hits it is 0.418 at 800px tall and 0.439 at 1080 — any single value is
wrong on most screens. The old 0.5 was the same intent one step coarser.

Measured at 1280×800: all five bursts at **y 337.6** against the number's ink at
**334.1**. The 3.5px is the engine's apex quantisation — a rocket breaks on the
frame its `vy` turns positive — not an aiming error, and 4% of the digit's
height. Verified by wrapping `fw.onBurst` and reading every burst's coordinates,
then by screenshotting the first break.

⚠ Aiming higher means ~8% more climb, about 0.19s on a 2.4s ascent, so the first
burst lands later. `cutGalaxyShort()` already covers the galaxy for it.

### The fill was levelled to the artwork, and the design spec was wrong

The supplied gradient, `#A18D7E → #998474`, rendered visibly darker than the
digit it replaced — *"the stylings seems abit off and dark."*

Measured rather than argued about. Sampling the old face against the blank one
**at the shipped 320px size**, the printed digit's body averages **#A69384** and
averages **#AB9A8A** once antialiased edges are counted; the spec's two stops
average **#9D8879**, about **ten levels per channel too dark in all three
channels**. The stops now sit on the soft mean, `#AE9C8D → #A69384`, chosen by
eye between the two candidates — what reads as the digit's colour is the average
the eye takes across the whole glyph, not the colour of its solid interior. The
straight body match still looked heavy. Angle, stop positions and spread are the
spec's, untouched.

**A trap found while testing this, worth keeping.** The `background` SHORTHAND
resets `background-clip` to `border-box`. A `background:` written after the clip
silently un-clips the gradient and paints a **filled rectangle** behind the
digit. It happened in a scratch comparison page and looked exactly like a
styling bug in the real thing. The rule uses `background-image` now, so the
order cannot matter.

### Left on the table

`medal-face-blank.svg` is on disk, unused, at **64 KB against the PNG's
2.28 MB** — the same artwork as vector. Switching to it would cut the image
payload by 97% and make the medallion crisp at any size. Not attempted, and not
free: it has to be served as `image/svg+xml`, its filters would be rasterised by
the browser rather than baked, and it has not been compared against the PNG by
eye.

`medal-face.png`, the one with the 5 in it, is kept on disk on purpose. It is the
only way to re-derive the number's position if the artwork changes.

---

## 2026-09-07 (fourth) — the handover folder, and 3.9 MB down to 1.36

Four things, in order. None of them touched the show's timing or the fireworks.

### The handover folder was rebuilt lean

`handoff/` was a stale copy from 30 August — the engine, the CSS and the JS were
all a week behind, and its `assets/` still held `medal.svg`, replaced that
morning. Wiped and regenerated from the current files.

**What is in it**: the three code files, the three images they actually load,
`lsa-mount.html`, a `README.md`, and a runnable demo — `index.html`, `bg.png`
and a copy of `serve.js` so the demo needs nothing installed.

**What came out**: `medal.svg` (dead), and the Aug-30 copies of everything.

`bg.png` was dropped and then put back on request. It is a **reference image** —
a screenshot of the intranet standing in for the live page — and it is now
labelled as such in three places: the comment at the top of `index.html`, the
comment on the CSS rule that uses it, and the README. Nothing in the shipped CSS
or JS refers to it.

**Two files were corrected rather than copied.** `lsa-mount.html` was still
telling the Liferay developer to host `medal.svg`, `back.png` and `shimmer.png`
— one replaced, two dead. It now lists the real three. And `serve.js`'s header
said it lives in `.claude/`, which stopped being true the moment it was bundled.

### The face and the galaxy were compressed

The client's own work, not the agent's. `medal-face-blank.png` 2.28 MB → 605 KB,
`gal4.jpg` 1.05 MB → 565 KB.

**The face came back as an indexed PNG** — 227 palette colours and only 22 alpha
levels, which for artwork with a soft drop shadow fading to transparent is
exactly the shape of a silent regression. Checked rather than assumed: rendered
side by side against the original at the shipped 320px and again at 2×, there is
no visible banding in the centre glow and no stepping on the edge. The artwork is
a narrow brown-and-cream range, which is why a 227-colour palette survives it.

⚠ **That test did not cover the case that would break it.** The medallion is
fixed at 320px today; making it screen-relative is a flagged open item, and a
much larger render is where 22 alpha levels would start to show.

### The shimmer came out

The client's call: *"remove the shimmer from code. i dont think it's helping."*

It was a warm gradient masked by `shimmer.png`, swept across the medal by the
cursor. Gone from the JS (the div, the two `--lsa-sx` / `--lsa-sy` writes on
mousemove, the opacity reset on leave), gone from the CSS, gone from
`lsa-mount.html`'s hosting list, and the file is out of `handoff/assets/`. It is
still on disk at the repo root and nothing reads it.

**It closed a standing open question by deletion.** The blend mode was `overlay`,
chosen back when the card had a white surface; the card has been transparent over
black since 08-30, which is what `screen` wants. That had been raised and
unanswered for a week. It is now moot.

**Two things fell out of it.** The mask was **542 KB for an effect whose three
colour channels the browser threw away** — only the alpha of a `mask-image` is
ever read — which made it the heaviest asset in the project after the
compression. And `lsa-experience.css` now loads **nothing at all**: that url()
was the only one, and it was the sole reason the stylesheet and `assets/` had to
stay siblings on Liferay. **One path rule now, not two**, and the doc had called
the old pair "the easiest thing to get wrong".

Verified in a browser rather than by reading: no `shimmer.png` request, zero
`.lsa-medal-shimmer` nodes, no shimmer rule in the parsed stylesheet, and **55
rules parsed with `lsa-charge-pop` still among them** — the check that the
comment edits had not swallowed a rule, which is this stylesheet's known failure
mode. The medal's 3D tilt is untouched: it still writes
`rotateX(10.11deg) rotateY(12.45deg)` over the medal and resets to zero off it.

### The rim was doubled

*"its not that obvious."* It was not: 34 layers × 1.2px is 40.8px of depth, and
at 25° of tilt that projects to about 17px on a 320px medal. `EDGE_STEP` is now
**2.4**, so the stack spans **81.6px**. `EDGE_COUNT` did not move and the front
face's `translateZ` is derived, so it followed on its own.

**The layer count did not need to rise, and that was measured.** 34 × 2.4 and
68 × 1.2 give the same 81.6px, and side by side they are identical — the extra
34 layers bought nothing and would have doubled the compositing cost for it.
The file's own comment had warned that raising the step opens gaps, which is
true but not at this value.

**2.4 is the ceiling, and the ceiling has a formula.** What opens a gap is the
*projected* distance between slices, `step × sin(tilt)`. Worst case here is both
axes at `MAX_TILT`, about 34° of effective rotation, so 2.4 projects to ~1.3px —
under the ~1.5px where a seam starts to show. Confirmed by screenshotting that
worst-case pose at 2.2× zoom: a clean solid band. **Go deeper than this by
raising the count, not the step**, and that is now written at the constant.

122px (51 layers × 2.4) was also built and looked at. It reads more puck than
coin. Not taken.

### Where the payload landed

**3.9 MB → 1.36 MB, a 65% cut, in one day.** Images are 1.14 MB of that:
`medal-face-blank.png` 605 KB, `gal4.jpg` 565 KB, `medal-edge.svg` 1.3 KB. Code
is 218 KB across three files.

The one win left is `medal-face-blank.svg` at 64 KB — another 40% off the whole
payload, and a medallion crisp at any size. Still not attempted.

### Not touched

`MEDALLION.md` is the **incoming component spec**, not a record of what was
built. It still documents `shimmer.png`, click-to-flip and `step = 1.2`, none of
which this project now runs. Left alone deliberately: it is the source document,
and every deviation from it is already recorded in `handoff.md`. Do not read it
as current.

---

## 2026-09-07 (last) — the sparkle on the number

The ask, in the client's words: *"the rockets bursts, when the center one
bursts, and sparkles settle down, the number need to sparkel, create it as
another layer. the sparkling is like many dots that come together to make up
the number and they slowly fade out."*

Built to a Plan / Review / Execute template the client supplied, in six steps,
each one looked at before the next started.

### Two forks, both decided by the client against the first proposal

**The dots do not fly in.** The first plan had them scattered and converging on
the glyph, with staggered arrival and target easing. Struck out: *"the dots dont
fly in, they are just there that become visible while sparkling stay for a while
then dissappear."* That is less code than the version it replaced, not more —
the flight, the stagger and the easing all went — and it is the reason the
twinkle sits on a **floor** rather than dipping to zero. A dot that goes fully
dark makes the digits come apart and reassemble, which is exactly the effect
that was rejected.

**The engraved number stays visible.** The agent proposed and recommended a
handoff — hide the medal's own digit until the dots finish, so the sparkles are
what *put* the number on the medal. The client's call was the other way:
*"the engraved stay visible."* The dots are a flare over a digit that is already
there.

### The shape comes from the font

The digits are rendered to an offscreen canvas in `.lsa-medal-number`'s own
computed font and every inked grid square becomes a dot. 88 dots at 5 years, 185
at 50. One code path for all ten milestones, no eleventh asset, and it follows
the typeface and the medal's size on its own.

The alternative was a hand-authored point list, which would have been ten lists,
each of them wrong the day the artwork moved. That is the same reasoning that
put the milestone on a blank face as DOM text earlier the same day rather than
shipping ten PNGs.

**Aimed by one read of the stylesheet**, then re-centred on measured ink.
`top` on `.lsa-medal-number` is already the ink line — the 0.055em nudge is what
makes that true — and the canvas shares `coinFront`'s box, so that value is the
target with nothing to convert. But `textBaseline: middle` centres the **em
box**, not the ink, and by a different amount for every typeface. So the ink's
real bounding box is read back out of the pixels and the whole field shifted
onto the target. **That shift is why "50" centres as well as "5"**, and it means
the `fillText` placement only has to be close enough to keep the glyphs on the
canvas. Same distinction the 0.055em nudge exists for, met a second time.

The box is taken from every pixel while the dots are taken on the grid, in one
pass — a box measured off the grid samples alone is coarse by a whole step.

### The first build made the digit look eroded

Hard-edged cream discs at low alpha, on a cream medal face. They read as
**texture**, not as light — the 5 looked chewed rather than lit. Flagged before
the twinkle went in, confirmed on sight once it did.

What separates a point of light from a coloured dot is the falloff around it.
Every dot is now one soft radial blob — white core, warm gold rim, transparent
edge — built once into a 64px canvas and stamped with `drawImage`, on
`lighter` so overlaps add. A gradient per dot per frame would have been ~185
gradient objects every frame for the same picture. The resting level dropped
from 0.32 to 0.16 at the same time, so the flashes have something to stand out
from.

Alongside it, two things that were right first time and are worth keeping:
**sharpness**, which raises the sine to a power so the curve has short bright
peaks and long dim gaps instead of spending half its time near the top — below
about 2 it goes back to breathing; and **size moving with brightness**, because
a point of light that grows as it brightens reads as a spark catching, while one
that only changes alpha reads as a pixel being faded, which is what it is.

**Jitter is not decoration either.** Dots on an exact grid read as a dot-matrix
display — the eye finds the rows instantly. Just under half a step of scatter
breaks the rows while every dot stays inside its glyph.

### A bug that no amount of reading would have found

The end of the field was tested with `env <= 0`. The envelope is zero at **both**
ends, so on the very first frame — age 0, still climbing — it read as finished
and wiped the field before a single dot was ever drawn. **The effect silently
did nothing**, with no error and nothing on screen to explain it.

Caught by driving a full run through `step()` and logging the canvas's total
alpha every fifteen frames: a column of zeros where there should have been a
curve. The test is on elapsed time now. That is the third bug in this project
found by measuring a rendered frame rather than by reasoning about the code, and
the second this week where the reasoning would have been confident and wrong.

### Where it sits, and what it costs

`.lsa-medal-sparkle` is a canvas **inside** the medallion's front face, next to
`.lsa-medal-number`, which is what makes it ride the 3D tilt. A stage-level
layer would slide off the digits the moment the cursor moved the coin.

Hung off `fw.onBurst` testing `spec.n === 3` — the same hook the veil steps on.
**The centre firework goes first**, at `at: 0`, since `goSequence` is inside-out,
and it is the only one carrying sub-bursts, which re-break 0.7s later. That is
what the 1.4s `settle` is buying. Armed **above** the one-burst-per-frame guard
on purpose: that guard is there so two rockets on one frame only move the veil
once, and this wants the opposite question answered.

Teardown needed nothing — the canvas is a child of `.lsa-root`, no listener, no
timer. Verified rather than assumed: RESET wipes it and a second run reproduces
it exactly, close leaves zero nodes, and the stylesheet still parses 56 rules
with `lsa-charge-pop` among them.

### All seven tuned values got sliders

`sparkleTune` — `settle` 1.4, `hold` 2.8, `fadeOut` 2.0, `grid` 4, `floor` 0.16,
`rate` 1.1, `halo` 3.4 — all under **The sparkle on the number** in the dev
panel, on a new `kind: 'sparkle'` following the `kind: 'charge'` pattern. Every
one lands live except `grid`, which is read while sampling and is in the cache
key instead, so it re-samples on the next frame. The whole section can be judged
during one press of `Play show`.

That is a deliberate contrast with the charge, where **eleven of sixteen values
still have no control** and `lab/charge-test.html` is the only place to tune
them. The sparkle was given its panel section on the way in rather than left as
a follow-up.

⚠ `Copy config` does not carry `sparkleTune`, exactly as it does not carry
`chargeTune`. Values dialled in there have to be written into the file by hand.

### Flagged, not fixed

**The density has not been settled.** At 4px spacing it reads as "the 5 is
*built out of* lights" rather than "the 5 has lights on it". That is what was
asked for, and the client's *"wew perfect"* was against still frames at 2.4×
magnification — it has not been watched running at its real size.

**The beat runs past the reveal.** It starts 1.4s after the centre break and
lasts 6.8s; the veil finishes about 1.9s after that break. So the sparkle is
still going for roughly five seconds after the medallion has landed, over the
top of the background fireworks. Whether those two fight is unjudged.

---

## 2026-09-11 — the card got a real surface

The ask, in full: *"replace the white background with the back png in assets."*

The card went flat white on 09-10, after being a transparent positioning box
since 08-30. This swaps that white for artwork — a cream plate with a 16px gold
rim and rounded corners, all of it baked into a 3200×2160 PNG.

### The filename was the one real decision

The file arrived as `handoff/assets/Back.png`. There is already an
`assets/back.png` — the medallion's own reverse face, which the click-to-flip
built on 09-10 now loads. **On Windows, and on any case-insensitive host,
copying one in beside the other is not two files, it is an overwrite.** The
flip would have started showing the card's plate on the back of the coin, and
the original artwork would have been gone.

It went in as `assets/card-back.png`. Two files, two names that differ by more
than a capital letter.

### The url() is in the JS, and that was not a style preference

A `background-image` wants to be a `url()` in the stylesheet. That is the
natural place for it and it is the wrong place here.

**A `url()` in a stylesheet resolves against the stylesheet**, not against the
page. That is what forced `lsa-experience.css` and `assets/` to stay siblings
wherever they were hosted, for as long as `shimmer.png` was a `mask-image` — a
second path rule, and `handoff.md` had called the pair "the easiest thing here
to get wrong". Deleting the shimmer on 09-07 got rid of it, and the note that
**the stylesheet now loads nothing at all** was written up as a win.

Putting the plate in the CSS would have handed that straight back, four days
later, for one line. It is `card.style.backgroundImage` built from `ASSET_PATH`
instead, which resolves against the page like every other image here. Still one
constant to set at integration time.

`card.style.backgroundImage`, not `card.style.background`. The shorthand resets
`background-clip`, and this card contains the count-up, which is gradient text
held together by `background-clip` — the exact way that was broken once already
on 09-07. Nothing on the card itself clips. They are one property apart.

### The white and the border-radius both had to go, not just the white

The artwork carries its own rounded corners in its alpha. A `background-color`
behind it paints the full padding box, so the transparent corners fill back in
and the plate is square again. A `border-radius` on the element is a second
rounding at a different radius, fighting the one in the PNG.

So `.lsa-card` now has no colour and no radius, and the shape is entirely the
image's. **The cost is that a failed load leaves a transparent card with dark
text on it** — the ink went to `#1b2733` on 09-10 when the surface went white.
That is the same bet the medallion's three images already take, so it is not a
new exposure, but it is worth saying out loud.

### The plate is stretched, and the number is known

`background-size: 100% 100%` on a 3200×2160 image in a card that measures
512×532. The axes scale by 0.160 and 0.246 — a 54% difference.

Almost nothing in the artwork cares. It is a near-flat cream gradient with a
faint grain, both symmetrical. **The rim is the exception**: 16px in the source,
which lands at **2.6px at the sides and 3.9px top and bottom.**

The two alternatives are worse rather than different. `contain` leaves bare card
either side of the plate; `cover` crops the rim clean off the two long edges.
A 9-slice `border-image` is the actual fix — it keeps the corners and the rim
undistorted and stretches only the flat middle — and it costs a `border-width`
on `.lsa-card`, which moves the content box inward and shifts the medallion.
Not done, and flagged.

**Judged on a screenshot at real size, not by argument.** It reads as a soft
gold edge rather than a crisp line, which is what makes 1.3px of asymmetry
survivable.

### ⚠ 6.5 MB, in as it arrived

The file is **6.5 MB**. Everything else that ships put together is 1.37 MB.

It is a near-flat cream gradient displayed at about 512px, so essentially all of
that is headroom. On 09-07 this project spent a day taking the payload from
3.9 MB to 1.37 MB and called the remaining SVG swap "the only real win left".
This puts it at **7.9 MB** — worse than the day that work started, and it makes
the SVG face the second-biggest win rather than the first.

Not compressed, because that was not what was asked for, and it is a drop-in:
nothing in the CSS or the JS depends on the file's pixel size.

### A note on how the browser pane behaved

Screenshots taken inside a `browser_batch` came back **one frame stale** — twice
a change was verified as applied in the DOM and the picture still showed the
state before it. Taking the screenshot as its own call after the change shows
the truth. Worth knowing before concluding from a batched screenshot that an
edit did nothing.

---

## 2026-09-21 — the flip came out, and the card got the plate's proportions

Two unrelated pieces of work. Production only; the labs were not touched.

### Click-to-flip was removed, and kept

The client's call. It went in on 09-10 and came out eleven days later, on the
one condition that it be recoverable: *"keep the code and logic for rotation in
a backup file to reference later and remove it from main."*

**Which rotation mattered, because there were two.** The medallion carries a
cursor tilt and carried a click-to-flip, and both are rotation. Asked rather
than guessed. **The tilt stays** and is now the only rotation in the overlay.

Out of `lsa-experience.js`: the back face and its `back.png`, `setFlip()` and
the `flipped` flag, `applyCoinSqueeze()`, `overMedal()`, the click branch, the
`resetScene()` line, `coinTune.thin` and `.hold`, and the two squeeze sliders.
Out of `lsa-experience.css`: `.lsa-coin-back`, `@keyframes lsa-coin-thin`,
`.lsa-medal-depth--flip`, the 0.9s transition on `.lsa-medal-coin`, and
`backface-visibility` on `.lsa-medal-face`.

**`lab/medal-flip.reference.md` holds all of it verbatim**, with the wiring
notes and the three findings worth keeping — that the rim is 68 pictures rather
than geometry and combs apart edge-on, that the squeeze has to lead the
rotation rather than mirror it, and that `void medalDepth.offsetWidth` is what
makes a second flip inside 0.9s replay the squeeze.

**Two wrapper divs were kept rather than flattened.** `.lsa-medal-coin` and
`.lsa-medal-depth` are inert now — no transform, no transition, no animation —
but the whole coin hangs off their `preserve-3d`, and pulling them out means
re-parenting 70 elements for nothing anyone can see. They are also exactly
where the flip goes if it comes back.

**The rim is still 68 layers and no longer needs to be.** The count went 34 → 68
on 09-10 *because* the flip turned the coin through 90 degrees, where every
slice is edge-on. At the tilt's ~34 degrees, 34 layers was compared and judged
identical. So 34 would now halve the compositing for no visible change — left
alone because that judgement was made against a black card and the card is
cream now, and nobody has looked since. Written into the code where the
constant lives.

**The comment-close bug caught me again.** A `*/` added mid-edit closed a
comment four lines early and the prose below it became code. `node --check`
found it in one run. That is five times in this project now, and the fix is the
same as it has always been: never let a closing `*/` land in the middle of a
block you are rewriting.

### The card now has the plate's proportions

`card-back.png` is 3200×2160 — a landscape **1.4815**. The card was sizing
itself from its contents at **464×566**, a portrait 0.82, and
`background-size: 100% 100%` was stretching the artwork across that. The plate
was rendering **1.8× taller than it was drawn**, and the 16px rim came out
2.6px at the sides against 3.9px top and bottom.

**`aspect-ratio` alone does nothing here, and that was worth finding out by
trying it.** With both width and height auto, an absolutely-positioned
shrink-to-fit box ignores it — measured at 0.82 with the property applied. One
axis has to be definite.

The first fix sized the box from the content: **860×580.5**, where 860 was
measured as the narrowest width at which a three-line sentence still fits under
the ratio. At 820 the three-line case silently broke it back to 1.449. That
version lasted about an hour before the numbers were replaced by hand.

**It is 800×540 now**, which is the plate's ratio to four decimal places, with
**24px padding** and the sentence at **20px**. The rim is an even ~4px all
round.

**The medallion went to 374×375 and came back to 320×321.** 374 was derived —
the tallest coin that still clears a three-line sentence in the new inner box,
with one pixel to spare. It was looked at and called back the same day.

⚠ **The card's height is fixed now, so content that outgrows it overflows
rather than pushing the box.** Nothing warns you; the rim simply crosses the
sentence. At the current five numbers the column is 409px in a 492px inner box,
437px with a three-line name.

**The counter's aim followed the medallion on its own, both times.** It is
derived from `--lsa-medal-w` rather than written twice, so at 374 the count-up
rendered at 106.92px against the medal number's 106.95px, and back at 320 it is
91.52 against 91.51. ΔX 0.00px throughout.

**Left alone, and flagged:** `.lsa-card-text` still carries `max-width: 420px`,
tuned when the type was 24px. At 20px it breaks the sentence as "…on completing
5 years / with DBS."

---

## 2026-09-30 — silver medal, silver card, shorter charge

Five changes, all in production, each one asked for and done on its own.

### A new medal: Front.png and Stack.png

The brown face and rim were replaced by silver artwork. `Front.png` is the face
and `Stack.png` is the rim, stacked 68 times as before. Two lines in
`lsa-experience.js` and the hosting note in `lsa-mount.html`. The old files are
still on disk and nothing loads them.

`Front.png` is 2250×2260, the same as the old face, so it dropped into the same
box. `Stack.png` is 2250×2248, 12px shorter, so the rim is stretched very
slightly. The 0.992 shrink on the face was measured for the OLD rim and has not
been re-checked.

### The number on the medal went grey

`#A0A0A0 → #949494`, sampled off the new face's own "Years" (`#949494` to
`#9D9D9D`). Angle and stops unchanged. The number's position and size were
measured on the brown face and not re-measured; by eye it sits right.

### The sparkle on the number was removed

The user's call. All of it: the canvas, `sparkleTune`, the draw and timing
code, the `fw.onBurst` arming line, the `resetScene()` lines, the seven
sliders, the CSS rule and `__lsaDev.sparkle`. About 15 KB of code. Verified: a
full run has no errors, the stylesheet still parses with `lsa-charge-pop`, and
no `.lsa-medal-sparkle` node exists. It is in git at `93a56bd`.

### The charge is spread evenly from 4s to 10s

The old model was 800ms per number, which ran 4.0s at 5 years to 14.4s at 50.
The ask was a 4s minimum and a 10s maximum. Two ways were offered:

- **Cap at 10s** and keep 800ms a number. Rejected: 25 to 50 would all take the
  same 10s, so bigger awards stop feeling bigger.
- **Spread evenly**, 4s at 5 to 10s at 50, about 0.67s per milestone, with the
  gap per number worked out from that. **Chosen.**

The catch, told to the user before they chose: the gap between numbers is no
longer the same at every milestone. It is 800ms at 5, 467ms at 10 and 556ms at
50. That undoes the 09-04 request to keep it constant, knowingly.

`chargeTune.stepMs` is gone; `minS` 4 and `maxS` 10 replace it. Measured by
holding once per milestone: 4.02, 4.68, 5.33, 6.02, 6.68, 7.33, 8.02, 8.68,
9.35, 10.00s. The blur swap still fits: its 250ms cap binds even at 467ms.

`lab/charge-test.html` still runs the old 800ms.

### The card plate went silver: Backs.png

Replaces `card-back.png`. Same 3200×2160, so the card's 800×540 still matches
and nothing is stretched. 3.1 MB against the old 6.5 MB.

### Payload

5.5 MB, down from 7.9. `Backs.png` and `Front.png` are 85% of it and neither
is compressed.

---

## 2026-09-30 (later) — the medal lab, and a texture that follows the cursor

### A separate lab for the medal

`lab/medal-lab/` — `index.html`, `medal-lab.css`, `medal-lab.js`. The medal
alone on a white page: no card, no sentence, no veil, no fireworks. The medal,
its 68-layer rim, the number and the cursor tilt were copied from production
with the same values and the same `lsa-` class names, so anything built there
carries back without renaming.

It runs from a second `launch.json` entry, `medal-lab`, on port **8127**,
because another chat's server holds 8126. Open
`http://localhost:8127/lab/medal-lab/index.html` — the bundled server does not
serve a folder's `index.html` on its own, so the bare folder URL is a 404.

### The face is medal.svg

Swapped for `Front.png`. Its 563×565 viewBox is `Front.png` at a quarter, so it
fills the same 320×321 box with no CSS change. The SVG has "Years" and no
number, so the DOM number still sits on top as before.

**It is inlined, not an `<img>`.** The ask was to target a layer inside it named
"image", and an SVG in an `<img>` is a closed document. It is fetched and
written into a `<div>` instead. The "image" layer turned out to be a circle
filled by a pattern that holds an embedded PNG of brushed metal; the circle is
tagged `.lsa-medal-image`.

### The texture turns and fades

- **It turns its darkest wedge toward the cursor**, since that is the side of
  the medal tipping away. The wedge sits at ~105° at rest, found by averaging
  brightness around the embedded PNG rather than guessed. The user's example
  of −90° assumed a wedge at the top; this one starts at the right, so cursor
  left is −195°.
- **Its opacity follows the tilt strength**: 0 at the far corner, 1 at the
  medal's edge, back to 0 over the medal's centre where the lean flattens.

**Checked by looking, not only by numbers.** The first screenshots showed no
texture at all and suggested the rotate had broken it. It had not: filling the
circle red showed it drawing, and hiding the two SVG layers above it showed the
brushed metal with its dark wedge on the left. **Those two layers — radial lines
and the centre glow — cover most of the texture**, which is why it read as
lace and why the effect is quieter than it sounds. Offered to change the
layering; not answered.

### Ported to production

The same code went into `lsa-experience.js` and `lsa-experience.css` as it ran
in the lab. The card, the sentence and the background stay in production —
removing them was lab-only. `lsa-mount.html`'s hosting note now lists
`medal.svg` in place of `Front.png`.

⚠ **New integration risk:** `fetch()` is under the page's CSP `connect-src`,
which an `<img>` never was. If Liferay blocks it the face is blank.

### The card plate is Backl.png

Replaces `Backs.png`. Same 3200×2160, so nothing stretches. 2.7 MB,
uncompressed.

### Payload

**3.9 MB**, down from 5.5. `Backl.png` is 70% of it.

---

## 2026-09-30 (latest) — diamonds on the ring

The medal now carries one diamond for every 5 years: 1 at 5, 10 at 50. The
count and layout come from a reference sheet of all ten medals the user sent,
where dots under "Years" grow by one per milestone.

### How they are placed

`drawDiamonds()` in `lsa-experience.js`. One formula, no table: centred on
straight down, 18° apart, each diamond's centre on the edge of `medal.svg`'s
inner disc, r 170. So half of every diamond sits on either side of the ring.
`setYears()` calls it, so the milestone picker changes the diamonds.

### It took three tries

- **r 191.25, the middle of the band.** The diamond is 42 and the band 42.5, so
  it fitted neatly, but it put the stones fully out in the band. The user said
  it sat below the ring.
- **Moved straight up by 21.** Still wrong. The ring curves, so a vertical
  nudge only suits the bottom diamond.
- **r 170, the ring's own edge.** Right. Checked by eye at 50 years in the
  browser. **Confirmed by the user.**

### Still open

- `assets/diamond.svg` is not yet in `lsa-mount.html`'s hosting list.
- The 18° spacing was measured off a small reference image.
- `diamond.svg` draws its ring gradient with a Figma `foreignObject`. Chrome
  shows it; other renderers may not.
