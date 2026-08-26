/* ==========================================================================
   Fireworks engine — the single source of truth.
   --------------------------------------------------------------------------
   Hanabi's look, confetti.js's engine. This file is the whole simulation and
   renderer; it knows nothing about who is driving it.

   Two consumers, and nothing else may be added to this file on their behalf:

     lab/fireworks-lab.html   the tuning stage — slider panel, FPS readout,
                              auto-fire. Builds `cfg` from its own SCHEMA.
     lsa-experience.js        the Liferay overlay — GO sequence, backdrop,
                              teardown. Hardcodes the tuned `cfg`.

   Anything either of them tweaks lives in `cfg` and is read LIVE — per frame,
   per spawn — never cached into a local. That is what lets a slider change
   the show while it is running.

   Load as a plain classic script before its consumer. Deliberately not an ES
   module: the lab has to keep working when opened straight off disk over
   file://, and the overlay ships to a page with a Content Security Policy
   that forbids inline script.

   --------------------------------------------------------------------------
   THE CONVERSION, which is the whole reason this engine exists: Hanabi's
   constants are PER FRAME at 30fps. This loop is delta-time integrated in
   seconds. So every Hanabi value is converted at read time against FPS_REF
   rather than being used raw — using them raw in a 60fps loop is exactly why
   the first overlay fell twice too fast and its sparkles died three times too
   early.

       gravity   0.2  /frame^2  ->  x FPS_REF^2  ->  180 px/s^2
       drag      0.9  /frame    ->  pow(drag, dt * FPS_REF)
       life      0.01 /frame    ->  1/(0.01 * FPS_REF) = 3.33 s
       speed     10   /frame    ->  x FPS_REF        ->  300 px/s

   Confetti contributes what Hanabi has no equivalent for: mass variance,
   flutter, the delta cap, and a wide per-particle lifetime spread.

   Sanity check: terminal fall must land at ~55 px/s and must NOT change with
   framerate.

   --------------------------------------------------------------------------
   USAGE

     var fw = Fireworks(canvasElement, myCfg);

     fw.cfg               the live config — mutate it, the engine re-reads it
     fw.burst(x, y)       break a shell where it stands
     fw.launch(x, y)      send a rocket up that bursts at y
     fw.update(dt)        advance the sim by dt seconds
     fw.draw(dt)          render one frame
     fw.clear()           wipe the stage, trail included
     fw.destroy()         unhook the resize listeners
     fw.stats()           live counts, for a debug readout
     fw.debug             raw arrays and buffers, for a debug hook

   The caller owns the requestAnimationFrame loop. The engine does not start
   one, so a consumer keeps control of when it runs and when it stops — which
   the overlay needs for teardown, and which is what makes hand-stepping
   frames possible when rAF is not firing.

   `spec` — the optional last argument to burst/launch — describes one
   firework, and is what lets a scripted show differ from a click:

       { hues:  [357, 352, 2],   // hue list, same form as PALETTES
         white: 0.33,            // fraction of sparkles drawn desaturated
         scale: 1.5 }            // this firework's size, overriding cfg.scale

   Omit it and the burst falls back to cfg.hanabi.palette and cfg.scale,
   which is what a plain click does.
   ========================================================================== */

