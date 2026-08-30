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

- [ ] **Look at it.** The single most overdue item. Open
  https://akhilpokle.github.io/sra/ and confirm by eye: do 1× / 1.5× / 2× read
  as three distinct sizes; does the ~2.25 s ascent feel right; does the trail
  dissolve rather than snap; does the centre burst read as the finale. None of
  this can be settled numerically, and none of it has ever been seen.
- [ ] **Decide whether the card comes back.** It was removed in the clean-slate
  rebuild (#29). Nothing currently shows the employee's name or the milestone,
  so as it stands the overlay celebrates nothing in particular. If it returns,
  its reveal has to be designed against the GO sequence rather than the old
  generation cascade.
- [ ] **Milestone scaling, reopened.** The show is hard-wired to five fireworks.
  The old one-rocket-per-year model (#17) is gone along with `YEARS`. How
  10/15/20/25 should differ from 5 is an open design question again — and the
  ">25 years needs a different metaphor" problem from the previous round was
  never solved either.
- [ ] **Add the medallion.** Still blocked on client assets (Q-A), and now
  doubly: there is no card for it to live in.
- [ ] **Final Liferay asset paths** for `lsa-mount.html`'s three
  `REPLACE_WITH_ASSET_PATH` placeholders — the CSS, `fireworks-engine.js`, and
  `lsa-experience.js`, in that load order.
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

- **Never confirmed visually.** Every check in this project's history —
  physics, timing, colour, density, coverage — has been numeric, run through
  `window.__lsaDev` because the agent's browser pane cannot composite frames in
  this environment. The hosted Pages site finally makes a real look possible.
  **This is the largest open risk and has been carried, unresolved, through
  every round.**
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
