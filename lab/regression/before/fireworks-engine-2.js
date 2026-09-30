/* ==========================================================================
   Fireworks engine 2
   --------------------------------------------------------------------------
   Draws fireworks on one canvas. Used by the overlay (lsa-experience.js) and
   by lab/fireworks-lab-2.html. Based on Hanabi
   (https://avanderw.co.za/hanabi/, github.com/avanderw/hanabi).

   HOW IT DRAWS: three offscreen buffers, combined onto the canvas each frame.
     particles  the sparks, crisp
     trail      a fading copy of the sparks, for streaks
     glow       the sparks shrunk to 1/4 size and scaled back up, added on
                top. The twinkle comes from pixels lost in that shrink.

   WHAT A BURST DOES: throws `count` sparks out from a point. Each spark gets
   a direction and speed from the burst shape, a colour from the palette, and
   a life. Gravity pulls it down and drag slows it until it dies. Optional
   extras: a flash of light at the burst point, and second bursts.

   UNITS: Hanabi's numbers are per frame at 30fps. This engine runs on real
   seconds, so each one is converted with FPS_REF = 30:

       gravity   0.2  /frame^2  ->  x FPS_REF^2  ->  180 px/s^2
       drag      0.9  /frame    ->  pow(drag, dt * FPS_REF)
       life      0.01 /frame    ->  1/(0.01 * FPS_REF) = 3.33 s
       speed     10   /frame    ->  x FPS_REF        ->  300 px/s

   So it looks the same at any frame rate.

   --------------------------------------------------------------------------
   USAGE

     var fw = Fireworks2(canvasElement, { palette: 'blue' });

     fw.cfg                the live config — mutate it, the engine re-reads it
     fw.burst(x, y)        break a shell where it stands
     fw.launch(x, y)       send a rocket up that bursts at y
     fw.update(dt)         advance the sim by dt seconds
     fw.draw()             render one frame
     fw.clear()            wipe the stage, trail included
     fw.resize()           re-read the canvas size (also hooked to window)
     fw.stats()            live counts
     fw.destroy()          unhook the resize listener

   The caller owns the requestAnimationFrame loop; the engine never starts one.
   Minimal driver:

     var last = 0;
     (function tick(t) {
       var dt = last ? (t - last) / 1000 : 0; last = t;
       fw.update(dt); fw.draw();
       requestAnimationFrame(tick);
     })(0);

   `spec`, the optional last argument to burst/launch, describes one
   firework:

       { hues: [357, 352, 2], white: 0.33, scale: 1.5, settings: {...} }

   hues: colours to pick from. white: share of sparks drawn white.
   scale: size. settings: config values for this firework only (see
   withSettings()). Leave it out and cfg.palette and cfg.scale are used.

   fw.onBurst(x, y, spec), if set, is called each time a rocket bursts.

   A plain script (not a module), so it works under a strict CSP. Adds one
   global, Fireworks2.
   ========================================================================== */

