/* ==========================================================================
   Fireworks engine 2 — the light one.
   --------------------------------------------------------------------------
   A standalone, minimal port of Hanabi (https://avanderw.co.za/hanabi/,
   github.com/avanderw/hanabi — itself a conversion of a Flash/AS3 effect).
   It shares NO code with `fireworks-engine.js` and neither knows about the
   other; both can be loaded on the same page.

   WHY A SECOND ENGINE. Engine 1 grew a large feature surface — burst shapes,
   sub-blasts, stamps, the blast bloom, smoke, layer isolation, a config
   serialiser. This one keeps only what makes a firework look like a firework
   and drops the rest, so it stays small enough to read in one sitting.

   WHAT IS IN, straight from Hanabi:

     three buffers      particles (crisp) -> trail (persistent) -> glow (1/4
                        res, smoothing off, scaled back up additively). The
                        twinkle is pixels LOST in that downscale; nothing is
                        animated to twinkle.
     physics            gravity 0.2, drag 0.9, life -0.01, all per frame @30fps
     explode            200 particles, radius = sqrt(random) * explosionSize,
                        angle = random * 2pi  (sqrt = area-uniform disc)
     palettes           fire / blue / purple / random, jittered +-5 hue,
                        +-10 sat, +-10 light per sparkle
     burst shapes       normal / ring / star burst / concentric, ported from
                        engine 1 verbatim. A geometry answers exactly one
                        question — for particle i, what angle and what fraction
                        of maximum speed — so it costs one function and nothing
                        else. `normal` is the original even disc unchanged.

   WHAT IS OUT, deliberately: smoke (a 4th buffer plus a radial gradient per
   puff — by far the biggest per-frame cost), mass/flutter variance, layer
   isolation. If a show needs any of those, it wants engine 1.

   `squiggle`, engine 1's fifth shape, is out with them: it is not a launch
   geometry at all — it carries a per-particle field and a term in the
   integration loop, so it is a physics change rather than one more case.

   --------------------------------------------------------------------------
   THE ONE CONVERSION THAT MATTERS. Hanabi's constants are PER FRAME at 30fps.
   This loop is delta-time integrated in seconds, so every one of them is
   converted at read time against FPS_REF = 30:

       gravity   0.2  /frame^2  ->  x FPS_REF^2  ->  180 px/s^2
       drag      0.9  /frame    ->  pow(drag, dt * FPS_REF)
       life      0.01 /frame    ->  1/(0.01 * FPS_REF) = 3.33 s
       speed     10   /frame    ->  x FPS_REF        ->  300 px/s

   Using them raw in a 60fps loop makes everything fall twice too fast and die
   three times too early. Sanity check: terminal fall lands at ~55 px/s and
   must not change with framerate.

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

   `spec` — the optional last argument to burst/launch — describes one
   firework, so a scripted show can differ from a click:

       { hues: [357, 352, 2], white: 0.33, scale: 1.5 }

   Omit it and the burst falls back to cfg.palette and cfg.scale.

   Classic script on purpose: no ES module, so it works off file:// and under
   a CSP that forbids inline script.
   ========================================================================== */