(function (global) {
  'use strict';

  var FPS_REF = 30; // the framerate Hanabi's per-frame constants are authored at
  var TAU = Math.PI * 2;

  // Hanabi's palettes, as hue lists. Base saturation/lightness are NOT from
  // the reference — only its jitter ranges were recoverable — so these two
  // are a judgement call, picked to read as hot sparks rather than pastel.
  var PALETTES = {
    fire:   [357, 58, 46, 9, 352],
    blue:   [220, 200, 240, 180, 210],
    purple: [280, 300, 260, 320, 270]
  };
  var BASE_SAT = 90;
  var BASE_LIGHT = 62;

  var SMOKE_MAX = 500;      // reference cap
  var SMOKE_SPREAD_X = 20;  // spawn scatter around the burst centre
  var SMOKE_SPREAD_Y = 12.5;
  var SMOKE_DRIFT_X = 0.02 * FPS_REF * FPS_REF; // per-frame^2 -> px/s^2
  var SMOKE_DRIFT_Y = 0.01 * FPS_REF * FPS_REF;

  var DITHER_PHASES = 12;

  // Seconds the trail takes to finish emptying itself once the stage is idle.
  // See the fade-out note in draw().
  var TRAIL_FADEOUT = 0.6;

  /* ---- Defaults ---------------------------------------------------------
     Every value the engine reads, at the reference libraries' own defaults.
     A consumer passes whatever subset it cares about and the rest is filled
     in here, so neither consumer has to restate the parts it never touches
     and neither can silently omit a key the engine depends on.

     The lab's SCHEMA is the authority on these numbers. If a default changes
     there, change it here too — that pairing is the one thing about this file
     that still has to be kept in step by hand. */

  var DEFAULTS = {
    // Overall scale · multiplies burst spread and shard size together.
    scale: 1,

    // What the composite is painted onto. A colour string gives an opaque
    // fill — additive blending needs real pixels underneath to add to, so a
    // standalone stage wants one. `null` clears to transparent instead, which
    // is what an overlay needs so the page behind it still shows through.
    background: '#0b1a30',

    // What the sparkles are arranged into at the moment of the break.
    shape: {
      type: 'normal',       // normal | star burst | concentric | squiggle | dbs sparks
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      ringWidth: 0.04,
      waveAmp: 500,
      waveFreq: 3,
      hexRays: 0.55,
      hexJitter: 0.06
    },

    // Shells carried out by the burst that break again a moment later.
    sub: {
      enabled: false,
      count: 6,
      delay: 0.7,
      particles: 30,
      scale: 0.3,
      glow: true
    },

    // Per-frame values · reference runs at 30fps
    hanabi: {
      layer: 'composite',   // composite | particles | trail | glow | smoke
      palette: 'fire',      // fire | blue | purple | random
      fps: 30,

      // Burst
      count: 200,           // particles per burst
      explosionSize: 10,
      poolMax: 2000,

      // Physics
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

    // The white core at the middle of the break · lights instantly, grows as
    // it dies.
    core: {
      enabled: true,
      radius: 22,           // px at size 1 · multiplied by the firework's size
      life: 0.45,           // s at size 1 · likewise, so big shells burn longer
      peak: 1,              // alpha at the instant it lights
      growth: 2.2,          // end radius as a multiple of the starting radius
      falloff: 2,           // higher = snaps out faster after the initial flash
      // How much of the disc stays at full alpha before the rim fades. Low
      // values are a soft smudge that vanishes into the blast; high values are
      // a hard-edged ball.
      edge: 0.62
    },

    // The shell on its way up.
    rocket: {
      size: 5,              // px — a sparkle is 1-3
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's BASE_LIGHT
    }
  };

  // Fills in only what `target` is missing, in place, so the caller keeps its
  // own object reference — both consumers hold on to `cfg` and mutate it live.
  function deepFill(target, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v && typeof v === 'object' && !(v instanceof Array)) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        deepFill(target[k], v);
      } else if (!(k in target)) {
        target[k] = v;
      }
    }
    return target;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---- Shared sprites ---------------------------------------------------
     Built once for the whole page rather than per instance: they are
     read-only sources, so two stages can blit from the same ones. Built
     lazily so that merely loading this file touches no DOM. */

  var smokeSprite = null;

  function getSmokeSprite() {
    if (smokeSprite) return smokeSprite;
    // One baked soft puff, blitted scaled. The reference builds a radial
    // gradient per particle per frame — 500 gradient objects a frame at its
    // cap. Same result, a fraction of the cost.
    smokeSprite = document.createElement('canvas');
    var R = 32;
    smokeSprite.width = smokeSprite.height = R * 2;
    var g = smokeSprite.getContext('2d');
    var grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, 'rgba(180,180,180,1)');
    grad.addColorStop(1, 'rgba(180,180,180,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
    return smokeSprite;
  }

  // Dithered trail erase. See the note in draw(): a proportional 8-bit erase
  // cannot reach zero, so a weak per-frame fade strands every touched pixel at
  // ~0.5/fade and leaves a ghost of the burst. Erasing in strong batches does
  // reach zero but steps the whole canvas at once, which reads as flicker.
  //
  // So the strong erase is scattered SPATIALLY instead: each frame a small
  // subset of pixels is erased hard enough to round to zero, and the rest are
  // left alone. Averaged over frames every pixel decays at the same rate as
  // before, but no frame changes the whole image, so there is nothing to
  // flicker.
  // The masks PARTITION the pixels rather than sampling them randomly: each
  // pixel belongs to exactly one of DITHER_PHASES masks, so cycling through
  // them erases every pixel exactly once per cycle. Random selection — whether
  // by a random mask or a random offset — leaves some pixels untouched for
  // long stretches, and those linger bright as speckle.
  var ditherMasks = null;

  function getDitherMasks() {
    if (ditherMasks) return ditherMasks;
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
    ditherMasks = masks;
    return ditherMasks;
  }

  /* ====================================================================== */

  function createFireworks(canvas, cfg) {
    cfg = deepFill(cfg || {}, DEFAULTS);

    var ctx = canvas.getContext('2d');

    /* ---- Buffers --------------------------------------------------------
       Size the backing store to device pixels, not CSS pixels. Fireworks are
       judged on sharp single-pixel particles, so a half-resolution buffer
       being upscaled by the browser would soften everything before any tuning
       starts.

         particleBuf  full res, cleared each frame. Feeds BOTH the trail and
                      the glow, so sparkles only have to be drawn once.
         trailBuf     full res, PERSISTENT — never cleared per frame, only
                      faded.
         glowBuf      1/downscale res, smoothing OFF. The sparkle comes from
                      pixels being LOST in the downscale: which ones survive
                      changes frame to frame, so it twinkles without anything
                      being animated to twinkle.
         smokeBuf     half res — smoke is soft, so half res is invisible in
                      the result and saves a lot of fill on large displays. */

    var particleBuf = document.createElement('canvas');
    var particleCtx = particleBuf.getContext('2d');
    var trailBuf = document.createElement('canvas');
    var trailCtx = trailBuf.getContext('2d');
    var glowBuf = document.createElement('canvas');
    var glowCtx = glowBuf.getContext('2d');
    var smokeBuf = document.createElement('canvas');
    var smokeCtx = smokeBuf.getContext('2d');

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

    /* ---- Colour ---------------------------------------------------------- */

    // `spec` is a burst's own colour set. Without one this falls back to
    // cfg.hanabi.palette, which is what a plain click-to-burst uses.
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

    // A firework's size: its own if it has one, the global scale otherwise.
    function scaleOf(spec) {
      return (spec && spec.scale) || cfg.scale;
    }

    /* ---- Particles ------------------------------------------------------- */

    var particles = [];
    var pool = [];

    function spawn(x, y, vx, vy, life, spec) {
      if (particles.length >= cfg.hanabi.poolMax) return null;
      var p = pool.pop() || {};
      p.x = x; p.y = y;
      p.px = x; p.py = y; // previous-frame position, for gap-free trail segments
      p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life;

      // Cleared explicitly: pooled particles are reused, so a shell or a
      // squiggle would otherwise leak its behaviour into whatever object comes
      // next.
      p.shell = false;
      p.waveAmp = 0;

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
      p.size = (1 + Math.random() * 2) * cfg.confetti.size * scaleOf(spec);
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 2 * cfg.confetti.spin * Math.PI / 180;

      particles.push(p);
      return p;
    }

    /* ---- Blast glow -------------------------------------------------------
       The shell detonating: a bright bloom at the burst point that leads the
       sparkles by a few dozen milliseconds, so the light arrives fractionally
       before its debris. Drawn at COMPOSITE level only, never into particleBuf
       — a soft gradient that large stamped into the trail would smear into
       exactly the lingering blob we spent three rounds removing. */

    var blasts = [];
    var pendingBursts = [];

    // Bloom takes a hue from the same set as its sparkles, so a red firework
    // does not detonate gold. Also carries the firework's size, so the bloom
    // can be drawn to match it.
    function spawnBlast(x, y, spec) {
      blasts.push({
        x: x, y: y, age: 0,
        hue: pickHue(spec),
        scale: scaleOf(spec)
      });
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

        // Scaled by the firework's own size, so a 2x burst gets a 2x bloom and
        // the glow keeps reading as the core of that firework rather than a
        // fixed blob every burst sits in.
        var r = B.radius * grow * b.scale;
        var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, 'hsla(' + b.hue.toFixed(0) + ',100%,95%,' + alpha.toFixed(3) + ')');
        g.addColorStop(0.35, 'hsla(' + b.hue.toFixed(0) + ',100%,72%,' + (alpha * 0.45).toFixed(3) + ')');
        g.addColorStop(1, 'hsla(' + b.hue.toFixed(0) + ',100%,60%,0)');

        ctx.fillStyle = g;
        ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
      }
    }

    /* ---- The centre glow --------------------------------------------------
       The hot white core a real shell leaves at the middle of its burst: a
       small blown-out ball of light, not the wide coloured wash `blast` puts
       behind everything. Its own system precisely because it behaves the
       opposite way — white rather than hue-tinted, tight rather than broad,
       and it swells as it dies instead of holding a fixed size.

       Both its size and its duration ride the firework's size, so a big shell
       leaves a wider core that burns longer. */

    var cores = [];

    function spawnCore(x, y, spec) {
      var s = scaleOf(spec);
      cores.push({
        x: x, y: y, age: 0,
        radius: cfg.core.radius * s,
        life: cfg.core.life * s
      });
    }

    function updateCores(dt) {
      for (var i = cores.length - 1; i >= 0; i--) {
        cores[i].age += dt;
        if (cores[i].age >= cores[i].life) {
          cores[i] = cores[cores.length - 1];
          cores.pop();
        }
      }
    }

    function drawCores() {
      var C = cfg.core;
      for (var i = 0; i < cores.length; i++) {
        var c = cores[i];
        var t = c.age / c.life;             // 0 at the break, 1 when it is out

        // Grows gradually across its whole life, rather than expanding in a
        // burst at the start the way `blast` does.
        var r = c.radius * (1 + (C.growth - 1) * t);

        // Full brightness immediately, then a curved decay — the flash IS the
        // event, so there is no ramp up to it.
        var alpha = C.peak * Math.pow(1 - t, C.falloff);

        var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        // White throughout: this is the overexposed core, not coloured light.
        //
        // Held at FULL alpha out to `edge` before falling off, rather than
        // fading from the very centre. A gradient that starts dropping at once
        // is a soft smudge, and a soft white smudge laid additively over the
        // blast — whose middle is already near-white — cannot be seen at all.
        // Holding it flat makes a solid disc with a soft rim, which is what
        // reads as a blown-out core.
        g.addColorStop(0, 'rgba(255,255,255,' + alpha.toFixed(3) + ')');
        g.addColorStop(C.edge, 'rgba(255,255,255,' + alpha.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = g;
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      }
    }

    /* ---- The rocket -------------------------------------------------------
       The shell on its way up: exactly one node, drawn the same way a sparkle
       is — a stroked segment from last frame's position to this one, into the
       same particle buffer — so it picks up the trail and the glow for free.
       Just bigger, and it does not wink: the cos(rot) flicker reads as a
       glint on a shard, but on a single climbing ember it reads as a fault.

       Rises to a target height and bursts at apex. Launch speed is solved from
       the height rather than picked and hoped for: under gravity alone, a body
       thrown at v rises v^2/2g, so v = sqrt(2 * g * rise) puts the apex exactly
       on target on every screen. Bursting at apex — the moment vy turns from
       negative to positive — also means it never stalls short or sails past.

       No drag, unlike the sparkles. Their heavy 0.9/frame damping is what
       makes a burst snap out and hang, but on the ascent it would eat the
       launch velocity and make the apex height unpredictable. Gravity alone
       means the launch speed can be solved exactly from the height wanted. */

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
        size: cfg.rocket.size * scaleOf(spec),
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

    /* ---- The break --------------------------------------------------------
       A burst fires the blast now and queues the sparkles for `lead` ms later.
       Kept on the rAF clock rather than setTimeout so it stays in step with
       the rest of the sim — and so stepping frames by hand still reproduces
       it. */

    function burst(x, y, spec) {
      var B = cfg.blast;

      // The centre glow lights here, before anything else and outside the
      // blast's enabled/lead handling — it marks the break itself, so it is not
      // delayed by `lead` and does not depend on the coloured wash existing.
      if (cfg.core.enabled) spawnCore(x, y, spec);

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

    /* ---- Burst geometry ---------------------------------------------------
       Every shape answers the same question — for particle i of n, at what
       ANGLE and what FRACTION of the maximum speed does it leave the burst
       point? That is the only thing a shape controls. Physics, colour, life
       and rendering are identical afterwards, so shapes cost nothing beyond
       this function and stay independent of everything already tuned.

       Note the shapes are launch-time only: drag and gravity start blurring
       them immediately, exactly as a real shell's pattern does. Anything that
       reads as mush is usually flutter and mass spread rather than the shape
       itself — concentric especially wants both turned down to stay crisp. */

    // Radius of an N-pointed star at `angle`, as a fraction of the outer
    // radius: 1 at each tip, `inner` in each valley, straight edges between.
    function starRadius(angle, points, inner) {
      var seg = TAU / points;
      var t = (angle % seg) / seg;    // position within one point, 0..1
      var d = Math.abs(t - 0.5) * 2;  // 0 at the tip, 1 at the valley
      return 1 - d * (1 - inner);
    }

    // The DBS/POSB brand hex, thrown outward: a hexagon body with bright rays
    // shooting from the six corners. `hexRays` splits the particles between the
    // two — 0 is a plain hex outline, 1 is six bare spokes.
    function dbsPoint(S) {
      var seg = TAU / 6;

      if (Math.random() < S.hexRays) {
        var corner = Math.floor(Math.random() * 6) * seg;
        return [corner + (Math.random() - 0.5) * seg * 0.18, 0.55 + Math.random() * 0.45];
      }

      // Regular-polygon edge in polar form: the flat runs closer to the centre
      // than the corners do, which is what makes the six points read as points.
      var a = Math.random() * TAU;
      var t = (a % seg) / seg;
      var r = Math.cos(seg / 2) / Math.cos((t - 0.5) * seg);
      // 0.72 keeps the body inside the corner rays so the rays visibly overshoot.
      return [a, r * 0.72 * (1 + (Math.random() - 0.5) * 2 * S.hexJitter)];
    }

    function shapePoint(i, S) {
      switch (S.type) {
        case 'star burst': {
          var sa = Math.random() * TAU;
          return [sa, Math.sqrt(Math.random()) * starRadius(sa, Math.round(S.starPoints), S.starInner)];
        }

        case 'concentric': {
          // i % rings rather than a random ring: interleaving fills every ring
          // evenly instead of leaving the count to chance.
          var rings = Math.round(S.rings);
          var band = ((i % rings) + 1) / rings;
          return [Math.random() * TAU, band + (Math.random() - 0.5) * 2 * S.ringWidth];
        }

        // Squiggles need real outward speed to travel while they weave, so they
        // start in a shell rather than filling the disc.
        case 'squiggle':
          return [Math.random() * TAU, 0.55 + Math.random() * 0.45];

        case 'dbs sparks':
          return dbsPoint(S);

        // sqrt gives uniform density per unit AREA. A plain uniform radius piles
        // particles toward the centre and reads as a hollow-cored blob; this
        // fills the disc evenly.
        default:
          return [Math.random() * TAU, Math.sqrt(Math.random())];
      }
    }

    function spawnSparkles(x, y, spec) {
      var n = cfg.hanabi.count;
      var speedMax = cfg.hanabi.explosionSize * FPS_REF * scaleOf(spec);
      var baseLife = 1 / (cfg.hanabi.lifeDecay * FPS_REF);
      var lifeMin = cfg.confetti.fadeMin;
      var lifeSpan = cfg.confetti.fadeMax - cfg.confetti.fadeMin;
      var S = cfg.shape;
      var squiggle = S.type === 'squiggle';

      // Shells are ordinary particles whose life IS the fuse: they burst when
      // they die, so the countdown costs no extra field and the shard visibly
      // dims on its way to the second break.
      var shells = cfg.sub.enabled ? Math.min(Math.round(cfg.sub.count), n) : 0;

      for (var i = 0; i < n; i++) {
        var g = shapePoint(i, S);
        var angle = g[0];
        var speed = g[1] * speedMax;
        // Wide per-particle lifetime spread, so the burst dissolves instead of
        // all dying on the same frame.
        var life = baseLife * (lifeMin + Math.random() * lifeSpan);

        // Shells get +/-15% on the fuse. With an exact delay every shell breaks
        // on the same frame, which reads as one mechanical pop instead of a
        // scatter of secondary breaks.
        var p = spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                      i < shells ? cfg.sub.delay * (0.85 + Math.random() * 0.3) : life,
                      spec);
        if (!p) break; // pool is full — the rest of this burst would be dropped anyway

        if (i < shells) p.shell = true;

        if (squiggle) {
          // Weave across the direction of travel, not along it, so the particle
          // still gets where it is going — it just snakes on the way.
          p.nx = -Math.sin(angle);
          p.ny = Math.cos(angle);
          p.waveAmp = S.waveAmp;
          p.waveFreq = S.waveFreq;
          p.wavePhase = Math.random() * TAU;
        }
      }

      spawnSmoke(x, y);
    }

    // The second break. Always a plain radial puff regardless of the parent's
    // shape — a shell is small and short-lived, and a shape inside a shape reads
    // as noise rather than as two patterns.
    //
    // `hue` is the parent shard's own already-jittered hue, wrapped as a
    // one-entry spec so the second break reads as the same firework breaking
    // again, not a new one.
    function spawnSub(x, y, hue) {
      var S = cfg.sub;
      var spec = { hues: [hue], scale: cfg.scale * S.scale };
      var speedMax = cfg.hanabi.explosionSize * FPS_REF * cfg.scale * S.scale;
      var baseLife = 1 / (cfg.hanabi.lifeDecay * FPS_REF);
      var lifeMin = cfg.confetti.fadeMin;
      var lifeSpan = cfg.confetti.fadeMax - cfg.confetti.fadeMin;

      if (S.glow && cfg.blast.enabled) spawnBlast(x, y, { hues: [hue], scale: S.scale });

      for (var i = 0; i < Math.round(S.particles); i++) {
        var angle = Math.random() * TAU;
        var speed = Math.sqrt(Math.random()) * speedMax;
        spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
              baseLife * (lifeMin + Math.random() * lifeSpan), spec);
      }
    }

    /* ---- Smoke ------------------------------------------------------------
       Same conversion discipline as everything else: the reference's per-frame
       values are scaled by FPS_REF (or its square, for accelerations). Smoke is
       what gives a burst body rather than just light. */

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

      var sprite = getSmokeSprite();
      var max = cfg.hanabi.smoke.maxAlpha;
      var i, s, lf;

      // Base clouds.
      for (i = 0; i < smoke.length; i++) {
        s = smoke[i];
        lf = s.life;
        smokeCtx.globalAlpha = Math.min(max, lf * max * Math.sqrt(lf));
        smokeCtx.drawImage(sprite, s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
      }

      // Darker wisps over the top, for depth.
      smokeCtx.globalCompositeOperation = 'multiply';
      for (i = 0; i < smoke.length; i++) {
        s = smoke[i];
        lf = s.life;
        smokeCtx.globalAlpha = Math.min(max, lf * max * Math.sqrt(lf)) * 0.5;
        smokeCtx.drawImage(sprite, s.x - s.size * 0.6, s.y - s.size * 0.6,
                           s.size * 1.2, s.size * 1.2);
      }

      smokeCtx.globalCompositeOperation = 'source-over';
      smokeCtx.globalAlpha = 1;
    }

    /* ---- Simulation ------------------------------------------------------- */

    function update(dt) {
      var gravity = cfg.hanabi.gravity * FPS_REF * FPS_REF;
      var damp = Math.pow(cfg.hanabi.drag, dt * FPS_REF);
      var flutter = cfg.confetti.flutter;
      var subQueue = null; // shells that broke this frame, spawned after the loop

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

        if (p.waveAmp) {
          // The weave is added as a sideways VELOCITY at integration time rather
          // than accelerated into vx/vy. Two reasons: drag never gets to eat it,
          // so the zig-zag is the same width whatever the physics is tuned to;
          // and a square wave then means a CONSTANT sideways speed that flips
          // sign, which draws straight diagonal runs with hard corners — an
          // actual zig-zag. Accelerating instead gives soft sine ripples whose
          // width collapses as 1/freq^2.
          // Half-swing width is therefore just waveAmp / (2 * waveFreq) px.
          var age = p.maxLife - p.life;
          var push = Math.sin(age * p.waveFreq * TAU + p.wavePhase) >= 0 ? p.waveAmp : -p.waveAmp;
          p.x += (p.vx + p.nx * push) * dt;
          p.y += (p.vy + p.ny * push) * dt;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        p.rot += p.spin * dt;
        p.life -= dt;

        if (p.life <= 0) {
          // Queued rather than spawned here: spawning would push onto the very
          // array this loop is walking with swap-and-pop.
          if (p.shell) (subQueue || (subQueue = [])).push(p.x, p.y, p.h);
          // Swap-and-pop: O(1) removal, and draw order is irrelevant here.
          particles[i] = particles[particles.length - 1];
          particles.pop();
          pool.push(p);
        }
      }

      // Children are never shells themselves — spawn() clears the flag — so a
      // sub-blast cannot cascade into a third generation.
      if (subQueue) {
        for (var q = 0; q < subQueue.length; q += 3) {
          spawnSub(subQueue[q], subQueue[q + 1], subQueue[q + 2]);
        }
      }

      updateRockets(dt);
      updateSmoke(dt);
      updateBlasts(dt);
      updateCores(dt);
      updatePending(dt); // last, so sparkles released this frame are drawn at full life
    }

    /* ---- Rendering -------------------------------------------------------- */

    // Seconds since the last particle died. See the fade-out note in draw().
    var idleTime = 0;
    var ditherPatterns = new Array(DITHER_PHASES); // built lazily, need the context
    var ditherPhase = 0;

    function draw(dt) {
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      var mode = cfg.hanabi.layer;

      // A collapsed or hidden stage gives a zero-size canvas, and drawImage
      // throws on a zero-dimension source — which would kill the caller's rAF
      // loop for good rather than skipping a frame.
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
      // canvas: once alpha*fade < 0.5 it rounds straight back, so every pixel
      // the trail has touched sticks at about 0.5/fade — 10/255 at fade 0.05.
      // That residue is a faint white ghost of the whole burst hanging in the
      // air.
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
        ditherPatterns[ditherPhase] = trailCtx.createPattern(getDitherMasks()[ditherPhase], 'repeat');
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
      // A standalone stage paints an opaque fill, because additive blending
      // needs real pixels underneath to add to. As an overlay that fill would
      // hide the page behind it, so `background: null` clears to transparent
      // instead and lets the browser composite the result over whatever is
      // underneath.
      if (cfg.background) {
        ctx.fillStyle = cfg.background;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      var all = mode === 'composite';

      // Smoke sits underneath everything and is NOT additive — it is haze that
      // occludes, not light that adds. Additive grey would just wash the navy.
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
      // should wash over the sparkles rather than sit behind them. Blast first,
      // then the centre glow on top of it — the coloured wash is the light
      // around the break, the white core is the break itself.
      if (all) {
        drawBlasts();
        drawCores();
      }

      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---- Stage ------------------------------------------------------------ */

    function clear() {
      for (var i = 0; i < particles.length; i++) pool.push(particles[i]);
      particles.length = 0;
      for (var j = 0; j < smoke.length; j++) smokePool.push(smoke[j]);
      smoke.length = 0;
      blasts.length = 0;
      cores.length = 0;
      rockets.length = 0;
      pendingBursts.length = 0; // or a queued burst fires into the cleared stage
      // The trail is persistent, so it has to be wiped explicitly or the last
      // burst bleeds into the next one.
      trailCtx.clearRect(0, 0, trailBuf.width, trailBuf.height);
    }

    // CSS-pixel dimensions of the stage, which is what burst/launch coordinates
    // are in.
    function size() {
      var dpr = window.devicePixelRatio || 1;
      return { w: canvas.width / dpr, h: canvas.height / dpr };
    }

    function destroy() {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
    }

    return {
      cfg: cfg,
      canvas: canvas,
      ctx: ctx,

      burst: burst,
      launch: launch,
      update: update,
      draw: draw,
      resize: resize,
      clear: clear,
      size: size,
      destroy: destroy,

      // Live counts, for a debug readout.
      stats: function () {
        return {
          particles: particles.length,
          pooled: pool.length,
          rockets: rockets.length,
          smoke: smoke.length,
          blasts: blasts.length,
          cores: cores.length
        };
      },

      // Raw internals. For debug hooks only — nothing in the show should read
      // these, and the shape of them is not a contract.
      debug: {
        particles: particles,
        pool: pool,
        rockets: rockets,
        smoke: smoke,
        blasts: blasts,
        cores: cores,
        particleBuf: particleBuf,
        trailBuf: trailBuf,
        glowBuf: glowBuf,
        smokeBuf: smokeBuf,
        // Runs the sim synchronously. Needed because requestAnimationFrame does
        // not fire in a non-compositing tab, which is the only way to verify the
        // engine in some environments. The real show never calls it.
        step: function (dt, n) {
          for (var i = 0; i < (n || 1); i++) { update(dt); draw(dt); }
        }
      }
    };
  }

  /* ---- Config transport -------------------------------------------------
     Moving a tuned `cfg` between the consumers, in either direction. It lives
     here for the same reason everything else does: both the lab and the
     overlay's dev panel need it, and a second copy of it is the exact problem
     this file exists to prevent.

     Dev-only. Nothing in a running show calls any of it — the overlay reaches
     it from its `data-lsa-dev` panel and nowhere else. */

  // A JS object literal, in the same shape and style the configs are written
  // in by hand, so the output can be pasted straight over one.
  function literal(v, indent) {
    if (v === null) return 'null';
    if (typeof v === 'string') return "'" + v.replace(/'/g, "\\'") + "'";
    if (typeof v !== 'object') return String(v);

    if (v instanceof Array) {
      return '[' + v.map(function (x) { return literal(x, indent); }).join(', ') + ']';
    }

    var pad = indent + '  ';
    var rows = Object.keys(v).map(function (k) {
      // Numeric keys — cfg.fireworkSize is keyed 1-5 — are not valid bare.
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + k + "'";
      return pad + key + ': ' + literal(v[k], pad);
    });
    return '{\n' + rows.join(',\n') + '\n' + indent + '}';
  }

  // `source` names where the tuning happened, so a config found on a clipboard
  // days later still says what produced it.
  createFireworks.exportConfig = function (cfg, source) {
    var stamp = new Date().toISOString().slice(0, 10);
    return '/* Fireworks config, tuned in the ' + (source || 'engine') +
           ' on ' + stamp + '.\n' +
           '   Paste over the `cfg` object in whichever project should run it.\n' +
           '   Needs fireworks-engine.js loaded first; its header documents the API. */\n\n' +
           'var cfg = ' + literal(cfg, '') + ';\n';
  };

  // The inverse. Deliberately tolerant: what gets pasted in is as often a
  // chunk lifted straight out of a source file — comments, `var cfg =`,
  // trailing semicolon — as it is this file's own export.
  //
  // Not `eval`, and not `new Function` either. This runs in a page served over
  // the public web, and "it is only a dev tool" is not a good enough reason to
  // put an arbitrary-code path in it. So the text is normalised into JSON and
  // handed to JSON.parse, which cannot execute anything.
  createFireworks.parseConfig = function (text) {
    var s = String(text);

    // Comments first, so a brace inside one cannot confuse the slice below.
    // The `[^:]` guard keeps `https://` in a string from being read as a line
    // comment — no config carries a URL today, but one costing nothing to
    // guard against is worth guarding against.
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    // Take the outermost object, which drops any `var cfg =` and `;`.
    var a = s.indexOf('{');
    var b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('no config object found in that text');
    s = s.slice(a, b + 1);

    s = s.replace(/'([^'\\]*)'/g, '"$1"');                        // 'fire' -> "fire"
    s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*|\d+)\s*:/g, '$1"$2":'); // bare keys
    s = s.replace(/,(\s*[}\]])/g, '$1');                          // trailing commas

    return JSON.parse(s);
  };

  // Clipboard write with a fallback, because the lab is routinely opened over
  // file:// where the async clipboard is not available. Calls back with true
  // on success, false otherwise — never rejects, so a caller only has to
  // handle the one path.
  createFireworks.copyText = function (text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      // Deprecated, and still the only thing that works everywhere this gets
      // opened, so it stays as the fallback rather than the primary.
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      if (!ok) console.log(text); // at least leave it retrievable
      done(ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  };

  // A fresh copy of every default, for a consumer that wants to start from
  // them and override a few rather than restate the lot.
  createFireworks.defaults = function () { return deepFill({}, DEFAULTS); };
  createFireworks.PALETTES = PALETTES;
  createFireworks.FPS_REF = FPS_REF;
  createFireworks.BASE_SAT = BASE_SAT;
  createFireworks.BASE_LIGHT = BASE_LIGHT;

  global.Fireworks = createFireworks;
})(typeof window !== 'undefined' ? window : this);