(function (global) {
  'use strict';

  // The frame rate the config numbers are written for. See the header.
  var FPS_REF = 30;
  var TAU = Math.PI * 2;

  // Colour sets, as lists of hues. Every spark uses the same base saturation
  // and lightness, plus a little random jitter.
  var PALETTES = {
    fire:   [357, 58, 46, 9, 352],
    blue:   [220, 200, 240, 180, 210],
    purple: [280, 300, 260, 320, 270]
  };
  var BASE_SAT = 90;
  var BASE_LIGHT = 62;

  var DITHER_PHASES = 12;   // see getDitherMasks()
  var TRAIL_FADEOUT = 0.6;  // seconds the trail takes to empty once idle

  // Every setting and its default. A caller's config fills in on top of these.
  var DEFAULTS = {
    // Colour painted under everything. null = see-through, which an overlay
    // on a live page needs.
    background: '#050a18',

    palette: 'fire',        // fire | blue | purple | random
    scale: 1,               // overall size: spread and spark size together

    /* Grow fireworks with the canvas, so a burst fills about the same share
       of a small or large screen. Based on the canvas's shorter side; at
       `reference` px the factor is 1. Off by default so lab sliders mean the
       same thing at any window size; the overlay turns it on. */
    scaleToScreen: {
      enabled: false,
      reference: 900        // px on the smaller side
    },

    count: 200,             // sparkles per burst
    explosionSize: 10,      // per-frame speed -> x FPS_REF -> px/s
    poolMax: 2000,          // hard cap on live sparkles

    gravity: 0.2,           // per frame^2
    drag: 0.9,              // per frame
    lifeDecay: 0.01,        // per frame -> 3.33 s base life
    lifeSpread: 0.35,       // +-fraction of life, per sparkle

    size: 1.6,              // px stroke width of a sparkle
    sizeSpread: 0.5,        // +-fraction of size, per sparkle

    trailFade: 0.05,        // per frame erase rate of the trail buffer
    trailAlpha: 0.6,        // how strongly particles stamp into the trail
    glowDownscale: 4,       // bigger = coarser, brighter twinkle
    glowAlpha: 1,           // how hard the glow is added back on top

    jitterHue: 5,
    jitterSat: 10,
    jitterLight: 10,

    /* The burst shape: only changes the direction and speed each spark
       starts with. `normal` is an even disc.
       ringThickness: how deep the `ring` shape is.
       starPoints, starInner: points and waist of `star burst`.
       rings, ringWidth: number and spread of `concentric` bands. */
    shape: {
      type: 'normal',       // normal | ring | star burst | concentric
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      ringWidth: 0.04,
      ringThickness: 0.08
    },

    deltaCap: 0.064,        // longest frame step, so a paused tab does not jump

    // The dot that flies up before a burst.
    rocket: {
      size: 4,              // px — a sparkle is ~1-2
      launchY: 1.0,         // launch height as a fraction of canvas height
      light: 88             // hotter than a sparkle's BASE_LIGHT
    },

    // The flash: a glow of light at the burst point, which makes it read as
    // an explosion.
    blast: {
      enabled: true,
      lead: 60,             // ms the light arrives BEFORE its own debris
      radius: 140,          // px at ignition, before growth
      peak: 0.55,           // brightest alpha it reaches
      rise: 0.06,           // s to ignite
      hold: 0.15,           // s at full brightness
      decay: 1.8,           // s fading out

      // End radius as a multiple of the start radius. Growing as it fades
      // looks like light spreading out; a fixed radius looks like it shrinks.
      growth: 1.6,

      // How many times the flash is drawn on itself. 1 is a plain flash;
      // more gives a bright white core. Raising `peak` stops helping above
      // about 2.75, so use this for more.
      stack: 1
    },

    /* Second bursts: some sparks burst again when they die. A shell is a
       normal spark whose life is its fuse. */
    sub: {
      enabled: false,
      count: 6,             // how many of the burst's sparkles are shells
      delay: 0.7,           // s fuse, +/-15% per shell
      particles: 30,        // sparkles each shell throws
      scale: 0.3,           // size of each secondary burst, vs its parent
      glow: true            // flash at each secondary break
    }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Read or write a nested config value by a dotted path, e.g. 'blast.lead'.
     Used by withSettings(). lsa-experience.js has its own copy on purpose,
     so neither file depends on the other. */

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

  /* ---- Burst shapes -----------------------------------------------------
     A shape only decides, for spark `i`, its direction and its share of full
     speed. Everything after that is the same for every shape. */

  // How far out a star burst reaches at a given angle: 1 at a tip, `inner`
  // between tips.
  function starRadius(angle, points, inner) {
    var seg = TAU / points;
    var t = (angle % seg) / seg;    // position within one point, 0..1
    var d = Math.abs(t - 0.5) * 2;  // 0 at the tip, 1 at the valley
    return 1 - d * (1 - inner);
  }

  // Returns [angle, speed share 0-1] for spark i.
  function shapePoint(i, S, type) {
    switch (type) {
      // A hollow ring: every spark near full speed, so the middle stays empty.
      case 'ring':
        return [Math.random() * TAU, 1 - Math.random() * S.ringThickness];

      case 'star burst': {
        var sa = Math.random() * TAU;
        return [sa, Math.sqrt(Math.random()) * starRadius(sa, Math.round(S.starPoints), S.starInner)];
      }

      case 'concentric': {
        // Sparks take turns between bands, so every band gets the same number.
        var rings = Math.round(S.rings);
        var band = ((i % rings) + 1) / rings;
        return [Math.random() * TAU, band + (Math.random() - 0.5) * 2 * S.ringWidth];
      }

      // `normal`: an even disc. The square root spreads sparks evenly over the
      // area instead of bunching them in the middle.
      default:
        return [Math.random() * TAU, Math.sqrt(Math.random())];
    }
  }

  // Fill in every key the caller left out, one level into objects.
  function fill(dst, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = fill(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, src[k]);
      } else if (dst[k] === undefined) {
        dst[k] = src[k];
      }
    }
    return dst;
  }

  /* ---- Fading the trail ---------------------------------------------------
     Fading a canvas a little each frame never reaches zero (the colour
     values round back up), so a faint ghost would stay forever.

     Instead, each frame fully erases one of 12 random pixel masks. Every
     pixel is in exactly one mask, so over 12 frames every pixel is erased
     once, and the trail fades out evenly with no ghost and no flicker. */
  var ditherMasks = null;

  // Builds the 12 masks once (128x128 tiles), shared by every engine.
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
      // Give each pixel to one random mask. Only alpha matters.
      imgs[Math.floor(Math.random() * DITHER_PHASES)].data[i * 4 + 3] = 255;
    }
    for (k = 0; k < DITHER_PHASES; k++) masks[k].getContext('2d').putImageData(imgs[k], 0, 0);
    ditherMasks = masks;
    return ditherMasks;
  }

  // Makes an offscreen canvas.
  function buffer(w, h, smoothing) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = !!smoothing;
    return { canvas: c, ctx: x };
  }

  /* ====================================================================== */

  /* Makes one engine for one canvas. The config passed in is COPIED, then
     missing values are filled from DEFAULTS. Use the returned `cfg` to change
     settings later, not the object you passed in. */
  function createFireworks2(canvas, userCfg) {
    var cfg = fill(userCfg ? JSON.parse(JSON.stringify(userCfg)) : {}, DEFAULTS);
    var ctx = canvas.getContext('2d');

    var w = 0, h = 0, dpr = 1;
    var glowD = 0;   // the downscale the glow buffer was actually built at
    var particleBuf, trailBuf, glowBuf;

    /* ---- Size -------------------------------------------------------------
       Matches the canvas and buffers to the window and screen density. The
       buffers are in device pixels, but all drawing is in CSS pixels, so it
       looks the same on a retina screen. Does nothing if nothing changed. */
    function resize() {
      var nw = canvas.clientWidth || canvas.width || 1;
      var nh = canvas.clientHeight || canvas.height || 1;
      var ndpr = window.devicePixelRatio || 1;
      // A change to glowDownscale also rebuilds the buffers.
      var nd = Math.max(1, cfg.glowDownscale);
      if (nw === w && nh === h && ndpr === dpr && nd === glowD && particleBuf) return;

      w = nw; h = nh; dpr = ndpr; glowD = nd;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      particleBuf = buffer(w * dpr, h * dpr, false);
      trailBuf = buffer(w * dpr, h * dpr, true);
      particleBuf.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailBuf.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The glow buffer is a shrunk copy of the particle buffer, never drawn on
      // directly.
      glowBuf = buffer(Math.floor(w * dpr / glowD), Math.floor(h * dpr / glowD), false);

      ditherPatterns = new Array(DITHER_PHASES); // rebuilt for the new buffer
    }

    /* ---- Colour ----------------------------------------------------------- */

    // A hue for one spark: from spec.hues if given, else from cfg.palette.
    function pickHue(spec) {
      var list;
      if (spec && spec.hues && spec.hues.length) {
        list = spec.hues;
      } else {
        if (cfg.palette === 'random') return Math.random() * 360;
        list = PALETTES[cfg.palette] || PALETTES.fire;
      }
      return list[Math.floor(Math.random() * list.length)];
    }

    // A firework's size: spec.scale if given, else cfg.scale.
    function scaleOf(spec) {
      return (spec && spec.scale) || cfg.scale;
    }

    /* The screen-size factor from cfg.scaleToScreen (1 when off). Applied
       only to how far sparks fly and the flash size, NOT to spark thickness
       or the rocket, so do not fold it into scaleOf(). */
    function screenScale() {
      var S = cfg.scaleToScreen;
      if (!S || !S.enabled) return 1;
      return Math.min(w, h) / Math.max(1, S.reference);
    }

    /* ---- Per-firework settings --------------------------------------------
       spec.settings is a flat list of dotted paths and values, e.g.
       { 'count': 200, 'blast.lead': 45, 'shape.type': 'ring' }, for ONE
       firework. This swaps them into cfg, runs fn, then puts the old values
       back, so no other firework sees them.

       It runs at the burst and again when the sparks spawn (blast.lead ms
       later). Only values read at those moments can differ per firework.
       try/finally makes sure cfg is always restored, even after an error. */
    function withSettings(spec, fn) {
      var over = spec && spec.settings;
      if (!over) return fn();

      var saved = {}, k;
      for (k in over) {
        if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
        saved[k] = readPath(cfg, k);
        writePath(cfg, k, over[k]);
      }
      try {
        fn();
      } finally {
        for (k in saved) writePath(cfg, k, saved[k]);
      }
    }

    // Gives a spark its colour. A share of sparks (spec.white) are drawn
    // near-white; the rest take a hue plus jitter.
    function colour(p, spec) {
      if (spec && spec.white && Math.random() < spec.white) {
        p.h = 45;
        p.s = clamp(8 + (Math.random() - 0.5) * 2 * cfg.jitterSat, 0, 20);
        p.l = clamp(95 + (Math.random() - 0.5) * cfg.jitterLight, 80, 100);
      } else {
        p.h = pickHue(spec) + (Math.random() - 0.5) * 2 * cfg.jitterHue;
        p.s = clamp(BASE_SAT + (Math.random() - 0.5) * 2 * cfg.jitterSat, 30, 100);
        p.l = clamp(BASE_LIGHT + (Math.random() - 0.5) * 2 * cfg.jitterLight, 30, 100);
      }
    }

    /* ---- Particles -------------------------------------------------------- */

    var particles = [];   // live sparks
    var pool = [];        // dead spark objects kept for reuse
    var rockets = [];

    // Adds one spark. Returns null if cfg.poolMax sparks are already live.
    function spawn(x, y, vx, vy, spec) {
      if (particles.length >= cfg.poolMax) return null;
      var p = pool.pop() || {};
      p.x = x; p.y = y;
      p.px = x; p.py = y;   // last frame's position — see the stroke in draw()
      p.vx = vx; p.vy = vy;

      var base = 1 / (cfg.lifeDecay * FPS_REF);
      p.life = 1;
      p.decay = 1 / (base * (1 + (Math.random() - 0.5) * 2 * cfg.lifeSpread));
      p.size = cfg.size * (1 + (Math.random() - 0.5) * 2 * cfg.sizeSpread) * scaleOf(spec);
      colour(p, spec);

      // Spark objects are reused, so reset every field here. Any new
      // per-spark field needs resetting too.
      p.shell = false;

      particles.push(p);
      return p;      // the caller marks shells — see spawnSparkles()
    }

    // Throws out one burst's sparks, in the configured shape. The first
    // sub.count sparks become shells that burst again.
    function spawnSparkles(x, y, spec) {
      var scale = scaleOf(spec);

      // Full speed. The screen factor makes sparks fly further on a bigger
      // screen; spark thickness is not scaled by it.
      var speed = cfg.explosionSize * FPS_REF * scale * screenScale();
      var n = Math.round(cfg.count);

      // Never more shells than there are sparkles to make shells out of.
      var shells = cfg.sub.enabled ? Math.min(Math.round(cfg.sub.count), n) : 0;

      // The shape, read once per burst.
      var S = cfg.shape;
      var type = S.type;

      for (var i = 0; i < n; i++) {
        // Direction and share of full speed, from the shape.
        var g = shapePoint(i, S, type);
        var a = g[0];
        var r = g[1] * speed;
        var p = spawn(x, y, Math.cos(a) * r, Math.sin(a) * r, spec);
        if (!p) break;   // pool is full; the rest of this burst would drop anyway

        if (i < shells) {
          p.shell = true;
          p.subScale = scale;

          // Its life becomes the fuse: it bursts when it dies. +/-15% so the
          // shells do not all burst on the same frame.
          p.decay = 1 / (cfg.sub.delay * (0.85 + Math.random() * 0.3));
        }
      }
    }

    /* A shell's second burst. Same colour as its parent, sized from the
       parent's size. Its sparks are never shells, so it cannot chain further.
       sub.particles, sub.scale and sub.glow are read here, after the
       per-firework swap is over, so they apply to every firework. */
    function spawnSub(x, y, hue, parentScale) {
      var S = cfg.sub;
      var scale = parentScale * S.scale;
      var spec = { hues: [hue], scale: scale };

      // Screen factor applied once here, matching the flash below.
      var speed = cfg.explosionSize * FPS_REF * scale * screenScale();

      if (S.glow && cfg.blast.enabled) spawnBlast(x, y, spec);

      for (var i = 0; i < Math.round(S.particles); i++) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.sqrt(Math.random()) * speed;
        spawn(x, y, Math.cos(a) * r, Math.sin(a) * r, spec);
      }
    }

    /* A burst at (x, y): the flash first, then the sparks blast.lead ms later
       (queued in pendingBursts).

       When testing: with a lead set, no sparks exist on the frame burst() is
       called. Step past the lead before counting them.

       The whole body is inside withSettings() because blast.enabled and
       blast.lead can differ per firework. */
    function burst(x, y, spec) {
      withSettings(spec, function () {
        var B = cfg.blast;
        if (!B.enabled) { spawnSparkles(x, y, spec); return; }
        spawnBlast(x, y, spec);
        if (B.lead > 0) pendingBursts.push({ x: x, y: y, t: B.lead / 1000, spec: spec });
        else spawnSparkles(x, y, spec);
      });
    }

    /* ---- The flash --------------------------------------------------------
       A bright glow at the burst point. Drawn straight onto the visible
       canvas, never into the particle buffer, or it would smear into the
       trail and leave a blob. */

    var blasts = [];
    var pendingBursts = [];   // sparks waiting out cfg.blast.lead

    // Starts a flash: same colours as its firework, sized by the firework's
    // size and the screen factor (fixed for the flash's whole life).
    function spawnBlast(x, y, spec) {
      blasts.push({
        x: x, y: y, age: 0,
        hue: pickHue(spec),
        scale: scaleOf(spec) * screenScale()
      });
    }

    // Ages each flash and removes finished ones.
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

    // Counts down queued bursts and throws their sparks when due.
    function updatePending(dt) {
      for (var i = pendingBursts.length - 1; i >= 0; i--) {
        var q = pendingBursts[i];
        q.t -= dt;
        if (q.t <= 0) {
          pendingBursts[i] = pendingBursts[pendingBursts.length - 1];
          pendingBursts.pop();

          // The spark settings (count, size, shape...) are read now, so apply
          // this firework's own settings again.
          withSettings(q.spec, function () { spawnSparkles(q.x, q.y, q.spec); });
        }
      }
    }

    /* Draws every flash as a radial gradient: it brightens over `rise`, holds
       for `hold`, fades over `decay`, and grows the whole time. */
    function drawBlasts() {
      var B = cfg.blast;
      var reps = Math.max(1, Math.round(B.stack));
      for (var i = 0; i < blasts.length; i++) {
        var b = blasts[i];
        var alpha, grow;

        if (b.age < B.rise) {
          var up = b.age / B.rise;
          alpha = B.peak * up;
          grow = 0.55 + 0.45 * up;         // expands as it ignites
        } else {
          // Keeps growing from 1 up to B.growth, slowing down as it goes.
          var after = (b.age - B.rise) / (B.hold + B.decay);
          grow = 1 + (B.growth - 1) * (1 - (1 - after) * (1 - after));

          if (b.age < B.rise + B.hold) {
            alpha = B.peak;                // sits at full brightness
          } else {
            var down = (b.age - B.rise - B.hold) / B.decay;
            if (down >= 1) continue;
            // Squared fade: drops fast, then a long soft tail.
            alpha = B.peak * (1 - down) * (1 - down);
          }
        }

        var r = B.radius * grow * b.scale;
        var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, 'hsla(' + b.hue.toFixed(0) + ',100%,95%,' + alpha.toFixed(3) + ')');
        g.addColorStop(0.35, 'hsla(' + b.hue.toFixed(0) + ',100%,72%,' + (alpha * 0.45).toFixed(3) + ')');
        g.addColorStop(1, 'hsla(' + b.hue.toFixed(0) + ',100%,60%,0)');

        ctx.fillStyle = g;
        // Filled `stack` times; each fill adds light on top of the last.
        for (var q = 0; q < reps; q++) {
          ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
        }
      }
    }

    /* ---- The rocket -------------------------------------------------------
       Sends a rocket up from the bottom to burst at targetY. It is drawn like
       a spark, so it gets the trail and glow too.

       Only gravity acts on it (no drag), so the launch speed is worked out
       exactly: v = sqrt(2 * g * rise). It bursts at the top of its climb, the
       frame it stops rising. */
    function launch(x, targetY, spec) {
      var g = cfg.gravity * FPS_REF * FPS_REF;
      var y0 = h * cfg.rocket.launchY;
      var rise = Math.max(1, y0 - targetY);
      rockets.push({
        x: x, y: y0, px: x, py: y0,
        vy: -Math.sqrt(2 * g * rise),
        h: pickHue(spec) + (Math.random() - 0.5) * 2 * cfg.jitterHue,
        s: clamp(BASE_SAT + (Math.random() - 0.5) * 2 * cfg.jitterSat, 30, 100),
        l: clamp(cfg.rocket.light + (Math.random() - 0.5) * 2 * cfg.jitterLight, 60, 100),
        size: cfg.rocket.size * scaleOf(spec),
        spec: spec || null
      });
    }

    /* ---- Simulation -------------------------------------------------------
       Moves everything forward by dt seconds: flashes, queued bursts,
       rockets (bursting any at the top), then sparks. Shells that die burst
       again at the end. */

    function update(dt) {
      dt = Math.min(dt || 0, cfg.deltaCap);
      if (dt <= 0) return;

      var gravity = cfg.gravity * FPS_REF * FPS_REF;
      var damp = Math.pow(cfg.drag, dt * FPS_REF);
      var i, p;
      var subQueue = null;   // shells that died this frame, drained below

      updateBlasts(dt);
      // Before moving sparks, so newly released ones move this frame too.
      updatePending(dt);

      for (i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.px = r.x; r.py = r.y;
        r.vy += gravity * dt;
        r.y += r.vy * dt;
        if (r.vy >= 0) {                       // apex
          burst(r.x, r.y, r.spec);
          rockets.splice(i, 1);
          // Tell the caller, after the burst has started.
          if (api.onBurst) api.onBurst(r.x, r.y, r.spec);
        }
      }

      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.px = p.x; p.py = p.y;
        p.vy += gravity * dt;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          // A dying shell is queued for its second burst (not spawned now,
          // since this loop is still walking the list).
          if (p.shell) (subQueue || (subQueue = [])).push(p.x, p.y, p.h, p.subScale);

          // Remove by swapping in the last spark (order does not matter), and
          // keep the object for reuse.
          particles[i] = particles[particles.length - 1];
          particles.pop();
          pool.push(p);
        }
      }

      if (subQueue) {
        for (var q = 0; q < subQueue.length; q += 4) {
          spawnSub(subQueue[q], subQueue[q + 1], subQueue[q + 2], subQueue[q + 3]);
        }
        subQueue = null;
      }
    }

    /* ---- Render ----------------------------------------------------------- */

    var idleTime = 0;                              // seconds with nothing alive
    var ditherPatterns = new Array(DITHER_PHASES); // built when first needed
    var ditherPhase = 0;

    // Draws one spark (or rocket) as a line from its last position to now.
    function segment(c, p) {
      c.strokeStyle = 'hsla(' + p.h + ',' + p.s + '%,' + p.l + '%,' + clamp(p.life, 0, 1) + ')';
      c.lineWidth = p.size;
      c.beginPath();
      c.moveTo(p.px, p.py);
      // A zero-length segment draws nothing with a butt cap, so nudge a
      // stationary particle enough to leave its round cap behind.
      c.lineTo(p.x === p.px && p.y === p.py ? p.x + 0.01 : p.x, p.y);
      c.stroke();
    }

    // Draws one frame, in five steps (numbered below).
    function draw(dt) {
      if (!particleBuf) resize();
      dt = Math.min(dt === undefined ? 1 / 60 : dt, cfg.deltaCap);

      var pc = particleBuf.ctx, tc = trailBuf.ctx, gc = glowBuf.ctx;
      var i;

      /* 1. Particles, crisp, on a cleared buffer. This one buffer feeds BOTH
            the trail and the glow, so every sparkle is drawn exactly once. */
      pc.clearRect(0, 0, w, h);
      pc.lineCap = 'round';
      pc.globalCompositeOperation = 'lighter';
      for (i = 0; i < particles.length; i++) segment(pc, particles[i]);
      for (i = 0; i < rockets.length; i++) {
        var r = rockets[i];
        segment(pc, { px: r.px, py: r.py, x: r.x, y: r.y, h: r.h, s: r.s, l: r.l, size: r.size, life: 1 });
      }

      /* 2. Trail: persistent, never cleared — only eroded, one dither phase
            per frame, then this frame's particles stamped on top. */
      var fadeStep = 1 - Math.pow(1 - cfg.trailFade, dt * FPS_REF);
      ditherPhase = (ditherPhase + 1) % DITHER_PHASES;
      if (!ditherPatterns[ditherPhase]) {
        ditherPatterns[ditherPhase] = tc.createPattern(getDitherMasks()[ditherPhase], 'repeat');
      }

      // When nothing is alive (no sparks, rockets or queued bursts), the erase
      // ramps up over TRAIL_FADEOUT so the leftover streaks fade away smoothly.
      // Flashes do not count, since they never draw into the trail.
      if (particles.length || rockets.length || pendingBursts.length) idleTime = 0;
      else idleTime += dt;

      // Each mask covers 1/12 of the pixels, so erase 12x harder to match
      // cfg.trailFade on average.
      var erase = Math.min(1, fadeStep * DITHER_PHASES);
      if (idleTime > 0) erase += (1 - erase) * Math.min(1, idleTime / TRAIL_FADEOUT);

      tc.save();
      tc.globalCompositeOperation = 'destination-out';
      tc.globalAlpha = erase;
      tc.fillStyle = ditherPatterns[ditherPhase];
      tc.fillRect(0, 0, w, h);
      tc.restore();

      // Then stamp this frame's sparks onto the trail.
      tc.save();
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.globalCompositeOperation = 'lighter';
      tc.globalAlpha = cfg.trailAlpha;
      tc.drawImage(particleBuf.canvas, 0, 0);
      tc.restore();

      /* 3. Glow: the particle buffer squeezed into 1/downscale with smoothing
            OFF. The twinkle is pixels being LOST here — a sparkle that lands
            on a dropped sample vanishes for that frame and comes back on the
            next. Nothing is animated to make it flicker. */
      gc.clearRect(0, 0, glowBuf.canvas.width, glowBuf.canvas.height);
      gc.drawImage(particleBuf.canvas, 0, 0, glowBuf.canvas.width, glowBuf.canvas.height);

      /* 4. Composite, additively, onto the visible canvas. */
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (cfg.background) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = cfg.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        // No background: clear to see-through so the page shows behind.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(trailBuf.canvas, 0, 0);
      ctx.drawImage(particleBuf.canvas, 0, 0);
      ctx.imageSmoothingEnabled = false;   // keep the lost pixels lost on the way back up
      ctx.globalAlpha = cfg.glowAlpha;
      ctx.drawImage(glowBuf.canvas, 0, 0, canvas.width, canvas.height);

      /* 5. The flashes, on top of everything, in CSS pixels. */
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBlasts();
      ctx.restore();
    }

    // Removes everything and wipes the canvas and buffers.
    function clear() {
      while (particles.length) pool.push(particles.pop());
      rockets.length = 0;
      blasts.length = 0;
      pendingBursts.length = 0;
      idleTime = 0;
      if (!particleBuf) return;
      particleBuf.ctx.clearRect(0, 0, w, h);
      trailBuf.ctx.clearRect(0, 0, w, h);
      glowBuf.ctx.clearRect(0, 0, glowBuf.canvas.width, glowBuf.canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Follow window resizes. destroy() removes the listener.
    function onResize() { resize(); }
    window.addEventListener('resize', onResize);
    resize();

    function destroy() {
      window.removeEventListener('resize', onResize);
    }

    // What the caller gets back. Kept in a variable so update() can call
    // api.onBurst, which the caller sets later.
    var api = {
      cfg: cfg,
      canvas: canvas,
      ctx: ctx,
      burst: burst,
      launch: launch,
      update: update,
      draw: draw,
      resize: resize,
      clear: clear,
      destroy: destroy,
      size: function () { return { w: w, h: h }; },
      stats: function () {
        return {
          particles: particles.length,
          pooled: pool.length,
          rockets: rockets.length,
          blasts: blasts.length
        };
      },
      debug: { particles: particles, pool: pool, rockets: rockets, blasts: blasts },

      /* Set this to a function(x, y, spec) to be told the moment each rocket
         bursts. Use it for anything that must happen on a burst, rather than
         guessing the timing. Every rocket calls it; tag your own rockets'
         specs to tell them apart.

         Not stored on cfg, because "Copy config" turns cfg into JSON and
         would silently drop a function. It runs inside update(), so an error
         in it stops the animation loop. */
      onBurst: null
    };

    return api;
  }

  // Extras for the lab: a copy of the defaults, the palettes and FPS_REF.
  createFireworks2.defaults = function () { return JSON.parse(JSON.stringify(DEFAULTS)); };
  createFireworks2.PALETTES = PALETTES;
  createFireworks2.FPS_REF = FPS_REF;

  global.Fireworks2 = createFireworks2;
})(typeof window !== 'undefined' ? window : this);
