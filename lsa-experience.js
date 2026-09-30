/* ==========================================================================
   Long Service Award — Milestone Overlay
   The show that plays on top of the live Liferay intranet page.
   --------------------------------------------------------------------------
   WHAT HAPPENS
   1. A blurred veil and a black cover go over the page.
   2. The cursor becomes a spark. A star sits at the bottom of the screen.
   3. Holding the spark on the star fills it while a counter climbs to the
      milestone (4s at 5 years up to 10s at 50).
   4. When the star is full, five fireworks launch and burst on the medal's
      number. Each burst clears a third of the black cover.
   5. The card is revealed: a 3D medal that leans toward the cursor, and a
      congratulation sentence. Soft fireworks keep going in the background.
   6. The close button removes everything.

   RULES FOR THIS FILE — they keep it from breaking the Liferay page:
   1. Everything is inside the one function below. No globals.
   2. Nothing built into the browser or owned by Liferay is changed.
   3. Every event listener is removed on close, and the animation loop stops.
   4. Loaded as a separate file, never inline, because the page has a
      Content Security Policy.
   5. Desktop only. Below 1024px wide the script does nothing at all.

   ONE FILE. The fireworks engine is inside this file ("The fireworks engine"
   section), so nothing else has to load first. The rest of the file decides
   when and where fireworks go off.

   `cfg` IS THE ENGINE'S OWN CONFIG. The engine copies what it is given, so
   right after it is built `cfg` is pointed at `fw.cfg`. Everything below
   edits that. `background: null` is what keeps the fireworks canvas
   see-through, so the page shows behind it.

   LAYERS, back to front (z-index is set in lsa-experience.css):
     -1  ambient    background fireworks, seen through the blue veil
      0  backdrop   blurred blue veil over the page
      1  card       medal and sentence
      2  black      black cover, cleared in thirds by the bursts
      3  canvas     the main fireworks, in front of the black so they stay
                    bright while the card is still hidden
      4+ the star, counter, close button, spark cursor and galaxy
   ========================================================================== */

