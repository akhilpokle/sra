/* ==========================================================================
   Long Service Award — 5 Year Milestone Overlay
   Behaviour for an overlay that shares the live Liferay intranet page.
   --------------------------------------------------------------------------
   SAFETY CONTRACT — do not break these rules:

   1. Everything lives inside the IIFE below. No global variables, no global
      function names, no properties added to window.
   2. No monkey-patching of built-ins or of anything Liferay owns.
   3. Every addEventListener must have a matching removeEventListener in the
      teardown path, and the requestAnimationFrame loop must be cancelled.
   4. Loaded as an external file — this project uses no inline <script>,
      because the target page enforces a Content Security Policy.

   Scope: desktop only, viewport width >= 1024px. Below that the script must
   do nothing at all: no DOM insertion, no listeners, no storage writes.
   --------------------------------------------------------------------------
   The fireworks themselves are NOT in this file. They are in
   fireworks-engine-2.js — ENGINE 2, the light one — which must be loaded
   before this one, and which lab/fireworks-lab-2.html drives from the same
   source. There is no second copy of the engine to keep in step.

   What this file owns is the show: the overlay chrome, the GO sequence, the
   tuned `cfg`, and the teardown path.

   ** ANY CHANGE TO HOW THE FIREWORKS THEMSELVES BEHAVE BELONGS IN THE ENGINE,
   NOT HERE. ** Physics, rendering, the trail, the glow, the flash, the rocket —
   all of it lives in fireworks-engine-2.js, and editing it there means the lab
   is running the change too, immediately, with nothing to sync. Adding any of
   it to this file recreates the exact duplication that cost this project its
   burst shapes and sub-blasts: they went into the lab and never reached
   production, and nothing flagged it for two commits.

   --------------------------------------------------------------------------
   MOVED FROM ENGINE 1 TO ENGINE 2. This overlay used to run
   fireworks-engine.js. Four things went with the swap, because engine 2 does
   not have them, and none of them were being tuned in the show:

     smoke            the haze behind a burst
     the centre glow  cfg.core — the small white ball at the break. NOT the
                      flash; the flash came across and is cfg.blast.
     burst shapes     ring / star burst / concentric / squiggle. Production
                      only ever ran `normal`, which is engine 2's only mode.
     sub-blasts       the second break. Production had them switched off.

   Engine 1 and its lab are untouched and still on disk, so this is reversible:
   swap the script tag back and restore the previous `cfg` from git.

   --------------------------------------------------------------------------
   `cfg` here IS the engine's config object, not a copy of it. Engine 2 takes a
   deep copy of whatever it is handed at construction, so the object this file
   builds is NOT the one the engine reads — `cfg` is reassigned to `fw.cfg`
   immediately after the constructor, and everything below edits that. Skipping
   the reassignment gives you a panel whose sliders move and change nothing.

   Anything tuned in the dev panel leaves through Copy config, which serialises
   `cfg` to JSON — paste it back over the literal below to keep it. Engine 2 has
   no serialiser of its own (it is deliberately the light engine), so that one
   lives at the bottom of this file.

   One config value is what makes the engine behave as an overlay rather than a
   standalone stage — `background: null`. The lab composites onto an opaque
   fill, because additive blending needs real pixels underneath to add to. Here
   that fill would hide everything below it, so the composite clears to
   transparent instead and the browser layers the result over what follows.

   --------------------------------------------------------------------------
   THE FIVE LAYERS, front to back. Built here, ordered by z-index in the CSS:

     1  fireworks   .lsa-canvas    z 3   transparent composite, always on top
     2  black       .lsa-black     z 2   opaque; the show clears it in thirds
     3  card        .lsa-card      z 1   medallion + message, never fades
     4  blue        .lsa-backdrop  z 0   blurred veil, constant throughout
     5  intranet    —                    the live page, behind .lsa-root

   The order is the design: the fireworks sit in FRONT of the black, so they
   burn at full brightness against it while the card behind it is hidden. Each
   burst clears a third of the black, and the card emerges from behind it. Move
   the black above the canvas and it dims the fireworks too, which is the exact
   opposite of the intent.
   ========================================================================== */

