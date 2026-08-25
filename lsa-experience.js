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
   The fireworks engine below is the fireworks lab (lab/fireworks-lab.html on
   the fireworks-lab branch), brought over as-is. Its tuned values are in `cfg`.

   Exactly one thing had to change to work as an overlay rather than a
   standalone stage: the lab composites onto an opaque navy fill, because
   additive blending needs real pixels underneath to add to. Here that fill
   would hide the page and the backdrop behind it, so the composite clears to
   transparent instead and the browser composites the result over the backdrop.
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
  var ctx = canvas.getContext('2d');

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
     The lab's settings, at the values it was left tuned to. Read live (per
     frame / per spawn) rather than cached into locals, so changing a value at
     runtime changes the show while it is running. */

  var cfg = {
    // Overall scale · multiplies burst spread and shard size together.
    scale: 1,

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
      radius: 140,
      peak: 0.55,
      rise: 0.06,           // s
      hold: 0.15,
      decay: 1.8
    },

    /* ---- The rocket -------------------------------------------------------
       The shell on its way up: exactly one node, drawn the same way a sparkle
       is — a stroked segment from last frame's position to this one, into the
       same particle buffer — so it picks up the trail and the glow for free.
       Just bigger, and it does not wink: the cos(rot) flicker reads as a
       glint on a shard, but on a single climbing ember it reads as a fault.

       No drag, unlike the sparkles. Their heavy 0.9/frame damping is what
       makes a burst snap out and hang, but on the ascent it would eat the
       launch velocity and make the apex height unpredictable. Gravity alone
       means the launch speed can be solved exactly from the height wanted. */
    rocket: {
      size: 5,              // px — a sparkle is 1-3
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's BASE_LIGHT
    },

    /* ---- The GO sequence ------------------------------------------------
       Colour sets as hue lists, in the same form as PALETTES. `white` is the
       fraction of a burst's sparkles drawn desaturated instead of taking a
       hue — hue alone cannot express white, since every sparkle otherwise
       gets BASE_SAT. */
    goColors: {
      red:  { hues: [357, 352, 2], white: 0 },
      gold: { hues: [46, 51, 58], white: 0 },
      mix:  { hues: [357, 352, 46, 58], white: 0.33 }
    },

    // Running order. `x` is a fraction of canvas width, `at` is ms from the
    // button press, `scale` multiplies burst spread and shard size together
    // (the lab's own `scale`, applied per burst instead of globally).
    goHeight: 0.38,         // burst height, fraction of canvas height
    goSequence: [
      { x: 0.10, at: 0,    color: 'red',  scale: 1 },    // 1 extreme left
      { x: 0.90, at: 0,    color: 'red',  scale: 1 },    // 5 extreme right
      { x: 0.30, at: 500,  color: 'gold', scale: 1.5 },  // 2 left
      { x: 0.70, at: 500,  color: 'gold', scale: 1.5 },  // 4 right
      { x: 0.50, at: 1000, color: 'mix',  scale: 2 }     // 3 centre
    ]
  };

  /* ---- Buffers ----------------------------------------------------------
     Size the backing store to device pixels, not CSS pixels. Fireworks are
     judged on sharp single-pixel particles, so a half-resolution buffer being
     upscaled by the browser would soften everything.

       particleBuf  full res, cleared each frame. Feeds BOTH the trail and the
                    glow, so sparkles only have to be drawn once.
       trailBuf     full res, PERSISTENT — never cleared per frame, only faded.
       glowBuf      1/downscale res, smoothing OFF. The sparkle comes from
                    pixels being LOST in the downscale: which ones survive
                    changes frame to frame, so it twinkles without anything
                    being animated to twinkle.
       smokeBuf     half res — smoke is soft, so half res is invisible in the
                    result and saves a lot of fill on large displays. */

  var particleBuf = document.createElement('canvas');
  var particleCtx = particleBuf.getContext('2d');
  var trailBuf = document.createElement('canvas');
  var trailCtx = trailBuf.getContext('2d');
  var glowBuf = document.createElement('canvas');
  var glowCtx = glowBuf.getContext('2d');
  var smokeBuf = document.createElement('canvas');
  var smokeCtx = smokeBuf.getContext('2d');

  // One baked soft puff, blitted scaled. The reference builds a radial
  // gradient per particle per frame — 500 gradient objects a frame at its cap.
  // Same result, a fraction of the cost.
  var smokeSprite = document.createElement('canvas');
  (function () {
    var R = 32;
    smokeSprite.width = smokeSprite.height = R * 2;
    var g = smokeSprite.getContext('2d');
    var grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, 'rgba(180,180,180,1)');
    grad.addColorStop(1, 'rgba(180,180,180,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
  })();

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels

    // Resizing clears a buffer, so trail history is lost on resize.
    // Acceptable, and far simpler than preserving and rescaling it.
    particleBuf.width = canvas.width;
    particleBuf.height = canvas.height;
    particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    trailBuf.width = canvas.width;
    trailBuf.height = canvas.height;
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    smokeBuf.width = Math.max(1, Math.round(canvas.width / 2));
    smokeBuf.height = Math.max(1, Math.round(canvas.height / 2));
    smokeCtx.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0); // still addressed in CSS px

    sizeGlow();
  }

  // Kept in its own function because the downscale can change at runtime, so
  // the glow buffer can need resizing between frames, not just on resize.
  function sizeGlow() {
    var d = Math.max(1, Math.round(cfg.hanabi.glowDownscale));
    var gw = Math.max(1, Math.round(canvas.width / d));
    var gh = Math.max(1, Math.round(canvas.height / d));
    if (glowBuf.width !== gw || glowBuf.height !== gh) {
      glowBuf.width = gw;
      glowBuf.height = gh;
      // Setting width/height resets context state, so this must come after.
      glowCtx.imageSmoothingEnabled = false;
    }
  }

  var resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  /* ---- Engine ----------------------------------------------------------
     Hanabi's look, confetti.js's engine.

     THE CONVERSION: Hanabi's constants are PER FRAME at 30fps. This loop is
     delta-time integrated in seconds. So every Hanabi value is converted at
     read time against FPS_REF rather than being used raw — using them raw in
     a 60fps loop is exactly why the previous overlay fell twice too fast and
     its sparkles died three times too early.

         gravity   0.2  /frame^2  ->  x FPS_REF^2  ->  180 px/s^2
         drag      0.9  /frame    ->  pow(drag, dt * FPS_REF)
         life      0.01 /frame    ->  1/(0.01 * FPS_REF) = 3.33 s
         speed     10   /frame    ->  x FPS_REF        ->  300 px/s

     Confetti contributes what Hanabi has no equivalent for: mass variance,
     flutter, the delta cap, and a wide per-particle lifetime spread.

     Sanity check: terminal fall must land at ~55 px/s and must NOT change
     with framerate. */

  var FPS_REF = 30; // the framerate Hanabi's per-frame constants are authored at

  // Hanabi's palettes, as hue lists. Base saturation/lightness are NOT from the
  // reference — only its jitter ranges were recoverable — so these two are a
  // judgement call, picked to read as hot sparks rather than pastel.
  var PALETTES = {
    fire:   [357, 58, 46, 9, 352],
    blue:   [220, 200, 240, 180, 210],
    purple: [280, 300, 260, 320, 270]
  };
  var BASE_SAT = 90;
  var BASE_LIGHT = 62;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // `spec` is a burst's own colour set (see cfg.goColors). Without one this
  // falls back to cfg.hanabi.palette, which is what a plain click-to-burst
  // uses — the lab's behaviour, unchanged.
  function pickHue(spec) {
    var list;
    if (spec && spec.hues) {
      list = spec.hues;
    } else {
      var name = cfg.hanabi.palette;
      if (name === 'random') return Math.random() * 360;
      list = PALETTES[name] || PALETTES.fire;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  var particles = [];
  var pool = [];

  function spawn(x, y, vx, vy, life, spec) {
    if (particles.length >= cfg.hanabi.poolMax) return;
    var p = pool.pop() || {};
    p.x = x; p.y = y;
    p.px = x; p.py = y; // previous-frame position, for gap-free trail segments
    p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;

    // Confetti's mass trick: pieces fall at different rates, so the burst
    // stretches vertically instead of descending as one sheet. Centred on 1x
    // and deliberately decoupled from the size slider, so changing shard size
    // does not secretly change how fast everything falls. 0.33 reproduces
    // confetti's own 2-4 height range; 0 makes every particle fall alike.
    p.mass = 1 + (Math.random() - 0.5) * 2 * cfg.confetti.massSpread;

    // Colour: a palette hue with Hanabi's per-particle jitter, so a burst is
    // not a flat block of one colour. Stored as numbers, not a string —
    // alpha changes every frame, so the string has to be built at draw time.
    var j = cfg.hanabi;
    if (spec && spec.white && Math.random() < spec.white) {
      // White cannot be expressed as a hue — every other sparkle takes
      // BASE_SAT — so these are desaturated and lifted instead.
      p.h = 45;
      p.s = clamp(8 + (Math.random() - 0.5) * 2 * j.jitterSat, 0, 20);
      p.l = clamp(95 + (Math.random() - 0.5) * j.jitterLight, 80, 100);
    } else {
      p.h = pickHue(spec) + (Math.random() - 0.5) * 2 * j.jitterHue;
      p.s = clamp(BASE_SAT + (Math.random() - 0.5) * 2 * j.jitterSat, 30, 100);
      p.l = clamp(BASE_LIGHT + (Math.random() - 0.5) * 2 * j.jitterLight, 30, 100);
    }

    // Shard geometry. A 1x1 pixel cannot show rotation, so sparkles get a
    // small extent and a spin rate; draw() modulates the width by cos(rot) so
    // the shard turns edge-on and winks out. That flicker is the point of
    // keeping confetti's spin — it is a glint, not a visible tumbling shape.
    p.size = (1 + Math.random() * 2) * cfg.confetti.size *
             ((spec && spec.scale) || cfg.scale);
    p.rot = Math.random() * Math.PI * 2;
    p.spin = (Math.random() - 0.5) * 2 * cfg.confetti.spin * Math.PI / 180;

    particles.push(p);
  }

  /* ---- Blast glow -------------------------------------------------------
     The shell detonating: a bright bloom at the burst point that leads the
     sparkles by a few dozen milliseconds, so the light arrives fractionally
     before its debris. Drawn at COMPOSITE level only, never into particleBuf
     — a soft gradient that large stamped into the trail would smear into
     exactly the lingering blob we spent three rounds removing. */

  var blasts = [];
  var pendingBursts = [];

  function spawnBlast(x, y, spec) {
    // Bloom takes a hue from the same set as its sparkles, so a red firework
    // does not detonate gold.
    blasts.push({ x: x, y: y, age: 0, hue: pickHue(spec) });
  }

  function updateBlasts(dt) {
    var B = cfg.blast;
    var span = B.rise + B.hold + B.decay;
    for (var i = blasts.length - 1; i >= 0; i--) {
      blasts[i].age += dt;
      if (blasts[i].age >= span) {
        blasts[i] = blasts[blasts.length - 1];
        blasts.pop();
      }
    }
  }

  function drawBlasts() {
    var B = cfg.blast;
    for (var i = 0; i < blasts.length; i++) {
      var b = blasts[i];
      var alpha, grow;

      if (b.age < B.rise) {
        var up = b.age / B.rise;
        alpha = B.peak * up;
        grow = 0.55 + 0.45 * up;   // expands as it ignites
      } else if (b.age < B.rise + B.hold) {
        alpha = B.peak;            // sits at full brightness before fading
        grow = 1;
      } else {
        var down = (b.age - B.rise - B.hold) / B.decay;
        if (down >= 1) continue;
        // Squared falloff: bright for a moment, then a long soft tail rather
        // than a linear ramp, which reads as a light source dying out.
        alpha = B.peak * (1 - down) * (1 - down);
        grow = 1;
      }

      var r = B.radius * grow;
      var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, 'hsla(' + b.hue.toFixed(0) + ',100%,95%,' + alpha.toFixed(3) + ')');
      g.addColorStop(0.35, 'hsla(' + b.hue.toFixed(0) + ',100%,72%,' + (alpha * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'hsla(' + b.hue.toFixed(0) + ',100%,60%,0)');

      ctx.fillStyle = g;
      ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    }
  }

  /* ---- The rocket -------------------------------------------------------
     Rises to a target height and bursts at apex. Launch speed is solved from
     the height rather than picked and hoped for: under gravity alone, a body
     thrown at v rises v^2/2g, so v = sqrt(2 * g * rise) puts the apex exactly
     on target on every screen. Bursting at apex — the moment vy turns from
     negative to positive — also means it never stalls short or sails past. */

  var rockets = [];

  function launch(x, targetY, spec) {
    var g = cfg.hanabi.gravity * FPS_REF * FPS_REF;
    var y0 = canvas.clientHeight * cfg.rocket.launchY;
    var rise = Math.max(1, y0 - targetY);
    var j = cfg.hanabi;

    rockets.push({
      x: x, y: y0,
      px: x, py: y0,          // previous-frame position, same as a sparkle
      vy: -Math.sqrt(2 * g * rise),
      // Carries the colour of the firework it is about to become.
      h: pickHue(spec) + (Math.random() - 0.5) * 2 * j.jitterHue,
      s: clamp(BASE_SAT + (Math.random() - 0.5) * 2 * j.jitterSat, 30, 100),
      l: clamp(cfg.rocket.light + (Math.random() - 0.5) * 2 * j.jitterLight, 60, 100),
      size: cfg.rocket.size * ((spec && spec.scale) || cfg.scale),
      spec: spec
    });
  }

  function updateRockets(dt) {
    var g = cfg.hanabi.gravity * FPS_REF * FPS_REF;

    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.px = r.x;
      r.py = r.y;
      r.vy += g * dt;
      r.y += r.vy * dt;

      if (r.vy >= 0) { // apex
        rockets[i] = rockets[rockets.length - 1];
        rockets.pop();
        burst(r.x, r.y, r.spec);
      }
    }
  }

  // A burst fires the blast now and queues the sparkles for `lead` ms later.
  // Kept on the rAF clock rather than setTimeout so it stays in step with the
  // rest of the sim — and so stepping frames by hand still reproduces it.
  function burst(x, y, spec) {
    var B = cfg.blast;
    if (!B.enabled) { spawnSparkles(x, y, spec); return; }
    spawnBlast(x, y, spec);
    if (B.lead > 0) pendingBursts.push({ x: x, y: y, t: B.lead / 1000, spec: spec });
    else spawnSparkles(x, y, spec);
  }

  function updatePending(dt) {
    for (var i = pendingBursts.length - 1; i >= 0; i--) {
      var q = pendingBursts[i];
      q.t -= dt;
      if (q.t <= 0) {
        pendingBursts[i] = pendingBursts[pendingBursts.length - 1];
        pendingBursts.pop();
        spawnSparkles(q.x, q.y, q.spec);
      }
    }
  }

  function spawnSparkles(x, y, spec) {
    var n = cfg.hanabi.count;
    var speedMax = cfg.hanabi.explosionSize * FPS_REF *
                   ((spec && spec.scale) || cfg.scale);
    var baseLife = 1 / (cfg.hanabi.lifeDecay * FPS_REF);
    var lifeMin = cfg.confetti.fadeMin;
    var lifeSpan = cfg.confetti.fadeMax - cfg.confetti.fadeMin;

    for (var i = 0; i < n; i++) {
      var angle = Math.random() * Math.PI * 2;
      // sqrt gives uniform density per unit AREA. A plain uniform radius piles
      // particles toward the centre and reads as a hollow-cored blob; this
      // fills the disc evenly.
      var speed = Math.sqrt(Math.random()) * speedMax;
      // Wide per-particle lifetime spread, so the burst dissolves instead of
      // all dying on the same frame.
      var life = baseLife * (lifeMin + Math.random() * lifeSpan);
      spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, life, spec);
    }

    spawnSmoke(x, y);
  }

  /* ---- Smoke ------------------------------------------------------------
     Same conversion discipline as everything else: the reference's per-frame
     values are scaled by FPS_REF (or its square, for accelerations). Smoke is
     what gives a burst body rather than just light. */

  var SMOKE_MAX = 500;      // reference cap
  var SMOKE_SPREAD_X = 20;  // spawn scatter around the burst centre
  var SMOKE_SPREAD_Y = 12.5;
  var SMOKE_DRIFT_X = 0.02 * FPS_REF * FPS_REF; // per-frame^2 -> px/s^2
  var SMOKE_DRIFT_Y = 0.01 * FPS_REF * FPS_REF;

  var smoke = [];
  var smokePool = [];

  function spawnSmoke(x, y) {
    var S = cfg.hanabi.smoke;
    if (!S.enabled) return;
    var n = S.countMin + Math.floor(Math.random() * (S.countMax - S.countMin + 1));

    for (var i = 0; i < n; i++) {
      if (smoke.length >= SMOKE_MAX) return;
      var s = smokePool.pop() || {};
      s.x = x + (Math.random() - 0.5) * 2 * SMOKE_SPREAD_X;
      s.y = y + (Math.random() - 0.5) * 2 * SMOKE_SPREAD_Y;
      s.vx = (Math.random() - 0.5) * 4 * FPS_REF;
      s.vy = -Math.random() * 0.2 * FPS_REF;
      s.size = S.sizeMin + Math.random() * (S.sizeMax - S.sizeMin);
      s.life = 1;
      smoke.push(s);
    }
  }

  function updateSmoke(dt) {
    var S = cfg.hanabi.smoke;
    var dragX = Math.pow(S.dragX, dt * FPS_REF);
    var dragY = Math.pow(S.dragY, dt * FPS_REF);
    var rise = S.rise * FPS_REF * FPS_REF;

    for (var i = smoke.length - 1; i >= 0; i--) {
      var s = smoke[i];
      s.vx += (Math.random() - 0.5) * 2 * SMOKE_DRIFT_X * dt;
      s.vy += (Math.random() - 0.5) * 2 * SMOKE_DRIFT_Y * dt;
      s.vy -= rise * dt;
      s.vx *= dragX;
      s.vy *= dragY;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.size += S.growth * FPS_REF * dt;
      s.life -= S.lifeDecay * FPS_REF * dt;

      if (s.life <= 0) {
        smoke[i] = smoke[smoke.length - 1];
        smoke.pop();
        smokePool.push(s);
      }
    }
  }

  function drawSmoke(w, h) {
    smokeCtx.clearRect(0, 0, w, h);
    if (!smoke.length) return;

    var max = cfg.hanabi.smoke.maxAlpha;
    var i, s, lf;

    // Base clouds.
    for (i = 0; i < smoke.length; i++) {
      s = smoke[i];
      lf = s.life;
      smokeCtx.globalAlpha = Math.min(max, lf * max * Math.sqrt(lf));
      smokeCtx.drawImage(smokeSprite, s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
    }

    // Darker wisps over the top, for depth.
    smokeCtx.globalCompositeOperation = 'multiply';
    for (i = 0; i < smoke.length; i++) {
      s = smoke[i];
      lf = s.life;
      smokeCtx.globalAlpha = Math.min(max, lf * max * Math.sqrt(lf)) * 0.5;
      smokeCtx.drawImage(smokeSprite, s.x - s.size * 0.6, s.y - s.size * 0.6,
                         s.size * 1.2, s.size * 1.2);
    }

    smokeCtx.globalCompositeOperation = 'source-over';
    smokeCtx.globalAlpha = 1;
  }

  function update(dt) {
    var gravity = cfg.hanabi.gravity * FPS_REF * FPS_REF;
    var damp = Math.pow(cfg.hanabi.drag, dt * FPS_REF);
    var flutter = cfg.confetti.flutter;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.vy += gravity * p.mass * dt;
      // Random walk on horizontal velocity — confetti's swish. Bounded by the
      // damping below, so it meanders rather than running away.
      p.vx += (Math.random() - 0.5) * 2 * flutter * dt;

      p.vx *= damp;
      p.vy *= damp;

      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;

      if (p.life <= 0) {
        // Swap-and-pop: O(1) removal, and draw order is irrelevant here.
        particles[i] = particles[particles.length - 1];
        particles.pop();
        pool.push(p);
      }
    }

    updateRockets(dt);
    updateSmoke(dt);
    updateBlasts(dt);
    updateSequence(dt);

    // The run is over once nothing is queued and the last rocket has burst.
    // Deliberately not waiting on the sparkles: they hang for several seconds
    // after, and a replay overlapping those looks fine.
    if (goBtn.disabled && !scheduled.length && !rockets.length) goBtn.disabled = false;
    updatePending(dt); // last, so sparkles released this frame are drawn at full life
  }

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
        spec: { hues: c.hues, white: c.white, scale: row.scale }
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
        launch(q.x, q.y, q.spec);
      }
    }
  }

  // Seconds since the last particle died, and how long the trail takes to
  // finish emptying itself once that happens. See the fade-out note in draw().
  var idleTime = 0;
  var TRAIL_FADEOUT = 0.6;

  // Dithered trail erase. See the note in draw(): a proportional 8-bit erase
  // cannot reach zero, so a weak per-frame fade strands every touched pixel at
  // ~0.5/fade and leaves a ghost of the burst. Erasing in strong batches does
  // reach zero but steps the whole canvas at once, which reads as flicker.
  //
  // So the strong erase is scattered SPATIALLY instead: each frame a small
  // random subset of pixels is erased hard enough to round to zero, and the
  // rest are left alone. Averaged over frames every pixel decays at the same
  // rate as before, but no frame changes the whole image, so there is nothing
  // to flicker.
  // The masks PARTITION the pixels rather than sampling them randomly: each
  // pixel belongs to exactly one of DITHER_PHASES masks, so cycling through
  // them erases every pixel exactly once per cycle. Random selection — whether
  // by a random mask or a random offset — leaves some pixels untouched for
  // long stretches, and those linger bright as speckle.
  var DITHER_PHASES = 12;
  var ditherMasks = (function () {
    var size = 128, masks = [], imgs = [], k;
    for (k = 0; k < DITHER_PHASES; k++) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      masks.push(c);
      imgs.push(c.getContext('2d').createImageData(size, size));
    }
    for (var i = 0; i < size * size; i++) {
      // Only alpha matters — destination-out reads nothing else.
      imgs[Math.floor(Math.random() * DITHER_PHASES)].data[i * 4 + 3] = 255;
    }
    for (k = 0; k < DITHER_PHASES; k++) masks[k].getContext('2d').putImageData(imgs[k], 0, 0);
    return masks;
  })();
  var ditherPatterns = new Array(DITHER_PHASES); // built lazily, need the context
  var ditherPhase = 0;

  function draw(dt) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    var mode = cfg.hanabi.layer;

    // A collapsed or hidden stage gives a zero-size canvas, and drawImage
    // throws on a zero-dimension source — which would kill the rAF loop for
    // good rather than skipping a frame.
    if (!w || !h) return;

    // ---- Particle layer ----
    // Drawn once, then reused as the source for both the trail and the glow.
    particleCtx.clearRect(0, 0, w, h);
    particleCtx.lineCap = 'round';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = p.life / p.maxLife;
      // Width collapses to zero as the shard turns edge-on, then opens back
      // up — the wink.
      var sw = p.size * Math.abs(Math.cos(p.rot));
      if (sw <= 0) continue;
      // Stroked from last frame's position to this one, rather than a dot at
      // just the current position — a fast-moving particle can travel several
      // px between frames, and a single point leaves a gap the trail buffer
      // never fills in. The segment always meets the previous frame's segment
      // exactly, so the trail stays unbroken at any speed.
      particleCtx.strokeStyle = 'hsla(' + p.h.toFixed(0) + ',' + p.s.toFixed(0) + '%,' +
                              p.l.toFixed(0) + '%,' + alpha.toFixed(3) + ')';
      particleCtx.lineWidth = sw;
      particleCtx.beginPath();
      particleCtx.moveTo(p.px, p.py);
      particleCtx.lineTo(p.x, p.y);
      particleCtx.stroke();
    }

    // Rockets, drawn the same way into the same buffer — one bigger node, at
    // full alpha, with no wink.
    for (var k = 0; k < rockets.length; k++) {
      var r = rockets[k];
      particleCtx.strokeStyle = 'hsl(' + r.h.toFixed(0) + ',' + r.s.toFixed(0) + '%,' +
                                r.l.toFixed(0) + '%)';
      particleCtx.lineWidth = r.size;
      particleCtx.beginPath();
      particleCtx.moveTo(r.px, r.py);
      particleCtx.lineTo(r.x, r.y);
      particleCtx.stroke();
    }

    // ---- Trail ----
    // destination-out ERASES alpha rather than painting black, so faded
    // regions go transparent and what is underneath is never darkened. The
    // per-frame rate is converted to this frame's dt, same as the physics.
    // ...but a per-frame proportional erase can never reach zero on an 8-bit
    // canvas: once alpha*fade < 0.5 it rounds straight back, so every pixel the
    // trail has touched sticks at about 0.5/fade — 10/255 at fade 0.05. That
    // residue is a faint white ghost of the whole burst hanging in the air.
    //
    // So the fade is BATCHED: accumulated across frames and applied as one
    // stronger erase. Same average decay rate, but each erase is large enough
    // to round the low alphas down instead of leaving them stranded, which
    // drops the floor from ~10/255 to ~1/255.
    // Erase strength is raised by 1/coverage so that, averaged over the pixels
    // actually hit, the decay rate is unchanged — but each hit is now strong
    // enough to round a stranded residue down to zero instead of leaving it.
    var fadeStep = 1 - Math.pow(1 - cfg.hanabi.trailFade, dt * FPS_REF);
    ditherPhase = (ditherPhase + 1) % DITHER_PHASES;
    if (!ditherPatterns[ditherPhase]) {
      ditherPatterns[ditherPhase] = trailCtx.createPattern(ditherMasks[ditherPhase], 'repeat');
    }

    // Once the last particle dies nothing is refreshing the trail any more,
    // and the erase is ramped from its normal strength up to full across
    // TRAIL_FADEOUT: the streaks keep decaying at their usual rate at first,
    // then get erased hard enough to round to zero. A clearRect here would
    // also reach zero, but it does it between two frames, so whatever streak
    // was still lit at that moment snaps out of existence instead of
    // dissolving.
    // Rockets count as alive here too: during an ascent there are no
    // particles yet, and without this the fade-out would ramp to full and
    // erase the rocket's own trail out from under it as it climbs.
    if (particles.length || rockets.length) idleTime = 0;
    else idleTime += dt;

    var erase = Math.min(1, fadeStep * DITHER_PHASES);
    if (idleTime > 0) erase += (1 - erase) * Math.min(1, idleTime / TRAIL_FADEOUT);

    trailCtx.save();
    trailCtx.globalCompositeOperation = 'destination-out';
    trailCtx.globalAlpha = erase;
    trailCtx.fillStyle = ditherPatterns[ditherPhase];
    trailCtx.fillRect(0, 0, w, h);
    trailCtx.restore();

    trailCtx.globalAlpha = cfg.hanabi.trailAlpha;
    trailCtx.drawImage(particleBuf, 0, 0, w, h);
    trailCtx.globalAlpha = 1;

    // ---- Smoke ----
    drawSmoke(w, h);

    // ---- Glow ----
    sizeGlow();
    glowCtx.clearRect(0, 0, glowBuf.width, glowBuf.height);
    glowCtx.drawImage(particleBuf, 0, 0, glowBuf.width, glowBuf.height);

    // ---- Composite ----
    // The lab fills an opaque navy here, because additive blending needs real
    // pixels underneath to add to. As an overlay that fill would hide the page
    // and the backdrop, so this clears to transparent and lets the browser
    // composite the result over the backdrop instead.
    ctx.clearRect(0, 0, w, h);

    var all = mode === 'composite';

    // Smoke sits underneath everything and is NOT additive — it is haze that
    // occludes, not light that adds.
    if (all || mode === 'smoke') {
      ctx.drawImage(smokeBuf, 0, 0, w, h);
    }

    ctx.globalCompositeOperation = 'lighter';

    if (all || mode === 'trail') {
      ctx.drawImage(trailBuf, 0, 0, w, h);
    }

    if (all || mode === 'glow') {
      // Smoothing off on the way back up too: the surviving pixels stay hard
      // blocks rather than being blurred back into a smear.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(glowBuf, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    }

    if (all || mode === 'particles') {
      ctx.drawImage(particleBuf, 0, 0, w, h);
    }

    // Still additive, and above the layers: the blast is a light source, so it
    // should wash over the sparkles rather than sit behind them.
    if (all) drawBlasts();

    ctx.globalCompositeOperation = 'source-over';
  }

  // Click launches a rocket that bursts where you clicked, rather than
  // bursting there outright — the lab had no ascent to exercise.
  function onCanvasClick(e) {
    var r = canvas.getBoundingClientRect();
    launch(e.clientX - r.left, e.clientY - r.top);
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

    update(dt);
    draw(dt);

    rafId = requestAnimationFrame(tick);
  }

  function teardown() {
    closeBtn.removeEventListener('click', teardown);
    goBtn.removeEventListener('click', onGo);
    canvas.removeEventListener('click', onCanvasClick);
    window.removeEventListener('resize', resize);
    resizeObserver.disconnect();
    cancelAnimationFrame(rafId);
    root.remove();
    document.body.style.overflow = previousOverflow;
  }

  // ---- LOCAL DEV HOOK — inert in production -----------------------------
  // The one place this file touches `window`, and only when the page opts in
  // by putting data-lsa-dev on <html>. The Liferay markup does not, so on the
  // intranet this branch never runs and no global is ever created.
  if (document.documentElement.hasAttribute('data-lsa-dev')) {
    window.__lsaDev = {
      cfg: cfg,
      burst: burst,
      launch: launch,
      stats: function () {
        return {
          rockets: rockets.length, particles: particles.length,
          smoke: smoke.length, blasts: blasts.length
        };
      },
      // Runs frames synchronously. Only used to exercise the pipeline where
      // requestAnimationFrame does not fire; the real show never calls it.
      step: function (n, dt) {
        for (var i = 0; i < (n || 1); i++) { update(dt || 1 / 60); draw(dt || 1 / 60); }
      }
    };
  }
})();