(function (global) {
  'use strict';

  // Hanabi's constants are per-frame at this rate. See the header.
  var FPS_REF = 30;
  var TAU = Math.PI * 2;

  // Hanabi's palettes as hue lists. Base saturation/lightness are a judgement
  // call — only the jitter ranges were recoverable from the reference — picked
  // to read as hot sparks rather than pastel.
  var PALETTES = {
    fire:   [357, 58, 46, 9, 352],
    blue:   [220, 200, 240, 180, 210],
    purple: [280, 300, 260, 320, 270]
  };
  var BASE_SAT = 90;
  var BASE_LIGHT = 62;

  var DITHER_PHASES = 12;   // see getDitherMasks()
  var TRAIL_FADEOUT = 0.6;  // seconds the trail takes to empty once idle

  var DEFAULTS = {
    // Opaque fill painted under everything. Additive blending needs real
    // pixels to add to, so a stage wants a colour here. Set null to composite
    // onto transparency instead — what an overlay over a live page needs.
    background: '#050a18',

    palette: 'fire',        // fire | blue | purple | random
    scale: 1,               // global size: spread and shard together

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

    /* How the sparkles LEAVE the burst. Ported from engine 1, values included.
       Only the launch geometry — physics, colour, life and rendering are
       identical whichever is chosen, which is why a shape costs one function.

       `normal` is the original even disc and is byte-for-byte what this engine
       did before shapes existed, so nothing changes until something asks.

       The two ring knobs are DIFFERENT things on different shapes, and the
       names are engine 1's: `ringThickness` is how deep the single `ring`
       shell is, `ringWidth` is the +/- spread around each of `concentric`'s
       several bands. */
    shape: {
      type: 'normal',       // normal | ring | star burst | concentric
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      ringWidth: 0.04,
      ringThickness: 0.08
    },

    deltaCap: 0.064,        // clamp on dt, so a stalled tab resumes not teleports

    rocket: {
      size: 4,              // px — a sparkle is ~1-2
      launchY: 1.0,         // launch height as a fraction of canvas height
      light: 88             // hotter than a sparkle's BASE_LIGHT
    },

    // The shell detonating. Hanabi has no equivalent — this is carried over
    // from engine 1, where it was the one thing that made a break read as an
    // explosion rather than as particles appearing.
    blast: {
      enabled: true,
      lead: 60,             // ms the light arrives BEFORE its own debris
      radius: 140,          // px at ignition, before growth
      peak: 0.55,           // brightest alpha it reaches
      rise: 0.06,           // s to ignite
      hold: 0.15,           // s at full brightness
      decay: 1.8,           // s fading out

      // End radius as a multiple of the ignition radius.
      //
      // Without this the bloom holds ONE fixed radius for its whole life while
      // its alpha falls, and a radial gradient fading at a fixed radius appears
      // to COLLAPSE INWARD: the faint rim drops below the visible threshold
      // first and the bright middle drops last, so the lit disc marches inward
      // even though the geometry never moves. Expanding as it fades is what
      // makes it read as light spreading out and dying.
      growth: 1.6,

      // How many times the bloom is drawn on top of itself. 1 is one draw —
      // the plain flash. Higher is the big blown-out white core you otherwise
      // only get by clicking the same spot over and over.
      //
      // It exists because `peak` cannot reach that. The bloom is a three-stop
      // gradient and every stop's alpha clamps at 1, so raising `peak` saturates
      // the stops one after another and then does nothing at all — measured in
      // engine 1 on one burst: peak 1.0 lights 982 blown-out pixels, 2.75 lights
      // 3941, and 5.0 lights the same 3941. That is simply the ceiling for one
      // draw. Drawing AGAIN is not subject to it, because each fill adds to what
      // is already on the canvas under the additive composite.
      //
      // One honest difference from really clicking repeatedly: those are separate
      // blasts that each roll their own hue, so their halo is a blend. This
      // repeats ONE blast, so the halo keeps that blast's single hue.
      stack: 1
    },

    /* Secondary bursts — some of the first burst's own sparkles break again.
       Ported from engine 1, where it was built and tuned.

       The whole mechanism is that a shell is an ORDINARY sparkle whose life IS
       the fuse. It breaks when it dies, so the countdown needs no extra field
       and the shard visibly dims on its way to its own break. */
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

  /* ---- Burst shapes -----------------------------------------------------
     Ported from engine 1 unchanged, squiggle excepted — see the header.

     A shape answers ONE question and nothing else: for particle `i`, at what
     angle does it leave, and at what fraction of maximum speed. Everything
     downstream — drag, gravity, life, hue, how it is drawn — is identical
     whatever comes back. That is the whole reason a new geometry is cheap:
     it is a case in a switch, not a feature.

     Both functions are pure, so they sit at module level and are shared by
     every instance rather than being rebuilt per canvas. */

  function starRadius(angle, points, inner) {
    var seg = TAU / points;
    var t = (angle % seg) / seg;    // position within one point, 0..1
    var d = Math.abs(t - 0.5) * 2;  // 0 at the tip, 1 at the valley
    return 1 - d * (1 - inner);
  }

  function shapePoint(i, S, type) {
    switch (type) {
      // A hollow hoop: every spark starts at the outer edge, so the middle
      // stays empty instead of filling in. `concentric` with one ring is a
      // near neighbour, but this is the shape people actually reach for and
      // it should not need discovering.
      case 'ring':
        return [Math.random() * TAU, 1 - Math.random() * S.ringThickness];

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

      // sqrt gives uniform density per unit AREA. A plain uniform radius piles
      // particles toward the centre and reads as a hollow-cored blob; this
      // fills the disc evenly. This is exactly what spawnSparkles() did before
      // shapes existed, which is what makes `normal` a no-op.
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

  /* ---- The dithered trail erase -----------------------------------------
     A proportional erase can never reach zero on an 8-bit canvas: once
     alpha*fade < 0.5 it rounds back up, stranding every touched pixel at
     ~0.5/fade and leaving a permanent ghost of the burst.

     So the strong erase is scattered SPATIALLY. Each frame one mask's worth
     of pixels is erased hard enough to round to zero and the rest are left
     alone; averaged over a cycle every pixel decays at the same rate, but no
     single frame changes the whole image, so there is nothing to flicker.

     The masks PARTITION the pixels rather than sampling them randomly — each
     pixel belongs to exactly one mask, so a full cycle erases every pixel
     exactly once. Random selection leaves some pixels untouched for long
     stretches and those linger as bright speckle.                          */
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

  function buffer(w, h, smoothing) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = !!smoothing;
    return { canvas: c, ctx: x };
  }

  /* ====================================================================== */

  function createFireworks2(canvas, userCfg) {
    var cfg = fill(userCfg ? JSON.parse(JSON.stringify(userCfg)) : {}, DEFAULTS);
    var ctx = canvas.getContext('2d');

    var w = 0, h = 0, dpr = 1;
    var glowD = 0;   // the downscale the glow buffer was actually built at
    var particleBuf, trailBuf, glowBuf;

    /* ---- Size -------------------------------------------------------------
       Buffers are allocated in DEVICE pixels and every context is scaled by
       dpr, so all the maths below is in CSS pixels and reads the same on a
       retina display as on a plain one. */
    function resize() {
      var nw = canvas.clientWidth || canvas.width || 1;
      var nh = canvas.clientHeight || canvas.height || 1;
      var ndpr = window.devicePixelRatio || 1;
      // glowDownscale is checked here too, so changing it at runtime rebuilds
      // the buffer instead of silently doing nothing — cfg is read live, and a
      // value that only applied at construction would be a lie.
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

      // Glow lives at 1/downscale of DEVICE resolution and is never scaled by
      // dpr — it is a downsample of the particle buffer, not a drawing surface.
      glowBuf = buffer(Math.floor(w * dpr / glowD), Math.floor(h * dpr / glowD), false);

      ditherPatterns = new Array(DITHER_PHASES); // patterns belong to the old ctx
    }

    /* ---- Colour ----------------------------------------------------------- */

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

    function scaleOf(spec) {
      return (spec && spec.scale) || cfg.scale;
    }

    // White cannot be expressed as a hue — every sparkle would otherwise take
    // BASE_SAT — so `spec.white` picks a fraction to draw desaturated and
    // lifted instead. That is what keeps white exclusive to the bursts asking
    // for it rather than bleeding into every palette.
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

    var particles = [];
    var pool = [];
    var rockets = [];

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

      // Cleared explicitly: particles are POOLED, so without this a shell would
      // leak its flag into whatever sparkle reuses the object next and that one
      // would break again for no reason. Any per-particle field added later
      // needs the same treatment.
      p.shell = false;

      particles.push(p);
      return p;      // the caller marks shells — see spawnSparkles()
    }

    /* Hanabi's explode(): an area-uniform disc. sqrt(random) is the whole
       trick — a plain random radius crowds the centre, because the area of a
       ring grows with its radius. */
    function spawnSparkles(x, y, spec) {
      var scale = scaleOf(spec);
      var speed = cfg.explosionSize * FPS_REF * scale;
      var n = Math.round(cfg.count);

      // Never more shells than there are sparkles to make shells out of.
      var shells = cfg.sub.enabled ? Math.min(Math.round(cfg.sub.count), n) : 0;

      // A shape belongs to the burst, not to the sparkle, so both are read
      // once out here rather than per particle.
      var S = cfg.shape;
      var type = S.type;

      for (var i = 0; i < n; i++) {
        // Angle, and speed as a FRACTION of this burst's maximum. Everything
        // below is identical whatever the shape returned.
        var g = shapePoint(i, S, type);
        var a = g[0];
        var r = g[1] * speed;
        var p = spawn(x, y, Math.cos(a) * r, Math.sin(a) * r, spec);
        if (!p) break;   // pool is full; the rest of this burst would drop anyway

        if (i < shells) {
          p.shell = true;
          p.subScale = scale;

          // Life IS the fuse. Overwriting decay rather than adding a countdown
          // is the whole trick: the shard dims as it goes, and it breaks at the
          // moment it would have died anyway.
          //
          // +/-15% on it. With an exact fuse every shell breaks on the same
          // frame, which reads as one mechanical pop rather than a scatter.
          p.decay = 1 / (cfg.sub.delay * (0.85 + Math.random() * 0.3));
        }
      }
    }

    /* One shell's break. Children inherit the parent's hue, so a red firework
       does not scatter into gold, and they are never shells themselves —
       spawn() clears the flag — so this cannot cascade to a third generation.

       ONE DELIBERATE DIFFERENCE FROM ENGINE 1: children take their parent's
       scale (`p.subScale`), where engine 1 used the global `cfg.scale`. In this
       show a firework's size comes from its `spec`, not from cfg.scale, so
       engine 1's version would give a 4.4x firework children sized as though it
       were 1x — visible as almost nothing. */
    function spawnSub(x, y, hue, parentScale) {
      var S = cfg.sub;
      var scale = parentScale * S.scale;
      var spec = { hues: [hue], scale: scale };
      var speed = cfg.explosionSize * FPS_REF * scale;

      if (S.glow && cfg.blast.enabled) spawnBlast(x, y, spec);

      for (var i = 0; i < Math.round(S.particles); i++) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.sqrt(Math.random()) * speed;
        spawn(x, y, Math.cos(a) * r, Math.sin(a) * r, spec);
      }
    }

    /* A break is the flash and its debris, and the light goes FIRST — the
       sparkles are held back by cfg.blast.lead so they arrive out of a flash
       that is already lit, rather than appearing alongside it.

       NOTE for anyone testing: with a lead set, burst() spawns NO particles on
       the frame it is called. A hand-stepped check that steps one or two frames
       and reads the count sees zero and looks like a broken burst. Step past
       the lead, or set blast.lead = 0 for the test. */
    function burst(x, y, spec) {
      var B = cfg.blast;
      if (!B.enabled) { spawnSparkles(x, y, spec); return; }
      spawnBlast(x, y, spec);
      if (B.lead > 0) pendingBursts.push({ x: x, y: y, t: B.lead / 1000, spec: spec });
      else spawnSparkles(x, y, spec);
    }

    /* ---- The flash --------------------------------------------------------
       The shell detonating: a bright bloom at the burst point.

       Drawn at COMPOSITE level only, never into particleBuf — that buffer is
       stamped wholesale into the trail, and a soft gradient this large smeared
       into the trail leaves a lingering blob sitting over the burst long after
       the flash itself is gone. */

    var blasts = [];
    var pendingBursts = [];   // sparkles waiting out cfg.blast.lead

    // The bloom takes its hue from the same set as its own sparkles, so a red
    // firework does not detonate gold, and carries the firework's scale so a
    // 2x burst gets a 2x flash instead of the same fixed blob every time.
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
          // Keeps expanding for the whole rest of its life rather than freezing
          // at the ignition radius — see the note on B.growth. Starts at exactly
          // 1, where the ramp above ended, so the size never jumps, and
          // decelerates from there, which is how an expanding bloom behaves.
          var after = (b.age - B.rise) / (B.hold + B.decay);
          grow = 1 + (B.growth - 1) * (1 - (1 - after) * (1 - after));

          if (b.age < B.rise + B.hold) {
            alpha = B.peak;                // sits at full brightness
          } else {
            var down = (b.age - B.rise - B.hold) / B.decay;
            if (down >= 1) continue;
            // Squared falloff: bright for a moment, then a long soft tail
            // rather than a linear ramp, which reads as a light source dying.
            alpha = B.peak * (1 - down) * (1 - down);
          }
        }

        var r = B.radius * grow * b.scale;
        var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, 'hsla(' + b.hue.toFixed(0) + ',100%,95%,' + alpha.toFixed(3) + ')');
        g.addColorStop(0.35, 'hsla(' + b.hue.toFixed(0) + ',100%,72%,' + (alpha * 0.45).toFixed(3) + ')');
        g.addColorStop(1, 'hsla(' + b.hue.toFixed(0) + ',100%,60%,0)');

        ctx.fillStyle = g;
        // Built once, then RE-FILLED. Each fill adds to what is already on the
        // canvas under the additive composite, which is the whole point — it is
        // repeated draws, not a brighter one, that get past the alpha-clamp
        // ceiling. See the note on cfg.blast.stack.
        for (var q = 0; q < reps; q++) {
          ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
        }
      }
    }

    /* ---- The rocket -------------------------------------------------------
       One node, drawn the same way a sparkle is — a stroked segment into the
       same particle buffer — so it picks up the trail and the glow for free.

       No drag. The sparkles' damping is what makes a burst snap and hang, but
       on the ascent it would eat the launch velocity. Gravity alone means the
       launch speed solves exactly (v = sqrt(2*g*rise)) and the shell bursts at
       apex — the frame vy turns positive — so it can never stall short or sail
       past its target. */
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

    /* ---- Simulation ------------------------------------------------------- */

    function update(dt) {
      dt = Math.min(dt || 0, cfg.deltaCap);
      if (dt <= 0) return;

      var gravity = cfg.gravity * FPS_REF * FPS_REF;
      var damp = Math.pow(cfg.drag, dt * FPS_REF);
      var i, p;
      var subQueue = null;   // shells that died this frame, drained below

      updateBlasts(dt);
      // Drained before the integration below, so sparkles released this frame
      // are moved on the same frame a rocket's own burst would have moved them.
      updatePending(dt);

      for (i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.px = r.x; r.py = r.y;
        r.vy += gravity * dt;
        r.y += r.vy * dt;
        if (r.vy >= 0) {                       // apex
          burst(r.x, r.y, r.spec);
          rockets.splice(i, 1);
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
          // Queued, not spawned here: spawning would push onto the very array
          // this loop is walking with swap-and-pop.
          if (p.shell) (subQueue || (subQueue = [])).push(p.x, p.y, p.h, p.subScale);

          // swap-and-pop: draw order is irrelevant under additive blending,
          // and splice would shift the tail on every death.
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

    var idleTime = 0;                              // seconds since the last death
    var ditherPatterns = new Array(DITHER_PHASES); // built lazily, need the ctx
    var ditherPhase = 0;

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

      // Once nothing is alive the erase ramps to full over TRAIL_FADEOUT so the
      // streaks dissolve. A clearRect would also reach zero, but between two
      // frames — whatever was still lit snaps out of existence instead.
      // Rockets count as alive: during an ascent there are no particles yet,
      // and without this the ramp would erase the rocket's own trail from
      // under it as it climbs. A burst waiting out blast.lead counts for the
      // same reason — for those 60ms there is nothing on either list, and the
      // trail would start dissolving in the gap between the flash and its own
      // debris.
      //
      // A live BLAST deliberately does NOT count. The question this asks is
      // "is anything about to deposit into the trail", not "is anything on
      // screen" — the flash never touches the trail buffer, and it outlives the
      // last sparkle by up to two seconds. Counting it would hold the fade-out
      // open for that whole time and leave the streaks hanging.
      if (particles.length || rockets.length || pendingBursts.length) idleTime = 0;
      else idleTime += dt;

      // Erase strength is raised by the phase count so that, averaged over the
      // pixels actually hit, the decay rate is the one cfg.trailFade asks for.
      var erase = Math.min(1, fadeStep * DITHER_PHASES);
      if (idleTime > 0) erase += (1 - erase) * Math.min(1, idleTime / TRAIL_FADEOUT);

      tc.save();
      tc.globalCompositeOperation = 'destination-out';
      tc.globalAlpha = erase;
      tc.fillStyle = ditherPatterns[ditherPhase];
      tc.fillRect(0, 0, w, h);
      tc.restore();

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
        // Transparent stage: the page behind shows through and the browser
        // does the layering. Additive blending has nothing of its own to add
        // to, which is the one visible difference from an opaque background.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(trailBuf.canvas, 0, 0);
      ctx.drawImage(particleBuf.canvas, 0, 0);
      ctx.imageSmoothingEnabled = false;   // keep the lost pixels lost on the way back up
      ctx.globalAlpha = cfg.glowAlpha;
      ctx.drawImage(glowBuf.canvas, 0, 0, canvas.width, canvas.height);

      /* 5. The flash, still additive and ABOVE the layers: it is a light
            source, so it washes over the sparkles rather than sitting behind
            them. Back into CSS pixels first — a blast's x/y is where the burst
            was asked for, which is not a device-pixel coordinate. */
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBlasts();
      ctx.restore();
    }

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

    function onResize() { resize(); }
    window.addEventListener('resize', onResize);
    resize();

    function destroy() {
      window.removeEventListener('resize', onResize);
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
      debug: { particles: particles, pool: pool, rockets: rockets, blasts: blasts }
    };
  }

  createFireworks2.defaults = function () { return JSON.parse(JSON.stringify(DEFAULTS)); };
  createFireworks2.PALETTES = PALETTES;
  createFireworks2.FPS_REF = FPS_REF;

  global.Fireworks2 = createFireworks2;
})(typeof window !== 'undefined' ? window : this);