(function () {
  'use strict';

  var MIN_WIDTH = 1024;

  if (window.innerWidth < MIN_WIDTH) return;

  /* The two values the card is personalised with, one line each, referenced in
     exactly one place below. Retargeting the overlay at a different person or
     milestone is a text edit here and nothing else.

     If Liferay ever renders these server-side, read them off #lsa-mount at
     this point instead — nothing further down cares where they came from. */
  var NAME = 'Akhil';
  var YEARS = 5;

  /* Where the medallion images live, resolved against the PAGE — not against
     this script, which is not how img.src works. Swap this for the hosted path
     the same way lsa-mount.html's REPLACE_WITH_ASSET_PATH placeholders are
     swapped.

     shimmer.png is deliberately absent: it is a mask-image in the stylesheet,
     which resolves against the CSS file instead and so needs no path here. */
  var ASSET_PATH = 'assets/';

  // "Show once" gating is intentionally NOT done here. Per project decision,
  // that flag must be set and checked on the backend (e.g. a per-user "has
  // seen LSA 5yr experience" flag). Until that's wired up, this experience
  // plays on every page load. See handoff.md -> "Once-only flag".

  var root = document.createElement('div');
  root.className = 'lsa-root';

  // The overlay itself: a blurred gradient veil over whatever the page is
  // showing underneath.
  var backdrop = document.createElement('div');
  backdrop.className = 'lsa-backdrop';
  root.appendChild(backdrop);

  var canvas = document.createElement('canvas');
  canvas.className = 'lsa-canvas';
  root.appendChild(canvas);

  /* ---- The congratulation card ----------------------------------------
     Built hidden. The GO sequence brings it up in three steps, one per burst
     moment — see stepReveal() further down. */

  var card = document.createElement('div');
  card.className = 'lsa-card';

  var medalScene = document.createElement('div');
  medalScene.className = 'lsa-medal-scene';

  var medalCoin = document.createElement('div');
  medalCoin.className = 'lsa-medal-coin';

  var coinFront = document.createElement('div');
  coinFront.className = 'lsa-medal-face lsa-coin-front';

  var medalImg = document.createElement('img');
  medalImg.className = 'lsa-medal-img';
  medalImg.src = ASSET_PATH + 'medal.svg';
  medalImg.alt = '';
  coinFront.appendChild(medalImg);

  var shimmer = document.createElement('div');
  shimmer.className = 'lsa-medal-shimmer';
  coinFront.appendChild(shimmer);

  medalCoin.appendChild(coinFront);
  medalScene.appendChild(medalCoin);
  card.appendChild(medalScene);

  var cardText = document.createElement('p');
  cardText.className = 'lsa-card-text';
  cardText.textContent =
    'Congratulation ' + NAME + ' on completing ' + YEARS + ' years with DBS.';
  card.appendChild(cardText);

  root.appendChild(card);

  /* Thickness, faked. There is no real geometry in the medallion: EDGE_COUNT
     copies of the textless silhouette are stacked along Z, and off-axis the
     slices read as one solid rim. The front face is then pushed out far enough
     to cap the stack.

     Raising EDGE_STEP without raising EDGE_COUNT opens visible gaps between
     the slices. More layers is a smoother rim at more compositing cost. */
  var EDGE_COUNT = 34;
  var EDGE_STEP = 1.2;    // px between layers; 34 x 1.2 gives ~40.8px of depth

  for (var e = 0; e < EDGE_COUNT; e++) {
    var edge = document.createElement('div');
    edge.className = 'lsa-coin-edge';

    var edgeImg = document.createElement('img');
    // Textless on purpose: edge layers are seen from both sides, so any
    // lettering would read mirrored from behind.
    edgeImg.src = ASSET_PATH + 'medal-edge.svg';
    edgeImg.alt = '';
    edge.appendChild(edgeImg);

    edge.style.transform =
      'translateZ(' + ((e - EDGE_COUNT / 2) * EDGE_STEP) + 'px)';
    medalCoin.appendChild(edge);
  }

  // DERIVED, never hardcoded: change either constant above and the face
  // follows the stack instead of ending up buried inside it.
  coinFront.style.transform =
    'translateZ(' + ((EDGE_COUNT / 2) * EDGE_STEP) + 'px)';

  /* Tilt is written on the PERSPECTIVE ROOT, which rotates the whole 3D
     subtree as one rigid body under a fixed perspective. That is what makes it
     feel like an object being turned rather than a picture being spun. The
     0.15s transition on that element in the CSS is where the lag comes from.

     There is no click-to-flip, so back.png goes unused and .lsa-coin-back is
     never built. */
  var MAX_TILT = 25;      // degrees of lean at the edge of the element

  /* The listener is on the ROOT, not on the medallion.

     The card sits UNDER the canvas so the fireworks burst over it, which means
     the medallion never receives a mouse event of its own and mouseenter /
     mouseleave never fire on it. So "is the cursor on the medal" is answered
     from geometry instead: mousemove bubbles up from the canvas to the root,
     and the cursor is tested against the medallion's own rect.

     One listener for the whole stage, which is also what the overlay used to
     do when it had cursor sparks. */
  var medalHot = false;   // whether the cursor was over the medal last move

  function onStageMove(ev) {
    var r = medalScene.getBoundingClientRect();

    // Cursor offset from the centre, normalised so that the edges of the
    // element are exactly -1 and +1 — which makes the containment test below
    // free rather than a second set of comparisons against the rect.
    var dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
    var dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);

    if (dx < -1 || dx > 1 || dy < -1 || dy > 1) {
      // Guarded so leaving writes the reset once, rather than on every move
      // across the rest of the stage.
      if (medalHot) {
        medalHot = false;
        medalScene.style.transform = 'rotateX(0deg) rotateY(0deg)';
        shimmer.style.opacity = '0';
      }
      return;
    }
    medalHot = true;

    // Y inverted, so the medal leans TOWARD the cursor rather than away.
    medalScene.style.transform =
      'rotateX(' + (-dy * MAX_TILT) + 'deg) rotateY(' + (dx * MAX_TILT) + 'deg)';

    // The highlight tracks the raw cursor position as a percentage of the
    // element, which the stylesheet reads as the mask's position.
    shimmer.style.setProperty('--lsa-sx',
      ((ev.clientX - r.left) / r.width) * 100 + '%');
    shimmer.style.setProperty('--lsa-sy',
      ((ev.clientY - r.top) / r.height) * 100 + '%');
    shimmer.style.opacity = '1';
  }

  root.addEventListener('mousemove', onStageMove);

  /* Layer 2 — the black veil, sitting over the card and under the canvas.
     Starts opaque and is what the reveal fades; the card itself never moves.
     CSS-only, so there is nothing here for teardown to unwind. */
  var black = document.createElement('div');
  black.className = 'lsa-black';
  root.appendChild(black);

  var goBtn = document.createElement('button');
  goBtn.className = 'lsa-go';
  goBtn.type = 'button';
  goBtn.textContent = 'GO';
  goBtn.addEventListener('click', onGo);
  root.appendChild(goBtn);

  // Puts the stage back to how it opened so the show can be watched again.
  // Scene only — it touches nothing that has been tuned; see resetScene().
  var resetBtn = document.createElement('button');
  resetBtn.className = 'lsa-reset';
  resetBtn.type = 'button';
  resetBtn.textContent = 'RESET';
  resetBtn.addEventListener('click', resetScene);
  root.appendChild(resetBtn);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'lsa-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', teardown);
  root.appendChild(closeBtn);

  var previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  document.body.appendChild(root);

  /* ---- Config -----------------------------------------------------------
     The lab's settings, at the values it was left tuned to, plus the keys only
     this show uses. Anything the engine owns and this file does not restate is
     filled in from the engine's own defaults, so a value missing here means
     "whatever the lab's default is", not "unset".

     Read live — per frame, per spawn — rather than cached into locals, so
     changing a value at runtime changes the show while it is running. To
     re-tune, open the lab, tune, press Copy config, and paste the result over
     the engine-owned half of this object. */

  var cfg = {
    // Overall scale · multiplies burst spread and shard size together. Each
    // firework overrides it with its own `fireworkSize`, so this is what a
    // plain canvas click gets. The engine's scaleOf() takes spec.scale OR this,
    // never both, so raising it does not touch the five GO fireworks.
    scale: 1.55,

    // Transparent composite. The one value that makes this an overlay rather
    // than a stage — see the note at the top of the file.
    background: null,

    palette: 'fire',        // fire | blue | purple | random · click-bursts only

    // The burst
    count: 200,             // sparkles per burst
    explosionSize: 10,
    poolMax: 2000,

    // Physics — per-frame values, reference runs at 30fps
    gravity: 0.2,
    drag: 0.9,
    lifeDecay: 0.01,
    lifeSpread: 0.35,       // ± fraction of life, per sparkle

    // The sparks
    size: 1.6,              // px stroke width
    sizeSpread: 0.5,        // ± fraction of it, per sparkle

    // Trail & glow
    trailFade: 0.27,
    trailAlpha: 0.6,
    glowDownscale: 4,
    glowAlpha: 0.35,

    // Colour jitter
    jitterHue: 5,
    jitterSat: 10,
    jitterLight: 10,

    // rAF delta clamp, so a stalled tab resumes rather than teleports
    deltaCap: 0.064,

    /* ---- The flash --------------------------------------------------------
       The shell detonating: a bloom of light at the burst point that arrives
       `lead` ms before its own sparkles. Brought across from engine 1's
       `sphere without trails` pattern, where it was tuned.

       `stack` is the big blown-out white core. It is repeated additive fills,
       and it exists because `peak` cannot reach that on its own — every
       gradient stop's alpha clamps at 1, so `peak` stops doing anything at all
       above roughly 2.75. Leave it at 1 for the plain flash. */
    blast: {
      enabled: true,
      lead: 60,             // ms

      // SETTING · flash size. Radius of the bloom at the burst point, in px at
      // size 1. Each firework multiplies it by its own `fireworkSize`, so the
      // flash stays roughly as big as the burst it sits inside.
      //
      // The five values below are whole-show — they cannot be aimed at one
      // firework. peak, growth and stack are what BOTH lab 2 sessions asked
      // for. `radius` is no longer either of theirs: it has been halved from
      // their 200 in a dev-panel session, tuned against the black veil the
      // show now plays against rather than the blue one they used.
      radius: 100,
      peak: 0.6,
      rise: 0.06,           // s
      hold: 0.15,
      decay: 1.8,
      growth: 1.1,          // end radius as a multiple of the ignition radius
      stack: 2
    },

    /* ---- The rocket -------------------------------------------------------
       The shell on its way up. Its physics are the engine's; these are the
       only three values the show sets. */
    rocket: {
      size: 2,              // px · halved from the lab 2 sessions' 4
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's base lightness
    },

    /* ---- Secondary bursts -------------------------------------------------
       OFF. Stated here rather than left to fall through to the engine's own
       defaults, because the per-firework rows below now carry sub.* keys and a
       reader comparing the two should be able to see both ends.

       A shell is an ordinary sparkle whose LIFE is its fuse — it breaks when it
       dies. `enabled`, `count` and `delay` are per-firework (read at the first
       break); the three below them are whole-show, because they are read at the
       SECOND break, after that firework's settings window has closed. */
    sub: {
      enabled: false,
      count: 6,
      delay: 0.7,
      particles: 30,
      scale: 0.3,
      glow: true
    },

    /* ---- The GO sequence ------------------------------------------------
       Below here is this file's own, and the engine reads none of it. Colour
       sets are hue lists, in the same form as the engine's PALETTES. `white`
       is the fraction of a burst's sparkles drawn desaturated instead of
       taking a hue — hue alone cannot express white, since every sparkle
       otherwise gets the engine's base saturation. */
    goColors: {
      red:  { hues: [357, 352, 2], white: 0 },
      gold: { hues: [46, 51, 58], white: 0 },
      mix:  { hues: [357, 352, 46, 58], white: 0.33 }
    },

    /* SETTING · size of fireworks 1-5. One entry per firework, numbered left
       to right across the stage. The number multiplies burst spread, shard
       size and rocket size together — it is the lab's `scale` slider applied
       per firework instead of globally, so 2 is twice the spread AND twice
       the shard. The lab's slider runs 0.3 to 3. */
    fireworkSize: {
      1: 4.4,               // extreme left  · lab 2 tuning
      2: 4.4,               // left          · lab 2 tuning
      3: 5,                 // centre        · its own tuning, the biggest
      4: 4.4,               // right         · lab 2 tuning
      5: 4.4                // extreme right · lab 2 tuning
    },

    /* ---- Per-firework settings ------------------------------------------
       A key present here wins over the show's own value for that one firework;
       a key absent falls through to the show — see the fireworkCfg build
       below.

       These rows came back from the dev panel's Copy config, which dumps every
       control it has rather than only the differences, so each row is now
       FULL. That is fine and it is how a tuned config survives a reload — but
       it does mean a row no longer falls through for anything the panel knows
       about. Change a whole-show value above and these five keep their own
       copies of it until they are re-dumped.

       Fireworks 1, 2, 4 and 5 are identical; 3, the centre, differs — smaller
       shards, a wider spread and a shorter life.

       The lab's `scale` is not a key here: for a GO firework the engine reads
       `spec.scale`, which comes from `fireworkSize` above. cfg.scale is only
       ever read by canvas clicks. */
    fireworkCfg: {
      1: {
        'count': 200,
        'explosionSize': 10,
        'size': 0.5,
        'sizeSpread': 0.5,
        'lifeDecay': 0.024,
        'lifeSpread': 0.35,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      },
      2: {
        'count': 200,
        'explosionSize': 10,
        'size': 0.5,
        'sizeSpread': 0.5,
        'lifeDecay': 0.024,
        'lifeSpread': 0.35,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      },
      4: {
        'count': 200,
        'explosionSize': 10,
        'size': 0.5,
        'sizeSpread': 0.5,
        'lifeDecay': 0.024,
        'lifeSpread': 0.35,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      },
      5: {
        'count': 200,
        'explosionSize': 10,
        'size': 0.5,
        'sizeSpread': 0.5,
        'lifeDecay': 0.024,
        'lifeSpread': 0.35,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      },

      // The centre firework, tuned in its own session: the finer, tighter,
      // faster-dying one of the five.
      3: {
        'count': 200,
        'explosionSize': 14.5,
        'size': 0.2,
        'sizeSpread': 0.15,
        'lifeDecay': 0.035,
        'lifeSpread': 0.15,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      }
    },

    // Running order. `x` is a fraction of canvas width, `at` is ms from the
    // button press, and `n` is which firework this is — 1-5 left to right,
    // which is also the `fireworkSize` entry it takes its size from. Rows are
    // in launch order, not left-to-right order.
    goHeight: 0.38,         // burst height, fraction of canvas height
    goSequence: [
      { x: 0.10, at: 0,    color: 'red',  n: 1 },
      { x: 0.90, at: 0,    color: 'red',  n: 5 },
      { x: 0.30, at: 500,  color: 'gold', n: 2 },
      { x: 0.70, at: 500,  color: 'gold', n: 4 },
      { x: 0.50, at: 1000, color: 'mix',  n: 3 }
    ]
  };

  /* ---- The engine -------------------------------------------------------
     Owns the canvas from here: buffers, physics, rendering, and its own
     resize listeners. It deliberately does not start a loop — this file does,
     below, so that teardown can stop it. */

  var fw = Fireworks2(canvas, cfg);

  /* THE ONE LINE THAT MAKES THE PANEL WORK. Engine 2 deep-COPIES the config it
     is handed and fills its own defaults into the copy, so the literal above is
     not the object the engine reads. Point `cfg` at the engine's own, and every
     slider below — and every per-firework swap — reaches the running show.
     Without it they would all write to an object nothing consults. The
     show-only keys (goSequence, goColors, fireworkSize, goHeight) survive the
     copy untouched, since the engine only ever adds to what it is given. */
  cfg = fw.cfg;

  /* ==== Per-firework settings ==============================================

     `cfg` above is the whole show. This is the layer on top of it: one row per
     firework, holding the settings that firework runs instead.

     HOW IT WORKS, AND WHAT IT DELIBERATELY CANNOT DO.

     The engine has ONE config object and reads it live. It has no notion of a
     per-firework setting, and this file must not give it one — the engine is
     shared with the lab, and behaviour belongs in it, not here. So a firework's
     settings are written into `cfg` for the moment the engine reads them, and
     put straight back afterwards.

     That works only for values the engine reads AT THE BREAK — one instant, in
     `burst()` and the `spawnSparkles()` just behind it. Everything in the table
     below is one of those. Once a sparkle exists its pattern, colour, size and
     lifetime are already fixed, and the engine never consults the config about
     it again, so restoring the values cannot disturb it.

     It does NOT work for values the engine re-reads every frame while drawing,
     because those apply to the whole canvas at once — to every firework in the
     air, not just the one that owns them. Everything in that category is in
     SHOW_SETTINGS instead, under a note saying so:

       gravity, drag           integrated every frame, for every sparkle alive
       trailFade, trailAlpha   the trail buffer is one surface for the whole sky
       glowDownscale, glowAlpha    likewise the glow
       blast.radius/peak/rise/hold/decay/growth/stack
                               only `enabled` and `lead` are read AT the break;
                               the rest are read while the bloom is drawn, every
                               frame of its life
       rocket.*                read at LAUNCH, which is a different instant from
                               the break the windows are built around
       palette, scale, background, deltaCap
                               whole-show by nature

     Making any of those per-firework is an engine change, not something this
     file can reach.

     Two things are per-firework ALREADY and are not in this table, because they
     never needed to be: COLOUR, which rides on each firework's own spec
     (`goColors` -> `goSequence[].color`), and SIZE (`fireworkSize`). The panel
     lists both alongside the rest, since from the outside they are the same
     kind of knob.

     A canvas click is unaffected by any of this. It launches with no spec and
     no window, so it always runs the show's own `cfg` — which is what makes it
     useful for judging the base look.
     ====================================================================== */

  var FIREWORK_SETTINGS = [
    { head: 'Colour and size' },
    { kind: 'color', label: 'Colour set' },
    { kind: 'size', label: 'Size', min: 0.3, max: 5, step: 0.05 },

    { head: 'Sparkles' },
    { path: 'count', label: 'How many', min: 20, max: 600, step: 10 },
    { path: 'explosionSize', label: 'How far they fly', min: 1, max: 30, step: 0.5 },
    { path: 'size', label: 'Sparkle thickness', min: 0.2, max: 6, step: 0.1 },
    { path: 'sizeSpread', label: 'Thickness variety', min: 0, max: 1, step: 0.05 },

    // Engine 2 expresses lifetime as a decay rate plus a spread, where engine 1
    // had a shortest/longest pair. Both are read in spawn(), so both are still
    // legal per firework — it is the same knob in a different form.
    { path: 'lifeDecay', label: 'How fast they die', min: 0.002, max: 0.05, step: 0.001 },
    { path: 'lifeSpread', label: 'Lifetime variety', min: 0, max: 0.9, step: 0.05 },

    { head: 'Colour spread' },
    { path: 'jitterHue', label: 'Hue', min: 0, max: 60, step: 1 },
    { path: 'jitterSat', label: 'Saturation', min: 0, max: 60, step: 1 },
    { path: 'jitterLight', label: 'Lightness', min: 0, max: 60, step: 1 },

    // Only these two of the flash's nine values are read AT the break. The rest
    // are read every frame the bloom is drawn, so they are in SHOW_SETTINGS.
    { head: 'The flash' },
    { path: 'blast.enabled', label: 'Flash at the break', bool: true },
    { path: 'blast.lead', label: 'Flash leads by (ms)', min: 0, max: 300, step: 10 },

    /* Three of the six secondary-burst values are read at the FIRST break, in
       spawnSparkles(), which is inside this firework's settings window — so
       they can be aimed. The other three are read at the SECOND break, one fuse
       later and outside any window, and are in SHOW_SETTINGS. See the note
       there for what it would take to aim those too. */
    { head: 'Secondary bursts' },
    { path: 'sub.enabled', label: 'Break a second time', bool: true },
    { path: 'sub.count', label: 'How many break again', min: 1, max: 40, step: 1 },
    { path: 'sub.delay', label: 'Fuse (s)', min: 0.1, max: 2.5, step: 0.05 }
  ];

  /* Read every frame for the whole canvas, so they belong to the show and not
     to any one firework. Shown at the bottom of the panel, under a note that
     says as much.

     Between the two tables, every value engine 2 reads has a control. Nothing
     about the engine is tunable only by editing this file. */
  var SHOW_SETTINGS = [
    { head: 'Whole show' },
    { note: 'The engine reads these while it draws, for the whole canvas at ' +
            'once, so they cannot belong to one firework.' },
    { kind: 'global', path: 'palette', label: 'Colour set for clicks',
      options: ['fire', 'blue', 'purple', 'random'] },
    { kind: 'global', path: 'scale', label: 'Size for clicks', min: 0.3, max: 5, step: 0.05 },

    { head: 'The flash' },
    { kind: 'global', path: 'blast.radius', label: 'Flash size', min: 20, max: 400, step: 10 },
    { kind: 'global', path: 'blast.peak', label: 'How bright', min: 0, max: 3, step: 0.05 },
    { kind: 'global', path: 'blast.rise', label: 'Time to ignite (s)', min: 0.01, max: 0.5, step: 0.01 },
    { kind: 'global', path: 'blast.hold', label: 'Time at full (s)', min: 0, max: 1, step: 0.01 },
    { kind: 'global', path: 'blast.decay', label: 'Time fading (s)', min: 0.1, max: 5, step: 0.1 },
    { kind: 'global', path: 'blast.growth', label: 'Spread as it dies', min: 1, max: 4, step: 0.1 },
    { kind: 'global', path: 'blast.stack', label: 'Draw it on itself (x)', min: 1, max: 10, step: 1 },

    { head: 'Trail and glow' },
    { kind: 'global', path: 'trailFade', label: 'Trail fade', min: 0.005, max: 0.3, step: 0.005 },
    { kind: 'global', path: 'trailAlpha', label: 'Trail strength', min: 0, max: 1, step: 0.05 },
    { kind: 'global', path: 'glowDownscale', label: 'Glow squeeze', min: 1, max: 12, step: 1 },
    { kind: 'global', path: 'glowAlpha', label: 'Glow strength', min: 0, max: 2, step: 0.05 },

    { head: 'Physics' },
    { kind: 'global', path: 'gravity', label: 'Gravity', min: 0, max: 1, step: 0.01 },
    { kind: 'global', path: 'drag', label: 'Air resistance', min: 0.8, max: 1, step: 0.005 },
    { kind: 'global', path: 'poolMax', label: 'Max sparks on screen', min: 200, max: 4000, step: 100 },
    { kind: 'global', path: 'deltaCap', label: 'Longest frame (s)', min: 0.016, max: 0.25, step: 0.002 },

    /* Read at the SECOND break — one fuse after the window this firework owns
       has closed — so they belong to the show, not to a firework.

       Engine 1 solved this with a second settings window per firework, opened
       around `at + lead + delay` and widened by the fuse's own +/-15%. That
       window was dropped when the overlay moved to engine 2, which had no
       secondary bursts at the time. Restoring it is what these three would
       need to become per-firework; it is a change to buildBreaks(), not
       something the panel can reach. */
    { head: 'Secondary bursts (whole show)' },
    { kind: 'global', path: 'sub.particles', label: 'Sparkles from each', min: 5, max: 200, step: 5 },
    { kind: 'global', path: 'sub.scale', label: 'Size of each', min: 0.05, max: 1.5, step: 0.05 },
    { kind: 'global', path: 'sub.glow', label: 'Flash when they break', bool: true },

    // Read at LAUNCH, not at the break — a different instant from the one the
    // settings windows are built around, so these cannot be aimed either.
    { head: 'The rocket' },
    { kind: 'global', path: 'rocket.size', label: 'Rocket thickness', min: 1, max: 12, step: 0.5 },
    { kind: 'global', path: 'rocket.launchY', label: 'Launches from', min: 0.5, max: 1, step: 0.01 },
    { kind: 'global', path: 'rocket.light', label: 'How hot it burns', min: 50, max: 100, step: 1 }
  ];

  function readPath(o, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) o = o[parts[i]];
    return o;
  }

  function writePath(o, path, v) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }

  /* One row per firework, seeded from the show's own values so nothing looks
     any different until a control is moved.

     Built HERE, after Fireworks2() rather than inside the `cfg` literal above,
     for two reasons: `cfg` is not even the same object until the reassignment
     up there has run, and the engine fills its own defaults in at construction,
     so a row can read a value this file never restated.

     A `fireworkCfg` already on `cfg` — pasted back in from a Copy config — is
     kept and only filled out, never replaced. That is what lets a tuning
     session survive a reload, and it means adding a row to the table above
     takes its value from the show rather than arriving undefined in a config
     that predates it. */
  var pastedLooks = cfg.fireworkCfg || null;
  cfg.fireworkCfg = {};
  [1, 2, 3, 4, 5].forEach(function (n) {
    var prev = pastedLooks && pastedLooks[n];
    var look = {};
    FIREWORK_SETTINGS.forEach(function (f) {
      if (!f.path) return;
      look[f.path] = (prev && prev[f.path] !== undefined)
        ? prev[f.path]
        : readPath(cfg, f.path);
    });
    cfg.fireworkCfg[n] = look;
  });

  // The show's own values, held while a firework's are swapped in. Non-null
  // only inside a single update() call.
  var savedLook = null;

  function applyLook(n) {
    var look = cfg.fireworkCfg[n];
    if (!look || savedLook) return;
    savedLook = {};
    for (var k in look) {
      savedLook[k] = readPath(cfg, k);
      writePath(cfg, k, look[k]);
    }
  }

  function restoreLook() {
    if (!savedLook) return;
    for (var k in savedLook) writePath(cfg, k, savedLook[k]);
    savedLook = null;
  }

  /* ---- The GO sequence --------------------------------------------------
     Five fireworks in three waves. Runs on the rAF clock like everything
     else, not setTimeout, so it stays in step with the sim and pauses with a
     backgrounded tab instead of playing out unseen. */

  var scheduled = [];

  // When each firework's own settings have to be in place. See the block above
  // for why this is a set of time windows rather than something the engine is
  // told directly.
  var breaks = [];
  var breaksEnd = 0;
  var runClock = -1;      // seconds since GO; -1 between runs

  /* The card is revealed in steps, one per BURST MOMENT — by clearing a third
     of the black veil above it each time. The card itself never moves; see
     .lsa-black in the stylesheet for why only one of the two may fade.

     There are three moments, not five. goSequence launches 1+5 together, then
     2+4 together, then 3 alone, and every rocket rises the same height — so
     each pair breaks on the same frame and the five fireworks produce three
     distinct instants. The times are collected in buildBreaks() below, where
     the apex is already solved for the settings windows; nothing here solves
     it a second time.

     ONE-WAY within a run: a second GO does not restore the veil and replay the
     reveal, so once the card is out it stays out. RESET is the only thing that
     puts it back — see resetScene(). */
  var REVEAL_STEPS = ['lsa-black--r1', 'lsa-black--r2', 'lsa-black--r3'];
  var revealAt = [];      // burst times in seconds since GO, ascending
  var revealed = 0;       // how many steps have been applied so far

  function stepReveal(t) {
    while (revealed < revealAt.length &&
           revealed < REVEAL_STEPS.length &&
           t >= revealAt[revealed]) {
      black.classList.add(REVEAL_STEPS[revealed]);
      revealed++;
    }
  }

  // Hanabi's constants are authored per frame at 30fps, and the engine converts
  // against that number at read time. Restated here only to solve the ascent
  // below. It is not a tunable: it must match the engine's own FPS_REF.
  var FPS_REF = 30;

  /* Slack around each window. The two ends need different amounts, and giving
     them the same was measured to make firework 4's window run 5ms into the
     second break of fireworks 1 and 5:

       IN   the frame between a rocket being queued below and the engine first
            integrating it, plus a frame of rounding.
       OUT  a frame. The trailing edge is already at an exact offset — the
            flash's `lead`, or the far end of the fuse jitter — so padding it
            as hard as the leading edge only widens the window into its
            neighbour for no benefit. */
  var BREAK_PAD_IN = 0.05;    // s
  var BREAK_PAD_OUT = 0.02;   // s

  function runSequence() {
    var w = canvas.clientWidth;
    var y = canvas.clientHeight * cfg.goHeight;

    scheduled.length = 0;
    cfg.goSequence.forEach(function (row) {
      var c = cfg.goColors[row.color];
      scheduled.push({
        t: row.at / 1000,
        x: row.x * w,
        y: y,
        // One spec per burst, carrying both its colour set and its size.
        // Size is read here, at press time, so editing cfg.fireworkSize
        // between runs takes effect without a reload.
        spec: { hues: c.hues, white: c.white, scale: cfg.fireworkSize[row.n] }
      });
    });

    buildBreaks(y);
    runClock = 0;
  }

  /* The windows in which each firework's settings have to be live.

     A rocket bursts at apex, and apex solves exactly: with no drag a shell
     launched at v rises v^2/2g, so v = sqrt(2*g*rise) and it turns over at
     t = v/g = sqrt(2*rise/g). Every rocket in the sequence rises the same
     height, so that is the same for all five and a firework's break time is
     just its launch time plus it. The engine solves the same thing when it
     launches; this mirrors the arithmetic rather than reaching into it.

     ONE window per firework, and it is not one instant: burst() reads the
     flash, then holds the sparkles back by blast.lead before spawnSparkles()
     reads the counts, the sizes and the lifetimes — so the window has to stay
     open across that lead.

     Engine 1 needed a second window per firework for sub-blasts, whose shells
     break a fuse later. Engine 2 has no sub-blasts, so that window is gone and
     a firework owns exactly one. */
  function buildBreaks(targetY) {
    var g = cfg.gravity * FPS_REF * FPS_REF;
    var rise = Math.max(1, canvas.clientHeight * cfg.rocket.launchY - targetY);
    var apex = Math.sqrt(2 * rise / g);

    breaks.length = 0;
    breaksEnd = 0;
    revealAt.length = 0;

    cfg.goSequence.forEach(function (row) {
      var at = row.at / 1000 + apex;

      /* Collected BEFORE the settings-window guard below: a row with no
         per-firework settings still bursts, and the reveal is about the burst,
         not about the window. Rows sharing an `at` run identical arithmetic
         and so produce an identical double, which is what makes the
         de-duplication exact rather than approximate. */
      if (revealAt.indexOf(at) < 0) revealAt.push(at);

      var look = cfg.fireworkCfg[row.n];
      if (!look) return;

      var lead = (look['blast.enabled'] ? look['blast.lead'] : 0) / 1000;

      breaks.push({ n: row.n, t0: at - BREAK_PAD_IN, t1: at + lead + BREAK_PAD_OUT });
    });

    revealAt.sort(function (a, b) { return a - b; });
    breaks.sort(function (a, b) { return a.t0 - b.t0; });
    for (var i = 0; i < breaks.length; i++) {
      if (breaks[i].t1 > breaksEnd) breaksEnd = breaks[i].t1;
    }
    warnOnOverlap();
  }

  /* Only one firework's settings can be in place at a time, so two fireworks
     needing theirs at once is a real conflict — the later one silently runs the
     earlier one's. Reported rather than hidden: the fix is a change to the
     sequence (space the launches) or to a fuse, both of which are the panel's
     business, not something this code should decide for anyone.

     Overlapping is NORMAL and harmless for most of this sequence: fireworks 1
     and 5 launch together and so break on the same frame, as do 2 and 4. Those
     pairs are meant to match, and while their settings do match there is
     nothing to lose. So the test is whether the two rows actually DIFFER, not
     whether they collide — otherwise every single run warns twice about the
     show working exactly as designed, and a warning that always fires is one
     nobody reads. */
  function looksDiffer(a, b) {
    var x = cfg.fireworkCfg[a];
    var y = cfg.fireworkCfg[b];
    if (a === b || !x || !y) return false;
    for (var k in x) if (x[k] !== y[k]) return true;
    return false;
  }

  function warnOnOverlap() {
    if (!window.console) return;
    // One message per pair, not per collision: a pair that clashes at its first
    // break usually clashes at its second one too, and saying so twice makes it
    // read as two separate problems.
    var said = {};
    for (var i = 1; i < breaks.length; i++) {
      var prev = breaks[i - 1];
      var cur = breaks[i];
      var pair = prev.n + '-' + cur.n;
      if (cur.t0 < prev.t1 && !said[pair] && looksDiffer(prev.n, cur.n)) {
        said[pair] = true;
        console.warn('[lsa] fireworks ' + prev.n + ' and ' + cur.n + ' need their ' +
                     'settings at the same moment, so ' + cur.n + ' will run ' +
                     prev.n + "'s. Space the sequence out, or shorten a fuse.");
      }
    }
  }

  // Whose settings belong to the frame spanning [t0, t1), if anyone's.
  function breakDuring(t0, t1) {
    for (var i = 0; i < breaks.length; i++) {
      if (t1 > breaks[i].t0 && t0 < breaks[i].t1) return breaks[i].n;
    }
    return 0;
  }

  function updateSequence(dt) {
    for (var i = scheduled.length - 1; i >= 0; i--) {
      var q = scheduled[i];
      q.t -= dt;
      if (q.t <= 0) {
        scheduled[i] = scheduled[scheduled.length - 1];
        scheduled.pop();
        // Each row launches a rocket; it bursts into that row's firework when
        // it reaches apex. `at` is therefore the launch time — every rocket
        // rises the same height, so it spaces the bursts identically.
        fw.launch(q.x, q.y, q.spec);
      }
    }
  }

  // Click launches a rocket that bursts where you clicked, rather than
  // bursting there outright — the lab had no ascent to exercise.
  function onCanvasClick(e) {
    var r = canvas.getBoundingClientRect();
    fw.launch(e.clientX - r.left, e.clientY - r.top);
  }
  canvas.addEventListener('click', onCanvasClick);

  // Disabled while the sequence is still playing, so a second press cannot
  // interleave a fresh run with the waves already in flight.
  function onGo() {
    if (scheduled.length) return;
    runSequence();
    goBtn.disabled = true;
  }

  /* ---- Reset ------------------------------------------------------------
     Puts the STAGE back to how it looked at mount: the veil opaque again, the
     card hidden behind it, nothing in flight, GO live. Safe to press at any
     point in a run, including mid-flight.

     ** IT DOES NOT TOUCH THE FIREWORK SETTINGS. ** `cfg`, `fireworkCfg`,
     `fireworkSize`, `goSequence`, `goColors` and everything the dev panel
     writes into are left exactly as tuned — this is a replay button, not a
     revert one. Anything added here that writes into `cfg` breaks that, and a
     tuning session with it.

     Putting `revealed` back to 0 is the one place the reveal's "one-way for
     the life of the overlay" rule is lifted, and deliberately so: a reset that
     left the card out would leave the next GO with nothing to reveal.

     The veil fades back in over its own 0.9s transition rather than snapping,
     because that transition is on .lsa-black and this only removes the
     classes. */
  function resetScene() {
    // Particles, rockets, blasts, queued bursts and all four buffers.
    fw.clear();

    scheduled.length = 0;
    breaks.length = 0;
    revealAt.length = 0;
    breaksEnd = 0;
    runClock = -1;

    for (var i = 0; i < REVEAL_STEPS.length; i++) {
      black.classList.remove(REVEAL_STEPS[i]);
    }
    revealed = 0;

    goBtn.disabled = false;
  }

  // ---- Loop ----
  var last = performance.now();
  var rafId = requestAnimationFrame(tick);

  function tick(now) {
    // Capped so a stalled tab resumes instead of teleporting every particle.
    var dt = Math.min((now - last) / 1000, cfg.deltaCap);
    last = now;
    frame(dt);
    rafId = requestAnimationFrame(tick);
  }

  /* One frame of the show, split out from the rAF loop above so that the dev
     hook's step() can drive the REAL frame rather than the engine's. Stepping
     the engine directly runs neither the GO sequence nor the per-firework
     settings, so it would exercise something the show never does. */
  function frame(dt) {
    /* A firework's own settings go in immediately before the engine reads them
       and come straight back out after, so they can only ever reach the break
       happening inside this one update() call — nothing drawn this frame, and
       no firework breaking on any other frame, ever sees them. This is the
       whole mechanism; see "Per-firework settings" above. */
    var look = runClock >= 0 ? breakDuring(runClock, runClock + dt) : 0;
    if (look) applyLook(look);

    fw.update(dt);

    if (look) restoreLook();

    /* The blue veil used to pull back to 60% here, detected off the first
       burst reaching fw.stats(). Removed with the black layer: that one is now
       the only thing that changes during the show.

       The lesson it was built on still applies to anything that replaces it —
       start on the first BREAK, never on the button press. The rocket climbs
       for over two seconds first, and dimming the page during the ascent reads
       as the overlay closing rather than as the sky lighting up. */

    if (runClock >= 0) {
      runClock += dt;

      /* Stepped BEFORE the reset below, not after. The last burst moment and
         breaksEnd are only a flash-lead plus a frame apart — inside a single
         capped delta — so a check that ran after the reset could find the
         clock already back at -1 and drop the final step. */
      stepReveal(runClock);

      if (runClock > breaksEnd) runClock = -1;
    }

    // After the engine, so a rocket launched on this frame is first integrated
    // on the next one — the same ordering the sequence has always had.
    updateSequence(dt);

    // The run is over once nothing is queued, the last rocket has burst, and
    // the last settings window has closed — a second break can still be owed
    // after the final rocket has gone, and re-arming before then would let a
    // fresh press rebuild the windows out from under it.
    // Deliberately not waiting on the sparkles: they hang for several seconds
    // after, and a replay overlapping those looks fine.
    if (goBtn.disabled && !scheduled.length && !fw.stats().rockets && runClock < 0) {
      goBtn.disabled = false;
    }

    fw.draw(dt);
  }

  /* ---- DEV CONTROL PANEL — never ships ----------------------------------
     Built only when the page opts in with data-lsa-dev, exactly like the
     __lsaDev hook below. The Liferay fragment does not set it, so on the
     intranet no panel is built and none of these listeners exist.

     Five tabs, one per firework, over the settings table above. A control
     writes into that firework's row rather than into `cfg` — the row is swapped
     into `cfg` for the frame its firework breaks on and swapped straight back,
     which is what keeps it to the one firework. The exceptions are the two
     things that were already per-firework (colour set, size), which write to
     `goSequence` and `fireworkSize` where they have always lived, and the
     "Whole show" section at the bottom, which writes into `cfg` directly
     because those values cannot be aimed at all.

     Both tables are the single source for the panel AND for what gets applied,
     so the two cannot drift apart. The lab remains the place for the trail,
     the smoke and the physics. */

  var devCleanup = [];

  function buildDevPanel() {
    var panel = document.createElement('div');
    panel.className = 'lsa-panel';

    var title = document.createElement('div');
    title.className = 'lsa-panel-title';
    title.textContent = 'Per-firework settings';
    panel.appendChild(title);

    // Which firework the controls edit. 1 is the far left of the stage, 5 the
    // far right — the same numbering fireworkSize and goSequence.n use.
    var current = 1;
    var tabBtns = [];

    var tabs = document.createElement('div');
    tabs.className = 'lsa-panel-tabs';
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'lsa-panel-tab';
      b.type = 'button';
      b.textContent = n;

      function onTab() { current = n; syncAll(); }
      b.addEventListener('click', onTab);
      devCleanup.push(function () { b.removeEventListener('click', onTab); });

      tabs.appendChild(b);
      tabBtns.push(b);
    });
    panel.appendChild(tabs);

    var body = document.createElement('div');
    panel.appendChild(body);

    var rows = [];

    function lookOf() { return cfg.fireworkCfg[current]; }

    // A firework's row in the running order, which is where its colour lives.
    function seqRowOf() {
      for (var i = 0; i < cfg.goSequence.length; i++) {
        if (cfg.goSequence[i].n === current) return cfg.goSequence[i];
      }
      return null;
    }

    function getVal(def) {
      if (def.kind === 'size') return cfg.fireworkSize[current];
      if (def.kind === 'global') return readPath(cfg, def.path);
      if (def.kind === 'color') { var r = seqRowOf(); return r ? r.color : ''; }
      return lookOf()[def.path];
    }

    function setVal(def, v) {
      if (def.kind === 'size') { cfg.fireworkSize[current] = v; return; }
      if (def.kind === 'global') { writePath(cfg, def.path, v); return; }
      if (def.kind === 'color') { var r = seqRowOf(); if (r) r.color = v; return; }
      lookOf()[def.path] = v;
    }

    function addRow(def) {
      if (def.head || def.note) {
        var el = document.createElement('div');
        el.className = def.head ? 'lsa-panel-head' : 'lsa-panel-note';
        el.textContent = def.head || def.note;
        body.appendChild(el);
        rows.push({ el: el, def: def, sync: function () {} });
        return;
      }

      var row = document.createElement('label');
      row.className = 'lsa-panel-row';

      var name = document.createElement('span');
      name.className = 'lsa-panel-label';
      name.textContent = def.label;
      row.appendChild(name);

      var out = null;
      var input;
      var picker = !!(def.options || def.kind === 'color');

      if (picker) {
        input = document.createElement('select');
        input.className = 'lsa-panel-select';
        // The colour sets are read off cfg.goColors rather than listed here,
        // so adding one there puts it in the dropdown with no change to this.
        var opts = def.options || Object.keys(cfg.goColors);
        opts.forEach(function (o) {
          var el = document.createElement('option');
          el.value = o;
          el.textContent = o;
          input.appendChild(el);
        });
        row.appendChild(input);
      } else if (def.bool) {
        input = document.createElement('input');
        input.className = 'lsa-panel-check';
        input.type = 'checkbox';
        row.appendChild(input);
      } else {
        out = document.createElement('span');
        out.className = 'lsa-panel-value';
        row.appendChild(out);

        input = document.createElement('input');
        input.className = 'lsa-panel-slider';
        input.type = 'range';
        input.min = def.min;
        input.max = def.max;
        input.step = def.step;
        row.appendChild(input);
      }

      var evt = (picker || def.bool) ? 'change' : 'input';

      function onInput() {
        var v;
        if (def.bool) v = input.checked;
        else if (picker) v = input.value;
        else { v = parseFloat(input.value); out.textContent = v; }
        setVal(def, v);

        // The one value the engine does not re-read while drawing: the glow
        // buffer is sized when it is ALLOCATED, so writing the config alone
        // leaves this slider moving and nothing changing. resize() re-checks
        // the downscale it built at and no-ops when nothing moved.
        if (def.path === 'glowDownscale') fw.resize();

        // Turning the flash off shortens this firework's settings window, since
        // the window has to span blast.lead and there is no lead without a
        // flash. Rebuilt on the next GO, so nothing to do here beyond the write.
      }
      input.addEventListener(evt, onInput);
      devCleanup.push(function () { input.removeEventListener(evt, onInput); });

      body.appendChild(row);

      rows.push({
        el: row,
        def: def,
        sync: function () {
          var v = getVal(def);
          if (def.bool) input.checked = !!v;
          else if (picker) input.value = v;
          else { input.value = v; out.textContent = v; }
        }
      });
    }

    FIREWORK_SETTINGS.concat(SHOW_SETTINGS).forEach(addRow);

    /* Re-reads every control from whichever firework is selected.

       Engine 1 also hid rows here — the shape-specific ones a pattern had no
       use for, via `showFor`. Engine 2 has no patterns, so every row applies to
       every firework and there is nothing left to hide. The .lsa-panel-off
       class it used is still in the CSS; nothing sets it now. */
    function syncAll() {
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].className = 'lsa-panel-tab' +
          (i + 1 === current ? ' lsa-panel-tab--on' : '');
      }

      for (var k = 0; k < rows.length; k++) rows[k].sync();
    }

    syncAll();

    /* The way a tuning session leaves the overlay. Without this, anything
       tuned here dies on reload: the sliders write into `cfg` in memory and
       nothing writes `cfg` back to disk.

       Engine 1 had exportConfig / copyText as statics and both its consumers
       called them. Engine 2 deliberately has neither — it is the light engine —
       so the serialiser is here, and it is a plain JSON dump because `cfg` is
       plain data throughout.

       It carries the WHOLE config, including the show-only keys the engine
       never reads: paste it back over the `cfg` literal at the top of this file
       to keep what you just tuned, `fireworkSize`, `fireworkCfg` and the GO
       sequence included. `fireworkCfg` is rebuilt from the show's own values at
       load, so pasting it back is the ONLY way per-firework settings survive a
       reload.

       There is no route into lab 2 from here: that lab has no paste box, since
       engine 2 has no parser to give it one. Values move the other way by hand. */
    function exportConfig() {
      return 'var cfg = ' + JSON.stringify(cfg, null, 2) + ';';
    }

    /* Clipboard, with a fallback. navigator.clipboard needs a secure context,
       and this page is often served over plain http on localhost — which does
       count as secure, but a hosted http demo does not, so the old route has to
       stay. The textarea is removed either way. */
    function copyText(text, done) {
      function legacy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.className = 'lsa-panel-clip';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { done(true); },
          function () { done(legacy()); }
        );
        return;
      }
      done(legacy());
    }

    var copyBtn = document.createElement('button');
    copyBtn.className = 'lsa-panel-copy';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy config';

    function onCopy() {
      copyText(exportConfig(), function (ok) {
        copyBtn.textContent = ok ? 'Copied' : 'Copy failed — see console';
        if (!ok) console.warn('[lsa] clipboard refused; config follows:\n' + exportConfig());
        setTimeout(function () { copyBtn.textContent = 'Copy config'; }, 1600);
      });
    }
    copyBtn.addEventListener('click', onCopy);
    devCleanup.push(function () { copyBtn.removeEventListener('click', onCopy); });

    panel.appendChild(copyBtn);

    root.appendChild(panel);
  }

  function teardown() {
    for (var i = 0; i < devCleanup.length; i++) devCleanup[i]();
    devCleanup.length = 0;
    closeBtn.removeEventListener('click', teardown);
    goBtn.removeEventListener('click', onGo);
    resetBtn.removeEventListener('click', resetScene);
    canvas.removeEventListener('click', onCanvasClick);
    root.removeEventListener('mousemove', onStageMove);
    cancelAnimationFrame(rafId);
    fw.destroy(); // the engine owns the resize listener and the observer
    root.remove();
    document.body.style.overflow = previousOverflow;
  }

  // ---- LOCAL DEV HOOK — inert in production -----------------------------
  // The one place this file touches `window`, and only when the page opts in
  // by putting data-lsa-dev on <html>. The Liferay markup does not, so on the
  // intranet this branch never runs and no global is ever created.
  if (document.documentElement.hasAttribute('data-lsa-dev')) {
    buildDevPanel();

    window.__lsaDev = {
      cfg: cfg,
      fw: fw,
      burst: fw.burst,
      launch: fw.launch,
      stats: fw.stats,
      go: onGo,
      // Runs frames synchronously. Only used to exercise the pipeline where
      // requestAnimationFrame does not fire; the real show never calls it.
      //
      // Drives the same frame() the rAF loop does, so the GO sequence counts
      // down and each firework's own settings are swapped in exactly as they
      // are in a live run. Stepping the engine instead (fw.debug.step) does
      // neither, and would quietly measure a different show.
      step: function (n, dt) {
        var d = dt || 1 / 60;
        for (var i = 0; i < (n || 1); i++) frame(d);
      }
    };
  }
})();
