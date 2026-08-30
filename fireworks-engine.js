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
      type: 'normal',       // normal | ring | star burst | concentric | squiggle
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      // Belongs to `concentric`. Note `ringThickness` below is a DIFFERENT knob
      // on a different shape — this one is the ± spread around each of several
      // bands, that one is the depth of the single `ring` shell.
      ringWidth: 0.04,
      // `ring` only: how far in from the outer edge the shell reaches. Small
      // values are a clean hoop, large ones fill in toward the middle.
      ringThickness: 0.08,
      waveAmp: 500,
      waveFreq: 3,

      // Per-frame random dimming of the SPARK ITSELF, independent per particle,
      // with no stored state or shared rhythm — so nothing about it repeats.
      //
      // This is NOT the existing wink (the cos(rot) width collapse in draw()):
      // the wink is a smooth oscillation, so each spark blinks at its own
      // STEADY rate. Only the phases and rates are random, not the blinking.
      // This is the actually-random one.
      //
      // ⚠ It is also the one deliberate exception to the rule that trail
      // effects touch the deposit only and never the head (see cfg.trail). A
      // spark that "flickers" has to flicker whole, so this scales the deposit
      // and the head together, by the same factor in the same frame. Turning it
      // up also makes the head itself wink, which it otherwise never does
      // because the wink only scales the deposit's stroke width.
      //
      // 0 (default) dims nothing — today's steady spark.
      sparkFlicker: 0
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

    // The second stage: a shape hung in the sky and filled with sparkles that
    // do not move. See the stamp section further down for why these are NOT
    // particles and keep a list of their own.
    stamp: {
      enabled: false,

      // How the shape arrives.
      //
      //   'instant'  every ball placed on one frame, already where it belongs.
      //   'bursts'   a handful of mini bursts go off inside the shape and
      //              throw real sparks out — a random angle and a random
      //              speed, the same formula an ordinary shell break uses —
      //              rather than solving a velocity to land on a target. Drag
      //              brings them to a stop wherever that honest throw put
      //              them, so the fill is whatever that many small bursts
      //              actually scatter, not a placement.
      //
      // Gravity is off for these — it would carry them down before the shape
      // has even finished forming.
      mode: 'bursts',
      bursts: 8,            // how many mini bursts
      burstSpread: 0.35,    // s · window they go off across
      burstGlow: true,      // each mini burst gets its own flash

      // Seconds the scatter is allowed to run before a ball is treated as
      // done and the engine stops moving it. Drag is exponential and never
      // mathematically stops a particle, so this is a cutoff, not an
      // arrival — long enough that the decay has settled it wherever it
      // lands.
      //
      // The hold, the fade and each ball's own pop below all start counting
      // from HERE, not from launch — so a ball does not spend part of its
      // held life still in the air.
      settle: 1.2,

      // Seconds after the break before the stamp lights.
      //
      // This has to clear the TRAIL, not the last sparkle — the trail keeps
      // erasing for TRAIL_FADEOUT (0.6s) after the final spark dies, and a
      // stamp timed off the particle count alone lands on a sky that still
      // has 745 lit samples in it. Measured at the current lifetimes: last
      // spark 2.72s, sky actually black 3.32s. 3.7 leaves a ~0.4s gap of
      // genuinely empty sky before the shape appears.
      delay: 3.7,

      // The outline, as a superellipse:  |x|^n + |y|^n <= r^n
      //
      // n = 1 is a straight-sided diamond. Below 1 the sides bow inward and
      // the points sharpen — 2/3 is the astroid. Lower slims the middle
      // further: the waist sits at 50% of the point at 2/3, 35% at 0.5, and
      // 23% at 0.38.
      n: 0.38,

      // Degrees. 0 leaves the formula untransformed, which puts the four
      // points on the AXES and reads as a "+". 45 turns them onto the
      // diagonals, which is the X.
      rotation: 45,

      count: 2500,

      // How sparkles are shared out between directions — the exponent on the
      // edge distance.
      //
      // 2 is the neutral value, not 0: a spoke's area grows as edge^2, so
      // weighting by exactly that renders the shape faithfully — fat middle,
      // arms tapering to points. Anything ABOVE 2 buys fuller arms by taking
      // sparkles out of the body, and it goes wrong faster than it looks: 8
      // strips the middle away entirely and leaves four hairlines with no
      // shape between them.
      //
      // So the honest way to fill the arms is `count`, not this. Left at the
      // neutral 2, with the arms filled by sparkle count instead.
      fillPoints: 2,

      // Scatter across the outline, so the edge is not razor-cut.
      softness: 0.01,

      // Radius, as a multiple of how far the parent burst's own sparkles
      // reach — so the stamp arrives the same size as the firework that made
      // it, whatever the physics is tuned to.
      size: 1,

      // 'bursts' only: how far each mini burst's own sparks scatter, as a
      // multiplier on a radius sized so `bursts` of them roughly share the
      // shape's area between them (R / sqrt(bursts)). 1 is that derived
      // share; above 1 the pops overlap more and the shape reads fuller with
      // softer edges, below 1 they stay small and distinct and can leave
      // visible gaps between them.
      scatter: 1,

      dotSize: 1.4,
      life: 5,              // seconds it hangs before going out

      // Fraction of that life spent fading. The stamp holds FULL brightness
      // for the rest, which is the point: a sparkle that starts dimming the
      // instant it lights reads as already dying, and the stamp is supposed
      // to hang there. So brightness is flat until the last `fade` of its
      // life, then ramps to nothing.
      //
      // Deliberately not the linear life/maxLife that particles use — that
      // curve suits an ember thrown out to die, not a shape held in the sky.
      fade: 0.35,

      // Each ball's own little pop as it lights: a brief lift toward white,
      // slightly larger, decaying away. NOT one flash for the whole stamp —
      // 2500 of them going off together is what gives the switch-on its
      // sparkle instead of the shape simply being there on the next frame.
      //
      // The decay is squared so it snaps rather than oozes, and each ball
      // carries its own flash length (+/-40%), so they do not all finish on
      // the same frame and read as one mechanical blink.
      // Balls do NOT all pop on the same frame, and that is not a detail.
      // Under additive blending 2500 overlapping dots are already near
      // saturation at rest; lift them together by even 0.3 and 77% of the
      // shape clips to pure white, so it renders as a solid silhouette with
      // no sparkles left in it. Spreading ignition over `flashStagger` means
      // only a fraction are hot at any instant, which reads as the stamp
      // crackling alight instead of a white wash. The stamp still ARRIVES
      // instantly — every ball is placed on the same frame; only their pops
      // are staggered.
      flash: 0.7,           // 0-1 · how hard each ball pops · 0 = off
      flashTime: 0.18,      // s · one ball's pop, before its own variation
      flashStagger: 0.35,   // s · window the pops are spread across

      // The hang is the boring part unless the balls are alive, so each one
      // breathes on its own smooth cycle — its own rate and its own starting
      // phase, so nothing about it lines up or repeats as a rhythm.
      //
      // Deliberately NOT the per-frame random dimming that shape.sparkFlicker
      // uses. That is right for a spark in flight, where the eye is tracking
      // movement; on 2500 dots nailed to the sky it reads as television
      // static. A slow per-ball oscillation reads as twinkling instead.
      //
      // The rate is applied live rather than baked at spawn, so dragging the
      // slider changes a stamp that is already hanging.
      flicker: 0.45,        // 0-1 · how deep the dip goes · 0 = steady
      flickerRate: 6        // Hz, before each ball's own +/-40%
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

      // Lifetime spread. Multiplies the base life, so the real range is
      // 1/(lifeDecay * FPS_REF) times these — 1.0s to 2.7s at the defaults.
      //
      // Pulled in from the reference's 0.5/2.5 so that a stamp can follow the
      // burst onto an empty sky. At 2.5 the longest-lived sparkles run 8.3s,
      // which no watchable stamp delay can outlast. The overlay sets its own
      // pair and is unaffected.
      fadeMin: 0.3,
      fadeMax: 0.8
    },

    // The shell detonating · neither library has this
    blast: {
      enabled: true,
      lead: 60,             // ms
      radius: 140,
      peak: 0.55,
      rise: 0.06,           // s
      hold: 0.15,
      decay: 1.8,
      // End radius as a multiple of the ignition radius — same idea, and the
      // same name, as core.growth below.
      //
      // Without this the bloom held ONE fixed radius for its whole hold+decay
      // while its alpha fell, and a radial gradient fading at a fixed radius
      // appears to COLLAPSE INWARD: the faint rim drops below the visible
      // threshold first and the bright middle drops last, so the lit disc
      // marches inward even though the geometry never shrinks. Expanding as
      // it fades is what makes it read as light spreading out and dying
      // instead of being sucked back in.
      growth: 1.6,

      // How many times the bloom is drawn on top of itself. ONLY read for
      // shape.type 'sphere without trails'; every other pattern draws once,
      // exactly as before.
      //
      // This exists because `peak` cannot reach the effect it is for. The
      // bloom is a three-stop gradient and every stop's alpha clamps at 1, so
      // raising `peak` saturates the stops one after another and then stops
      // doing anything at all: measured on one burst, peak 1.0 lights 982
      // blown-out pixels, 2.75 lights 3941, and 5.0 lights the same 3941.
      // 3941 is simply the ceiling for one draw.
      //
      // Drawing again is not subject to that ceiling, because each fill adds
      // to what is already on the canvas under the additive composite. Same
      // measurement, stacking instead of brightening: 1 draw 0, 2 draws 1450,
      // 3 draws 4318, 5 draws 8670 — past the single-draw ceiling by the
      // third and still climbing. It is the big blown-out white core you get
      // by clicking the same spot over and over, which no single value could
      // express.
      //
      // One difference from really clicking repeatedly: those are separate
      // blasts that each roll their own hue, so their halo is a blend. This
      // repeats ONE blast, so the halo keeps that blast's single hue.
      stack: 1
    },

    // The white core at the middle of the break · lights instantly, grows as
    // it dies.
    core: {
      // Off by default — it read as a second circle collapsing inward at the
      // break rather than as part of one flash. Everything below still works
      // if it is switched back on.
      enabled: false,
      radius: 22,           // px at size 1 · multiplied by the firework's size
      life: 0.45,           // s at size 1 · likewise, so big shells burn longer
      peak: 1,              // alpha at the instant it lights
      growth: 2.2,          // end radius as a multiple of the starting radius
      // Shapes the fade: higher holds the brightness up for longer and then
      // drops it more abruptly at the end, lower fades more evenly from the
      // start. (Its sense changed when the fade curve was fixed — see the
      // note in drawCores.)
      falloff: 1.6,
      // How much of the disc stays at full alpha before the rim fades. Low
      // values are a soft smudge that vanishes into the blast; high values are
      // a hard-edged ball.
      edge: 0.62,

      // --- The morphing flash · opt-in, added 2026-08-28 ------------------
      // Off leaves every value above behaving exactly as it always has. On,
      // the core stops being a round disc: it swells while its outline slides
      // from a circle into a four-pointed star, then shrinks away to nothing.
      // See drawMorphCore().
      //
      // `edge` and `falloff` are NOT read while this is on — they shape the
      // radial gradient, and the morphing flash is built from stacked shapes
      // instead. `radius`, `life`, `peak` and `growth` all still apply.
      morph: false,

      // Pointiness of the star it becomes: the exponent of the superellipse
      // |x|^n + |y|^n = r^n. Below 1 the sides bow inward and the corners come
      // to points — the waist sits at 50% of the point at n = 0.67, 23% at
      // 0.38. Deliberately its OWN value and deliberately not read from
      // cfg.stamp.n: the flash and the DBS spark stamp are tuned separately
      // and are not required to agree.
      morphN: 0.38,

      // Fraction of the core's life spent expanding and morphing; the rest is
      // spent shrinking away. The core only lives `life` seconds (0.45 at
      // size 1), so if the morph reads as too quick to follow, the dial to
      // raise is `life` — this only moves where the two phases meet.
      morphSplit: 0.55
    },

    // The shell on its way up.
    rocket: {
      size: 5,              // px — a sparkle is 1-3
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's BASE_LIGHT
    },

    // Step 1 of the ribbon -> natural-trail rework: separates the deposit
    // (what gets stamped into the persistent trail buffer — since Step 7
    // below, an explicit teardrop rather than a plain stroke) from the head
    // (an extra bright dot at the particle's current point, layered on top).
    // headSize 0 draws no extra head dot at all — nothing changes there until
    // the lab turns it on.
    trail: {
      width: 1,             // teardrop girth, x — the tail's width at the head end
      headSize: 0,          // extra bright dot at the head, x sparkle size · 0 = off

      // Step 6: the head's own lightness/saturation, blended toward the same
      // "hot" reference the cooling curve flashes to (hotLight, below) — so
      // it reads as a distinctly hotter point than the trail it's leaving,
      // not just a bigger copy of the same colour. The glow buffer already
      // blurs particleBuf cheaply via downscale/upscale (see sizeGlow); a
      // bigger, brighter, rounder head is what turns that existing blur into
      // a bloom around a point of light instead of just a fatter sliver. A
      // per-particle radial gradient would do this more smoothly but was
      // deliberately not built — at up to poolMax particles a gradient per
      // particle per frame is real cost for a softening the cheap blur
      // already gets close enough to. 0 (default) leaves the head at the
      // particle's own colour, exactly as step 1 built it.
      headBoost: 0,          // 0-1 · blend toward hotLight/near-white

      // Step 3: tapers the DEPOSIT's width across the particle's life, same
      // mechanism as the colour cooling above — the stamp made at each
      // instant keeps whatever width it was stamped at. Bidirectional and
      // centred on age 0.5, where the factor is always 1 regardless of the
      // taper amount: +1 stamps full width near spawn narrowing to zero by
      // death, -1 the reverse, 0 (default) stamps the old constant width.
      // Which sign reads as "natural" is not obvious from the geometry alone
      // — decide by eye.
      taper: 0,

      // Step 4: every ember today deposits at the same strength, so a whole
      // burst decays in lockstep — a comb of identical streaks. This gives
      // each particle its own deposit-strength factor, fixed at spawn, so
      // some run as long streamers and others barely leave a mark, at the
      // SAME global erase rate. 0 (default) assigns every particle strength
      // 1 — today's uniform deposit, unchanged.
      spread: 0,

      // Step 5: the existing wink (the width's cos(rot) collapse, above) is a
      // slow smooth oscillation — regular beads along the streak. This is a
      // separate, faster effect: an independent random jitter on the
      // DEPOSIT's alpha every single frame, per particle, with no shared
      // rhythm to read as mechanical. The wink is deliberately left exactly
      // as it was and still only touches the deposit's width — the head
      // stays steady, the same call made for cool/taper/spread above, so the
      // head keeps reading as the particle's true, unflickering state.
      // 0 (default) applies no jitter — today's flat deposit alpha.
      flicker: 0,

      // Step 2: cools the DEPOSIT's colour across the particle's life — a
      // brief hot flash near spawn, settling into the particle's own assigned
      // colour, then dimming toward a fixed ember hue as it dies. The head
      // (above) is unaffected — it always shows the particle's true colour,
      // full brightness, as the actively burning tip. `cool` is a blend
      // against the flat colour used before this existed; 0 reproduces it
      // exactly, so nothing changes until the lab turns it up.
      cool: 0,               // 0-1 · blend toward the cooling curve below
      hotLight: 95,          // lightness of the near-spawn flash
      emberHue: 15,          // hue the deposit dims toward by end of life
      emberLight: 25,        // lightness at end of life

      // Step 7: the tail's own LENGTH, independent of the particle's speed or
      // size. Before this, what read as a trail was just the distance a
      // particle happened to move that frame, stroked from last frame's
      // position to this one — coupling apparent length to speed (and, via
      // drag, to age) with no way to set it directly. Every spark is now
      // drawn each frame as an explicit teardrop — a round head (still sized
      // by `width` above) with a tail extending straight back, opposite its
      // direction of travel (see p.dirAngle in spawn()/draw()), by this many
      // px. Deliberately NOT scaled by the firework's own size or by
      // `width` — a direct, standalone control.
      length: 8              // tail length, px
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

  // Shortest-path hue blend — hue is circular, so a plain lerp from 350 to 10
  // would swing the long way through 180 instead of the short way through 0.
  function lerpHue(a, b, t) {
    var d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
  }

  // Fraction of a particle's life spent riding the hot flash down into its
  // own assigned colour, before it starts dimming toward the ember. Not
  // exposed as a slider — the four cfg.trail fields already cover the range
  // that matters, and a wider hot phase mostly just delays when the ember
  // dimming starts.
  var TRAIL_HOT_SPAN = 0.18;

  // The deposit's colour at this instant of a particle's life: hot flash ->
  // true colour -> ember, scaled by T.cool. At T.cool === 0 this returns
  // p.h/p.s/p.l exactly (t and t2 both land on 0), which is the flat colour
  // used before cooling existed.
  function trailColor(p, T, out) {
    var age = 1 - p.life / p.maxLife; // 0 at spawn, 1 at death
    if (age <= TRAIL_HOT_SPAN) {
      var t = (TRAIL_HOT_SPAN ? age / TRAIL_HOT_SPAN : 1) * T.cool;
      out.h = p.h;
      out.s = p.s + (8 - p.s) * t;
      out.l = p.l + (T.hotLight - p.l) * t;
    } else {
      var t2 = ((age - TRAIL_HOT_SPAN) / (1 - TRAIL_HOT_SPAN)) * T.cool;
      out.h = lerpHue(p.h, T.emberHue, t2);
      out.s = p.s;
      out.l = p.l + (T.emberLight - p.l) * t2;
    }
  }

  /* ---- The stamp's outline ----------------------------------------------
     The stamp is a superellipse,  |x|^n + |y|^n <= r^n,  with n below 1 so
     the sides bow inward and the four corners come to points.

     Filling it needs the EDGE, not the test — "is this point inside" throws
     away most of what it computes, and at a sharp n it throws away almost
     everything. So solve the equation for the radius instead. Substituting
     x = p*cos(a), y = p*sin(a):

         p^n * (|cos a|^n + |sin a|^n) = r^n
         p(a) = r / (|cos a|^n + |sin a|^n)^(1/n)

     which is the distance from the centre out to the edge along any angle,
     exactly. Verified against the original equation across the useful range
     of n: |x|^n + |y|^n comes back as 1 to within 2.2e-16. */

  var STAMP_STEPS = 1440; // angle buckets in the sampling table below

  // Edge distance along `angle`, normalised so a point sits at exactly 1.
  function stampEdge(angle, n, rotation) {
    var a = angle - rotation * Math.PI / 180;
    var d = Math.pow(Math.abs(Math.cos(a)), n) + Math.pow(Math.abs(Math.sin(a)), n);
    return 1 / Math.pow(d, 1 / n);
  }

  /* ---- The morphing flash's shape ---------------------------------------
     The same superellipse as the stamp above, reused rather than re-derived —
     there is one copy of this equation in the file and this is it. What
     differs is only that `n` is animated: the flash slides from a circle to a
     star while it burns, where the stamp is placed at a fixed pointiness. */

  // n = 2 is the exact circle case: |cos|^2 + |sin|^2 is 1 at every angle, so
  // stampEdge returns 1 all the way round. That is what makes a plain lerp on
  // n a true circle-to-star morph with no special-casing at the start.
  var CORE_MORPH_ROUND = 2;

  // Degrees. 0 puts the points on the axes and reads as a "+"; 45 turns them
  // onto the diagonals, which is the X. Fixed rather than exposed — it is what
  // makes the shape the shape, not something to dial mid-show.
  var CORE_MORPH_ROTATION = 45;

  // Perimeter points per outline. A very low n is sharp enough that uniform
  // angular sampling slightly rounds the four tips; 360 is fine at flash
  // sizes, and this is the number to raise if the points ever read blunt.
  var CORE_MORPH_STEPS = 360;

  // A radial gradient is circular by nature and cannot be given a shape, so
  // the morphing flash is built from stacked outlines instead: wide and faint
  // through to small and bright. Under the additive composite they sum into a
  // falloff that follows the STAR rather than a circle. Three is a deliberate
  // cap — enough to read as a glow, cheap enough to stay light.
  var CORE_MORPH_LAYERS = [
    { scale: 1.00, alpha: 0.30 },
    { scale: 0.70, alpha: 0.50 },
    { scale: 0.42, alpha: 0.90 }
  ];

  // Eased at both ends, so the morph does not snap into motion or stop dead.
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

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
      p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life;

      // The tail's aim: updated live in draw() while the particle is
      // actually moving, but seeded here so a particle drawn before its
      // first update() (the same frame it spawns) already points somewhere
      // sensible instead of defaulting to 0.
      p.dirAngle = Math.atan2(vy, vx);

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

      // Deposit-strength factor: fixed once here at spawn like mass above,
      // read every frame in draw(). Uniform in [1 - spread, 1], so spread 0
      // always lands on exactly 1 — no per-particle variation, today's look.
      p.trailStrength = 1 - Math.random() * cfg.trail.spread;

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
    var pendingStamps = [];

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
      // Scoped to the one pattern it was asked for; everything else draws once
      // and is byte-for-byte unchanged. See the note on B.stack.
      var reps = cfg.shape.type === 'sphere without trails'
        ? Math.max(1, Math.round(B.stack)) : 1;
      for (var i = 0; i < blasts.length; i++) {
        var b = blasts[i];
        var alpha, grow;

        if (b.age < B.rise) {
          var up = b.age / B.rise;
          alpha = B.peak * up;
          grow = 0.55 + 0.45 * up;   // expands as it ignites
        } else {
          // Keeps expanding for the whole rest of its life, rather than
          // freezing at the ignition radius — see the note on B.growth.
          // Starts at exactly 1, where the ignition ramp above ended, so the
          // size never jumps; and decelerates from there, which is how an
          // expanding bloom actually behaves and stops the hand-off from
          // reading as the glow stopping dead.
          var after = (b.age - B.rise) / (B.hold + B.decay);
          grow = 1 + (B.growth - 1) * (1 - (1 - after) * (1 - after));

          if (b.age < B.rise + B.hold) {
            alpha = B.peak;          // sits at full brightness before fading
          } else {
            var down = (b.age - B.rise - B.hold) / B.decay;
            if (down >= 1) continue;
            // Squared falloff: bright for a moment, then a long soft tail
            // rather than a linear ramp, which reads as a light source dying
            // out.
            alpha = B.peak * (1 - down) * (1 - down);
          }
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
        // The gradient is built once and re-filled: each fill ADDS to what is
        // already there under the additive composite, which is the whole
        // point — it is repeated draws, not a brighter one, that get past the
        // alpha-clamp ceiling.
        for (var q = 0; q < reps; q++) {
          ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
        }
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

    /* The morphing flash. Opt-in via cfg.core.morph; the round core below is
       untouched and is still what draws when it is off.

       Two phases across the core's own life, meeting at `morphSplit`:

         phase 1  swells from its lit size out to full while the outline slides
                  from a circle to the star. Holds full brightness the whole
                  way — the flash IS the event, so it does not ramp up to it.
         phase 2  shape locked, shrinks away to nothing while it fades out.

       The shrink is the one place this deliberately contradicts the round core
       below, which grows for its whole life. That was a considered decision
       there (a lit disc marching inward reads as collapsing) and this is a
       considered decision against it: as a star that closes back down it reads
       as the shape being withdrawn rather than the light failing. Asked for
       explicitly — see phase 2. */
    function drawMorphCore(c, t, C) {
      // Guarded away from 0 and 1: either end would divide by zero below.
      var split = clamp(C.morphSplit, 0.01, 0.99);
      var n, r, alpha;

      if (t < split) {
        var u = easeInOutCubic(t / split);
        // Starts at the size it lit at, NOT at a dot — the round core's own
        // behaviour, kept deliberately.
        r = c.radius * (1 + (C.growth - 1) * u);
        n = CORE_MORPH_ROUND + (C.morphN - CORE_MORPH_ROUND) * u;
        alpha = C.peak;
      } else {
        var v = easeInOutCubic((t - split) / (1 - split));
        r = c.radius * C.growth * (1 - v);
        n = C.morphN;
        alpha = C.peak * (1 - v);
      }

      if (r <= 0 || alpha <= 0) return;

      for (var k = 0; k < CORE_MORPH_LAYERS.length; k++) {
        var L = CORE_MORPH_LAYERS[k];
        var rk = r * L.scale;
        ctx.beginPath();
        for (var s = 0; s <= CORE_MORPH_STEPS; s++) {
          var a = s / CORE_MORPH_STEPS * TAU;
          var e = stampEdge(a, n, CORE_MORPH_ROTATION) * rk;
          var px = c.x + Math.cos(a) * e;
          var py = c.y + Math.sin(a) * e;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        // White throughout, like the round core — this is the overexposed
        // centre, not coloured light. The layers stack additively, so the
        // middle blows out to solid white while the arms stay soft.
        ctx.fillStyle = 'rgba(255,255,255,' + (alpha * L.alpha).toFixed(3) + ')';
        ctx.fill();
      }
    }

    function drawCores() {
      var C = cfg.core;
      for (var i = 0; i < cores.length; i++) {
        var c = cores[i];
        var t = c.age / c.life;             // 0 at the break, 1 when it is out

        // Opt-in: everything below this line is the original round core.
        if (C.morph) { drawMorphCore(c, t, C); continue; }

        // Grows gradually across its whole life, rather than expanding in a
        // burst at the start the way `blast` does.
        var r = c.radius * (1 + (C.growth - 1) * t);

        // Full brightness immediately — the flash IS the event, so there is no
        // ramp up to it — then a gradual fade that only drops off sharply at
        // the very end.
        //
        // NOT pow(1 - t, falloff), which is what this used to be. That crashes
        // the brightness almost at once (a quarter of peak by half-life at
        // falloff 2) and leaves a long, very dim tail. Through that tail the
        // radius is still growing, but the soft rim keeps sinking below the
        // visible threshold faster than the growth widens it — so the lit disc
        // marches INWARD and the whole thing reads as collapsing, which is
        // exactly the opposite of what a real core does. Holding the
        // brightness up and dropping it late confines that effect to the last
        // few percent of its life, where it is too brief and too faint to see.
        var alpha = C.peak * (1 - Math.pow(t, C.falloff));

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

      // The second stage, queued from the break itself so it inherits the
      // firework's own point and `spec` — same centre, same size, same colour.
      // Queued here rather than at the end of the sparkles' lives because the
      // stamp is a scheduled beat of the show, not something the sparkles
      // cause: it has to land on time even if the burst was clipped by the
      // pool or the sparkles happen to outlive their welcome.
      // 'dbs sparks' is a firework TYPE, not just a launch geometry, and it is
      // the one entry in the pattern list that is. Every other pattern answers
      // only "what angle and speed does each spark leave at"; this one also
      // says what happens afterwards — an even sphere, then the DBS spark
      // assembling on the emptied sky. It therefore turns the stamp on by
      // itself rather than waiting to be paired with it by hand.
      if (cfg.stamp.enabled || cfg.shape.type === 'dbs sparks') {
        pendingStamps.push({ x: x, y: y, t: cfg.stamp.delay, spec: spec });
      }

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

      for (var k = pendingStamps.length - 1; k >= 0; k--) {
        var p = pendingStamps[k];
        p.t -= dt;
        if (p.t <= 0) {
          pendingStamps[k] = pendingStamps[pendingStamps.length - 1];
          pendingStamps.pop();
          spawnStamp(p.x, p.y, p.spec);
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

        // Squiggles need real outward speed to travel while they weave, so they
        // start in a shell rather than filling the disc.
        case 'squiggle':
          return [Math.random() * TAU, 0.55 + Math.random() * 0.45];

        // Two entries land on the plain even sphere deliberately, and are
        // listed rather than left to fall through so it is clear each is a
        // chosen shape and not an unrecognised name hitting the default.
        //
        //   'dbs sparks'            the opening burst — the DBS spark itself
        //                           arrives later, as the stamp.
        //   'sphere without trails' the same sphere, drawn with no streak
        //                           behind each spark. The geometry is
        //                           identical to 'normal'; what makes it its
        //                           own entry happens in draw(), at the trail
        //                           stamp.
        case 'dbs sparks':
        case 'sphere without trails':

        // sqrt gives uniform density per unit AREA. A plain uniform radius piles
        // particles toward the centre and reads as a hollow-cored blob; this
        // fills the disc evenly.
        default:
          return [Math.random() * TAU, Math.sqrt(Math.random())];
      }
    }

    function spawnSparkles(x, y, spec) {
      var S = cfg.shape;
      var type = cfg.shape.type;
      var squiggle = type === 'squiggle';
      var n = cfg.hanabi.count;
      var speedMax = cfg.hanabi.explosionSize * FPS_REF * scaleOf(spec);

      var baseLife = 1 / (cfg.hanabi.lifeDecay * FPS_REF);
      var lifeMin = cfg.confetti.fadeMin;
      var lifeSpan = cfg.confetti.fadeMax - cfg.confetti.fadeMin;

      // Shells are ordinary particles whose life IS the fuse: they burst when
      // they die, so the countdown costs no extra field and the shard visibly
      // dims on its way to the second break.
      var shells = cfg.sub.enabled ? Math.min(Math.round(cfg.sub.count), n) : 0;

      for (var i = 0; i < n; i++) {
        var g = shapePoint(i, S, type);
        var angle = g[0];
        // Wide per-particle lifetime spread, so the burst dissolves instead of
        // all dying on the same frame.
        var life = baseLife * (lifeMin + Math.random() * lifeSpan);

        var speed = g[1] * speedMax;
        // Shells get +/-15% on the fuse. With an exact delay every shell breaks
        // on the same frame, which reads as one mechanical pop instead of a
        // scatter of secondary breaks.
        var p = spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                      i < shells ? cfg.sub.delay * (0.85 + Math.random() * 0.3) : life,
                      spec);
        if (!p) break; // pool is full — the rest of this burst would be dropped anyway

        // Set here rather than in spawn(), which has no idea what shape it is
        // spawning for — the same place, and the same reason, the squiggle's
        // own per-particle fields are set just below.
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

    /* ---- The stamp --------------------------------------------------------
       The second stage: a shape hung in the sky. In 'instant' mode every
       sparkle is placed already motionless; in 'bursts' mode each one is
       thrown from its mini burst at a real angle and speed and drags to a
       stop, same as an ordinary spark, then holds still once settled.

       These are deliberately NOT particles, even the ones briefly
       scattering. A stamp sparkle has no gravity, no flutter, no mass and no
       trail — 'bursts' mode gives it velocity and drag in a small loop of
       its own, but nothing else it shares with a real sparkle but a colour.
       Keeping its own list buys four things at once:

         · It stays out of the particle pool. A stamp is ~1200 sparkles and
           poolMax is 2000, so putting them in the pool would let one stamp
           starve the firework that follows it.
         · It skips the SHARED physics loop — gravity, flutter, mass spread,
           trail — so even a scattering ball only pays for a plain drag
           decay, not that whole pipeline.
         · It can be drawn AFTER the trail has been stamped, which is the only
           way to leave no streak — the trail stamp is wholesale, so a particle
           can never opt out of it.
         · spawn() is untouched, so none of its pooled fields need clearing and
           none of them can leak into the next firework. */

    var stamps = [];
    var stampPool = [];

    // Cumulative weight per angle bucket, so a direction can be drawn straight
    // from the distribution instead of by rejection.
    //
    // Rejection was the obvious way and it does not scale: at fillPoints 12 it
    // needed ~1,558 throws per sparkle, about 1.9 MILLION iterations to place
    // one stamp. This table makes the cost flat no matter how hard the
    // distribution is skewed — a whole stamp is ~1ms at any setting — so
    // fillPoints can be turned up as far as the shape needs.
    //
    // Rebuilt only when one of the three values it depends on changes, since
    // cfg is read live and a slider drag would otherwise rebuild it per frame.
    var stampCum = null;
    var stampKey = '';

    function stampAngles() {
      var S = cfg.stamp;
      var key = S.n + '|' + S.rotation + '|' + S.fillPoints;
      if (stampCum && key === stampKey) return stampCum;

      var cum = new Float64Array(STAMP_STEPS + 1);
      var total = 0;
      for (var i = 0; i < STAMP_STEPS; i++) {
        var a = (i + 0.5) / STAMP_STEPS * TAU;
        total += Math.pow(stampEdge(a, S.n, S.rotation), S.fillPoints);
        cum[i + 1] = total;
      }
      stampCum = cum;
      stampKey = key;
      return cum;
    }

    // One direction, drawn from the table. Binary search for the bucket, then
    // a uniform spread inside it so the result is continuous rather than
    // quantised to 1440 spokes.
    function stampAngle(cum) {
      var u = Math.random() * cum[STAMP_STEPS];
      var lo = 0, hi = STAMP_STEPS - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cum[mid + 1] <= u) lo = mid + 1; else hi = mid;
      }
      return (lo + Math.random()) / STAMP_STEPS * TAU;
    }

    // Mini bursts waiting to go off — their flashes, fired on the sim clock so
    // hand-stepped frames reproduce the same show.
    var stampBlasts = [];

    function spawnStamp(x, y, spec) {
      var S = cfg.stamp;
      var cum = stampAngles();
      var j = cfg.hanabi;
      var burstMode = S.mode === 'bursts';

      // Where the mini bursts sit. Drawn from the SHAPE itself rather than
      // spread evenly over a circle, so a couple land in the fat middle and
      // the rest sit out along the arms — which is what keeps every ball's
      // flight short and the assembly quick to read.
      var cN = burstMode ? Math.max(1, Math.round(S.bursts)) : 0;
      var cxs = [], cys = [], cAt = [];
      var ci;
      for (ci = 0; ci < cN; ci++) {
        var ca = stampAngle(cum);
        var cr = stampEdge(ca, S.n, S.rotation) * Math.sqrt(Math.random());
        cxs.push(Math.cos(ca) * cr);
        cys.push(Math.sin(ca) * cr);
        cAt.push(Math.random() * S.burstSpread);
      }
      // Drag covers distance v / (FPS_REF * ln(1/drag)), so this inverts it:
      // multiply a distance by it and get the launch speed that runs out there.
      var toSpeed = FPS_REF * Math.log(1 / j.drag);

      // How far a sparkle actually travels on its launch speed. Drag is applied
      // as v *= drag^(dt*FPS_REF), so the distance covered before it stops is
      // the integral of that: v / (FPS_REF * ln(1/drag)). Deriving the stamp's
      // radius from it is what makes the stamp arrive the same size as the
      // burst that made it, at any tuning — rather than a pixel number that
      // silently stops matching the moment drag or explosionSize is touched.
      var reach = 1 / (FPS_REF * Math.log(1 / j.drag));
      var R = j.explosionSize * FPS_REF * scaleOf(spec) * reach * S.size;

      // Each mini burst's own reach — sized so `bursts` of them roughly share
      // the shape's area between them, then scaled by `scatter`.
      var localMax = burstMode ? (R / Math.sqrt(cN)) * S.scatter : 0;

      for (var i = 0; i < Math.round(S.count); i++) {
        var p = stampPool.pop() || {};

        if (burstMode) {
          // Round-robin across the mini bursts — there is no target to find
          // the nearest one to any more. Each spark is thrown from its burst
          // point at a real random angle and speed, the same formula an
          // ordinary shell break uses (spawnSub), and left to drag to a stop
          // rather than solved to land somewhere exact. The shape is only
          // ever the mini-burst CENTRES; the fill is whatever that many
          // honest little bursts happen to scatter.
          ci = i % cN;
          p.x = x + cxs[ci] * R;
          p.y = y + cys[ci] * R;
          var angle = Math.random() * TAU;
          var speed = Math.sqrt(Math.random()) * localMax * toSpeed;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.delay = cAt[ci];
          p.moving = true;
        } else {
          // 'instant': placed straight onto the shape's own outline, no
          // burst, no motion — the same sampler the mini-burst centres use.
          var oa = stampAngle(cum);
          var edge = stampEdge(oa, S.n, S.rotation);
          // sqrt spaces the sparkles evenly along the spoke by AREA rather
          // than by length — the same reason the radial burst uses it.
          var r = edge * Math.sqrt(Math.random());
          if (S.softness > 0) {
            r += (Math.random() - 0.5) * 2 * S.softness;
            if (r < 0) r = 0;
          }
          p.x = x + Math.cos(oa) * r * R;
          p.y = y + Math.sin(oa) * r * R;
          p.vx = 0; p.vy = 0;
          p.delay = 0;
          p.moving = false;
        }

        // Same colour treatment a sparkle gets, so the stamp reads as the same
        // firework carrying on rather than something new arriving.
        if (spec && spec.white && Math.random() < spec.white) {
          p.h = 45;
          p.s = clamp(8 + (Math.random() - 0.5) * 2 * j.jitterSat, 0, 20);
          p.l = clamp(95 + (Math.random() - 0.5) * j.jitterLight, 80, 100);
        } else {
          p.h = pickHue(spec) + (Math.random() - 0.5) * 2 * j.jitterHue;
          p.s = clamp(BASE_SAT + (Math.random() - 0.5) * 2 * j.jitterSat, 30, 100);
          p.l = clamp(BASE_LIGHT + (Math.random() - 0.5) * 2 * j.jitterLight, 30, 100);
        }

        p.size = S.dotSize * cfg.confetti.size;

        // The hold-and-fade clock starts once the scatter is done, not at
        // launch — otherwise `settle` would be eaten out of `stamp.life`
        // before the ball ever holds still. Zero for 'instant', which never
        // scatters.
        var settle = burstMode ? S.settle : 0;
        p.settle = settle;
        p.life = settle + S.life + p.delay;
        p.maxLife = p.life;

        // Per-ball variation for the flash and the twinkle. Set unconditionally
        // — these objects come back off stampPool, so a value left unwritten
        // would be the previous stamp's and would leak across fireworks.
        //
        // The pop fires once a ball is done scattering, not as it launches —
        // it reads as the shape crackling alight once it has actually formed.
        p.flashT = S.flashTime * (0.6 + Math.random() * 0.8);
        p.flashAt = settle + Math.random() * S.flashStagger;
        p.twPhase = Math.random() * TAU;
        p.twMul = 0.6 + Math.random() * 0.8; // multiplies the live flickerRate

        // The settled colour, built ONCE here instead of per frame in draw().
        // Measured at 12,500 balls: composing an hsla() per ball per frame
        // costs 25.5ms a frame, against 12.5ms reusing a cached string and
        // carrying the alpha on globalAlpha. The geometry is not the cost —
        // arcs and rects measure the same; the string is.
        p.css = 'hsl(' + p.h.toFixed(0) + ',' + p.s.toFixed(0) + '%,' + p.l.toFixed(0) + '%)';

        stamps.push(p);
      }

      // Queue each mini burst's own flash for the moment it goes off.
      if (burstMode && S.burstGlow && cfg.blast.enabled) {
        for (ci = 0; ci < cN; ci++) {
          stampBlasts.push({
            x: x + cxs[ci] * R,
            y: y + cys[ci] * R,
            t: cAt[ci],
            spec: spec
          });
        }
      }
    }

    function updateStamps(dt) {
      // Mini-burst flashes coming due.
      for (var b = stampBlasts.length - 1; b >= 0; b--) {
        var sb = stampBlasts[b];
        sb.t -= dt;
        if (sb.t <= 0) {
          stampBlasts[b] = stampBlasts[stampBlasts.length - 1];
          stampBlasts.pop();
          // Small on purpose. A blast decays over ~1.8s, so eight of them
          // overlapping sit on the shape for longer than the shape takes to
          // assemble and wash it out entirely. Scaled well down so they read
          // as eight pops rather than one cloud; turn them off with
          // stamp.burstGlow if even this is too much.
          spawnBlast(sb.x, sb.y, { hues: [pickHue(sb.spec)], scale: cfg.stamp.size * 0.18 });
        }
      }

      var damp = Math.pow(cfg.hanabi.drag, dt * FPS_REF);

      for (var i = stamps.length - 1; i >= 0; i--) {
        var p = stamps[i];

        // Scattering outward on drag alone, no gravity — gravity would carry
        // it down before the shape has even finished forming. Nothing pins it
        // to an exact point: wherever drag has carried it by `settle` is
        // where it stays, so the fill is the honest result of the burst
        // rather than a solved position.
        if (p.moving) {
          var own = p.maxLife - p.life - p.delay;
          if (own >= p.settle) {
            p.moving = false;
          } else if (own >= 0) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= damp;
            p.vy *= damp;
          }
        }

        p.life -= dt;
        if (p.life <= 0) {
          // Swap-and-pop, same as the particle loop: draw order does not matter
          // under additive blending.
          stamps[i] = stamps[stamps.length - 1];
          stamps.pop();
          stampPool.push(p);
        }
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

        // mass is the per-particle spread that makes a burst stretch as it falls.
        p.vy += gravity * p.mass * dt;

        // Random walk on horizontal velocity — confetti's swish. Bounded by the
        // damping below, so it meanders rather than running away.
        p.vx += (Math.random() - 0.5) * 2 * flutter * dt;

        p.vx *= damp;
        p.vy *= damp;

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
      updateStamps(dt);
      updatePending(dt); // last, so sparkles released this frame are drawn at full life
    }

    /* ---- Rendering -------------------------------------------------------- */

    // Reused every frame, every particle, so the cooling-curve lookup in
    // trailColor() does not allocate at burst densities.
    var trailHsl = { h: 0, s: 0, l: 0 };

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
      var headSize = cfg.trail.headSize;
      var cool = cfg.trail.cool;
      var sparkFlicker = cfg.shape.sparkFlicker;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var alpha = p.life / p.maxLife;
        // One draw of the dice per particle per frame, shared by BOTH the
        // deposit and the head below — a spark that flickers has to flicker
        // whole, and rolling separately would let its tip and its tail
        // disagree. This is the deliberate exception to the deposit-only rule
        // the rest of the trail effects follow (see cfg.shape.sparkFlicker).
        //
        // Range is [1 - sparkFlicker, 1] and alpha is already 0-1, so the
        // product cannot leave 0-1 and build an invalid hsla() string — the
        // failure that silently leaves the PREVIOUS particle's strokeStyle in
        // place rather than erroring.
        var flick = sparkFlicker > 0 ? 1 - Math.random() * sparkFlicker : 1;
        // Width collapses to zero as the shard turns edge-on, then opens back
        // up — the wink.
        var sw = p.size * Math.abs(Math.cos(p.rot)) * cfg.trail.width;
        if (cfg.trail.taper) {
          // 1 at age 0.5 always, whatever the taper amount — so the pivot age
          // stamps at the untapered width and only the two ends diverge.
          var taperAge = 1 - p.life / p.maxLife;
          sw *= 1 - cfg.trail.taper * (2 * taperAge - 1);
        }
        if (sw > 0) {
          // THE DEPOSIT: what gets stamped into the persistent trailBuf below,
          // so its own colour is the tail's, not the head's — which is why
          // it, not the head below, is what cools across the particle's
          // life. Drawn as an explicit teardrop — a round head at the
          // particle's own point, tapering to a spot straight behind it,
          // opposite its direction of travel, by cfg.trail.length px (see
          // p.dirAngle, below) — deliberately NOT how far the particle
          // actually moved this frame, which is what tied trail length to
          // speed and size with no direct control. One consequence worth
          // knowing: a particle moving faster than `length` per frame now
          // draws separate teardrops rather than one unbroken stroke; dial
          // `length` past the fastest per-frame travel for a solid streak,
          // or leave it short for a beaded, discrete look.
          var dh = p.h, ds = p.s, dl = p.l;
          if (cool > 0) {
            trailColor(p, cfg.trail, trailHsl);
            dh = trailHsl.h; ds = trailHsl.s; dl = trailHsl.l;
          }
          // trailStrength (fixed per particle at spawn, see spawn()) only
          // scales the DEPOSIT's alpha, not the head's below — a faint ember
          // still burns at full brightness, it just leaves less of a mark.
          var depositAlpha = alpha * p.trailStrength * flick;
          if (cfg.trail.flicker > 0) {
            // Independent per particle per frame — no phase or stored state,
            // so nothing about it repeats on a rhythm. Clamped: an unclamped
            // value outside 0-1 makes an invalid hsla() string, which the
            // browser silently ignores, leaving the PREVIOUS particle's
            // fillStyle in place for this one.
            depositAlpha = clamp(depositAlpha * (1 + (Math.random() - 0.5) * 2 * cfg.trail.flicker), 0, 1);
          }
          particleCtx.fillStyle = 'hsla(' + dh.toFixed(0) + ',' + ds.toFixed(0) + '%,' +
                                  dl.toFixed(0) + '%,' + depositAlpha.toFixed(3) + ')';

          // Direction updates only while actually moving, so a particle that
          // stalls to a near-stop (e.g. drag settling it) keeps pointing the
          // way it was last headed instead of collapsing toward angle 0.
          if (p.vx * p.vx + p.vy * p.vy > 1e-4) p.dirAngle = Math.atan2(p.vy, p.vx);
          var hw = sw / 2;
          var tlen = cfg.trail.length;
          if (tlen > 0) {
            var dx = -Math.cos(p.dirAngle), dy = -Math.sin(p.dirAngle);
            var nx = -dy, ny = dx; // perpendicular to the direction of travel
            particleCtx.beginPath();
            particleCtx.moveTo(p.x + dx * tlen, p.y + dy * tlen);
            particleCtx.lineTo(p.x + nx * hw, p.y + ny * hw);
            particleCtx.lineTo(p.x - nx * hw, p.y - ny * hw);
            particleCtx.closePath();
            particleCtx.fill();
          }
          // The round head rounds off the fat end of the tail above into an
          // actual teardrop, and alone (tlen 0) is the whole shape — every
          // spark is at minimum this circle, whatever `length` is set to.
          particleCtx.beginPath();
          particleCtx.arc(p.x, p.y, hw, 0, TAU);
          particleCtx.fill();
        }

        // The HEAD: an extra bright dot at the particle's current point only,
        // drawn on top of the deposit above. Because it lands in particleBuf
        // before the trail stamp below, this frame's trail segment is a
        // little brighter right where the particle is now than the segments
        // stamped in earlier frames — which then age and dim under the usual
        // erase, exactly like a real ember cooling behind its own spark.
        // headSize 0 (today's default) skips this entirely.
        if (headSize > 0) {
          var hr = p.size * headSize * 0.5;
          // The wink has only ever scaled the DEPOSIT's stroke width, which
          // makes a round head the one part of a spark that never blinks. That
          // quietly cancels the flicker in exactly the case where the head is
          // all you can see — trails off, so the deposit is a one-frame sliver
          // and the head IS the spark. Winking the radius as well keeps a
          // round point of light flickering. Gated, so a head drawn without
          // sparkFlicker stays the steady dot it has always been.
          if (sparkFlicker > 0) hr *= Math.abs(Math.cos(p.rot));
          // Boosted toward the same hot reference the cooling curve flashes
          // to (step 6), so the head reads as a hotter point, not just a
          // bigger patch of the same colour. 0 (default) is p.h/p.s/p.l
          // exactly — step 1's original head.
          var hb = cfg.trail.headBoost;
          var headS = p.s, headL = p.l;
          if (hb > 0) {
            headS = p.s + (8 - p.s) * hb;
            headL = p.l + (cfg.trail.hotLight - p.l) * hb;
          }
          particleCtx.beginPath();
          particleCtx.arc(p.x, p.y, hr, 0, TAU);
          particleCtx.fillStyle = 'hsla(' + p.h.toFixed(0) + ',' + headS.toFixed(0) + '%,' +
                                  headL.toFixed(0) + '%,' + (alpha * flick).toFixed(3) + ')';
          particleCtx.fill();
        }
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

      // 'sphere without trails' skips the deposit entirely — this is the whole
      // of what that pattern is. Everything else about the frame is untouched,
      // so the blast flash, the centre glow, the bloom and the smoke all still
      // draw; only the streak behind each spark goes.
      //
      // Gating the STAMP rather than the composite's trail draw matters: with
      // the stamp skipped nothing accumulates while the pattern is selected,
      // so switching back to another pattern cannot pop a stored image of
      // everything that just fired into view. The erase above still runs every
      // frame, so a trail left behind by a previous pattern dissolves at its
      // normal rate instead of freezing on screen.
      //
      // The rocket is drawn into particleBuf too, so its ascent trail goes with
      // the sparks'. The stamp is wholesale — excluding only the sparkles would
      // need a second draw pass, the same constraint the stamp system works
      // around by drawing AFTER this line.
      if (cfg.shape.type !== 'sphere without trails') {
        trailCtx.globalAlpha = cfg.hanabi.trailAlpha;
        trailCtx.drawImage(particleBuf, 0, 0, w, h);
        trailCtx.globalAlpha = 1;
      }

      // ---- Stamp ----
      // Drawn into particleBuf immediately AFTER the trail has been stamped
      // from it. That ordering is the entire trick: the stamp into trailBuf is
      // wholesale, so a particle drawn before it can never opt out, and these
      // sparkles must leave no streak at all. Landing here they miss the trail
      // buffer completely, but still reach the glow (built from particleBuf a
      // few lines below) and the composite — so they bloom like everything
      // else while trailing nothing.
      var ST = cfg.stamp;
      for (var si = 0; si < stamps.length; si++) {
        var sp = stamps[si];
        // This ball's own clock. In mini-burst mode it has not been thrown yet
        // until its burst goes off, and drawing it early would show the whole
        // shape sitting at the burst points before anything fires.
        var sAgeS = sp.maxLife - sp.life - sp.delay;
        if (sAgeS < 0) continue;

        // Held time: negative while still scattering, 0 the instant a ball is
        // done (already 0 for 'instant', which never scatters), running to
        // ST.life at death. The flat-then-fade curve below is measured
        // against THIS, not the age since launch, so `settle` is never eaten
        // out of the held life.
        var heldAge = sAgeS - sp.settle;
        var heldFrac = heldAge / ST.life;

        // Flat at full brightness while still scattering and through most of
        // the hold, then a ramp over the last `fade` of ST.life. Guarded
        // against fade 0, which would divide by zero and put NaN into the
        // colour string — an invalid hsla() is silently ignored by the
        // browser, so every sparkle would quietly inherit the previous one's
        // fillStyle instead of erroring.
        var sAlpha = (heldAge >= 0 && ST.fade > 0 && heldFrac > 1 - ST.fade)
          ? (1 - heldFrac) / ST.fade
          : 1;

        // Twinkle: a smooth per-ball cycle, its own rate and its own phase.
        // Normalised to 0..1 so the dip can never drive alpha negative.
        if (ST.flicker > 0) {
          var osc = (1 + Math.sin(sAgeS * sp.twMul * ST.flickerRate * TAU + sp.twPhase)) * 0.5;
          sAlpha *= 1 - ST.flicker * osc;
        }

        // The pop as it lights: toward white, desaturated, a little bigger.
        // Squared decay so it snaps away rather than oozing.
        //
        // The size lift is deliberately small. Radius scales area by its
        // square, and 2500 of these already overlap, so a boost that looks
        // modest per ball drives the whole stamp to saturated white and the
        // shape renders as a solid silhouette with no sparkles in it. 0.3 is
        // enough to read as a pop while the grain survives.
        //
        // Only a ball actually mid-pop pays for a fresh colour string; the
        // stagger means that is a small slice of them at any instant, and
        // every other ball reuses the one cached at spawn.
        var sR = sp.size;
        var sSince = sAgeS - sp.flashAt; // this ball's own clock, not the stamp's
        if (ST.flash > 0 && sSince >= 0 && sSince < sp.flashT) {
          var f = 1 - sSince / sp.flashT;
          var boost = ST.flash * f * f;
          sR = sp.size * (1 + boost * 0.3);
          particleCtx.fillStyle = 'hsl(' + sp.h.toFixed(0) + ',' +
            (sp.s * (1 - boost * 0.55)).toFixed(0) + '%,' +
            (sp.l + (100 - sp.l) * boost).toFixed(0) + '%)';
        } else {
          particleCtx.fillStyle = sp.css;
        }

        particleCtx.globalAlpha = clamp(sAlpha, 0, 1);
        // A square, not an arc. They measure the same, and at these radii the
        // glow buffer blurs the difference away entirely.
        particleCtx.fillRect(sp.x - sR, sp.y - sR, sR * 2, sR * 2);
      }
      // Reset, or the next frame's particles and rockets inherit the last
      // stamp sparkle's alpha — this context is reused across frames.
      particleCtx.globalAlpha = 1;

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
      for (var k = 0; k < stamps.length; k++) stampPool.push(stamps[k]);
      stamps.length = 0;
      stampBlasts.length = 0;
      blasts.length = 0;
      cores.length = 0;
      rockets.length = 0;
      pendingBursts.length = 0; // or a queued burst fires into the cleared stage
      pendingStamps.length = 0; // likewise — Clear must mean nothing is still coming
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
      stamp: spawnStamp,
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
          cores: cores.length,
          stamps: stamps.length
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
        stamps: stamps,
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
