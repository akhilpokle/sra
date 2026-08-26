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
   fireworks-engine.js, which must be loaded before this one, and which the
   fireworks lab (lab/fireworks-lab.html) drives from the same source. There is
   no second copy of the engine to keep in step.

   What this file owns is the show: the overlay chrome, the GO sequence, the
   tuned `cfg`, and the teardown path.

   ** ANY CHANGE TO HOW THE FIREWORKS THEMSELVES BEHAVE BELONGS IN THE ENGINE,
   NOT HERE. ** Physics, rendering, burst geometry, smoke, the rocket, the
   glows — all of it lives in fireworks-engine.js, and editing it there means
   the lab is running the change too, immediately, with nothing to sync. Adding
   any of it to this file recreates the exact duplication that cost this
   project its burst shapes and sub-blasts: they went into the lab and never
   reached production, and nothing flagged it for two commits.

   Values are the one thing that legitimately differs between the two, and they
   travel in both directions through the clipboard:

     lab -> here     tune in the lab, press Copy config, paste over `cfg`.
     here -> lab     tune in the dev panel, press Copy config, paste into the
                     lab's box and press Apply.

   Both buttons call the same serialiser in the engine.

   One config value is what makes the engine behave as an overlay rather than a
   standalone stage — `background: null`. The lab composites onto an opaque
   navy fill, because additive blending needs real pixels underneath to add to.
   Here that fill would hide the page and the backdrop behind it, so the
   composite clears to transparent instead and the browser composites the
   result over the backdrop.
   ========================================================================== */

