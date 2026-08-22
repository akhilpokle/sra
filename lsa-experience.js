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
   ========================================================================== */

(function () {
  'use strict';

  // ---- Vocabulary — used consistently in this file and in the docs -------
  //   ROCKET  — the firework that travels up and bursts.
  //   SPARKLE — the elements thrown out when a rocket bursts.
  // The shared `particles` pool below backs THREE different things: rocket
  // trails, cursor sparks, and sparkles. Only burst products are "sparkles",
  // so the pool itself keeps the generic name.

  var EMPLOYEE_NAME = 'Timothy Tan';
  var MIN_WIDTH = 1024;

  if (window.innerWidth < MIN_WIDTH) return;

  // One rocket per year. Past 25 this approach stops working — 30+ rockets is
  // neither readable as a count nor affordable to render, and needs a
  // different visual treatment. Tracked as a TODO in progress.md.
  var MAX_SUPPORTED_YEARS = 25;

  // ======================================================================
  // CFG — every tunable value in one place.
  //
  // Values are read live (per frame / per spawn), not cached into locals, so
  // the local dev control panel can tune the show while it runs. That costs
  // a property lookup in the hot loops, which is immaterial next to the
  // canvas work, and it is what makes the tuning panel possible at all.
  //
  // Colours are stored as hex here and compiled into lookup tables by
  // rebuildPalettes() — call that after changing any colour.
  // ======================================================================
  var CFG = {
    // The milestone. Single source of truth: drives BOTH the rocket count
    // and the card copy, so the two can never disagree.
    years: 5,

    // Physics follows the Hanabi reference: heavy drag so bursts snap out and
    // then hang, rather than drifting apart. Note the interaction — total
    // displacement from an initial speed v is v/(1-friction), so this drag
    // (10v) reaches a fifth as far as the old 0.98 (50v) did. Generation
    // speeds below are scaled up to compensate. Terminal fall settles at
    // gravity/(1-friction) = 1.8 px/frame, which is the "hang".
    physics: {
      gravity: 0.2,       // per-frame downward pull on sparkles
      friction: 0.9,      // per-frame velocity damping (drag)
      maxParticles: 2800  // hard ceiling; past it spawns are dropped
    },

    // Which layer to show. 'composite' is the real thing; the others isolate
    // one layer for tuning, matching the reference's isolation toggles.
    layers: { mode: 'composite' }, // composite | particles | trail | glow | smoke

    // Persistent trail buffer. Faded with destination-out (which ERASES
    // alpha) rather than a black fillRect (which PAINTS black) — that
    // distinction is why the Step 3 attempt at this darkened the backdrop
    // and this one cannot. See handoff.md.
    trail: {
      enabled: true,
      // The reference uses 0.05. We use a faster fade because an 8-bit canvas
      // fade stalls at ~0.5/fade and never reaches zero: at 0.05 the residue
      // sticks at 9/255 and, measured over a full show, 88% of the screen
      // ends up permanently lit. 0.12 puts the floor at ~4/255 while still
      // giving a visible trail. See updateTrail().
      fade: 0.12,   // alpha erased per frame
      alpha: 0.6    // opacity particles are stamped into the trail at
    },

    // Sparkle glow. 'gradient' is the linear radial falloff; 'sparkle' is the
    // reference's trick — downscale the particle layer, then upscale it with
    // smoothing off so the pixels that survive read as twinkle.
    sparkleGlow: { mode: 'gradient', downscale: 4 },

    smoke: {
      enabled: true,
      perBurstMin: 12, perBurstMax: 20,
      sizeMin: 3, sizeMax: 8,
      spreadX: 20, spreadY: 12.5,
      velX: 2.0, velYMax: 0.2,
      rise: 0.015,          // vy -= rise, per frame
      dragX: 0.95, dragY: 0.92,
      driftX: 0.02, driftY: 0.01,
      growth: 0.08,         // size += growth, per frame
      lifeDecay: 0.012,     // ~83 frames
      maxAlpha: 0.25,
      maxCount: 500
    },

    // Per-sparkle HSL variation around the brand hues, so a burst is not a
    // flat block of one colour. Applied at spawn by picking from pre-built
    // variants — never per frame.
    colorJitter: { hue: 5, sat: 10, light: 10, variants: 12 },

    rocket: {
      flightFrames: 75,       // ascent time; velocity is solved from this
      flightJitter: 6,        // +/- frames, i.e. the spread across scene 2
      gravity: 0.02,
      // Launch fan, as a fraction of viewport width. Kept under 0.5 so the
      // fan always sits inside the central half of the screen — at 0.55 on a
      // 1024px display the fan was wider than that band, putting rockets out
      // at the edges and diluting the dense-middle shape.
      fanMaxWidthFrac: 0.45,
      fanCardMultiple: 1.1,   // ...capped to this multiple of card width
      burstAboveCard: 0.06,   // burst zone top, in card-heights above card top
      burstDepthIntoCard: 0.28,
      headSize: 3,
      headGlow: 10,
      trail: true,            // rockets leave a trail of spawned particles
      trailLife: 20,
      trailSize: 2
    },

    // These apply UNIFORMLY across all three generations. The generations
    // keep different base counts internally because the cascade is
    // multiplicative — making them equal would blow the particle budget
    // several times over — but everything the panel exposes is a multiplier
    // on top, so one control moves every scene consistently.
    sparkle: {
      densityScale: 1.0,  // x on every generation's sparkle count
      sizeScale: 1.0,     // x on sparkle size
      lifeScale: 1.0,     // x on sparkle life
      speedScale: 1.0,    // x on sparkle speed
      breakScale: 1.0,    // x on how much each generation cascades onward
      lifeJitter: 0.10,   // +/-10% so a generation dies as a wave, not a pop
      glowSize: 2.2,      // halo radius as a multiple of sparkle size (<=1 off)
      glowAlpha: 0.35,    // halo opacity
      trailLength: 0      // motion-trail length factor (0 = round dot)
    },

    colors: {
      red: '#E11931',      // DBS main
      gold: '#D4AF37',     // DBS Treasures
      blue: '#1C6FD1',     // POSB — PLACEHOLDER hex, see handoff.md row K
      tintRed: '#FF6B7F',
      tintGold: '#F2DA91',
      tintBlue: '#8FC2F5'
    },

    // One row per scene. `palette` names a key in PALETTES (see below).
    generations: [
      // Speeds are ~5x the pre-Hanabi values: the heavier drag reaches a
      // fifth as far for the same initial speed, so these keep the burst
      // radius while gaining the snap-and-hang motion.
      { label: 'Scene 2 — rocket burst',
        shapes: ['peony', 'palm', 'ring'],
        count: 90, speedMin: 8, speedMax: 26, size: 3.6, life: 70,
        palette: 'open', breakFraction: 0.30, flashRadius: 170 },
      { label: 'Scene 3 — second wave',
        shapes: ['peony', 'ring'],
        count: 12, speedMin: 6, speedMax: 17, size: 3.0, life: 62,
        palette: 'build', breakFraction: 0.18, flashRadius: 0 },
      { label: 'Scene 4 — density peak',
        shapes: ['willow'],
        count: 11, speedMin: 5, speedMax: 13, size: 2.8, life: 90,
        palette: 'climax', breakFraction: 0, flashRadius: 0 }
    ],

    // Soft radial glow pooling over the card. Times are ms after the last
    // rocket bursts.
    glow: { start: 2300, rise: 500, decay: 1500, peakAlpha: 0.45, radius: 560 },

    // Card fade begins this long after the last rocket bursts. Tuned to land
    // at generation 2's coverage peak, not before it.
    card: { fadeStart: 2700 },

    cursorSpark: { enabled: true, interval: 3, count: 2, life: 30, size: 3 },

    fuse: { burnDuration: 1500, igniteRadius: 40 },

    willow: { speedFactor: 0.55, lifeFactor: 1.5, gravityScale: 1.5, sizeFactor: 0.8 },

    palmSpokes: 7
  };

  function rocketCount() { return Math.min(CFG.years, MAX_SUPPORTED_YEARS); }

  // "Show once" gating is intentionally NOT done here. Per project decision,
  // that flag must be set and checked on the backend (e.g. a per-user "has
  // seen LSA 5yr experience" flag). Until that's wired up, this experience
  // plays on every page load. See handoff.md -> "Once-only flag".

  var root = document.createElement('div');
  root.className = 'lsa-root';

  var backdrop = document.createElement('div');
  backdrop.className = 'lsa-backdrop';
  root.appendChild(backdrop);

  // Reusable particle pool: avoids allocating a new object per spark/rocket.
  var particles = [];
  var particlePool = [];

  // `lut` is a colour lookup table (see makeLut) rather than a single colour —
  // sparkles shift colour as they die. Callers set the optional fields on the
  // returned particle; they are reset here because pooled objects otherwise
  // carry stale values (a recycled sparkle keeping an old breakGen would
  // re-break forever).
  function spawnParticle(x, y, vx, vy, life, size, lut) {
    if (particles.length >= CFG.physics.maxParticles) return null;
    var p = particlePool.pop() || {};
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.lut = lut;
    p.alpha = 1;
    p.gravityScale = 1;
    p.breakGen = -1; // generation to spawn on death; -1 = this sparkle just dies
    particles.push(p);
    return p;
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += CFG.physics.gravity * p.gravityScale;
      p.vx *= CFG.physics.friction;
      p.vy *= CFG.physics.friction;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      p.alpha = Math.max(p.life / p.maxLife, 0);

      if (p.life <= 0) {
        // A sparkle flagged as a breaker spawns the NEXT generation where it
        // died — this is what turns one rocket burst into the successive
        // waves of scenes 3 and 4. New sparkles append past the current
        // index, so the reverse loop won't revisit them this frame.
        if (p.breakGen >= 0) spawnSparkleBurst(p.x, p.y, p.breakGen);

        // Swap-and-pop rather than splice: O(1) instead of O(n) shifting per
        // death. Draw order doesn't matter under additive blending, and at
        // climax density splice was the dominant per-frame cost. Safe with
        // this reverse loop — the element moved into i has already been
        // processed this frame.
        particles[i] = particles[particles.length - 1];
        particles.pop();
        particlePool.push(p);
      }
    }
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'lsa-canvas';
  root.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  // ---- Offscreen layer buffers -------------------------------------------
  // The reference stacks four <canvas> elements. We keep ONE visible canvas
  // and composite from offscreen buffers instead: the card sits *behind* the
  // canvas in the z-stack, so four DOM layers would each need their own
  // z-index, teardown and resize handling for no gain.
  //
  //   trailBuf     full res, PERSISTENT — faded a little each frame
  //   particleBuf  full res, cleared each frame; also the glow's source
  //   glowBuf      1/downscale res, smoothing off — the sparkle trick
  //   smokeBuf     half res — smoke is soft, half res is invisible in the
  //                result and saves a lot of fill on large displays
  function makeBuffer() {
    var c = document.createElement('canvas');
    return { canvas: c, ctx: c.getContext('2d') };
  }

  var trailBuf = makeBuffer();
  var particleBuf = makeBuffer();
  var glowBuf = makeBuffer();
  var smokeBuf = makeBuffer();

  function sizeBuffers(w, h) {
    trailBuf.canvas.width = w;   trailBuf.canvas.height = h;
    particleBuf.canvas.width = w; particleBuf.canvas.height = h;

    var d = Math.max(1, CFG.sparkleGlow.downscale);
    glowBuf.canvas.width = Math.max(1, Math.round(w / d));
    glowBuf.canvas.height = Math.max(1, Math.round(h / d));
    glowBuf.ctx.imageSmoothingEnabled = false;

    smokeBuf.canvas.width = Math.max(1, Math.round(w / 2));
    smokeBuf.canvas.height = Math.max(1, Math.round(h / 2));
    // Resizing a canvas clears it, so the trail history is lost on resize.
    // Acceptable, and far simpler than trying to preserve and rescale it.
  }

  // Fuse cord tuning. A short curved cord near bottom-center: fuseBase is
  // the launch point, fuseTip is the free end the user lights.
  var fuseBase, fuseTip, fuseControl;
  var fuseLit = false;
  var fuseBurned = false;
  var burnStartTime = null;

  function computeFusePoints() {
    var baseX = canvas.width / 2;
    var baseY = canvas.height - 40;
    fuseBase = { x: baseX, y: baseY };
    fuseTip = { x: baseX + 50, y: baseY - 100 };
    fuseControl = { x: baseX + 15, y: baseY - 55 };
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    sizeBuffers(canvas.width, canvas.height);
    computeFusePoints();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  var promptEl = document.createElement('div');
  promptEl.className = 'lsa-prompt';
  promptEl.textContent = 'Move your cursor to light the fuse ✨';
  root.appendChild(promptEl);

  var cardEl = document.createElement('div');
  cardEl.className = 'lsa-card';

  var medallionEl = document.createElement('div');
  medallionEl.className = 'lsa-card__medallion';
  // Placeholder white rectangle. Swap for the real medallion component here
  // once supplied — see handoff.md "Medallion assets".
  cardEl.appendChild(medallionEl);

  var line1El = document.createElement('p');
  line1El.className = 'lsa-card__line1';
  line1El.textContent = 'Congratulations, ' + EMPLOYEE_NAME + '!';
  cardEl.appendChild(line1El);

  var accentEl = document.createElement('div');
  accentEl.className = 'lsa-card__accent';
  cardEl.appendChild(accentEl);

  var line2El = document.createElement('p');
  line2El.className = 'lsa-card__line2';
  // Reads from CFG.years so the copy can never disagree with the rocket count.
  line2El.textContent = 'Celebrating ' + CFG.years + ' Years with us';
  cardEl.appendChild(line2El);

  root.appendChild(cardEl);

  function revealCard() {
    cardEl.classList.add('lsa-card--visible');
  }

  // `g` is the particle-layer buffer, not the visible canvas — so the fuse,
  // rocket heads and sparkles all feed the trail and glow layers together.
  function drawFuse(g) {
    // Once the fuse has burned down it's consumed — stop drawing it, so no
    // cord is left sitting over the card during the reveal.
    if (fuseBurned) return;
    g.save();
    g.strokeStyle = '#8a6d3b';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(fuseBase.x, fuseBase.y);
    g.quadraticCurveTo(fuseControl.x, fuseControl.y, fuseTip.x, fuseTip.y);
    g.stroke();

    g.beginPath();
    g.fillStyle = fuseLit ? '#FFFFFF' : '#D4AF37';
    g.shadowColor = '#D4AF37';
    g.shadowBlur = 12;
    g.arc(fuseTip.x, fuseTip.y, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function checkFuseIgnition() {
    if (fuseLit || cursorX === null) return;
    var dx = cursorX - fuseTip.x;
    var dy = cursorY - fuseTip.y;
    if (Math.sqrt(dx * dx + dy * dy) <= CFG.fuse.igniteRadius) {
      fuseLit = true;
      burnStartTime = performance.now();
      promptEl.classList.add('lsa-prompt--hidden');
    }
  }

  // Point along the fuse's curve at t=0 (base) .. t=1 (tip).
  function pointOnFuseCurve(t) {
    var mt = 1 - t;
    return {
      x: mt * mt * fuseBase.x + 2 * mt * t * fuseControl.x + t * t * fuseTip.x,
      y: mt * mt * fuseBase.y + 2 * mt * t * fuseControl.y + t * t * fuseTip.y
    };
  }

  function updateFuseBurn(g) {
    if (!fuseLit || fuseBurned) return;
    var progress = Math.min((performance.now() - burnStartTime) / CFG.fuse.burnDuration, 1);
    var pt = pointOnFuseCurve(1 - progress); // travels tip -> base

    g.save();
    g.fillStyle = '#FFFFFF';
    g.shadowColor = '#D4AF37';
    g.shadowBlur = 16;
    g.beginPath();
    g.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    g.fill();
    g.restore();

    if (progress >= 1) {
      fuseBurned = true;
      startFireworksSequence();
    }
  }

  var WHITE = '#FFFFFF';

  // Sparkles shift colour as they burn out. Building an rgb() string per
  // sparkle per frame would allocate thousands of strings a second, so each
  // colour journey is baked once into a small lookup table of prebuilt
  // strings and the draw loop just indexes it by remaining life. Index 0 is
  // the death colour, LUT_STEPS-1 the birth colour.
  var LUT_STEPS = 10;

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  function makeLut(birthHex, deathHex) {
    var a = hexToRgb(birthHex);
    var b = hexToRgb(deathHex);
    var lut = [];
    for (var i = 0; i < LUT_STEPS; i++) {
      var t = i / (LUT_STEPS - 1); // 0 at death .. 1 at birth
      lut.push('rgb(' +
        Math.round(b[0] + (a[0] - b[0]) * t) + ',' +
        Math.round(b[1] + (a[1] - b[1]) * t) + ',' +
        Math.round(b[2] + (a[2] - b[2]) * t) + ')');
    }
    return lut;
  }

  // Colour journeys, birth -> death. Real fireworks burn white-hot then cool
  // into their pigment, which is what most of these mimic. Palettes widen as
  // the show escalates. Rebuilt from CFG.colors, so the dev panel can change
  // a brand hex and have every generation pick it up.
  var PALETTES = {};
  var LUT_WHITE;
  var SPARK_LUTS; // cursor-spark colours, so they follow the brand gold too

  // ---- HSL jitter ---------------------------------------------------------
  // The reference varies each particle's colour slightly around its palette
  // entry (hue +/-5, saturation +/-10 clamped 30-100, lightness +/-10 clamped
  // 30-90), which stops a burst reading as a flat block of one colour.
  //
  // We keep the brand hues and jitter around THOSE. To preserve the LUT
  // system's no-per-frame-allocation property, the variants are pre-built at
  // init and one is picked per sparkle at spawn — never computed per frame.
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs (((h / 60) % 2) - 1));
    var m = l - c / 2;
    var rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    function hx(v) {
      var n = Math.round((v + m) * 255);
      n = n < 0 ? 0 : n > 255 ? 255 : n;
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + hx(rgb[0]) + hx(rgb[1]) + hx(rgb[2]);
  }

  function jitterHex(hex) {
    var J = CFG.colorJitter;
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var h = hsl[0] + (Math.random() - 0.5) * 2 * J.hue;
    var s = Math.min(100, Math.max(30, hsl[1] + (Math.random() - 0.5) * 2 * J.sat));
    var l = Math.min(90, Math.max(30, hsl[2] + (Math.random() - 0.5) * 2 * J.light));
    return hslToHex(h, s, l);
  }

  // Builds `variants` LUTs for one birth->death journey, each with the death
  // colour jittered. Returned as a flat list the palettes concatenate.
  function makeLutVariants(birthHex, deathHex) {
    var out = [];
    var n = Math.max(1, CFG.colorJitter.variants);
    for (var i = 0; i < n; i++) {
      // Variant 0 is the exact brand colour, so the palette is always
      // anchored on-brand even if the jitter is turned up.
      out.push(i === 0 ? makeLut(birthHex, deathHex)
                       : makeLut(jitterHex(birthHex), jitterHex(deathHex)));
    }
    return out;
  }

  function rebuildPalettes() {
    var c = CFG.colors;
    var gold = makeLutVariants(WHITE, c.gold);
    var goldDeep = makeLutVariants(c.tintGold, c.gold);
    var red = makeLutVariants(c.tintRed, c.red);
    var blue = makeLutVariants(c.tintBlue, c.blue);
    var blueWhite = makeLutVariants(WHITE, c.blue);
    var redGold = makeLutVariants(c.gold, c.red);
    LUT_WHITE = makeLut(WHITE, WHITE);

    PALETTES.open = gold.concat([LUT_WHITE], goldDeep);
    PALETTES.build = gold.concat(red, [LUT_WHITE], redGold, goldDeep);
    PALETTES.climax = gold.concat(red, blue, [LUT_WHITE], redGold, blueWhite, goldDeep);
    SPARK_LUTS = [gold[0], LUT_WHITE];
    glowSprites = {}; // colours changed — the baked glow sprites are stale
  }
  rebuildPalettes();

  // ---- Smoke -------------------------------------------------------------
  // Grey puffs that rise and expand after each burst, per the reference.
  // Its own pool and cap, separate from the sparkle budget.
  //
  // One deliberate deviation: the reference builds a radial gradient per
  // smoke particle per frame. At 500 particles that is 500 gradient objects
  // a frame. We bake one soft-puff sprite at init and blit it scaled —
  // visually the same, far cheaper. (Same fix already applied to the
  // sparkle glow.)
  var smokeParticles = [];
  var smokePool = [];
  var smokeSprite = null;

  function buildSmokeSprite() {
    var PX = 64;
    var c = document.createElement('canvas');
    c.width = c.height = PX;
    var g = c.getContext('2d');
    var r = PX / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(180,180,180,1)');
    grad.addColorStop(1, 'rgba(180,180,180,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, PX, PX);
    smokeSprite = c;
  }
  buildSmokeSprite();

  function spawnSmoke(x, y) {
    var S = CFG.smoke;
    if (!S.enabled) return;
    var n = S.perBurstMin + Math.floor(Math.random() * (S.perBurstMax - S.perBurstMin + 1));

    for (var i = 0; i < n; i++) {
      if (smokeParticles.length >= S.maxCount) return;
      var s = smokePool.pop() || {};
      s.x = x + (Math.random() - 0.5) * 2 * S.spreadX;
      s.y = y + (Math.random() - 0.5) * 2 * S.spreadY;
      s.vx = (Math.random() - 0.5) * 2 * S.velX;
      s.vy = -Math.random() * S.velYMax;
      s.size = S.sizeMin + Math.random() * (S.sizeMax - S.sizeMin);
      s.life = 1;
      smokeParticles.push(s);
    }
  }

  function updateSmoke() {
    var S = CFG.smoke;
    for (var i = smokeParticles.length - 1; i >= 0; i--) {
      var s = smokeParticles[i];
      s.vy -= S.rise;
      s.vx += (Math.random() - 0.5) * S.driftX;
      s.vy += (Math.random() - 0.5) * S.driftY;
      s.vx *= S.dragX;
      s.vy *= S.dragY;
      s.x += s.vx;
      s.y += s.vy;
      s.size += S.growth;
      s.life -= S.lifeDecay;

      var offscreen = s.x < -50 || s.x > canvas.width + 50 || s.y > canvas.height + 50;
      if (s.life <= 0 || offscreen) {
        smokeParticles[i] = smokeParticles[smokeParticles.length - 1];
        smokeParticles.pop();
        smokePool.push(s);
      }
    }
  }

  function drawSmoke() {
    var S = CFG.smoke;
    var g = smokeBuf.ctx;
    g.clearRect(0, 0, smokeBuf.canvas.width, smokeBuf.canvas.height);
    if (!S.enabled || !smokeParticles.length) return;

    // Buffer is half res, so everything is drawn at half scale.
    for (var i = 0; i < smokeParticles.length; i++) {
      var s = smokeParticles[i];
      var lf = Math.max(s.life, 0);
      var alpha = Math.min(S.maxAlpha, lf * S.maxAlpha * Math.sqrt(lf));
      if (alpha <= 0) continue;
      var r = s.size / 2;

      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha * 0.7;
      g.drawImage(smokeSprite, (s.x - r) / 2, (s.y - r) / 2, s.size, s.size);

      // Subtler second pass, as in the reference, to break up the puffs.
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = alpha * 0.3;
      g.drawImage(smokeSprite, (s.x - r) / 2, (s.y - r) / 2, s.size, s.size);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  var rockets = [];
  var flashes = [];

  // Burst shapes. All four run through the same spawnParticle — the only
  // differences are how angle, speed, life and gravity are distributed.
  var SHAPE_PEONY = 'peony';   // even radial spray — the classic round burst
  var SHAPE_RING = 'ring';     // evenly spaced angles at near-fixed speed
  var SHAPE_WILLOW = 'willow'; // slow, long-lived, heavy — arcs then droops
  var SHAPE_PALM = 'palm';     // a few thick spokes instead of an even spray

  // Milestone scaling, applied ONLY at generation 0 (the rocket bursts) —
  // applying it at every generation would compound through the cascade.
  //
  // This holds the TOTAL generation-0 sparkle count roughly constant across
  // milestones (~450), rather than making a 25-year show denser. That is
  // deliberate: the particle budget, not the milestone, is the binding
  // constraint — measured peaks sit at the MAX_PARTICLES ceiling at every
  // milestone regardless. Letting counts scale up just means the cap clips
  // them unpredictably, dropping sparkles and leaving gaps in the very
  // coverage the reveal depends on. What visibly scales with the milestone is
  // the number of rockets you see go up, which is the point.
  function sparkleScale() { return Math.min(1, 5 / rocketCount()); }

  // ---- Generations = scenes ----------------------------------------------
  // The generation table lives in CFG.generations — one row per scene. A
  // sparkle carries only `breakGen`; when a flagged sparkle dies it spawns
  // that generation where it died. The chain terminates on its own because
  // the last generation has no successor — no separate depth cap to keep in
  // sync.
  function spawnSparkleBurst(x, y, depth) {
    var gen = CFG.generations[depth];
    if (!gen) return;

    var S = CFG.sparkle;
    var genScale = (depth === 0 ? sparkleScale() : 1) * S.densityScale;
    var count = Math.max(1, Math.round(gen.count * genScale));
    var shape = gen.shapes[(Math.random() * gen.shapes.length) | 0];
    var nextGen = CFG.generations[depth + 1] ? depth + 1 : -1;
    var luts = PALETTES[gen.palette] || PALETTES.open;
    var w = CFG.willow;
    var jitter = S.lifeJitter;
    // Global multipliers — applied after the per-generation and per-shape
    // values so one panel control moves every scene by the same proportion.
    var breakChance = Math.min(1, gen.breakFraction * S.breakScale);

    for (var i = 0; i < count; i++) {
      var angle, speed;
      var life = gen.life;
      var size = gen.size;
      var gravityScale = 1;

      if (shape === SHAPE_RING) {
        angle = (i / count) * Math.PI * 2;
        speed = gen.speedMax * (0.92 + Math.random() * 0.16);
      } else if (shape === SHAPE_PALM) {
        var spokes = CFG.palmSpokes;
        angle = ((i % spokes) / spokes) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
        speed = gen.speedMin + Math.random() * (gen.speedMax - gen.speedMin);
      } else if (shape === SHAPE_WILLOW) {
        angle = Math.random() * Math.PI * 2;
        speed = (gen.speedMin + Math.sqrt(Math.random()) * (gen.speedMax - gen.speedMin)) * w.speedFactor;
        life = Math.round(gen.life * w.lifeFactor);
        // The droop. Tuned to fall visibly but still hang over the card long
        // enough to cover it — heavier than this and willow drains out of the
        // card area before the reveal finishes.
        gravityScale = w.gravityScale;
        size = gen.size * w.sizeFactor;
      } else { // peony
        // sqrt(random) gives a uniform-area distribution across the disc.
        // A plain uniform radius (what this used to do) piles particles up
        // toward the centre; this fills the burst evenly. From the reference.
        angle = Math.random() * Math.PI * 2;
        speed = gen.speedMin + Math.sqrt(Math.random()) * (gen.speedMax - gen.speedMin);
      }

      // Life jitter. Without it every sparkle in a generation dies on the
      // same frame, so the next generation spawns as one mechanical pop; the
      // jitter spreads each scene into a short wave while keeping the
      // generations clearly separate.
      life = Math.round(life * S.lifeScale * (1 - jitter + Math.random() * jitter * 2));
      size = size * S.sizeScale;
      speed = speed * S.speedScale;

      var p = spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                            Math.max(2, life), size, luts[(Math.random() * luts.length) | 0]);
      if (!p) break; // hit the particle cap — degrade density, not framerate

      p.gravityScale = gravityScale;
      if (nextGen >= 0 && Math.random() < breakChance) p.breakGen = nextGen;
    }
  }

  function spawnFlash(x, y, maxRadius, life) {
    flashes.push({ x: x, y: y, maxRadius: maxRadius, life: life, maxLife: life });
  }

  // Rockets carry no burst spec: every rocket bursts as generation 0.
  function launchRocket(x, targetY, vy) {
    rockets.push({ x: x, y: canvas.height - 20, vy: vy, targetY: targetY });
  }

  function updateRockets(g) {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      var rk = CFG.rocket;
      r.vy += rk.gravity;
      r.y += r.vy;

      if (rk.trail) {
        spawnParticle(r.x, r.y, (Math.random() - 0.5) * 0.5, Math.random() * 0.5,
                      rk.trailLife, rk.trailSize, LUT_WHITE);
      }

      g.save();
      g.fillStyle = '#FFFFFF';
      g.shadowColor = CFG.colors.gold;
      g.shadowBlur = rk.headGlow;
      g.beginPath();
      g.arc(r.x, r.y, rk.headSize, 0, Math.PI * 2);
      g.fill();
      g.restore();

      if (r.y <= r.targetY) {
        spawnSparkleBurst(r.x, r.y, 0); // scene 2
        spawnSmoke(r.x, r.y);
        var fr = CFG.generations[0].flashRadius;
        if (fr) spawnFlash(r.x, r.y, fr, 30);
        rockets.splice(i, 1);
      }
    }
  }

  function updateFlashes() {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.life -= 1;
      var t = 1 - f.life / f.maxLife;
      var ringAlpha = 1 - t;
      var flashAlpha = Math.max(1 - t * 5, 0);

      ctx.save();
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.maxRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.maxRadius * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (f.life <= 0) flashes.splice(i, 1);
    }
  }

  // ---- The show ----------------------------------------------------------
  // Everything after the fuse burns down runs off ONE clock (showStartTime)
  // and is driven from the rAF loop, not setTimeout — the reveal must be
  // frame-exact against what's actually on screen, and an rAF-only show
  // pauses with a backgrounded tab instead of playing out unseen.
  //
  // ALL rockets launch on the same frame (scene 1). Everything after that is
  // the cascade: generation 0 is scene 2, generation 1 scene 3, generation 2
  // scene 4, and scene 5 is those last sparkles dying off the card. See
  // CFG.generations — the show's whole structure lives in that one table.

  // Rocket burst geometry is anchored to the CARD, not to viewport fractions
  // (see CFG.rocket.burstAboveCard / burstDepthIntoCard). The card is a fixed
  // pixel size, so viewport-relative heights put the bursts far above it on a
  // large display — the cascade then arrives late and thin, and coverage is
  // still climbing when the card starts fading. The range is also kept
  // narrow: rockets decelerate near apex, so a wide height range turns into a
  // ragged spread of burst times.
  //
  // Flight time is specified directly (CFG.rocket.flightFrames) and the
  // launch velocity solved for it, rather than choosing a speed and letting
  // height decide timing. Choosing a speed couples burst HEIGHT to burst
  // TIME, so varying heights made scene 2's spread balloon to 400-500ms and
  // drift with viewport size. Solving for time decouples them: heights stay
  // free, the spread is exactly flightJitter, and it is identical on every
  // screen. It also cannot stall short of its target the way a fixed speed
  // can, because the velocity is an exact solution rather than an estimate.

  // Exact initial velocity to reach targetY in n frames under the same
  // per-frame integration updateRockets uses:
  //   vy += g;  y += vy   =>   y(n) = y0 + n*vy0 + g*n*(n+1)/2
  function velocityForFlight(y0, targetY, n) {
    return (targetY - y0 - CFG.rocket.gravity * n * (n + 1) / 2) / n;
  }

  // Card footprint — MUST match .lsa-card's width/height in the stylesheet.
  // Used to place the bursts and size the glow so it pools over the card
  // rather than washing the whole viewport.
  var CARD_W = 800;
  var CARD_H = 460;

  // Safety net only: guarantees the card is never left unrevealed if a rocket
  // somehow never bursts.
  var REVEAL_FALLBACK_AT = 12000;

  var showStartTime = null;
  var launched = false;
  var allBurstTime = null; // when the last rocket burst — end of scene 2
  var cardRevealed = false;

  function startFireworksSequence() {
    showStartTime = performance.now();
  }

  // Scene 1 — every rocket goes off at once.
  function launchAllRockets() {
    var rk = CFG.rocket;
    var n = rocketCount();
    var launchY = canvas.height - 20; // matches launchRocket's own launch point
    var cardTop = canvas.height / 2 - CARD_H / 2;
    var fanWidth = Math.min(canvas.width * rk.fanMaxWidthFrac, CARD_W * rk.fanCardMultiple);

    // Flight times are a deterministic ladder across the jitter range, then
    // shuffled. Drawing each independently at random can collapse: with only
    // five rockets it will sometimes pick five near-identical values and
    // scene 2 lands as one mechanical pop (measured as low as 17ms spread).
    // The ladder guarantees the spread; the shuffle keeps burst order
    // uncorrelated from position, so it doesn't read as a left-to-right sweep.
    var flightTimes = [];
    for (var k = 0; k < n; k++) {
      var f = n > 1 ? k / (n - 1) : 0.5;
      flightTimes.push(Math.max(12, Math.round(rk.flightFrames + (f - 0.5) * 2 * rk.flightJitter)));
    }
    for (var a = flightTimes.length - 1; a > 0; a--) {
      var b = Math.floor(Math.random() * (a + 1));
      var tmp = flightTimes[a]; flightTimes[a] = flightTimes[b]; flightTimes[b] = tmp;
    }

    for (var i = 0; i < n; i++) {
      // Even fan across the width, jittered so rockets don't stack up.
      var t = n > 1 ? i / (n - 1) : 0.5;
      var x = canvas.width / 2 + (t - 0.5) * fanWidth + (Math.random() - 0.5) * 40;
      var targetY = cardTop - CARD_H * rk.burstAboveCard +
                    Math.random() * CARD_H * (rk.burstAboveCard + rk.burstDepthIntoCard);
      launchRocket(x, targetY, velocityForFlight(launchY, targetY, flightTimes[i]));
    }
  }

  function updateShow() {
    if (showStartTime === null) return;
    var now = performance.now();
    var elapsed = now - showStartTime;

    if (!launched) {
      launched = true;
      launchAllRockets();
    }

    // Scene 2 ends when the last rocket has burst. Note this runs before
    // updateRockets in the frame, so rockets launched above are still in
    // flight here and this can't fire early on the launch frame.
    if (allBurstTime === null && rockets.length === 0) allBurstTime = now;

    if (cardRevealed) return;
    var ready = allBurstTime !== null && now - allBurstTime >= CFG.card.fadeStart;
    if (ready || elapsed >= REVEAL_FALLBACK_AT) {
      cardRevealed = true;
      revealCard();
    }
  }

  // Clears the show and replays it from the first rocket. Used by the local
  // dev panel's replay button; nothing in production calls it.
  function restartShow() {
    for (var i = 0; i < particles.length; i++) particlePool.push(particles[i]);
    particles.length = 0;
    for (var j = 0; j < smokeParticles.length; j++) smokePool.push(smokeParticles[j]);
    smokeParticles.length = 0;
    rockets.length = 0;
    flashes.length = 0;
    // The trail is persistent, so a replay must wipe it or the previous run
    // bleeds into the new one.
    trailBuf.ctx.clearRect(0, 0, trailBuf.canvas.width, trailBuf.canvas.height);
    trailCleared = false;
    launched = false;
    allBurstTime = null;
    cardRevealed = false;
    cardEl.classList.remove('lsa-card--visible');
    line2El.textContent = 'Celebrating ' + CFG.years + ' Years with us';
    showStartTime = performance.now();
  }

  // A soft radial glow pooling over the card — deliberately NOT a
  // full-viewport white flash, which read as "the screen went white". It is
  // sized to the card's footprint, never reaches the viewport edges, and is
  // drawn additively so it looks like the sparkles' own light rather than
  // paint laid over the screen.
  function updateCentreGlow() {
    if (allBurstTime === null) return;
    var G = CFG.glow;
    if (G.peakAlpha <= 0) return;
    var t = performance.now() - allBurstTime - G.start;
    if (t < 0) return;

    var alpha;
    if (t < G.rise) {
      alpha = (t / G.rise) * G.peakAlpha;
    } else {
      var d = (t - G.rise) / G.decay;
      if (d >= 1) return;
      alpha = (1 - d * d) * G.peakAlpha;
    }

    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var R = G.radius;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(255,252,242,' + alpha.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(255,240,200,' + (alpha * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,235,180,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  // Cursor spark trail tuning. (Sparks, not sparkles — these follow the
  // cursor and are unrelated to rocket bursts.)

  var cursorX = null;
  var cursorY = null;
  var frameCount = 0;

  // Global cursor tracking, not bound to the canvas — this same position
  // feeds the fuse proximity check in a later step, so there is only ever
  // one mousemove listener.
  function onMouseMove(e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
  }
  window.addEventListener('mousemove', onMouseMove);

  function spawnSparkBurst() {
    var cs = CFG.cursorSpark;
    for (var i = 0; i < cs.count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 1.5;
      var lut = SPARK_LUTS[Math.floor(Math.random() * SPARK_LUTS.length)];
      spawnParticle(cursorX, cursorY, Math.cos(angle) * speed, Math.sin(angle) * speed,
                    cs.life, cs.size, lut);
    }
  }

  // Glow sprites. The halo is a radial gradient — full colour at the centre
  // falling linearly to fully transparent at the edge — so it reads as glow
  // rather than as a bigger solid dot, which is what a flat-alpha circle
  // looked like.
  //
  // It is baked into a small offscreen canvas per colour and blitted with
  // drawImage, rather than building a gradient per sparkle per frame: at
  // these densities that would mean creating thousands of gradient objects
  // every frame. There are only ~70 distinct colours across all the LUTs, so
  // the cache stays small. Cleared by rebuildPalettes() when colours change.
  var GLOW_SPRITE_PX = 64;
  var glowSprites = {};

  function glowSprite(color) {
    var sprite = glowSprites[color];
    if (sprite) return sprite;

    sprite = document.createElement('canvas');
    sprite.width = sprite.height = GLOW_SPRITE_PX;
    var g = sprite.getContext('2d');
    var r = GLOW_SPRITE_PX / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    // Fade to the SAME colour at zero alpha, not to transparent black —
    // canvas interpolates gradients in non-premultiplied RGBA, so fading to
    // rgba(0,0,0,0) would drag the midtones through grey.
    grad.addColorStop(0, color);
    grad.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ',0)'));
    g.fillStyle = grad;
    g.fillRect(0, 0, GLOW_SPRITE_PX, GLOW_SPRITE_PX);

    glowSprites[color] = sprite;
    return sprite;
  }

  // Additive ('lighter') blending throughout: overlapping sparkles brighten
  // and blend rather than occluding, which is what gives the dense bursts
  // their bloom.
  //
  // Two optional per-sparkle effects, both controlled from CFG.sparkle:
  //   glow   — the gradient halo above, drawn behind each sparkle. Doubles
  //            the draw calls when on, so it is the first thing to turn down
  //            if framerate suffers.
  //   trail  — draws each sparkle as a short line from where it was to where
  //            it is, instead of a dot. Deliberately done by stretching the
  //            existing sparkle rather than spawning trail particles: a trail
  //            particle per sparkle per frame would multiply the particle
  //            count several-fold and blow the budget outright.
  function drawParticles(g) {
    var S = CFG.sparkle;
    var glowOn = CFG.sparkleGlow.mode === 'gradient' && S.glowSize > 1 && S.glowAlpha > 0;
    var trail = S.trailLength;

    g.save();
    g.globalCompositeOperation = 'lighter';
    if (trail > 0) g.lineCap = 'round';

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      // Colour is read from the particle's LUT by remaining life, so sparkles
      // shift colour as they burn out. No per-frame string building.
      var color = p.lut[(p.alpha * (LUT_STEPS - 1)) | 0];

      if (glowOn) {
        var gr = p.size * S.glowSize;
        g.globalAlpha = p.alpha * S.glowAlpha;
        g.drawImage(glowSprite(color), p.x - gr, p.y - gr, gr * 2, gr * 2);
      }

      g.globalAlpha = p.alpha;
      if (trail > 0) {
        g.strokeStyle = color;
        g.lineWidth = p.size * 2;
        g.beginPath();
        g.moveTo(p.x - p.vx * trail, p.y - p.vy * trail);
        g.lineTo(p.x, p.y);
        g.stroke();
      } else {
        g.fillStyle = color;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  // ---- Layer passes -------------------------------------------------------

  // The persistent trail. The fade uses destination-out, which ERASES alpha,
  // rather than a black fillRect, which PAINTS black — that one difference is
  // why the Step 3 attempt at this turned the screen near-black and this does
  // not. Faded regions lose alpha, so compositing over the gradient backdrop
  // cannot darken it.
  //
  // BUT a proportional fade can never actually reach zero on an 8-bit canvas.
  // Alpha rounds a*(1-fade) back up to a once a*fade < 0.5, so it stalls at
  // roughly 0.5/fade. Measured in-browser: fade 0.05 stalls at 9/255, 0.02 at
  // 25/255, 0.005 at 127/255 — half opacity, permanently. Only a 0.5 fade
  // reaches 0, which is far too fast to be a trail.
  //
  // Consequence: the trail always leaves a faint ghost of its own paths.
  // That is fine while the show is running, but it must not be left sitting
  // over the revealed card — so once there is nothing left to trail, the
  // buffer gets one hard clearRect, which does reach zero. CFG.trail.fade is
  // floored in the panel for the same reason.
  var trailCleared = false;

  function updateTrail() {
    var T = CFG.trail;
    var g = trailBuf.ctx;
    var W = trailBuf.canvas.width, H = trailBuf.canvas.height;

    if (!T.enabled) { g.clearRect(0, 0, W, H); return; }

    // Nothing left to trail means the buffer holds only residue — wipe it.
    // Deliberately not gated on the card reveal: that is time-based, and the
    // buffer should be cleaned up whenever the show has actually finished.
    if (!trailCleared && showStartTime !== null &&
        particles.length === 0 && rockets.length === 0) {
      g.clearRect(0, 0, W, H);
      trailCleared = true;
      return;
    }

    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,' + T.fade + ')';
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = T.alpha;
    g.drawImage(particleBuf.canvas, 0, 0);

    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // The sparkle layer: downscale the particle buffer with smoothing OFF, so
  // most pixels are simply dropped. Scaled back up at composite time, the
  // survivors read as twinkle. Cost is two blits regardless of particle count.
  function updateGlowBuf() {
    // Re-size if the downscale factor was changed from the dev panel.
    var d = Math.max(1, CFG.sparkleGlow.downscale);
    var wantW = Math.max(1, Math.round(canvas.width / d));
    var wantH = Math.max(1, Math.round(canvas.height / d));
    if (glowBuf.canvas.width !== wantW || glowBuf.canvas.height !== wantH) {
      glowBuf.canvas.width = wantW;
      glowBuf.canvas.height = wantH;
    }

    var g = glowBuf.ctx;
    g.clearRect(0, 0, wantW, wantH);
    g.imageSmoothingEnabled = false;
    g.drawImage(particleBuf.canvas, 0, 0, wantW, wantH);
  }

  function compositeLayers() {
    var mode = CFG.layers.mode;
    var all = mode === 'composite';
    var W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    if ((all || mode === 'smoke') && CFG.smoke.enabled) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(smokeBuf.canvas, 0, 0, W, H);
    }

    if ((all || mode === 'trail') && CFG.trail.enabled) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(trailBuf.canvas, 0, 0, W, H);
    }

    // In composite mode the sparkle layer is only added when that glow mode
    // is selected; in glow-isolation mode it is always shown, so the toggle
    // does something visible whichever glow mode is active.
    if ((all && CFG.sparkleGlow.mode === 'sparkle') || mode === 'glow') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(glowBuf.canvas, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
    }

    if (all || mode === 'particles') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(particleBuf.canvas, 0, 0, W, H);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  var rafId = requestAnimationFrame(tick);

  function tick() {
    frame();
    rafId = requestAnimationFrame(tick);
  }

  // One frame of work, split out from the rAF scheduling so the dev hook can
  // step it manually — the only way to exercise the render pipeline in an
  // environment where requestAnimationFrame never fires.
  function frame() {
    // Everything that belongs to the particle layer — fuse, rocket heads,
    // sparkles — is drawn into particleBuf, which then feeds the trail and
    // glow layers. Flashes and the card glow are composite-level only: they
    // would smear badly through the trail.
    var pg = particleBuf.ctx;
    pg.clearRect(0, 0, particleBuf.canvas.width, particleBuf.canvas.height);

    checkFuseIgnition();
    drawFuse(pg);
    updateFuseBurn(pg);
    updateShow();
    updateRockets(pg);

    frameCount++;
    if (cursorX !== null && CFG.cursorSpark.enabled &&
        frameCount % CFG.cursorSpark.interval === 0) {
      spawnSparkBurst();
    }

    updateParticles();
    drawParticles(pg);

    updateSmoke();
    drawSmoke();

    updateTrail();
    updateGlowBuf();
    compositeLayers();

    updateCentreGlow(); // additive over the composite
    updateFlashes();
  }

  var closeBtn = document.createElement('button');
  closeBtn.className = 'lsa-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', teardown);
  root.appendChild(closeBtn);

  var previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  document.body.appendChild(root);

  // ---- LOCAL DEV HOOK — inert in production -----------------------------
  // The one place this file touches `window`, and only when the page opts in
  // by putting data-lsa-dev on <html>. lsa-demo.html sets it; lsa-mount.html
  // (the Liferay markup) does not, so on the intranet this branch never runs
  // and no global is ever created — the no-globals rule in the safety
  // contract above still holds there.
  //
  // Delete these lines if you want zero dev code in the deployed file; the
  // only thing lost is the local tuning panel.
  if (document.documentElement.hasAttribute('data-lsa-dev')) {
    window.__lsaDev = {
      cfg: CFG,
      restart: restartShow,
      rebuildPalettes: rebuildPalettes,
      stats: function () {
        return {
          particles: particles.length,
          rockets: rockets.length,
          smoke: smokeParticles.length
        };
      },
      // Runs frames synchronously. Only used to exercise the pipeline where
      // requestAnimationFrame does not fire; the real show never calls it.
      step: function (n) {
        for (var i = 0; i < (n || 1); i++) frame();
      },
      buffers: function () {
        return {
          trail: trailBuf.canvas,
          particle: particleBuf.canvas,
          glow: glowBuf.canvas,
          smoke: smokeBuf.canvas
        };
      }
    };
    document.dispatchEvent(new CustomEvent('lsa-dev-ready'));
  }

  function teardown() {
    closeBtn.removeEventListener('click', teardown);
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('mousemove', onMouseMove);
    // The whole show is rAF-driven — no timers to sweep. Cancelling the loop
    // stops every launch, burst, bloom and the card reveal outright.
    cancelAnimationFrame(rafId);
    root.remove();
    document.body.style.overflow = previousOverflow;
  }
})();