(function () {
  'use strict';

  // Desktop only: on a narrow screen, do nothing at all.
  var MIN_WIDTH = 1024;

  if (window.innerWidth < MIN_WIDTH) return;

  /* ---- Name and milestone ----------------------------------------------
     Read from data-name and data-years on #lsa-mount, which Liferay fills in
     per user. If either is missing, the defaults below are used.

     YEARS drives the counter, the number on the medal, the diamonds and the
     sentence. A value that is not a positive number is ignored, so a bad
     template never puts "NaN" on screen. Any whole number works, not only
     multiples of five. */
  var mount = document.getElementById('lsa-mount');

  var NAME = (mount && mount.getAttribute('data-name')) || 'Akhil';

  var YEARS = 5;
  var yearsAttr = mount && parseInt(mount.getAttribute('data-years'), 10);
  if (yearsAttr > 0) YEARS = yearsAttr;

  /* Where the images live. Every image the overlay loads is found through
     this one path, which is relative to the PAGE, not to this script. On
     Liferay, set it to wherever the assets/ folder is hosted. */
  var ASSET_PATH = 'assets/';

  // "Show only once" is NOT done here. It needs a per-user flag stored on
  // the server. Until that exists, the overlay plays on every page load.

  // The overlay's one container. Everything below goes inside it.
  var root = document.createElement('div');
  root.className = 'lsa-root';

  // Background fireworks canvas, furthest back. It starts drawing once the
  // card is revealed; see "Background fireworks" further down.
  var ambCanvas = document.createElement('canvas');
  ambCanvas.className = 'lsa-ambient';
  root.appendChild(ambCanvas);

  // Blurred blue veil over the page.
  var backdrop = document.createElement('div');
  backdrop.className = 'lsa-backdrop';
  root.appendChild(backdrop);

  // Main fireworks canvas.
  var canvas = document.createElement('canvas');
  canvas.className = 'lsa-canvas';
  root.appendChild(canvas);

  /* ---- The card ----------------------------------------------------------
     Holds the medal and the sentence. It is hidden behind the black cover
     until the fireworks clear it; see advanceReveal() further down. */

  var card = document.createElement('div');
  card.className = 'lsa-card';

  /* The card's silver plate. Set here rather than in the CSS so it goes
     through ASSET_PATH like every other image. Use backgroundImage, never
     the `background` shorthand.
     The file name has a capital B; on a case-sensitive server it must match. */
  card.style.backgroundImage = 'url("' + ASSET_PATH + 'card-Back-l.png")';

  var medalScene = document.createElement('div');
  medalScene.className = 'lsa-medal-scene';

  var medalCoin = document.createElement('div');
  medalCoin.className = 'lsa-medal-coin';

  var coinFront = document.createElement('div');
  coinFront.className = 'lsa-medal-face lsa-coin-front';

  /* ---- The medal ---------------------------------------------------------
     medal.svg is the front face. It has "Years" on it but no number; the
     number is drawn on top as text (see medalNumber below), so one face
     works for every milestone.

     The SVG is loaded with fetch() and put straight into the page, not shown
     as an <img>, because the script has to reach one layer inside it (the
     texture, see turnImage()). fetch() is covered by the page's CSP
     connect-src. If it is blocked, the face is blank and the rest still runs. */
  var medalImg = document.createElement('div');
  medalImg.className = 'lsa-medal-img';
  coinFront.appendChild(medalImg);

  // The round brushed-metal texture inside medal.svg (a circle filled with an
  // embedded image). Found once the SVG has loaded.
  var medalImage = null;

  fetch(ASSET_PATH + 'medal.svg')
    .then(function (res) { return res.text(); })
    .then(function (text) {
      medalImg.innerHTML = text;
      var svg = medalImg.querySelector('svg');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      medalImage = svg.querySelector('rect[fill="url(#pattern0_5482_71034)"]');
      medalImage.classList.add('lsa-medal-image');
    });

  /* The diamonds on the ring: one for every 5 years (1 at 5, 10 at 50).
     They are spread 18° apart, centred on the bottom of the medal. Each one
     sits on the edge of the medal's inner disc (radius 170), half on either
     side of it.

     Numbers are in medal.svg's own 563x565 units, turned into percentages,
     so the diamonds follow the medal if it is resized. */
  var medalDiamonds = document.createElement('div');
  medalDiamonds.className = 'lsa-medal-diamonds';
  coinFront.appendChild(medalDiamonds);

  function drawDiamonds() {
    var W = 563, H = 565, CX = 281.5, CY = 282.5, R = 170;
    var SIZE = 42, GAP = 18;

    var n = Math.floor(YEARS / 5);
    medalDiamonds.textContent = '';
    for (var k = 0; k < n; k++) {
      var a = (90 + (k - (n - 1) / 2) * GAP) * Math.PI / 180;
      var d = document.createElement('img');
      d.className = 'lsa-medal-diamond';
      d.src = ASSET_PATH + 'diamond.png';
      d.alt = '';
      d.style.left = ((CX + R * Math.cos(a)) / W * 100) + '%';
      d.style.top = ((CY + R * Math.sin(a)) / H * 100) + '%';
      d.style.width = (SIZE / W * 100) + '%';
      d.style.height = (SIZE / H * 100) + '%';
      medalDiamonds.appendChild(d);
    }
  }
  drawDiamonds();

  /* The milestone number on the medal. It sits inside the face so it tilts
     with it. Its position and size are in the CSS (.lsa-medal-number). */
  var medalNumber = document.createElement('div');
  medalNumber.className = 'lsa-medal-number';
  medalNumber.setAttribute('aria-hidden', 'true');
  medalNumber.textContent = String(YEARS);
  coinFront.appendChild(medalNumber);

  medalCoin.appendChild(coinFront);
  medalScene.appendChild(medalCoin);
  card.appendChild(medalScene);

  // The sentence on the card.
  function cardLine() {
    return 'Congratulation ' + NAME + ' on completing ' + YEARS +
           ' years with DBS.';
  }

  var cardText = document.createElement('p');
  cardText.className = 'lsa-card-text';
  cardText.textContent = cardLine();
  card.appendChild(cardText);

  root.appendChild(card);

  /* ---- The medal's thickness --------------------------------------------
     The coin has no real depth. EDGE_COUNT copies of Stack.png (the medal's
     outline, no text) are stacked one behind the other, and at an angle they
     look like a solid rim. The face sits on the front of the stack.

     To make it thicker, raise the COUNT, not the step, or gaps show between
     the layers. 34 layers would likely look the same and cost half as much;
     nobody has compared them since the flip was removed. */
  var EDGE_COUNT = 68;
  var EDGE_STEP = 1.2;    // px between layers; 68 x 1.2 gives ~81.6px of depth

  // An empty 3D wrapper that holds the rim layers and the face. Nothing moves
  // it now; it is where the old click-to-flip lived
  // (see lab/medal-flip.reference.md).
  var medalDepth = document.createElement('div');
  medalDepth.className = 'lsa-medal-depth';
  medalCoin.appendChild(medalDepth);

  // Moves the face into the wrapper.
  medalDepth.appendChild(coinFront);

  // Build the rim layers. applyCoinDepth() positions them.
  for (var e = 0; e < EDGE_COUNT; e++) {
    var edge = document.createElement('div');
    edge.className = 'lsa-coin-edge';

    var edgeImg = document.createElement('img');
    edgeImg.src = ASSET_PATH + 'Stack.png';
    edgeImg.alt = '';
    edge.appendChild(edgeImg);

    medalDepth.appendChild(edge);
  }

  /* The face art is drawn a hair smaller (99.2%) so it does not stick out
     past the rim behind it. Only the art and the diamonds are scaled, never
     the face itself, so the number on the medal (and the counter aimed at
     it) do not move. */
  var FACE_SCALE = 0.992;
  medalImg.style.transform = 'scale(' + FACE_SCALE + ')';
  medalDiamonds.style.transform = 'scale(' + FACE_SCALE + ')';

  // The rim's total depth in px.
  var coinTune = {
    depth: EDGE_COUNT * EDGE_STEP   // 81.6px, the current look
  };

  // Places every rim layer and the face along Z from coinTune.depth. Called
  // once at build.
  function applyCoinDepth() {
    var step = coinTune.depth / EDGE_COUNT;
    var layers = medalDepth.querySelectorAll('.lsa-coin-edge');
    for (var i = 0; i < layers.length; i++) {
      layers[i].style.transform =
        'translateZ(' + ((i - EDGE_COUNT / 2) * step) + 'px)';
    }
    coinFront.style.transform =
      'translateZ(' + ((EDGE_COUNT / 2) * step) + 'px)';
  }

  applyCoinDepth();

  /* ---- The medal's tilt ---------------------------------------------------
     The medal leans toward the cursor from anywhere on screen. Over the medal
     the lean is full strength; it gets weaker the further away the cursor is.
     When the cursor leaves the window the medal keeps its last lean.

     The tilt is set on .lsa-medal-scene, which turns the whole coin as one
     piece. The 0.15s CSS transition on it gives the lag. */
  var MAX_TILT = 25;      // degrees of lean at the edge of the medal
  var FAR_TILT = 0.12;    // strength at the far corner of the screen, 0-1
  var TILT_FALLOFF = 0.6; // how fast strength drops with distance. Below 1
                          // it drops fast then levels off; above 1 it stays
                          // strong most of the way out.

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* The medal's centre and half-size on screen.

     Uses offsetWidth / offsetLeft (layout values), NOT getBoundingClientRect()
     on the medal. The medal is always tilted, and a tilted element's rect
     changes size as it turns, which would make the tilt chase itself. */
  function medalBox() {
    var cardRect = card.getBoundingClientRect();
    var halfW = medalScene.offsetWidth / 2;
    var halfH = medalScene.offsetHeight / 2;
    return {
      halfW: halfW,
      halfH: halfH,
      cx: cardRect.left + medalScene.offsetLeft + halfW,
      cy: cardRect.top + medalScene.offsetTop + halfH
    };
  }

  /* Runs on every mouse move over the overlay. It is on the root, not the
     medal, because the medal sits under the fireworks canvas and never gets
     mouse events of its own. It does three things: records the cursor for the
     spark, tilts the medal, and turns and fades the medal's texture. */
  function onStageMove(ev) {
    // Cursor position for the spark cursor.
    sparkX = ev.clientX;
    sparkY = ev.clientY;
    sparkSeen = true;

    var b = medalBox();
    var halfW = b.halfW;
    var halfH = b.halfH;

    var px = ev.clientX - b.cx;
    var py = ev.clientY - b.cy;

    // Direction of the lean, -1 to 1 on each axis.
    var dx = clamp(px / halfW, -1, 1);
    var dy = clamp(py / halfH, -1, 1);

    // How far out the cursor is, 0 at the medal's edge to 1 at the screen's
    // corner. Measured against the window so it feels the same on any screen.
    var edge = Math.sqrt(halfW * halfW + halfH * halfH);
    var reach = Math.sqrt(window.innerWidth * window.innerWidth +
                          window.innerHeight * window.innerHeight) / 2;
    var t = clamp((Math.sqrt(px * px + py * py) - edge) /
                  Math.max(1, reach - edge), 0, 1);

    // Strength of the lean, 1 near the medal down to FAR_TILT far away.
    var k = 1 - (1 - FAR_TILT) * Math.pow(t, TILT_FALLOFF);

    // Y is flipped so the medal leans TOWARD the cursor, not away.
    medalScene.style.transform =
      'rotateX(' + (-dy * MAX_TILT * k) + 'deg) rotateY(' +
      (dx * MAX_TILT * k) + 'deg)';

    turnImage(px, py);

    /* The texture fades in with the tilt: fully visible at the medal's edge,
       gone at the screen's far corner and over the medal's centre. */
    if (medalImage) {
      var mag = Math.min(1, Math.sqrt(dx * dx + dy * dy)) * k;
      medalImage.style.opacity = clamp((mag - FAR_TILT) / (1 - FAR_TILT), 0, 1);
    }
  }

  /* ---- The texture turns toward the cursor -------------------------------
     Turns the texture so its darkest part faces the cursor, since that side
     of the medal is the one tipping away.

     DARK_ANGLE is where the darkest part sits before any turn, in degrees
     clockwise from the top (measured from the image). */
  var DARK_ANGLE = 105;
  var imageAngle = null;  // kept unwrapped so it never spins the long way round

  function turnImage(px, py) {
    if (!medalImage) return;  // the SVG has not loaded yet

    // The cursor's direction from the medal's centre, clockwise from the top.
    var target = Math.atan2(px, -py) * 180 / Math.PI - DARK_ANGLE;

    if (imageAngle === null) {
      imageAngle = target;
    } else {
      // Shortest way round from where it is now.
      var delta = ((target - imageAngle) % 360 + 540) % 360 - 180;
      imageAngle += delta;
    }

    medalImage.style.transform = 'rotate(' + imageAngle + 'deg)';
  }

  root.addEventListener('mousemove', onStageMove);

  // The black cover over the card. Each burst clears a third of it.
  var black = document.createElement('div');
  black.className = 'lsa-black';
  root.appendChild(black);

  /* ---- The counter and the star ------------------------------------------
     The user holds the cursor on the star at the bottom of the screen. The
     star fills with light while the counter in the middle climbs to the
     milestone. When the star is full, the show starts. */

  var countEl = document.createElement('div');
  countEl.className = 'lsa-count';
  countEl.setAttribute('aria-live', 'polite');

  // The digits go in a child element so they can be scaled on their own;
  // countEl's transform is already used to centre it.
  var countValue = document.createElement('span');
  countValue.className = 'lsa-count-value';
  countEl.appendChild(countValue);
  root.appendChild(countEl);

  // The four-point star shape (from assets/Path.svg), in a 15x15 box centred
  // at 7.44. Used by both the star button and the spark cursor.
  var SPARK_PATH = 'M14.8563 14.88L9.09636 10.0498C9.09636 10.0498 8.31607 9.28792 7.44088 9.28792C6.5569 9.28792 5.77661 10.0498 5.77661 10.0498L0.0184526 14.88L0 14.8633L4.83112 9.10339C4.83112 9.10339 5.5912 8.32574 5.5912 7.44C5.5912 6.56305 4.83112 5.78452 4.83112 5.78452L0 0.0202103L0.0184526 0L5.77661 4.83552C5.77661 4.83552 6.5569 5.59911 7.44088 5.59911C8.31607 5.59911 9.09636 4.83552 9.09636 4.83552L14.8563 0L14.88 0.0254826L10.0392 5.78452C10.0392 5.78452 9.2844 6.56305 9.2844 7.44C9.2844 8.32574 10.0392 9.10339 10.0392 9.10339L14.88 14.8615L14.8563 14.88Z';

  var chargeBtn = document.createElement('button');
  chargeBtn.className = 'lsa-charge';
  chargeBtn.type = 'button';

  /* ---- The star's art ------------------------------------------------------
     Three copies of the star shape, back to front:

       halo   blurred glow behind the star. It brightens as the star fills,
              so an empty star does not glow.
       track  the thin gold outline, always there.
       fill   the light inside, a radial gradient that grows from the centre
              out as the star fills.

     A CSS drop-shadow and a blurred fill were both tried and looked wrong;
     do not switch to them.

     The ids start with "lsa-" because SVG ids are shared with the whole
     Liferay page. */
  chargeBtn.innerHTML =
    '<svg class="lsa-spark-art" viewBox="0 0 15 15" aria-hidden="true" focusable="false">' +
      '<defs>' +
        /* The fill's gradient. Centred on the star; radius 10.6 reaches the
           tips, so at offset 1 the whole star is lit. The two stops are kept
           apart on purpose: the gap between them is the soft edge of the
           light as it grows. The script moves both stops. */
        '<radialGradient id="lsa-spark-grad" gradientUnits="userSpaceOnUse" ' +
                        'cx="7.44" cy="7.44" r="10.6">' +
          '<stop id="lsa-spark-core-a" offset="0" stop-color="#FFF0C0"/>' +
          '<stop id="lsa-spark-core-b" offset="0" stop-color="#F0C24B" stop-opacity="0"/>' +
        '</radialGradient>' +
        // The halo's blur. The region is made large so the glow is not cut off.
        '<filter id="lsa-spark-halo" x="-75%" y="-75%" width="250%" height="250%">' +
          '<feGaussianBlur id="lsa-spark-halo-blur" stdDeviation="0.6"/>' +
        '</filter>' +
      '</defs>' +
      '<path class="lsa-spark-halo" fill="url(#lsa-spark-grad)" ' +
            'filter="url(#lsa-spark-halo)" d="' + SPARK_PATH + '"/>' +
      '<path class="lsa-spark-track" d="' + SPARK_PATH + '"/>' +
      '<path class="lsa-spark-fill" fill="url(#lsa-spark-grad)" d="' + SPARK_PATH + '"/>' +
    '</svg>';

  // Handles to the parts the frame loop updates while charging.
  var sparkArt = chargeBtn.querySelector('.lsa-spark-art');
  var sparkCoreA = chargeBtn.querySelector('#lsa-spark-core-a');
  var sparkCoreB = chargeBtn.querySelector('#lsa-spark-core-b');
  var sparkHalo = chargeBtn.querySelector('.lsa-spark-halo');
  var sparkFillPath = chargeBtn.querySelector('.lsa-spark-fill');
  var sparkHaloBlur = chargeBtn.querySelector('#lsa-spark-halo-blur');

  // "HOLD YOUR SPARK HERE", under the star. Its text is set further down.
  var chargeLabel = document.createElement('span');
  chargeLabel.className = 'lsa-charge-label';
  chargeBtn.appendChild(chargeLabel);

  root.appendChild(chargeBtn);

  /* The spark cursor's own canvas, above everything so nothing covers it.
     It is drawn by simple code further down, not by the fireworks engine. */
  var sparkCanvas = document.createElement('canvas');
  sparkCanvas.className = 'lsa-spark';
  root.appendChild(sparkCanvas);

  /* ---- The galaxy ----------------------------------------------------------
     A galaxy photo over the whole screen, blended with color-dodge. On black
     it is invisible; it only shows where something bright is drawn (the
     counter, the star, the cursor). Bright parts of the photo light up
     first, so each number seems to ignite in patches.

     Three things silently break it:
       1. A transform, filter, will-change or opacity below 1 on any element
          between this image and .lsa-black.
       2. Fading a container that holds both the text and this image. Fade
          the image itself instead.
       3. Fading the counter with `opacity`. Use `brightness`.
     The counter must also stay pure white. */
  var galaxy = document.createElement('img');
  galaxy.className = 'lsa-galaxy';
  galaxy.alt = '';
  galaxy.src = ASSET_PATH + 'gal4.jpg';
  root.appendChild(galaxy);

  // The close button. Clicking it runs teardown(), which removes everything.
  var closeBtn = document.createElement('button');
  closeBtn.className = 'lsa-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', teardown);
  root.appendChild(closeBtn);

  // Stop the page scrolling while the overlay is open. teardown() puts the
  // old value back.
  var previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Put the overlay on the page.
  document.body.appendChild(root);

  /* ---- Aiming the counter at the medal -------------------------------------
     At a full charge, the counter sits exactly on top of the medal's number,
     at the same size. Both the position and the size are read from the
     medal's own layout, so they stay right if the medal is resized.

     Uses offsetTop (layout), not the medal's rect, because the medal is
     always tilted and its rect changes as it turns.

     ALEO_INK_ABOVE_CENTRE: Aleo's digits sit 0.055em above the middle of
     their box, so the counter adds that back to line up by ink. Re-measure
     if the font changes. */
  var ALEO_INK_ABOVE_CENTRE = 0.055;   // em

  // Where the medal's number is on screen (its ink centre, in px from the
  // top). The counter and the fireworks both aim here.
  function medalNumberY() {
    var top = parseFloat(getComputedStyle(medalNumber).top);
    if (!isFinite(top)) return null;
    return card.getBoundingClientRect().top + medalScene.offsetTop + top;
  }

  // Sets the counter's final size (chargeTune.scale1) and its offset from
  // screen centre (--lsa-count-y) so it lands on the medal's number.
  function aimCounterAtMedal() {
    var numStyle = getComputedStyle(medalNumber);
    var baseFont = parseFloat(getComputedStyle(countEl).fontSize);

    var targetFont = parseFloat(numStyle.fontSize);
    var targetInkY = medalNumberY();
    if (!(targetFont > 0) || !(baseFont > 0) || targetInkY === null) return;

    var rootRect = root.getBoundingClientRect();
    var centreY = rootRect.top + rootRect.height / 2;

    // Final size: whatever makes the digits match the medal's.
    chargeTune.scale1 = targetFont / baseFont;

    countEl.style.setProperty(
      '--lsa-count-y',
      ((targetInkY - centreY) + ALEO_INK_ABOVE_CENTRE * targetFont).toFixed(2) + 'px'
    );
  }
  // Called further down, once chargeTune exists.

  /* ---- Each firework's look ---------------------------------------------------
     How each of the five fireworks throws its sparks, 1 to 5 left to right.
     These replace cfg's values for that firework's own sparks. Second-burst
     sparks still use cfg's values.

     1, 2, 4 and 5 are the same. 3, the centre, is a six-point star burst that
     flies further and bursts a second time. */
  var SIDE_LOOK = {
    count: 200,             // sparks
    explosionSize: 10,      // how far they fly
    size: 0.5,              // spark thickness, px
    sizeSpread: 0.5,        // +/- share of that, per spark
    lifeDecay: 0.024,       // how fast they die
    lifeSpread: 0.35,       // +/- share of that, per spark
    shape: { type: 'normal' },
    jitterHue: 5,
    jitterSat: 10,
    jitterLight: 10,
    blast: { enabled: true, lead: 45 },           // flash, and ms before sparks
    sub: { enabled: false, count: 6, delay: 0.7 } // second bursts
  };

  var CENTRE_LOOK = {
    count: 200,
    explosionSize: 18.5,
    size: 0.5,
    sizeSpread: 0.3,
    lifeDecay: 0.029,
    lifeSpread: 0.25,
    shape: { type: 'star burst', starPoints: 6, starInner: 0.45 },
    jitterHue: 5,
    jitterSat: 10,
    jitterLight: 10,
    blast: { enabled: true, lead: 45 },
    sub: { enabled: true, count: 6, delay: 0.7 }  // 6 sparks burst again after ~0.7s
  };

  var FIREWORK_LOOK = { 1: SIDE_LOOK, 2: SIDE_LOOK, 3: CENTRE_LOOK, 4: SIDE_LOOK, 5: SIDE_LOOK };

  /* ---- Fireworks settings ---------------------------------------------------
     The settings for the main show's fireworks. Keys the engine knows and
     this object leaves out take the engine's defaults. The engine reads these
     live, so changing one while the show runs takes effect at once.

     These values are final. */

  var cfg = {
    // Size for a firework set off by clicking the canvas. The five show
    // fireworks use their own sizes (fireworkSize below) instead.
    scale: 1.55,

    /* Grow the fireworks with the screen, so a burst takes up about the same
       share of a small or a large screen. At `reference` px (the screen's
       shorter side) the numbers here mean exactly what they say.
       Only how far sparks fly and the flash size are scaled; spark thickness
       and the rocket head stay the same. */
    scaleToScreen: {
      enabled: true,
      reference: 900
    },

    // No background fill, so the page shows through the canvas. Required for
    // an overlay.
    background: null,


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
       A flash of light at the burst point, `lead` ms before the sparks fly.
       `stack` draws it several times over for a bright white core; 1 is a
       plain flash. These values apply to every firework. */
    blast: {
      enabled: true,
      lead: 60,             // ms

      // Flash radius in px, multiplied by each firework's fireworkSize.
      radius: 100,
      peak: 0.6,
      rise: 0.06,           // s
      hold: 0.15,
      decay: 1.8,
      growth: 1.1,          // end radius as a multiple of the ignition radius
      stack: 2
    },

    /* ---- The rocket -------------------------------------------------------
       The dot that flies up before a burst. */
    rocket: {
      size: 2,              // px
      launchY: 1.0,         // launches from this fraction of canvas height
      light: 88             // hotter than a sparkle's base lightness
    },

    /* ---- Second bursts -----------------------------------------------------
       Some sparks burst again when they die. Only the centre firework does
       (see CENTRE_LOOK). `particles`, `scale` and `glow` here apply to it. */
    sub: {
      enabled: false,
      count: 6,
      delay: 0.7,
      particles: 30,
      scale: 0.3,
      glow: true
    },

    /* ---- Burst shape --------------------------------------------------------
       Not used by the show: each firework has its own shape (FIREWORK_LOOK). */
    shape: {
      type: 'normal',       // normal | ring | star burst | concentric
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      ringWidth: 0.04,
      ringThickness: 0.08
    },

    /* ---- The show's own settings ---------------------------------------------
       Everything from here down is used by this file, not the engine.

       goColors: colour sets for the fireworks, as lists of hues. `white` is
       the share of sparks drawn white instead. */
    goColors: {
      red:  { hues: [357, 352, 2], white: 0 },
      gold: { hues: [46, 51, 58], white: 0 },
      mix:  { hues: [357, 352, 46, 58], white: 0.33 }
    },

    /* Size of each of the five fireworks, left to right. It scales the burst
       spread, spark size and rocket size together. */
    fireworkSize: {
      1: 4.4,               // far left
      2: 4.4,               // left
      3: 5,                 // centre, the biggest
      4: 4.4,               // right
      5: 4.4                // far right
    },

    /* Burst height as a share of the screen height (0.5 = the middle). Only
       used if the medal's number cannot be found; normally the fireworks
       burst on the number itself (see burstY()). */
    goHeight: 0.5,

    /* The launch order. The centre goes first, then the pair either side,
       then the outer pair, 0.5s apart.
       x: across the screen, 0 left to 1 right.
       at: ms after the star is full.
       color: a set from goColors.
       n: which firework, 1-5 left to right (its size and look). */
    goSequence: [
      { x: 0.50, at: 0,    color: 'mix',  n: 3 },
      { x: 0.30, at: 500,  color: 'gold', n: 2 },
      { x: 0.70, at: 500,  color: 'gold', n: 4 },
      { x: 0.10, at: 1000, color: 'red',  n: 1 },
      { x: 0.90, at: 1000, color: 'red',  n: 5 }
    ],

    /* ---- Background fireworks: when and where ------------------------------
       They start once the card is revealed and run until close. */
    ambient: {
      enabled: true,
      every: 1.4,           // s, average gap between bursts
      vary: 0.6,            // +/- share of that gap, so the timing is uneven
      top: 0.12,            // highest burst, as a share of screen height
      bottom: 0.55,         // lowest burst, as a share of screen height
      margin: 0.08          // keep bursts this share of the width from the edges
    },

    /* ---- Background fireworks: how they look -------------------------------
       The full settings for the second engine that draws the background
       fireworks. It is separate from the main show, so changing these does
       not affect the five fireworks in front.

       Seen through the blue veil, so everything here looks softer and dimmer
       than the same numbers on the main canvas. */
    ambientLook: {
      background: null,


      scale: 3,

      scaleToScreen: {
        enabled: true,
        reference: 900
      },

      count: 120,
      explosionSize: 9,
      poolMax: 1200,

      gravity: 0.2,
      drag: 0.9,
      lifeDecay: 0.02,
      lifeSpread: 0.35,

      size: 0.9,
      sizeSpread: 0.5,

      trailFade: 0.14,
      trailAlpha: 0.7,
      glowDownscale: 4,
      glowAlpha: 0.5,

      // All zero, so every spark in a burst is exactly the same colour.
      jitterHue: 0,
      jitterSat: 0,
      jitterLight: 0,

      blast: {
        enabled: true,
        lead: 45,
        radius: 70,
        peak: 0.6,
        rise: 0.06,
        hold: 0.15,
        decay: 1.8,
        growth: 1.1,
        stack: 1
      },

      /* Engine defaults. None of these has an effect here: the bursts are plain spheres, no rocket is
         launched (bursts appear in place), second bursts are off, and the
         frame-time cap comes from the main config. */
      shape: {
        type: 'normal',
        starPoints: 5,
        starInner: 0.3,
        rings: 3,
        ringWidth: 0.04,
        ringThickness: 0.08
      },

      deltaCap: 0.064,

      rocket: {
        size: 4,
        launchY: 1,
        light: 88
      },

      sub: {
        enabled: false,
        count: 6,
        delay: 0.7,
        particles: 30,
        scale: 0.3,
        glow: true
      }
    }
  };

  /* ==========================================================================
     The fireworks engine
     --------------------------------------------------------------------------
     Draws fireworks on one canvas. The show below makes two: one for the main
     show and one for the background fireworks. Based on Hanabi
     (https://avanderw.co.za/hanabi/, github.com/avanderw/hanabi).

     HOW IT DRAWS: three offscreen buffers, combined onto the canvas each frame.
       particles  the sparks, crisp
       trail      a fading copy of the sparks, for streaks
       glow       the sparks shrunk to 1/4 size and scaled back up, added on
                  top. The twinkle comes from pixels lost in that shrink.

     WHAT A BURST DOES: throws `count` sparks out from a point. Each spark gets
     a direction and speed from the burst shape (an even disc or a star), a
     colour from the firework's hues, and a life. Gravity pulls it down and drag slows it until it dies. Optional
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

       var fw = Fireworks2(canvasElement, config);

       fw.cfg                the engine's copy of the config
       fw.burst(x, y, spec)  a burst where it stands (background fireworks)
       fw.launch(x, y, spec) a rocket that flies up and bursts at y (the show)
       fw.update(dt)         move everything forward dt seconds
       fw.draw(dt)           draw one frame
       fw.destroy()          remove the resize listener

     The show runs the animation loop (tick() further down); the engine never
     starts one.

     `spec` describes one firework:

         { hues: [357, 352, 2], white: 0.33, scale: 1.5, look: {...} }

     hues: colours to pick from (required). white: share of sparks drawn
     white. scale: size. look: count, size, shape, flash and second-burst values
     for this firework only (see lookOf()). Leave any out and cfg is used.

     fw.onBurst(x, y, spec), if set, is called each time a rocket bursts.

     It lives in this file's function, so it adds no global.
     ========================================================================== */

  var Fireworks2 = (function () {
    'use strict';

    // The frame rate the config numbers are written for. See the header.
    var FPS_REF = 30;
    var TAU = Math.PI * 2;

    // Every spark's base saturation and lightness, before a little jitter.
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

    // Returns [angle, speed share 0-1] for one spark.
    function shapePoint(S) {
      if (S.type === 'star burst') {
        var sa = Math.random() * TAU;
        return [sa, Math.sqrt(Math.random()) * starRadius(sa, Math.round(S.starPoints), S.starInner)];
      }
      // `normal`: an even disc. The square root spreads sparks evenly over the
      // area instead of bunching them in the middle.
      return [Math.random() * TAU, Math.sqrt(Math.random())];
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

      // A hue for one spark, picked from the firework's own hues.
      function pickHue(spec) {
        var list = spec.hues;
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

      // The values that shape a firework's own sparks: spec.look if the show
      // gave one, otherwise cfg (second-burst and background sparks).
      function lookOf(spec) { return (spec && spec.look) || cfg; }

      // Gives a spark its colour. A share of sparks (spec.white) are drawn
      // near-white; the rest take a hue plus jitter.
      function colour(p, spec) {
        var L = lookOf(spec);
        if (spec && spec.white && Math.random() < spec.white) {
          p.h = 45;
          p.s = clamp(8 + (Math.random() - 0.5) * 2 * L.jitterSat, 0, 20);
          p.l = clamp(95 + (Math.random() - 0.5) * L.jitterLight, 80, 100);
        } else {
          p.h = pickHue(spec) + (Math.random() - 0.5) * 2 * L.jitterHue;
          p.s = clamp(BASE_SAT + (Math.random() - 0.5) * 2 * L.jitterSat, 30, 100);
          p.l = clamp(BASE_LIGHT + (Math.random() - 0.5) * 2 * L.jitterLight, 30, 100);
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

        var L = lookOf(spec);
        var base = 1 / (L.lifeDecay * FPS_REF);
        p.life = 1;
        p.decay = 1 / (base * (1 + (Math.random() - 0.5) * 2 * L.lifeSpread));
        p.size = L.size * (1 + (Math.random() - 0.5) * 2 * L.sizeSpread) * scaleOf(spec);
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
        var L = lookOf(spec);
        var scale = scaleOf(spec);

        // Full speed. The screen factor makes sparks fly further on a bigger
        // screen; spark thickness is not scaled by it.
        var speed = L.explosionSize * FPS_REF * scale * screenScale();
        var n = Math.round(L.count);

        // Never more shells than there are sparkles to make shells out of.
        var shells = L.sub.enabled ? Math.min(Math.round(L.sub.count), n) : 0;

        // The shape, read once per burst.
        var S = L.shape;

        for (var i = 0; i < n; i++) {
          // Direction and share of full speed, from the shape.
          var g = shapePoint(S);
          var a = g[0];
          var r = g[1] * speed;
          var p = spawn(x, y, Math.cos(a) * r, Math.sin(a) * r, spec);
          if (!p) break;   // pool is full; the rest of this burst would drop anyway

          if (i < shells) {
            p.shell = true;
            p.subScale = scale;

            // Its life becomes the fuse: it bursts when it dies. +/-15% so the
            // shells do not all burst on the same frame.
            p.decay = 1 / (L.sub.delay * (0.85 + Math.random() * 0.3));
          }
        }
      }

      /* A shell's second burst. Same colour as its parent, sized from the
         parent's size. Its sparks are never shells, so it cannot chain further.
         Its sparks use cfg's values, and cfg.sub's particles, scale and glow. */
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
         called. Step past the lead before counting them. */
      function burst(x, y, spec) {
        var B = lookOf(spec).blast;
        if (!B.enabled) { spawnSparkles(x, y, spec); return; }
        spawnBlast(x, y, spec);
        if (B.lead > 0) pendingBursts.push({ x: x, y: y, t: B.lead / 1000, spec: spec });
        else spawnSparkles(x, y, spec);
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

            spawnSparkles(q.x, q.y, q.spec);
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
        // Clear to see-through so the page shows behind.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        burst: burst,
        launch: launch,
        update: update,
        draw: draw,
        destroy: destroy,

        /* Set this to a function(x, y, spec) to be told the moment each rocket
           bursts. Use it for anything that must happen on a burst, rather than
           guessing the timing. Every rocket calls it; tag your own rockets'
           specs to tell them apart.

           It runs inside update(), so an error in it stops the animation loop. */
        onBurst: null
      };

      return api;
    }

    return createFireworks2;
  })();

  /* ---- Start the engines -----------------------------------------------------
     The engine draws on the canvas and handles its own resizing. It does not
     run its own loop; this file runs it (see tick()) so teardown can stop it. */

  var fw = Fireworks2(canvas, cfg);

  // REQUIRED. The engine made its own copy of cfg, so point cfg at that copy.
  cfg = fw.cfg;

  /* The background fireworks get their own engine on their own canvas, so
     they can sit behind the blue veil. Same copy rule as above. */
  var amb = Fireworks2(ambCanvas, cfg.ambientLook);
  cfg.ambientLook = amb.cfg;

  /* ---- The show's timing ----------------------------------------------------
     The launches are timed on the animation loop (not setTimeout), so they
     pause if the tab is in the background. */

  // Launches waiting to happen, filled by runSequence().
  var scheduled = [];

  /* ---- Revealing the card ---------------------------------------------------
     Each burst moment clears one third of the black cover. There are three
     moments: fireworks that launch together burst on the same frame.

     Two bursts on the same frame count as one step (revealStepped is reset
     every frame). Once cleared, the cover stays cleared. */
  var REVEAL_STEPS = ['lsa-black--r1', 'lsa-black--r2', 'lsa-black--r3'];
  var revealed = 0;       // how many steps have been applied so far
  var revealStepped = false;   // has this frame already advanced the veil?

  // Clears the next third of the black cover.
  function advanceReveal() {
    if (revealed >= REVEAL_STEPS.length) return;
    black.classList.add(REVEAL_STEPS[revealed]);
    revealed++;
  }

  /* The engine calls this each time a rocket bursts. Only the five show
     fireworks (tagged with spec.n) move the cover; a firework from clicking
     the canvas does not. */
  fw.onBurst = function (x, y, spec) {
    if (!spec || !spec.n) return;

    if (revealStepped) return;
    revealStepped = true;

    // On the first burst, fade out the star and the counter, and cut the
    // galaxy short.
    if (revealed === 0) {
      root.classList.add('lsa-root--fired');
      cutGalaxyShort();
    }

    advanceReveal();
  };

  /* Makes sure the galaxy is gone by the first burst, whatever its fade time
     is set to; over a burst it would wash it out. If it is still fading,
     this stops it where it is and fades the rest in 0.25s.

     Changing the transition time mid-fade does nothing in browsers, so it
     freezes the current opacity, forces a style update, then starts a new
     fade. */
  function cutGalaxyShort() {
    var now = getComputedStyle(galaxy).opacity;
    if (parseFloat(now) === 0) return;   // already gone; nothing to interrupt

    galaxy.style.transition = 'none';
    galaxy.style.opacity = now;
    void galaxy.offsetWidth;             // flush, or the freeze never lands
    galaxy.style.transition = 'opacity 0.25s linear';
    galaxy.style.opacity = '0';
  }

  /* The height the fireworks burst at: the medal's number. Read when the
     show starts, so it is right for the current window size. If the number
     cannot be found, falls back to cfg.goHeight. */
  function burstY() {
    var y = medalNumberY();
    return (y === null || !isFinite(y)) ? canvas.clientHeight * cfg.goHeight : y;
  }

  // Queues the five launches from cfg.goSequence. updateSequence() fires them.
  function runSequence() {
    var w = canvas.clientWidth;
    var y = burstY();

    scheduled.length = 0;
    cfg.goSequence.forEach(function (row) {
      var c = cfg.goColors[row.color];
      scheduled.push({
        t: row.at / 1000,
        x: row.x * w,
        y: y,
        /* What makes this firework itself: colour, size, its look, and `n`,
           which tags it as a show firework for fw.onBurst. */
        spec: {
          hues: c.hues,
          white: c.white,
          scale: cfg.fireworkSize[row.n],
          n: row.n,
          look: FIREWORK_LOOK[row.n]
        }
      });
    });

  }

  // Called every frame. Counts down each queued launch and fires it when due.
  function updateSequence(dt) {
    for (var i = scheduled.length - 1; i >= 0; i--) {
      var q = scheduled[i];
      q.t -= dt;
      if (q.t <= 0) {
        scheduled[i] = scheduled[scheduled.length - 1];
        scheduled.pop();
        // Launch a rocket. It bursts when it reaches the target height.
        fw.launch(q.x, q.y, q.spec);
      }
    }
  }

  // Starts the show, once the star is full.
  // Does nothing if a show is already queued.
  function onGo() {
    if (scheduled.length) return;
    runSequence();
  }

  /* ---- The charge -------------------------------------------------------------
     Hold the cursor on the star and it fills; move away and it drains. The
     show starts when it is full.

     The hold takes 4s at 5 years up to 10s at 50, evenly in between, and
     stays at 10s past 50. Each number stays on screen for the hold divided
     by how many numbers the counter shows:

          5y    5 numbers ->  4.0s, 800ms each
         10y   10 numbers ->  4.7s, 467ms each
         50y   18 numbers -> 10.0s, 556ms each

     All values here were tuned by eye. Do not round them off. */
  var chargeTune = {
    minS: 4,       // the hold at 5 years, in seconds
    maxS: 10,      // the hold at 50 years, in seconds

    // Counter size, as a multiple of the CSS's 88px. scale1 is overwritten
    // by aimCounterAtMedal() to match the medal, so editing it does nothing.
    scale0: 0.30,  // when empty, about 26px
    scale1: 1.04,  // when full, set by aimCounterAtMedal()

    // The star's size, as a multiple of its 140px box. It grows past the
    // box on purpose.
    spark0: 0.65,  // at empty
    spark1: 1.65,  // at full
    glow: 1,       // how strong the bloom behind it gets, at full
    glowBlur: 0.6, // bloom radius, in viewBox units
    hot: 0.5,      // extra brightness on the fill itself, at full

    // The blur between numbers. See swapTick() for how these are used.
    // blur: most blur, in em. Keep it under about 0.12, or the number turns
    // into a round grey blob.
    blur:  0.1,
    maxMs: 250,    // longest a single swap may take
    frac:  0.85,   // of one step's interval, so it adapts to the milestone
    floor: 0.45,   // brightness at the peak, as a fraction
    peak:  0.65,   // where in the swap the text actually changes
    power: 1,      // curve shape. >1 holds sharp longer, then blurs hard.

    /* When the star is full.
       pop: a white flash on the star. OFF: under the galaxy it shows as a
       black disc. A replacement should use the star's own shape.
       galaxyFade: seconds for the galaxy to fade out. The rockets take about
       2.4s to burst; if the fade is longer, cutGalaxyShort() ends it. */
    pop: false,
    galaxyFade: 2.3
  };

  // Now that chargeTune exists, size and place the counter to match the medal.
  aimCounterAtMedal();

  // How long a full hold takes for this milestone, in seconds.
  function chargeSeconds() {
    var t = Math.min(1, Math.max(0, (YEARS - 5) / 45));
    return chargeTune.minS + (chargeTune.maxS - chargeTune.minS) * t;
  }

  // How long one number is on screen, in seconds.
  function stepSeconds() {
    return chargeSeconds() / steps.length;
  }

  // Draining takes twice as long as filling, so a small slip off the star
  // only loses a little.
  var DRAIN_RATIO = 2;

  // How soft the edge of the growing light is (the gap between the fill
  // gradient's two stops). Smaller is a harder ring.
  var SOFT_BAND = 0.18;

  // Pause in seconds between the star filling and the first launch.
  var RELEASE_PAUSE = 0.25;

  // How close the cursor must be, in px, before the star starts reacting.
  var NEAR_RADIUS = 260;

  /* ---- Which numbers the counter shows ----------------------------------------
     Every number up to 10, then every five, always ending on the milestone:

         5    1 2 3 4 5                       5 numbers
         25   1..10, 15, 20, 25              13 numbers
         50   1..10, 15, 20 ... 45, 50       18 numbers

     Works for any whole number; 7 years counts 1 to 7. */
  function stepsFor(y) {
    var out = [];
    for (var n = 1; n <= 10 && n <= y; n++) out.push(n);
    for (var m = 15; m <= y; m += 5) out.push(m);
    if (out[out.length - 1] !== y) out.push(y);
    return out;
  }

  // The numbers for this milestone.
  var steps = stepsFor(YEARS);

  var charge = 0;         // 0..1
  var charging = false;   // is the cursor on the button right now
  var charged = false;    // has it reached the top and fired the show

  /* ---- Blurring between numbers ----------------------------------------------
     When the number changes, it blurs and dims, the text swaps at the most
     blurred point where it cannot be read, then it sharpens again. One
     curve, run from the frame loop (no CSS transition).

     A swap lasts `frac` of one number's time, capped at `maxMs` (250ms).
     shownCount makes sure a swap starts only when the number really changes. */
  var shownCount = -1;    // the last number actually written to the DOM
  var swapT = -1;         // seconds into the current swap, -1 when idle
  var swapTo = null;      // the text waiting to be written at the peak
  var swapDur = chargeTune.maxMs / 1000;

  // Last blur written to the halo, so drawCharge() only writes when it changes.
  var haloBlurNow = -1;

  // Runs every frame. Moves the current swap along and writes the blur.
  function swapTick(dt) {
    if (swapT < 0) return;

    swapT += dt;
    var p = swapT / swapDur;

    if (p >= 1) {
      // Swap finished. Make sure the new text went in, even after a long frame.
      if (swapTo !== null) { countValue.textContent = swapTo; swapTo = null; }
      countValue.style.filter = '';
      swapT = -1;
      return;
    }

    // k goes 0 -> 1 -> 0 across the swap, peaking at `peak` (0.65), so it
    // blurs out slowly and sharpens quickly.
    var pk = chargeTune.peak;
    var t = (p < pk) ? (p / pk) : ((1 - p) / (1 - pk));
    var k = Math.pow(Math.sin(t * Math.PI / 2), chargeTune.power);

    if (p >= pk && swapTo !== null) {
      countValue.textContent = swapTo;
      swapTo = null;
    }

    // Blur, then dim with brightness. Must be brightness, not opacity, or
    // the galaxy effect is lost. `floor` keeps it from going fully dark.
    countValue.style.filter =
      'blur(' + (k * chargeTune.blur).toFixed(3) + 'em) ' +
      'brightness(' + ((1 - k * (1 - chargeTune.floor)) * 100).toFixed(1) + '%)';
  }

  // Cursor on the star: fill. Cursor off: drain.
  function onChargeEnter() { charging = true; }
  function onChargeLeave() { charging = false; }
  chargeBtn.addEventListener('mouseenter', onChargeEnter);
  chargeBtn.addEventListener('mouseleave', onChargeLeave);

  /* Runs every frame from frame(). Fills or drains the charge. When it is
     full: starts the release pause, fades the galaxy, and flashes the star
     if `pop` is on. */
  function chargeTick(dt) {
    if (charged) return;

    var secs = chargeSeconds();
    charge += charging ? (dt / secs) : -(dt / (secs * DRAIN_RATIO));
    if (charge < 0) charge = 0;

    if (charge >= 1) {
      charge = 1;
      charged = true;
      charging = false;
      // The show starts after RELEASE_PAUSE; see releaseSparks().
      releaseIn = RELEASE_PAUSE;

      // The white flash. Off by default; see chargeTune.pop.
      if (chargeTune.pop) chargeBtn.classList.add('lsa-charge--pop');

      // Start fading the galaxy now, so it is gone before the fireworks
      // burst. The fade time is set on the root, never on the image itself.
      root.style.setProperty('--lsa-galaxy-fade',
                             chargeTune.galaxyFade.toFixed(2) + 's');
      root.classList.add('lsa-root--released');
    }

    drawCharge();
  }

  /* Draws the charge: picks the counter's number, sizes the counter, and
     fills, grows and lights the star. Everything follows the fill level, not
     the time, so draining counts back down. */
  function drawCharge() {
    /* Which number to show. Each number gets an equal share of the fill, and
       the milestone shows exactly at full. At empty nothing shows (not 0). */
    var idx = Math.ceil(charge * steps.length) - 1;
    if (idx > steps.length - 1) idx = steps.length - 1;
    var count = idx < 0 ? 0 : steps[idx];

    // When the number changes (up or down), start a blur swap to the new text.
    if (count !== shownCount) {
      var text = count > 0 ? String(count) : '';

      if (shownCount === -1) {
        // First number of this run: nothing to blur from, so just write it.
        countValue.textContent = text;
      } else {
        // Start a new swap, even if one is still running.
        swapTo = text;
        swapT = 0;
        swapDur = Math.min(chargeTune.maxMs / 1000,
                           stepSeconds() * chargeTune.frac);
      }
      shownCount = count;
    }

    // The counter grows smoothly with the fill (a transform, so nothing
    // re-lays out). swapTick() handles `filter`; this only writes `transform`.
    var numScale = chargeTune.scale0 +
                   (chargeTune.scale1 - chargeTune.scale0) * charge;
    countValue.style.transform = 'scale(' + numScale.toFixed(3) + ')';
    /* The star's light grows from the centre out. The outer gradient stop is
       the front edge; the inner one trails it by SOFT_BAND. The front runs a
       little past 1 so the whole star is lit at full. Values are rounded to
       4 places because SVG will not read numbers like 4.9e-14. */
    var front = charge * (1 + SOFT_BAND);
    var trail = front - SOFT_BAND;
    if (front > 1) front = 1;
    if (trail < 0) trail = 0;
    sparkCoreA.setAttribute('offset', trail.toFixed(4));
    sparkCoreB.setAttribute('offset', front.toFixed(4));

    // The CSS uses this to brighten the star's outline as it fills.
    chargeBtn.style.setProperty('--lsa-fill', charge.toFixed(4));

    // Grow the star art. Only the SVG grows, never the button, so the target
    // under a held cursor stays the same size.
    var sparkScale = chargeTune.spark0 +
                     (chargeTune.spark1 - chargeTune.spark0) * charge;
    sparkArt.style.transform = 'scale(' + sparkScale.toFixed(3) + ')';

    // The glow behind the star, and the light inside it, both brighten with
    // the fill.
    sparkHalo.style.opacity = (charge * chargeTune.glow).toFixed(3);
    sparkFillPath.style.filter =
      'brightness(' + (1 + charge * chargeTune.hot).toFixed(3) + ')';

    // The glow's blur size. Only written when it changes, since each write
    // re-renders the filter.
    if (haloBlurNow !== chargeTune.glowBlur) {
      haloBlurNow = chargeTune.glowBlur;
      sparkHaloBlur.setAttribute('stdDeviation', haloBlurNow);
    }

    // The label under the star.
    chargeLabel.textContent = charged ? 'Charged'
      : (charging ? 'Charging' : 'Hold your spark here');
  }

  /* How close the cursor is to the star, 0 to 1, written to --lsa-near
     every frame. Nothing in the CSS uses it right now. */
  function proximityTick() {
    var near = 0;

    if (sparkSeen && !charged) {
      var b = chargeBtn.getBoundingClientRect();
      var dx = sparkX - (b.left + b.width / 2);
      var dy = sparkY - (b.top + b.height / 2);
      var dist = Math.sqrt(dx * dx + dy * dy);
      near = Math.max(0, 1 - dist / NEAR_RADIUS);
      // Squared, so it stays low until the cursor is quite close.
      near *= near;
    }

    chargeBtn.style.setProperty('--lsa-near', near.toFixed(3));
  }

  // Draw once now so the star and label show before the first frame.
  drawCharge();

  /* ---- The spark cursor ------------------------------------------------------
     The cursor is a soft glow that keeps throwing out small four-point
     sparks. Each spark flies out at a random angle, spins, shrinks and fades.
     They keep coming even when the cursor is still, because the user has to
     hold still to charge the star.

     The sparks use the star shape (SPARK_PATH) and the centre firework's
     colours plus a warm white. Drawn on its own canvas, not by the engine. */
  var SPARK_MAX = 40;
  var SPARK_LIFE = 0.6;         // s
  var SPARK_PER_SEC = 45;       // embers spawned per second
  var SPARK_SPEED_MIN = 50;     // px/s outward from the cursor
  var SPARK_SPEED_MAX = 170;
  var SPARK_SIZE_MIN = 10;      // px, the shape's on-screen footprint
  var SPARK_SIZE_MAX = 20;
  var SPARK_SPIN_MAX = 5;       // rad/s, +/-
  var SPARK_GLOW_RADIUS = 14;   // px, the glow at the cursor itself

  // The star shape, and its centre so each spark turns around its middle.
  var SPARK_SHAPE = new Path2D(SPARK_PATH);
  var SPARK_SHAPE_CENTER = 7.44;

  // The colours, built once rather than for every spark.
  var SPARK_COLORS = cfg.goColors.mix.hues.map(function (h) {
    return 'hsl(' + h + ', 90%, 62%)';
  }).concat(['#FFF6D6']);

  var sparkCtx = sparkCanvas.getContext('2d');
  var sparks = [];
  var sparkX = -1000, sparkY = -1000;
  var sparkSeen = false;      // has the pointer been inside the overlay yet
  var sparkDebt = 0;          // fractional embers carried between frames
  var sparkW = 0, sparkH = 0, sparkDpr = 0;

  // Keeps the cursor canvas matched to the window and screen density.
  function sparkResize() {
    var w = sparkCanvas.clientWidth || 1;
    var h = sparkCanvas.clientHeight || 1;
    var dpr = window.devicePixelRatio || 1;
    if (w === sparkW && h === sparkH && dpr === sparkDpr) return;
    sparkW = w; sparkH = h; sparkDpr = dpr;
    sparkCanvas.width = Math.round(w * dpr);
    sparkCanvas.height = Math.round(h * dpr);
    // Drawing below is then in CSS pixels.
    sparkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Runs every frame. Adds new sparks and moves the existing ones.
  function sparkTick(dt) {
    if (!sparkSeen) return;

    // Sparks per second, not per frame, so a 120Hz screen gets the same number.
    sparkDebt += SPARK_PER_SEC * dt;
    while (sparkDebt >= 1) {
      sparkDebt -= 1;
      if (sparks.length < SPARK_MAX) {
        var angle = Math.random() * Math.PI * 2;
        var speed = SPARK_SPEED_MIN + Math.random() * (SPARK_SPEED_MAX - SPARK_SPEED_MIN);
        sparks.push({
          x: sparkX, y: sparkY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 2 * SPARK_SPIN_MAX,
          size: SPARK_SIZE_MIN + Math.random() * (SPARK_SIZE_MAX - SPARK_SIZE_MIN),
          color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
          life: 1
        });
      }
    }

    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt / SPARK_LIFE;
      if (p.life <= 0) {
        // Remove it quickly by swapping in the last one; order does not matter.
        sparks[i] = sparks[sparks.length - 1];
        sparks.pop();
      }
    }
  }

  // Draws the sparks, then the glow at the cursor on top.
  function sparkDraw() {
    sparkResize();
    sparkCtx.clearRect(0, 0, sparkW, sparkH);
    if (!sparkSeen) return;

    sparkCtx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      // Shrinks as it fades.
      var scale = (p.size * (0.4 + 0.6 * p.life)) / 15;
      sparkCtx.save();
      sparkCtx.translate(p.x, p.y);
      sparkCtx.rotate(p.rot);
      sparkCtx.scale(scale, scale);
      sparkCtx.translate(-SPARK_SHAPE_CENTER, -SPARK_SHAPE_CENTER);
      sparkCtx.globalAlpha = p.life;
      sparkCtx.fillStyle = p.color;
      sparkCtx.fill(SPARK_SHAPE);
      sparkCtx.restore();
    }
    // Reset alpha to be safe.
    sparkCtx.globalAlpha = 1;

    // The glow at the cursor: a bright centre fading out. Rebuilt every frame
    // because the cursor moves.
    var glowR = SPARK_GLOW_RADIUS;
    var glow = sparkCtx.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, glowR);
    glow.addColorStop(0,    'rgba(255, 250, 235, 0.95)');
    glow.addColorStop(0.3,  'rgba(255, 246, 214, 0.55)');
    glow.addColorStop(1,    'rgba(255, 246, 214, 0)');
    sparkCtx.fillStyle = glow;
    sparkCtx.fillRect(sparkX - glowR, sparkY - glowR, glowR * 2, glowR * 2);

    sparkCtx.globalCompositeOperation = 'source-over';
  }

  /* ---- The pause before launch ------------------------------------------------
     After the star is full, wait RELEASE_PAUSE seconds, then start the show. */
  var releaseIn = -1;     // seconds until release; -1 when idle

  // Runs every frame. Counts down the pause and starts the show at zero.
  function dischargeTick(dt) {
    if (releaseIn < 0) return;
    releaseIn -= dt;
    if (releaseIn > 0) return;
    releaseIn = -1;
    releaseSparks();
  }

  function releaseSparks() {
    onGo();
  }

  /* ---- Background fireworks: timing --------------------------------------------
     Random bursts at random places behind the blue veil. They start on the
     frame the black cover is fully cleared.
     The first one goes off straight away. */
  var ambNext = 0;        // seconds until the next background burst

  // A random gap before the next burst, around cfg.ambient.every.
  function ambientGap() {
    var A = cfg.ambient;
    // Never below 0.05s, or it would burst every frame.
    return Math.max(0.05, A.every * (1 + (Math.random() * 2 - 1) * A.vary));
  }

  // Runs every frame. When the gap is up, sets off one background burst.
  function ambientTick(dt) {
    var A = cfg.ambient;
    if (!A.enabled || revealed < REVEAL_STEPS.length) return;

    ambNext -= dt;
    if (ambNext > 0) return;

    /* A burst in place, with no rocket, so it looks like a distant firework
       already in the sky.

       One random colour for the whole burst, passed as a one-item `hues` list.
       No `scale` here, so ambientLook.scale still controls the size. */
    var w = ambCanvas.clientWidth;
    var h = ambCanvas.clientHeight;
    var m = A.margin * w;
    var band = Math.max(0, A.bottom - A.top);

    amb.burst(m + Math.random() * Math.max(1, w - m * 2),
              (A.top + Math.random() * band) * h,
              { hues: [Math.random() * 360] });

    ambNext = ambientGap();
  }

  /* ---- The animation loop ------------------------------------------------------
     One requestAnimationFrame loop runs everything. teardown() cancels it. */
  var last = performance.now();
  var rafId = requestAnimationFrame(tick);

  function tick(now) {
    // Seconds since the last frame, capped so a paused tab does not jump.
    var dt = Math.min((now - last) / 1000, cfg.deltaCap);
    last = now;
    frame(dt);
    rafId = requestAnimationFrame(tick);
  }

  // Everything that happens in one frame, in order.
  function frame(dt) {
    // Reset before the engine runs; fw.onBurst sets it during fw.update().
    revealStepped = false;

    // Move the main fireworks (bursts fire fw.onBurst from in here).
    fw.update(dt);

    // Background fireworks: maybe start one, then move them.
    ambientTick(dt);
    amb.update(dt);

    // Fire any launches that are due.
    updateSequence(dt);

    // Fill or drain the star. Once it has fired, it stays full.
    chargeTick(dt);

    // The counter's blur swap. Run here, not in chargeTick(), so the last
    // number's swap finishes after the star is full.
    swapTick(dt);

    // The pause before launch.
    dischargeTick(dt);
    proximityTick();

    // Move the cursor sparks.
    sparkTick(dt);

    // Draw all three canvases, back to front.
    amb.draw(dt);
    fw.draw(dt);
    sparkDraw();
  }

  /* ---- Close ---------------------------------------------------------------------
     Removes everything: every listener, the animation loop, both engines,
     the overlay itself, and gives the page its scrolling back. */
  function teardown() {
    closeBtn.removeEventListener('click', teardown);
    chargeBtn.removeEventListener('mouseenter', onChargeEnter);
    chargeBtn.removeEventListener('mouseleave', onChargeLeave);
    root.removeEventListener('mousemove', onStageMove);
    cancelAnimationFrame(rafId);
    // Each engine removes its own resize listener.
    fw.destroy();
    amb.destroy();
    root.remove();
    document.body.style.overflow = previousOverflow;
  }

})();