(function () {
  'use strict';

  var MIN_WIDTH = 1024;

  if (window.innerWidth < MIN_WIDTH) return;

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

  var goBtn = document.createElement('button');
  goBtn.className = 'lsa-go';
  goBtn.type = 'button';
  goBtn.textContent = 'GO';
  goBtn.addEventListener('click', onGo);
  root.appendChild(goBtn);

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
    // Overall scale · multiplies burst spread and shard size together.
    scale: 1,

    // Transparent composite. The one value that makes this an overlay rather
    // than a stage — see the note at the top of the file.
    background: null,

    hanabi: {
      layer: 'composite',   // composite | particles | trail | glow | smoke
      palette: 'fire',      // fire | blue | purple | random

      // Burst
      count: 200,           // particles per burst
      explosionSize: 10,
      poolMax: 2000,

      // Physics — per-frame values, reference runs at 30fps
      gravity: 0.2,
      drag: 0.9,
      lifeDecay: 0.01,

      // Trail & glow
      trailFade: 0.05,
      trailAlpha: 0.6,
      glowDownscale: 4,

      // Colour jitter
      jitterHue: 5,
      jitterSat: 10,
      jitterLight: 10,

      smoke: {
        enabled: true,
        countMin: 12,
        countMax: 20,
        sizeMin: 3,
        sizeMax: 8,
        rise: 0.015,
        dragX: 0.95,
        dragY: 0.92,
        growth: 0.08,
        lifeDecay: 0.012,
        maxAlpha: 0.25
      }
    },

    // Per-second values · what Hanabi has no equivalent for
    confetti: {
      size: 1,              // shard size
      spin: 250,            // ±°/s

      massSpread: 0.33,
      flutter: 350,
      deltaCap: 0.064,

      // Lifetime spread
      fadeMin: 0.5,
      fadeMax: 2.5
    },

    // The shell detonating · neither library has this
    blast: {
      enabled: true,
      lead: 60,             // ms

      // SETTING · glow size. Radius of the white bloom at the burst point, in
      // px at size 1. Each firework multiplies it by its own `fireworkSize`,
      // so the glow stays roughly as big as the burst it sits inside.
      radius: 60,
      peak: 0.55,
      rise: 0.06,           // s
      hold: 0.15,
      decay: 1.8
    },

    /* ---- The centre glow --------------------------------------------------
       The hot white core a real shell leaves at the middle of its burst: a
       small blown-out ball of light, not the wide coloured wash `blast` puts
       behind everything. Fires the instant the shell breaks, with no `lead`
       offset: the core is the break, so there is nothing for it to arrive
       ahead of. */
    core: {
      enabled: true,
      radius: 22,           // px at size 1 · multiplied by the firework's size
      life: 0.45,           // s at size 1 · likewise, so big shells burn longer
      peak: 1,              // alpha at the instant it lights
      growth: 2.2,          // end radius as a multiple of the starting radius
      falloff: 2            // higher = snaps out faster after the initial flash
    },

    /* ---- The rocket -------------------------------------------------------
       The shell on its way up. Its physics are the engine's; these are the
       only three values the show sets. */
    rocket: {
      size: 5,              // px — a sparkle is 1-3
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's base lightness
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
      1: 1,                 // extreme left
      2: 1.5,               // left
      3: 2,                 // centre
      4: 1.5,               // right
      5: 1                  // extreme right
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

  var fw = Fireworks(canvas, cfg);

  /* ---- The GO sequence --------------------------------------------------
     Five fireworks in three waves. Runs on the rAF clock like everything
     else, not setTimeout, so it stays in step with the sim and pauses with a
     backgrounded tab instead of playing out unseen. */

  var scheduled = [];

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

  // ---- Loop ----
  var last = performance.now();
  var rafId = requestAnimationFrame(tick);

  function tick(now) {
    // Capped so a stalled tab resumes instead of teleporting every particle.
    var dt = Math.min((now - last) / 1000, cfg.confetti.deltaCap);
    last = now;

    fw.update(dt);

    // After the engine, so a rocket launched on this frame is first integrated
    // on the next one — the same ordering the sequence has always had.
    updateSequence(dt);

    // The run is over once nothing is queued and the last rocket has burst.
    // Deliberately not waiting on the sparkles: they hang for several seconds
    // after, and a replay overlapping those looks fine.
    if (goBtn.disabled && !scheduled.length && !fw.stats().rockets) {
      goBtn.disabled = false;
    }

    fw.draw(dt);

    rafId = requestAnimationFrame(tick);
  }

  /* ---- DEV CONTROL PANEL — never ships ----------------------------------
     Built only when the page opts in with data-lsa-dev, exactly like the
     __lsaDev hook below. The Liferay fragment does not set it, so on the
     intranet no panel is built and none of these listeners exist.

     Writes straight into `cfg`, which is read live per frame and per spawn,
     so a slider changes the next burst without a reload. For anything beyond
     these three, use the lab — it has a control for every value the engine
     reads, and a Copy config button to bring the result back here. */

  var devCleanup = [];

  function buildDevPanel() {
    var panel = document.createElement('div');
    panel.className = 'lsa-panel';

    var title = document.createElement('div');
    title.className = 'lsa-panel-title';
    title.textContent = 'Controls';
    panel.appendChild(title);

    function addSlider(label, min, max, step, get, set) {
      var row = document.createElement('label');
      row.className = 'lsa-panel-row';

      var name = document.createElement('span');
      name.className = 'lsa-panel-label';
      name.textContent = label;

      var out = document.createElement('span');
      out.className = 'lsa-panel-value';
      out.textContent = get();

      var input = document.createElement('input');
      input.className = 'lsa-panel-slider';
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = get();

      function onInput() {
        var v = parseFloat(input.value);
        set(v);
        out.textContent = v;
      }
      input.addEventListener('input', onInput);
      devCleanup.push(function () { input.removeEventListener('input', onInput); });

      row.appendChild(name);
      row.appendChild(out);
      row.appendChild(input);
      panel.appendChild(row);
    }

    // Setting 1 — one slider per firework, numbered left to right. Runs past
    // the lab's own 0.3-3 size slider, up to 5x.
    [1, 2, 3, 4, 5].forEach(function (n) {
      addSlider('Firework ' + n + ' size', 0.3, 5, 0.05,
        function () { return cfg.fireworkSize[n]; },
        function (v) { cfg.fireworkSize[n] = v; });
    });

    // Setting 2 — the coloured blast wash behind the burst.
    addSlider('Glow size', 20, 400, 10,
      function () { return cfg.blast.radius; },
      function (v) { cfg.blast.radius = v; });

    // Setting 3 — the white centre glow. Its own control, since it is a
    // separate system from the blast above. This is its size at firework
    // size 1; each firework multiplies it by its own size.
    addSlider('Centre glow size', 2, 120, 1,
      function () { return cfg.core.radius; },
      function (v) { cfg.core.radius = v; });

    /* The way a tuning session leaves the overlay. Without this, anything
       tuned here dies on reload: the sliders write into `cfg` in memory and
       nothing writes `cfg` back to disk.

       It carries the WHOLE config, including the show-only keys the engine
       never reads. Two destinations, and the extra keys matter to one of
       them:

         back into this file · paste over `cfg` to keep what you just tuned,
              `fireworkSize` and the GO sequence included.
         into the lab · paste into its box and press Apply. The lab takes only
              what it has a control for and ignores the rest, so the show-only
              keys — and `background: null`, which would strip the lab's night
              sky — are dropped on the way in. */
    var copyBtn = document.createElement('button');
    copyBtn.className = 'lsa-panel-copy';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy config';

    function onCopy() {
      Fireworks.copyText(Fireworks.exportConfig(cfg, 'overlay'), function (ok) {
        copyBtn.textContent = ok ? 'Copied' : 'Copy failed — see console';
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
    canvas.removeEventListener('click', onCanvasClick);
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
      // Runs frames synchronously. Only used to exercise the pipeline where
      // requestAnimationFrame does not fire; the real show never calls it.
      step: function (n, dt) {
        fw.debug.step(dt || 1 / 60, n || 1);
      }
    };
  }
})();
