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
   THE LAYERS, front to back. Built here, ordered by z-index in the CSS:

     1  fireworks   .lsa-canvas    z  3   transparent composite, always on top
     2  black       .lsa-black     z  2   opaque; the show clears it in thirds
     3  card        .lsa-card      z  1   medallion + message, never fades
     4  blue        .lsa-backdrop  z  0   blurred veil, constant throughout
     5  ambient     .lsa-ambient   z -1   background fireworks, seen THROUGH
                                          the blue veil; starts at the reveal
     6  intranet    —                     the live page, behind .lsa-root

   The order is the design: the fireworks sit in FRONT of the black, so they
   burn at full brightness against it while the card behind it is hidden. Each
   burst clears a third of the black, and the card emerges from behind it. Move
   the black above the canvas and it dims the fireworks too, which is the exact
   opposite of the intent.

   Layer 5 is the newest, and the only one BEHIND the blue veil — which is what
   makes it read as distance, since it is blurred and muted by the same veil
   that blurs the page. It runs on its own Fireworks2 instance with its own
   config, so nothing about it can disturb the show in front. See "Background
   fireworks" further down.
   ========================================================================== */

(function () {
  'use strict';

  var MIN_WIDTH = 1024;

  if (window.innerWidth < MIN_WIDTH) return;

  /* ---- Who this is for, and which milestone -----------------------------
     Read from the mount element if Liferay has put them there, and fall back
     to the constants otherwise so the local demo and any un-templated page
     still work.

     THE MILESTONE IS NOW ONE INPUT WITH REAL REACH. It used to appear in a
     single sentence on the card; it now also drives the counter the whole
     charge interaction is built around, which counts from 0 to exactly this
     number. So a wrong value here is visible for three seconds before anyone
     reaches the card.

     `data-years` is parsed rather than trusted: an attribute is a string, it
     may be absent, and it may be something a template rendered badly. Anything
     that is not a positive number falls back rather than putting NaN on screen
     in letters two inches tall.

     Deliberately NOT clamped to multiples of five. The award has ten
     milestones, but this file has no business knowing that — if HR ever hands
     out a seven-year award, the overlay should count to seven rather than
     refuse. */
  var mount = document.getElementById('lsa-mount');

  var NAME = (mount && mount.getAttribute('data-name')) || 'Akhil';

  var YEARS = 5;
  var yearsAttr = mount && parseInt(mount.getAttribute('data-years'), 10);
  if (yearsAttr > 0) YEARS = yearsAttr;

  /* Where the medallion images live, resolved against the PAGE — not against
     this script, which is not how img.src works. Swap this for the hosted path
     the same way lsa-mount.html's REPLACE_WITH_ASSET_PATH placeholders are
     swapped.

     Every image the overlay loads is found through here. There used to be one
     exception — shimmer.png, a mask-image resolved against the stylesheet — and
     it went with the shimmer on 2026-09-07. */
  var ASSET_PATH = 'assets/';

  // "Show once" gating is intentionally NOT done here. Per project decision,
  // that flag must be set and checked on the backend (e.g. a per-user "has
  // seen LSA 5yr experience" flag). Until that's wired up, this experience
  // plays on every page load. See handoff.md -> "Once-only flag".

  var root = document.createElement('div');
  root.className = 'lsa-root';

  /* The background fireworks, built FIRST because it sits furthest back — the
     one element in the overlay that paints behind the blue veil rather than in
     front of it. Nothing is drawn on it until the reveal finishes; see the
     "Background fireworks" section below. */
  var ambCanvas = document.createElement('canvas');
  ambCanvas.className = 'lsa-ambient';
  root.appendChild(ambCanvas);

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
     moment — see advanceReveal() and fw.onBurst further down. */

  var card = document.createElement('div');
  card.className = 'lsa-card';

  /* THE CARD'S SURFACE, 2026-09-11 — it replaces the flat white that stood
     here from 09-10. A cream plate with a 16px gold rim and rounded corners,
     all of it baked into the artwork, so the CSS carries no colour and no
     border-radius of its own. The rest of the rule is in .lsa-card.

     IT IS SET FROM HERE, AND THAT IS THE POINT. Written as a url() in the
     stylesheet it would resolve against the CSS file, which would put the
     stylesheet and assets/ back to being siblings on Liferay — a constraint
     that was finally removed on 09-07 when the shimmer's mask went. Through
     ASSET_PATH it resolves against the PAGE, like every other image here, and
     there is still exactly one path to swap at integration time.

     NOT card.style.background. The shorthand resets background-clip, and this
     card contains the count-up, which is gradient text held together by
     background-clip. Nothing clips on the card itself, but they are one
     property away from each other.

     card-Back-l.png since 2026-09-30: Backl.png compressed, 1.38 MB against
     2.7 MB, same 3200x2160. Mind the capital B on a case-sensitive server. */
  card.style.backgroundImage = 'url("' + ASSET_PATH + 'card-Back-l.png")';

  var medalScene = document.createElement('div');
  medalScene.className = 'lsa-medal-scene';

  var medalCoin = document.createElement('div');
  medalCoin.className = 'lsa-medal-coin';

  var coinFront = document.createElement('div');
  coinFront.className = 'lsa-medal-face lsa-coin-front';

  /* THE FACE CARRIES NO NUMBER, since 2026-09-07. medal-face.png had a 5 and
     the word Years baked into the artwork, which meant a 20-year award showed a
     medal reading 5, and ten milestones would have needed ten 2.3 MB faces.
     medal-face-blank.png is the same artwork with the digit taken out; "Years"
     stays, because that word does not change.

     The number is drawn over it as DOM text instead — see .lsa-medal-number
     below. One face for all ten milestones, and the count-up can be aimed at
     the same box rather than at a measured guess. medal-face.png is still on
     disk and nothing loads it. */
  /* medal.svg since 2026-09-30, in place of Front.png, brought over from
     lab/medal-lab. Its 563x565 viewBox is Front.png's 2250x2260 at a quarter,
     so it fills the same 320x321 box.

     INLINED, not an <img>. An SVG inside an <img> is a closed document that
     CSS and JS cannot reach into, and its "image" layer is turned and faded
     by the tilt — see turnImage(). This div holds the <svg> once it loads.

     ⚠ fetch() is subject to the page's CSP connect-src, which an <img> is
     not. On Liferay, assets/ must be same-origin or allowed there. */
  var medalImg = document.createElement('div');
  medalImg.className = 'lsa-medal-img';
  coinFront.appendChild(medalImg);

  /* The "image" layer: the round brushed-metal texture in the middle of the
     face. In the file it is a 387x387 circle filled by a pattern that holds
     the embedded PNG (#image0_5482_71034). The circle is what draws, so that
     is what gets the class. */
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

  /* The diamonds on the ring, since 2026-09-30. One for every 5 years, set
     along the bottom of the ring and centred on straight down, 18° apart.

     The ring is the edge of medal.svg's inner disc, r 170 about (281.5, 282.5):
     the line between the textured centre and the plain band around it. Each
     diamond is CENTRED ON THAT LINE, so half of it always sits on either side,
     whatever its angle. A straight-up nudge cannot do that, because the ring
     curves; the radius is the only thing that can.

     All values are in medal.svg's 563x565 units and written as percentages,
     so the diamonds follow the medal if it is ever resized. Same FACE_SCALE
     as the face, set where that is. */
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

  /* The milestone, drawn over the blank face instead of baked into it.

     IT SITS INSIDE coinFront, not over the card, so it rides the 3D tilt with
     the face — which is what the digit did when it was part of the artwork.

     Everything about where it lands is in the stylesheet, derived from the old
     artwork rather than eyeballed: see .lsa-medal-number. */
  var medalNumber = document.createElement('div');
  medalNumber.className = 'lsa-medal-number';
  medalNumber.setAttribute('aria-hidden', 'true');
  medalNumber.textContent = String(YEARS);
  coinFront.appendChild(medalNumber);

  medalCoin.appendChild(coinFront);
  medalScene.appendChild(medalCoin);
  card.appendChild(medalScene);

  /* One writer for the sentence, because the dev panel's milestone picker
     rewrites it — see setYears(). Two copies of this string would drift the
     moment either one is reworded. */
  function cardLine() {
    return 'Congratulation ' + NAME + ' on completing ' + YEARS +
           ' years with DBS.';
  }

  var cardText = document.createElement('p');
  cardText.className = 'lsa-card-text';
  cardText.textContent = cardLine();
  card.appendChild(cardText);

  root.appendChild(card);

  /* Thickness, faked. There is no real geometry in the medallion: EDGE_COUNT
     copies of the textless silhouette are stacked along Z, and off-axis the
     slices read as one solid rim. The front face is then pushed out far enough
     to cap the stack.

     Raising EDGE_STEP without raising EDGE_COUNT opens visible gaps between
     the slices. More layers is a smoother rim at more compositing cost.

     What opens a gap is the PROJECTED distance between slices, which is
     step x sin(rotation). Go deeper by raising the COUNT, not the step.

     ⚠ THE COUNT IS 68 AND THE CASE THAT BOUGHT IT IS GONE. The history:

     - It went 1.2 -> 2.4 on 2026-09-07 with the count held at 34, doubling the
       depth from 40.8px to 81.6px, because at 40.8 the rim was there and nobody
       could see it.
     - A 68-layer stack of the same 81.6px depth was compared then and judged
       IDENTICAL, so the layers were not bought. That judgement was made AT
       REST, where the coin never turns past ~34 degrees of tilt and 2.4
       projects to ~1.3px, under the ~1.5px where a seam shows.
     - The click-to-flip of 2026-09-10 turned it through 90, where the
       projection is the full 2.4px and every slice is edge-on. The stack came
       apart into a visible comb, so the count went to 68 to halve the gap.

     The flip was removed on 2026-09-21, which puts the coin back inside that
     ~34 degrees of tilt for good — the one case where 34 layers at 2.4px was
     judged identical. So 34 halves the compositing cost for no visible change.
     LEFT AT 68 because nobody has looked at the two side by side since, and
     the earlier judgement was made against a black card rather than the cream
     plate the medal sits on now. */
  var EDGE_COUNT = 68;
  var EDGE_STEP = 1.2;    // px between layers; 68 x 1.2 gives ~81.6px of depth

  /* ---- The depth wrapper, and why there is a third nested div -----------
     ⚠ NOTHING WRITES TO medalCoin OR medalDepth ANY MORE. Both are inert 3D
     wrappers today: no transform, no transition, no animation. They were built
     for the click-to-flip, which was removed on 2026-09-21 —
     medalCoin carried the 180-degree turn and medalDepth carried a keyframed
     scaleZ squeeze that collapsed the rim while it turned, because 68 flat
     planes seen edge-on comb apart and let the card show between them.

     KEPT RATHER THAN FLATTENED, deliberately. They are two empty divs carrying
     preserve-3d, the whole coin hangs off them, and pulling them out means
     re-parenting 70 elements for nothing anyone can see. They are also exactly
     where the flip goes if it comes back — one writer per element, which is
     what made it cheap the first time.

     Full code and the reasoning behind the squeeze's curve:
     lab/medal-flip.reference.md */
  var medalDepth = document.createElement('div');
  medalDepth.className = 'lsa-medal-depth';
  medalCoin.appendChild(medalDepth);

  // coinFront was parented to medalCoin up in the card block, before this
  // wrapper existed. appendChild MOVES a node, so this re-parents it rather
  // than copying it.
  medalDepth.appendChild(coinFront);

  for (var e = 0; e < EDGE_COUNT; e++) {
    var edge = document.createElement('div');
    edge.className = 'lsa-coin-edge';

    var edgeImg = document.createElement('img');
    // Textless on purpose: edge layers are seen from both sides, so any
    // lettering would read mirrored from behind.
    edgeImg.src = ASSET_PATH + 'Stack.png';
    edgeImg.alt = '';
    edge.appendChild(edgeImg);

    // No transform here. applyCoinDepth() below places every layer AND both
    // caps off one formula, and it has to be callable again when the depth
    // slider moves — so placing them here too would be the same arithmetic in
    // two places, drifting the moment either is edited.
    medalDepth.appendChild(edge);
  }

  /* THE FRONT CAP IS A SHADE SMALLER THAN ITS OWN BOX, and the number is
     measured rather than eyeballed. The face and the rim are different assets
     that were never checked against each other:

         medal-face-blank.png  ink fills 100%   x 99.56% of its canvas
         medal-edge.svg        path fills 99.16% x 98.81% of its viewBox

     Both are drawn into the same box at 100% width and height, so the cap
     stood ~0.84% proud of the silhouette behind it — about 1.3px a side at
     the current 320px, a visible lip all the way round.

     back.png measured 100% x 99.60% and took the same correction while it was
     the far cap. It is unused since the flip came out on 2026-09-21.

     0.992 is the width ratio; the height ratio is 0.9924 and one uniform scale
     splits the difference to well under a tenth of a pixel.

     ON THE IMG, NOT ON THE FACE, and that is the whole reason this is safe.
     coinFront also holds .lsa-medal-number, and the
     count-up's aim reads the number's LAYOUT position — see medalNumberY(),
     which cannot see a transform. Scaling the face would move the digit about a
     quarter-pixel out from under a counter that lands within 0.23px of it.
     Scaling only the artwork leaves every measured relationship alone. */
  var FACE_SCALE = 0.992;
  medalImg.style.transform = 'scale(' + FACE_SCALE + ')';
  medalDiamonds.style.transform = 'scale(' + FACE_SCALE + ')';

  /* ---- The medal's thickness, and its slider ----------------------------
     There is no far cap. The stack's back end is open, which nothing can see:
     the tilt never takes the coin past ~25 degrees, so the far side of the rim
     stays away from the viewer the whole time.

     It had one until 2026-09-21 — back.png, capping the stack the way coinFront
     caps the near end — because the coin used to turn all the way over on a
     click. That came out with the flip. See lab/medal-flip.reference.md. */
  var coinTune = {
    depth: EDGE_COUNT * EDGE_STEP   // 81.6px, the current look
  };

  /* ONE FORMULA FOR ALL 69 PIECES. The layers and the front cap are placed from
     coinTune.depth here and nowhere else, so the slider and the initial build
     cannot disagree. EDGE_COUNT stays fixed and the STEP is derived — more
     layers in the same depth is always the safer direction, and holding the
     count means the compositing cost does not move while the slider does. */
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

  /* Tilt is written on the PERSPECTIVE ROOT, which rotates the whole 3D
     subtree as one rigid body under a fixed perspective. That is what makes it
     feel like an object being turned rather than a picture being spun. The
     0.15s transition on that element in the CSS is where the lag comes from.

     THIS IS THE ONLY ROTATION LEFT, since 2026-09-21. The coin no longer turns
     over on a click, so back.png goes unused and the stack has no far cap. */
  var MAX_TILT = 25;      // degrees of lean at the edge of the element

  /* WHOLE-SCREEN TRACKING, since 2026-09-10. The medal used to go dead the
     moment the cursor left its own box and snap flat; it now leans toward the
     cursor from anywhere on the stage, and only the STRENGTH falls off with
     distance. Two constants below own that falloff.

     What did NOT change: the lean over the medal itself. Inside its box the
     strength is a flat 1, so the interaction that was tuned there is the same
     interaction, and everything outside is new behaviour bolted on around it.

     There is no reset to flat any more, by design — the medal holds its last
     lean when the pointer leaves the window, the way a tilted object would. */
  var FAR_TILT = 0.12;    // strength at the far corner of the screen, 0-1
  var TILT_FALLOFF = 0.6; /* curve between the medal's edge and that corner.
                             Below 1 it drops fast and then flattens, which is
                             what puts most of the stage in the subtle band
                             instead of spreading the decay evenly. Above 1
                             would keep the lean strong most of the way out. */

  /* The listener is on the ROOT, not on the medallion.

     The card sits UNDER the canvas so the fireworks burst over it, which means
     the medallion never receives a mouse event of its own and mouseenter /
     mouseleave never fire on it. So the cursor's position relative to the medal
     is answered from geometry instead: mousemove bubbles up from the canvas to
     the root, and the offset is measured there.

     One listener for the whole stage, which is also what the overlay used to
     do when it had cursor sparks. */

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* THE MEDAL'S BOX IS TAKEN FROM LAYOUT, NOT FROM ITS RECT, and that is not a
     style preference. The scene is always rotated by the tilt and the coin can
     be mid-flip, and a rotated element's getBoundingClientRect() is the
     axis-aligned box of the rotated geometry — it grows and shrinks with the
     turn. Feeding that back in as the thing the turn is measured against is a
     loop that feeds on its own output. offsetWidth / offsetLeft are
     pre-transform layout values, so the target stays still.

     Same trick the counter's aim already uses — see medalNumberY(). The card's
     own rect is safe to read: it carries a translate, never a rotation. */
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

  function onStageMove(ev) {
    // The spark cursor rides this listener rather than adding a second one.
    // Every element in the overlay is a descendant of root, so this fires
    // wherever the pointer is — including over the buttons, where a listener
    // on the canvas alone would go quiet.
    sparkX = ev.clientX;
    sparkY = ev.clientY;
    sparkSeen = true;

    var b = medalBox();
    var halfW = b.halfW;
    var halfH = b.halfH;

    var px = ev.clientX - b.cx;
    var py = ev.clientY - b.cy;

    /* DIRECTION and STRENGTH are worked out separately, which is the whole
       shape of this. Direction is the old normalised offset clamped to the
       box, so over the medal it is bit-for-bit what it was before; strength is
       one scalar that only depends on how far away the cursor is. */
    var dx = clamp(px / halfW, -1, 1);
    var dy = clamp(py / halfH, -1, 1);

    // Distance from the medal's corner out to the screen's corner, as 0-1.
    // Measured against the VIEWPORT so "far" means the same thing on a 1024
    // screen and a 2560 one, rather than the same number of medal-widths.
    var edge = Math.sqrt(halfW * halfW + halfH * halfH);
    var reach = Math.sqrt(window.innerWidth * window.innerWidth +
                          window.innerHeight * window.innerHeight) / 2;
    var t = clamp((Math.sqrt(px * px + py * py) - edge) /
                  Math.max(1, reach - edge), 0, 1);

    var k = 1 - (1 - FAR_TILT) * Math.pow(t, TILT_FALLOFF);

    // Y inverted, so the medal leans TOWARD the cursor rather than away.
    medalScene.style.transform =
      'rotateX(' + (-dy * MAX_TILT * k) + 'deg) rotateY(' +
      (dx * MAX_TILT * k) + 'deg)';

    turnImage(px, py);

    /* The image's opacity follows how hard the medal is tilting. mag is the
       tilt as a fraction of MAX_TILT: 1 at the medal's edge, FAR_TILT at the
       screen's far corner, and falling to 0 toward the medal's centre, where
       the lean flattens out. Rescaled so the far corner is fully clear. */
    if (medalImage) {
      var mag = Math.min(1, Math.sqrt(dx * dx + dy * dy)) * k;
      medalImage.style.opacity = clamp((mag - FAR_TILT) / (1 - FAR_TILT), 0, 1);
    }
  }

  /* ---- The image turns its dark side away ------------------------------
     The side of the medal nearest the cursor is the side tipped AWAY from
     the viewer, so the image's darkest section is turned to face the cursor.

     DARK_ANGLE is where that section sits at rest, in degrees clockwise from
     the top. Measured off the embedded PNG by averaging brightness around the
     disc: the darkest wedge is centred at ~105, right and a little below. The
     other dark lobe, at ~245, is a touch lighter and simply follows. */
  var DARK_ANGLE = 105;
  var imageAngle = null;  // unwrapped, so the transition never spins the long way

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

  /* Layer 2 — the black veil, sitting over the card and under the canvas.
     Starts opaque and is what the reveal fades; the card itself never moves.
     CSS-only, so there is nothing here for teardown to unwind. */
  var black = document.createElement('div');
  black.className = 'lsa-black';
  root.appendChild(black);

  /* ---- The charge button, and the counter above it ----------------------
     Replaces the old GO press. The user brings the cursor to the button and
     HOLDS it there; sparks fill the button from the bottom while the years
     count up above it, and the show starts when it is full.

     The counter is its own element rather than part of the button, and sits
     above it, because it is the thing being watched — the button is only where
     the filling happens. It is NOT the card's message: that one carries the
     congratulation and lives behind the veil, and is a different sentence at a
     different moment.

     Both are built here, at the bottom of the stage, well clear of the
     fireworks — which now break at the vertical middle, over the medallion. */

  var countEl = document.createElement('div');
  countEl.className = 'lsa-count';
  countEl.setAttribute('aria-live', 'polite');

  /* The digits live in a child, not in countEl itself, because the two need a
     transform each: countEl's centres it, this one's grows it with the fill.
     See .lsa-count-value in the stylesheet. */
  var countValue = document.createElement('span');
  countValue.className = 'lsa-count-value';
  countEl.appendChild(countValue);
  root.appendChild(countEl);

  /* assets/Path.svg's four-pointed sparkle, as raw path data. 15x15 box, the
     shape centred at 7.44.

     ONE COPY, TWO CONSUMERS — the button's SVG below and the cursor's Path2D
     further down. It used to live only in the Path2D constructor, which was
     fine while nothing else drew this shape; the button now does, and a second
     transcription of 700 characters of bezier data is the kind of duplication
     that goes wrong silently and stays wrong. */
  var SPARK_PATH = 'M14.8563 14.88L9.09636 10.0498C9.09636 10.0498 8.31607 9.28792 7.44088 9.28792C6.5569 9.28792 5.77661 10.0498 5.77661 10.0498L0.0184526 14.88L0 14.8633L4.83112 9.10339C4.83112 9.10339 5.5912 8.32574 5.5912 7.44C5.5912 6.56305 4.83112 5.78452 4.83112 5.78452L0 0.0202103L0.0184526 0L5.77661 4.83552C5.77661 4.83552 6.5569 5.59911 7.44088 5.59911C8.31607 5.59911 9.09636 4.83552 9.09636 4.83552L14.8563 0L14.88 0.0254826L10.0392 5.78452C10.0392 5.78452 9.2844 6.56305 9.2844 7.44C9.2844 8.32574 10.0392 9.10339 10.0392 9.10339L14.88 14.8615L14.8563 14.88Z';

  var chargeBtn = document.createElement('button');
  chargeBtn.className = 'lsa-charge';
  chargeBtn.type = 'button';

  /* ---- The spark that is charged ----------------------------------------
     REPLACED THE PILL, and the change is not cosmetic. The old control was a
     232x52 gold capsule filling from the bottom like a glass of water; this is
     the same four-point sparkle the cursor is made of, filling from its own
     core outward. The thing being charged is now visibly the same substance as
     the thing doing the charging.

     THREE COPIES OF ONE PATH, back to front:

       halo   blurred, gradient-filled, behind everything — the light escaping
              the shape. Opacity rides the fill, so an empty spark does not
              glow at all.
       track  stroked and empty. This is what "dormant" looks like: the shape
              fully present, with no light in it yet.
       fill   the same path again, filled by a radial gradient whose stops move
              outward as it charges.

     WHY A HALO COPY AND NOT A drop-shadow. A drop-shadow applies to the whole
     silhouette, stroke included, so it hung a halo off the outline of an empty
     spark rather than glowing from the light inside it — gold at 70% smeared
     over black, which reads as a brown smudge. The halo carries only the
     gradient, so it grows with the light that is actually there. Built,
     rejected, do not rebuild it.

     WHY THE FILL IS NOT BLURRED. It was, and that is what put a dark seam
     between the light and the border: a blur softens the silhouette, so the
     fill's edge retreats inward from the stroke, and the stroke's inner half
     then sits over half-transparent fill with black showing through. Reads as
     an emboss. The soft edge you want is the growing FRONT of the light, and
     the gap between the gradient's two stops already does that.

     ids are prefixed the same as every class, since url(#...) references are
     document-global and this markup is going onto somebody else's page. */
  chargeBtn.innerHTML =
    '<svg class="lsa-spark-art" viewBox="0 0 15 15" aria-hidden="true" focusable="false">' +
      '<defs>' +
        /* INSIDE OUT. Light gathers at the core and grows outward, which is
           what a spark does. A rising waterline was tried first and it was
           liquid logic borrowed from the pill — it also read as non-linear,
           because a four-point star's mass is all at its waist and the arms
           taper to nothing.

           userSpaceOnUse so the radius is in viewBox units: centred on the
           shape's own centre with r 10.6, which is the distance from there out
           to the diagonal tips. Offset 1 is therefore exactly "the tips are
           lit", with nothing wasted past the shape.

           THE TWO STOPS ARE DELIBERATELY APART. The gap between them IS the
           soft edge, so the light has a growing front rather than a cut line. */
        '<radialGradient id="lsa-spark-grad" gradientUnits="userSpaceOnUse" ' +
                        'cx="7.44" cy="7.44" r="10.6">' +
          '<stop id="lsa-spark-core-a" offset="0" stop-color="#FFF0C0"/>' +
          '<stop id="lsa-spark-core-b" offset="0" stop-color="#F0C24B" stop-opacity="0"/>' +
        '</radialGradient>' +
        // Generous region: the default clips at 120% and would cut the bloom
        // off square.
        '<filter id="lsa-spark-halo" x="-75%" y="-75%" width="250%" height="250%">' +
          '<feGaussianBlur id="lsa-spark-halo-blur" stdDeviation="0.6"/>' +
        '</filter>' +
      '</defs>' +
      '<path class="lsa-spark-halo" fill="url(#lsa-spark-grad)" ' +
            'filter="url(#lsa-spark-halo)" d="' + SPARK_PATH + '"/>' +
      '<path class="lsa-spark-track" d="' + SPARK_PATH + '"/>' +
      '<path class="lsa-spark-fill" fill="url(#lsa-spark-grad)" d="' + SPARK_PATH + '"/>' +
    '</svg>';

  var sparkArt = chargeBtn.querySelector('.lsa-spark-art');
  var sparkCoreA = chargeBtn.querySelector('#lsa-spark-core-a');
  var sparkCoreB = chargeBtn.querySelector('#lsa-spark-core-b');
  var sparkHalo = chargeBtn.querySelector('.lsa-spark-halo');
  var sparkFillPath = chargeBtn.querySelector('.lsa-spark-fill');
  var sparkHaloBlur = chargeBtn.querySelector('#lsa-spark-halo-blur');

  /* Below the star rather than inside it. On the pill the label sat across the
     middle on mix-blend-mode: difference, inverting against the gold as it
     filled; there is no surface to invert against here. */
  var chargeLabel = document.createElement('span');
  chargeLabel.className = 'lsa-charge-label';
  chargeBtn.appendChild(chargeLabel);

  root.appendChild(chargeBtn);

  /* THE RESET BUTTON IS GONE, 2026-09-10. It was built unconditionally, so it
     shipped to production — a bare RESET control on a congratulation page.

     resetScene() itself STAYS and is still called from two places in the dev
     panel: the milestone picker and Play show. Only the button went. */

  /* The spark that replaces the cursor. Its own canvas, ABOVE everything — the
     buttons included. It is the pointer, so nothing may cover it, and sparks
     disappearing behind the charge button would be worst at the exact moment
     they matter most.

     Not a third Fireworks2. That engine is built around bursts and carries
     three viewport-sized buffers per instance; a cursor trail is a handful of
     drifting dots and wants none of that. It is also UI chrome rather than a
     firework, so it is not behaviour the lab shares and not behaviour that
     belongs in the engine. */
  var sparkCanvas = document.createElement('canvas');
  sparkCanvas.className = 'lsa-spark';
  root.appendChild(sparkCanvas);

  /* ---- The galaxy · what makes the number ignite ------------------------
     A photograph of a galaxy laid over the whole stage on color-dodge.

     IT IS NOT A MASK AND NOTHING IS CLIPPED TO THE TEXT. color-dodge cannot
     lift black at all, so the image is invisible everywhere except where
     something bright is already painted — and during the charge the only
     bright things on a black stage are the counter, the star and the cursor.
     The picture lands on them and nowhere else, for free.

     WHY IT READS AS IGNITING. Bright patches of the photograph dodge harder
     than dark ones, so a letter comes up in patches rather than evenly.
     Nothing animates that. The image is standing still and acting as a timing
     map for the brightness swapTick() is already writing.

     IT MUST BE A SIBLING, NEVER A CHILD. It has to see both the letters and
     the black underneath them; nested inside anything it could only blend with
     that one element. Appended last, and .lsa-root's isolation is what stops
     the dodge reaching the Liferay page behind the overlay.

     THREE THINGS WILL KILL THIS SILENTLY, and all three look unrelated to it:
       1. A transform, an opacity below 1, a filter or will-change on any
          element BETWEEN this image and .lsa-black. That seals the blend
          inside that wrapper and it stops reaching the black.
       2. Fading a container that holds both the text and this image. The
          browser flattens the two together first. Fade the image itself, which
          is what .lsa-root--released below does.
       3. Fading the number with `opacity` rather than `brightness`. Opacity
          fades the letter against its background AFTER it is drawn, which
          collapses the whole effect into an ordinary crossfade.

     The text must also stay WHITE. Pure white sits at the top of the dodge, so
     the image does the ignition on the way in and then gets out of the way.
     Mid-grey leaves the galaxy sitting in the letters permanently — that was
     built and rejected. */
  var galaxy = document.createElement('img');
  galaxy.className = 'lsa-galaxy';
  galaxy.alt = '';
  galaxy.src = ASSET_PATH + 'gal4.jpg';
  root.appendChild(galaxy);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'lsa-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', teardown);
  root.appendChild(closeBtn);

  var previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  document.body.appendChild(root);

  /* ---- Aiming the counter at the medal ----------------------------------
     The count-up finishes exactly on top of the number printed on the medal,
     at the same size, so the last thing the charge shows becomes the first
     thing the medallion shows. Nothing here is a chosen number: both values
     are read back out of the stylesheet's own layout.

     WHY NOT JUST HARD-CODE THE OFFSET. It is a fixed 320px medal today, and a
     fixed pixel offset would be correct today and quietly wrong the moment
     --lsa-medal-w moves or the card's copy reflows. Reading it costs two
     getBoundingClientRect calls, once.

     THE MEDAL'S OWN RECT IS NOT USED, on purpose. lsa-experience.js writes a
     tilt transform onto .lsa-medal-scene every mousemove, and a rotated
     element's rect is the box AROUND the rotation, which shrinks and grows as
     the cursor moves. offsetTop/offsetWidth are layout values and ignore
     transforms entirely, so they are stable mid-tilt.

     WHERE 0.055 COMES FROM. Centring puts an element's BOX on a point; what
     has to land there is its INK. Aleo sits its digits' ink centre 0.055em
     above the box centre. .lsa-medal-number already corrects for it in CSS, so
     its computed `top` IS the ink line; the counter has to add the same
     correction back, scaled to the size it ends at. Re-measure this if the
     typeface ever changes — see .lsa-medal-number in the stylesheet. */
  var ALEO_INK_ABOVE_CENTRE = 0.055;   // em

  /* Where the medal's number actually is on screen, in viewport pixels, at its
     INK centre. The one place that is worked out, so the counter and the
     fireworks cannot drift apart — see aimCounterAtMedal() and runSequence().

     Read fresh every call rather than cached. Both callers run at moments when
     layout is settled and neither is on the frame loop, so the two
     getBoundingClientRect calls cost nothing worth saving. */
  function medalNumberY() {
    var top = parseFloat(getComputedStyle(medalNumber).top);
    if (!isFinite(top)) return null;
    return card.getBoundingClientRect().top + medalScene.offsetTop + top;
  }

  function aimCounterAtMedal() {
    var numStyle = getComputedStyle(medalNumber);
    var baseFont = parseFloat(getComputedStyle(countEl).fontSize);

    // Resolved by the stylesheet, so the fraction is not restated here.
    var targetFont = parseFloat(numStyle.fontSize);
    var targetInkY = medalNumberY();
    if (!(targetFont > 0) || !(baseFont > 0) || targetInkY === null) return;

    var rootRect = root.getBoundingClientRect();
    var centreY = rootRect.top + rootRect.height / 2;

    /* DERIVED, NOT TUNED. scale0 is still a taste value — how small it starts —
       but the top of the ramp is now whatever makes the digits match the medal,
       so it is written rather than dialled in. */
    chargeTune.scale1 = targetFont / baseFont;

    countEl.style.setProperty(
      '--lsa-count-y',
      ((targetInkY - centreY) + ALEO_INK_ABOVE_CENTRE * targetFont).toFixed(2) + 'px'
    );
  }
  // Called further down, once chargeTune exists — `var` hoists the name but not
  // the object, so calling it here would write scale1 onto undefined.

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

    /* SETTING · grow the fireworks with the screen. ON here, off in the engine
       and so off in the lab, which is where a slider should keep meaning one
       fixed thing.

       Everything else in this config is absolute CSS pixels, so without this a
       burst is the same physical size on every display: measured at 783px
       across on a 1024x768 screen and 778px on a 2560x1440 one. That is 76% of
       the width on the small screen — running off both edges — and 30% on the
       large one, adrift in empty sky.

       `reference` is the smaller side of the canvas at which the numbers below
       mean exactly what they say. 900 puts a 1024x768 screen at 0.85 and a
       2560x1440 one at 1.6.

       IT DOES NOT SCALE EVERYTHING, deliberately. Only how far the sparkles
       travel and how big the flash is. Spark thickness and the rocket's head
       stay at their configured size on every display — a firework on a big
       monitor should be WIDER, not chunkier. See screenScale() in the engine
       for which call sites take it. */
    scaleToScreen: {
      enabled: true,
      reference: 900
    },

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

    /* ---- Burst shape ------------------------------------------------------
       The whole show's default, which is the engine's own even disc. Stated
       here rather than left to fall through for the same reason `sub` is: the
       five per-firework rows below now carry `shape.*` keys, and a reader
       comparing the two should be able to see both ends.

       Only firework 3 overrides it. The other four run exactly this. */
    shape: {
      type: 'normal',       // normal | ring | star burst | concentric
      starPoints: 5,
      starInner: 0.3,
      rings: 3,
      ringWidth: 0.04,
      ringThickness: 0.08
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
        'shape.type': 'normal',
        'shape.ringThickness': 0.08,
        'shape.starPoints': 5,
        'shape.starInner': 0.3,
        'shape.rings': 3,
        'shape.ringWidth': 0.04,
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
        'shape.type': 'normal',
        'shape.ringThickness': 0.08,
        'shape.starPoints': 5,
        'shape.starInner': 0.3,
        'shape.rings': 3,
        'shape.ringWidth': 0.04,
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
        'shape.type': 'normal',
        'shape.ringThickness': 0.08,
        'shape.starPoints': 5,
        'shape.starInner': 0.3,
        'shape.rings': 3,
        'shape.ringWidth': 0.04,
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
        'shape.type': 'normal',
        'shape.ringThickness': 0.08,
        'shape.starPoints': 5,
        'shape.starInner': 0.3,
        'shape.rings': 3,
        'shape.ringWidth': 0.04,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': false,
        'sub.count': 6,
        'sub.delay': 0.7
      },

      /* The centre firework, and now the only one that is not a plain sphere:
         a six-point STAR BURST, thrown wider and heavier than it used to be.

         It moved a long way in the session that set the shape. It was the
         fine, tight, fast-dying one; it is now the big loose one — the spread
         went 14.5 -> 18.5, the shards 0.2 -> 0.5, and it dies slower (0.035 ->
         0.029) with more spread on that (0.15 -> 0.25). A star needs the extra
         reach and the extra life or the points never get far enough out to
         read as points.

         Only `starPoints` and `starInner` do anything at this shape. The ring
         and concentric values below them are carried by the dev panel's dump,
         which writes every control it has rather than only the live ones. */
      3: {
        'count': 200,
        'explosionSize': 18.5,
        'size': 0.5,
        'sizeSpread': 0.3,
        'lifeDecay': 0.029,
        'lifeSpread': 0.25,
        'shape.type': 'star burst',
        'shape.ringThickness': 0.42,
        'shape.starPoints': 6,
        'shape.starInner': 0.45,
        'shape.rings': 6,
        'shape.ringWidth': 0.16,
        'jitterHue': 5,
        'jitterSat': 10,
        'jitterLight': 10,
        'blast.enabled': true,
        'blast.lead': 45,
        'sub.enabled': true,
        'sub.count': 6,
        'sub.delay': 0.7
      }
    },

    // Running order. `x` is a fraction of canvas width, `at` is ms from the
    // button press, and `n` is which firework this is — 1-5 left to right,
    // which is also the `fireworkSize` entry it takes its size from. Rows are
    // in launch order, not left-to-right order.
    /* Burst height. FALLBACK ONLY since 2026-09-07 — a fraction of canvas
       height, used if the medal's number cannot be located. runSequence() now
       bursts on the number itself; see burstY().

       Its history is worth keeping, because it is the same idea one step
       coarser. 0.38 became 0.5 on 2026-09-01 to put the bursts at the vertical
       middle, which is roughly where the medallion sits, so the fireworks break
       over the card while it is still behind the black veil and the medal is
       revealed in the spot they just lit up. Aiming at the NUMBER rather than
       at the middle is that intent made exact: the number is ~66px above centre
       at any viewport height, which no fixed fraction can express.

       Side effect of aiming higher: the rocket climbs further, so the first
       burst arrives LATER — about 8% more ascent, ~0.19s on a 2.4s climb.
       cutGalaxyShort() already covers the galaxy fade for this. */
    goHeight: 0.5,

    /* INSIDE-OUT since 2026-09-01. The centre goes first and the show spreads
       to the edges, so it reads as erupting from the middle of the stage —
       where the button the user pressed is. It used to run outside-in.

       Only the `at` values moved. Colour and size stay attached to the
       firework number, so 3 is still the mix and still the biggest. Two
       consequences of that, both deliberate and both worth a look: the show now
       OPENS on its largest, most distinctive firework — 3 is the only shaped
       one, a star burst — and closes on four plain red spheres. */
    goSequence: [
      { x: 0.50, at: 0,    color: 'mix',  n: 3 },
      { x: 0.30, at: 500,  color: 'gold', n: 2 },
      { x: 0.70, at: 500,  color: 'gold', n: 4 },
      { x: 0.10, at: 1000, color: 'red',  n: 1 },
      { x: 0.90, at: 1000, color: 'red',  n: 5 }
    ],

    /* ---- Background fireworks · WHEN ------------------------------------
       The scheduling half: how often one goes off and where it is allowed to
       go off. Read live, so changing any of it mid-run changes the next gap
       rather than waiting for a replay.

       They start the moment the reveal finishes and run until teardown. There
       is no end condition on purpose — the card is out by then and this is
       what the stage settles into. */
    ambient: {
      enabled: true,
      every: 1.4,           // s · mean gap between bursts
      vary: 0.6,            // +/- fraction of it, so the rhythm is not a metronome
      top: 0.12,            // burst band, as fractions of canvas height:
      bottom: 0.55,         //   never right at the ceiling, never down at the GO button
      margin: 0.08          // keep bursts this fraction of the width in from either edge
    },

    /* ---- Background fireworks · LOOK ------------------------------------
       The ambient canvas runs a SECOND Fireworks2 instance, and this is that
       instance's entire config — the same schema as the top of this object,
       not a subset of it. The two engines share nothing: no buffers, no pool,
       no settings. Tuning one cannot disturb the other.

       ** THESE ARE PLACEHOLDERS. ** They are a plain, slightly smaller version
       of the main show, chosen only so the feature has something to draw until
       the real numbers arrive. Replace the whole object.

       `background: null` for the same reason the main config has it: the
       composite must clear to transparent or it paints over the page.

       Remember what these are seen through. The blue veil blurs this canvas by
       8px and sits over it at 60% opacity, so everything here lands softer and
       dimmer than the same numbers do on the main canvas. */
    ambientLook: {
      background: null,

      /* `palette` IS READ BY NOTHING. It is here because Copy config dumps the
         filled config, defaults included, and this came back in that dump —
         not because it does anything. Every ambient burst is handed an explicit
         one-entry `hues` spec (see ambientTick()) and a spec always beats the
         palette, which is also why the panel has no colour-set control for
         these. Changing it will appear to do nothing, correctly. */
      palette: 'fire',

      scale: 3,             // yours, not a placeholder

      // Same as the show in front, and for the same reason — these have the
      // identical problem, just further back. Its own copy because this is a
      // separate engine instance with a separate config.
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

      /* All three at zero, which is what makes the colour STATIC: every sparkle
         in a burst comes out at exactly the rolled hue, at BASE_SAT 90 and
         BASE_LIGHT 62, with no spread around any of the three. Raise jitterHue
         to loosen the burst back into a band of neighbouring colours. */
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

      /* The tail of the Copy config dump: engine defaults that came back
         filled in. None of them is doing anything today, and all four are kept
         so that re-dumping this object produces the same text rather than a
         diff nobody made.

         `shape`   the background bursts are plain spheres. Nothing aims a
                   shape at them — that was scoped to firework 3 — but the key
                   exists on every engine config, so it serialises.
         `rocket`  DEAD for this canvas. ambientTick() calls burst(), never
                   launch(), so no rocket is ever built here and none of these
                   three is read.
         `sub`     off, same as the show in front.
         `deltaCap` DEAD for this canvas too: the rAF loop clamps its delta
                   once, against the MAIN cfg, and hands the same dt to both
                   engines. This instance never reads its own. */
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

  /* ---- Background fireworks · the second engine -------------------------
     A separate Fireworks2 on a separate canvas, because the engine draws to
     the one canvas it is handed and these have to land at a different depth in
     the stack. There is no way to split one instance across two z-indexes.

     What it costs: a second set of buffers — particle, trail and glow — sized
     to the viewport, plus a second pool. That is the price of the layer, and
     it is why ambientLook's poolMax is set well under the main show's.

     The same reassignment trick as above, and load-bearing for the same
     reason: the constructor deep-copies what it is handed, so the literal is
     not the object the engine reads. Pointing cfg.ambientLook at the engine's
     own copy does two jobs at once — the panel's controls reach the running
     canvas, AND Copy config dumps the live values, because ambientLook is a
     property of `cfg` like any other. Without it a tuning session on these
     would vanish on reload with nothing to show it had happened. */
  var amb = Fireworks2(ambCanvas, cfg.ambientLook);
  cfg.ambientLook = amb.cfg;

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

    /* Read inside spawnSparkles(), the same instant `count` and
       `explosionSize` are read, so the shape is aimable exactly like they are
       and rides the same spec they do.

       The panel is schema-driven and the tabs share one table, so these rows
       exist on all five tabs and every row defaults to `normal`. That default
       is the engine's original even disc, so the other four fireworks are
       unchanged until somebody deliberately changes them. Firework 3 is the
       one this was wanted for; which shape it gets is yours to pick, and no
       shape has been chosen here.

       The four geometry knobs below each belong to ONE shape and do nothing on
       the others. Engine 1 hid the irrelevant ones with a `showFor` mechanism
       that was dropped in the port, so they are simply always visible. */
    { head: 'Shape' },
    { path: 'shape.type', label: 'Burst shape',
      options: ['normal', 'ring', 'star burst', 'concentric'] },
    { path: 'shape.ringThickness', label: 'Hoop depth · ring', min: 0.01, max: 1, step: 0.01 },
    { path: 'shape.starPoints', label: 'Points · star burst', min: 3, max: 12, step: 1 },
    { path: 'shape.starInner', label: 'Waist · star burst', min: 0.05, max: 0.95, step: 0.05 },
    { path: 'shape.rings', label: 'Bands · concentric', min: 2, max: 8, step: 1 },
    { path: 'shape.ringWidth', label: 'Band spread · concentric', min: 0, max: 0.3, step: 0.01 },

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

    /* Read at the SECOND break, when a shell particle dies a fuse later — so
       they belong to the show, not to a firework.

       These are the one thing the spec does not reach. A spec travels as far
       as spawnSparkles(); the second break happens later still, inside the
       particle loop, and by then the only thing left of the parent is the
       shell itself. Making these per-firework means carrying the settings ON
       the shell — a `p.subSettings` alongside `p.subScale`, cleared in spawn()
       like every other pooled field — and applying them in spawnSub(). It is a
       change to the engine, not something the panel can reach. */
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

  /* The background fireworks — the ones behind the blue veil, which start when
     the reveal finishes. Appended after SHOW_SETTINGS, so they sit at the
     bottom of the panel under their own heading, and they are visible on every
     tab: none of this belongs to one of the five fireworks.

     TWO KINDS IN ONE TABLE, and the split matters:

       'global'   the SCHEDULE — when and where. These live on cfg.ambient,
                  which is show-owned, exactly like goSequence.
       'ambient'  the LOOK. These live on the second engine's own config, and
                  the identical key on the main cfg is a different value on a
                  different canvas. Changing 'How many' here cannot touch the
                  show in front.

     Both halves are carried by Copy config: the first because it is on `cfg`,
     the second because cfg.ambientLook points at the live engine object. */
  var AMBIENT_SETTINGS = [
    { head: 'Background fireworks' },
    { note: 'Behind the blue veil, so they are blurred and dimmed by it. ' +
            'They begin when the reveal finishes and run until the overlay ' +
            'closes. RESET silences them.' },

    { kind: 'global', path: 'ambient.enabled', label: 'On', bool: true },
    { kind: 'global', path: 'ambient.every', label: 'One every (s)', min: 0.2, max: 6, step: 0.1 },
    { kind: 'global', path: 'ambient.vary', label: 'Timing variety', min: 0, max: 1, step: 0.05 },
    { kind: 'global', path: 'ambient.top', label: 'Highest they go', min: 0, max: 1, step: 0.01 },
    { kind: 'global', path: 'ambient.bottom', label: 'Lowest they go', min: 0, max: 1, step: 0.01 },
    { kind: 'global', path: 'ambient.margin', label: 'Clear of the edges', min: 0, max: 0.4, step: 0.01 },

    { head: 'Background fireworks · look' },
    { note: 'A second engine with its own config. Nothing here reaches the ' +
            'five fireworks in front. Each burst takes one flat colour rolled ' +
            'from the whole hue wheel, so there is no colour set to choose.' },

    { kind: 'ambient', path: 'scale', label: 'Size', min: 0.3, max: 5, step: 0.05 },
    { kind: 'ambient', path: 'count', label: 'How many', min: 20, max: 600, step: 10 },
    { kind: 'ambient', path: 'explosionSize', label: 'How far they fly', min: 1, max: 30, step: 0.5 },
    { kind: 'ambient', path: 'size', label: 'Sparkle thickness', min: 0.2, max: 6, step: 0.1 },
    { kind: 'ambient', path: 'lifeDecay', label: 'How fast they die', min: 0.002, max: 0.05, step: 0.001 },
    { kind: 'ambient', path: 'trailAlpha', label: 'Trail strength', min: 0, max: 1, step: 0.05 },
    { kind: 'ambient', path: 'glowAlpha', label: 'Glow strength', min: 0, max: 2, step: 0.05 },
    { kind: 'ambient', path: 'blast.enabled', label: 'Flash at the break', bool: true },
    { kind: 'ambient', path: 'blast.radius', label: 'Flash size', min: 20, max: 400, step: 10 },
    { kind: 'ambient', path: 'blast.peak', label: 'How bright', min: 0, max: 3, step: 0.05 },
    { kind: 'ambient', path: 'blast.stack', label: 'Draw it on itself (x)', min: 1, max: 10, step: 1 }
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

  /* ---- The GO sequence --------------------------------------------------
     Five fireworks in three waves. Runs on the rAF clock like everything
     else, not setTimeout, so it stays in step with the sim and pauses with a
     backgrounded tab instead of playing out unseen. */

  var scheduled = [];

  /* The card is revealed in steps, one per BURST MOMENT — by clearing a third
     of the black veil above it each time. The card itself never moves; see
     .lsa-black in the stylesheet for why only one of the two may fade.

     There are three moments, not five. goSequence launches 1+5 together, then
     2+4 together, then 3 alone, and every rocket rises the same height — so
     each pair breaks on the same frame and the five fireworks produce three
     distinct instants.

     DRIVEN BY THE ENGINE, NOT BY A CLOCK. fw.onBurst fires the moment a rocket
     actually turns over. This used to be solved arithmetically instead — the
     apex was predicted and the veil stepped when the clock passed it — and
     that prediction ran 50-67ms early by an amount that changed with the
     viewport height. It was the same broken guess the per-firework settings
     were built on; see withSettings() in the engine.

     TWO ROCKETS ON ONE FRAME MUST STILL ONLY COUNT ONCE, or fireworks 1+5
     would eat two of the three steps between them and the veil would be gone
     before firework 3 ever broke. `revealStepped` is cleared at the top of
     every frame and set by the first burst in it, which makes "the same
     moment" mean exactly "the same frame" — no epsilon, nothing to tune, and
     it stays correct if the sequence is ever restaggered.

     ONE-WAY within a run: a second GO does not restore the veil and replay the
     reveal, so once the card is out it stays out. RESET is the only thing that
     puts it back — see resetScene(). */
  var REVEAL_STEPS = ['lsa-black--r1', 'lsa-black--r2', 'lsa-black--r3'];
  var revealed = 0;       // how many steps have been applied so far
  var revealStepped = false;   // has this frame already advanced the veil?

  function advanceReveal() {
    if (revealed >= REVEAL_STEPS.length) return;
    black.classList.add(REVEAL_STEPS[revealed]);
    revealed++;
  }

  /* Every rocket reports here, including one sent up by clicking the stage —
     the engine cannot tell those apart and should not have to. `spec.n` is the
     tag runSequence() puts on the five that belong to the show; anything
     without it is a click and must not move the veil. */
  fw.onBurst = function (x, y, spec) {
    if (!spec || !spec.n) return;

    if (revealStepped) return;
    revealStepped = true;

    /* The button and counter clear on the FIRST burst, not at the release.
       They have done their job by then, but the two and a half seconds while
       the rocket is climbing are dead air otherwise — leaving them up gives the
       eye something to hold while nothing else is happening, and taking them
       away on the same beat the veil first lifts hands the stage over in one
       movement instead of two.

       `revealed` is still 0 only on the first burst of a run, which makes it
       the test without needing a flag of its own. */
    if (revealed === 0) {
      root.classList.add('lsa-root--fired');
      cutGalaxyShort();
    }

    advanceReveal();
  };

  /* THE GALAXY MAY NEVER OUTLIVE THE FIRST BURST, whatever the slider says.

     This is the one rule the old 0.5s fade enforced for free by being far
     shorter than the climb. Now that the fade is tunable up to 4s and the
     climb is only ~2.4s — and drifts with window height, measured 2.52s at
     1440x900 against 2.33s at 1024x768 — it has to be enforced properly.
     color-dodge on a live burst blows the burst out, and then the medallion
     coming up behind it.

     WHY IT IS NOT JUST A SHORTER DURATION. Changing transition-duration on a
     transition that is already running does nothing: the browser committed to
     the original timing when the transition started. The value has to move for
     a new one to begin. So this freezes the opacity where it actually is,
     forces the style to take, then transitions from there.

     A CUT WOULD BE WORSE THAN THE PROBLEM at a long setting — the image could
     still be at half strength when the shell breaks, and dropping that in one
     frame is a visible flinch on the brightest moment of the show. A quarter
     second is short enough to be gone before the dodge matters and long enough
     not to read as a glitch.

     Costs one forced reflow, once per run, on a frame where the engine has
     just done far more work than this. */
  function cutGalaxyShort() {
    var now = getComputedStyle(galaxy).opacity;
    if (parseFloat(now) === 0) return;   // already gone; nothing to interrupt

    galaxy.style.transition = 'none';
    galaxy.style.opacity = now;
    void galaxy.offsetWidth;             // flush, or the freeze never lands
    galaxy.style.transition = 'opacity 0.25s linear';
    galaxy.style.opacity = '0';
  }

  /* THE BURSTS LAND ON THE MEDAL'S NUMBER, since 2026-09-07.

     Read at press time, not cached, so it is correct at whatever size the
     window is by then. That also makes it the reason nothing here needs a
     resize listener.

     A FRACTION OF THE HEIGHT CANNOT EXPRESS THIS, which is why cfg.goHeight
     stopped being the answer. The number sits a FIXED ~66px above the viewport
     centre — the card is centred and the medal's offset inside it is layout,
     not viewport — so the fraction that hits it is 0.418 at 800px tall and
     0.439 at 1080. Any single number is wrong on most screens.

     Falls back to cfg.goHeight if the number cannot be measured, so a future
     change that removes or hides .lsa-medal-number degrades to the old
     behaviour instead of bursting at y = NaN, which silently drops every
     rocket. */
  function burstY() {
    var y = medalNumberY();
    return (y === null || !isFinite(y)) ? canvas.clientHeight * cfg.goHeight : y;
  }

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
        /* One spec per burst. It carries everything that makes this firework
           itself: its colour set, its size, its number, and — the new part —
           its whole settings row.

           `settings` is the LIVE row, by reference, not a copy. That is the
           same choice `scale` already makes by reading fireworkSize here at
           press time: a value changed in the dev panel reaches the next run
           with no reload. withSettings() only reads the object, never writes
           to it, so handing over the original is safe.

           This is what fixes the per-firework settings. The row now travels
           with the firework and is applied by the engine at the exact moments
           it is read, instead of being swapped into a shared config during a
           window guessed from arithmetic. See withSettings() in the engine for
           why the guess could not be made to work.

           `n` is for the overlay's own use — it tags this rocket as part of
           the GO sequence so the reveal can ignore stray canvas clicks, which
           report through the same hook. The engine never looks at it. */
        spec: {
          hues: c.hues,
          white: c.white,
          scale: cfg.fireworkSize[row.n],
          n: row.n,
          settings: cfg.fireworkCfg[row.n]
        }
      });
    });

  }

  /* GONE FROM HERE, 2026-09-01: buildBreaks(), breakDuring(), applyLook(),
     restoreLook(), warnOnOverlap(), looksDiffer(), BREAK_PAD_IN/OUT, `breaks`,
     `breaksEnd` and `runClock`. All of it existed to answer one question —
     WHEN does each firework break — so that its settings could be swapped into
     the shared config for exactly that moment.

     It answered the question by arithmetic: apex solves as sqrt(2*rise/g), so
     the break time is the launch time plus that. The trouble is the engine does
     not burst at the analytic apex. It bursts on the first frame where the
     rocket's velocity has turned over, which measured 50-67ms LATER — and the
     window's trailing pad was 20ms. So the settings were only sometimes live,
     and because `rise` is a fraction of canvas height, WHICH WAY IT FELL
     DEPENDED ON THE VIEWPORT. At 1024x768 all five fireworks silently ran the
     whole-show config: sparks 3x too thick and firework 3 with no star shape.

     Nothing predicts anything now. A firework's settings ride on its own spec
     and the engine applies them at the two moments it reads them (see
     withSettings there); the veil steps on fw.onBurst, which fires from the
     same line that does the bursting. There is no clock left to drift.

     Worth knowing if the show ever grows: the one-firework-at-a-time limit went
     with it. Settings travel with the firework instead of through a shared
     window, so any number of fireworks can break on the same frame with
     completely different settings. warnOnOverlap() policed exactly that limit
     and has nothing left to warn about. */

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

  /* Clicking the stage used to launch a rocket that burst where you clicked.
     Removed 2026-09-21 at the client's request — the charge button is the only
     way to set anything off now. `fw.launch()` itself stays: the sequence uses
     it, and __lsaDev exposes it for tuning.

     A click on the medal used to flip the coin instead. That came out earlier
     the same day; see lab/medal-flip.reference.md. */

  // Kept as the one entry point that starts the show, so the charge button
  // below and the dev hook both go through the same door. Guarded so a second
  // trigger cannot interleave a fresh run with waves already in flight.
  function onGo() {
    if (scheduled.length) return;
    runSequence();
  }

  /* ---- The charge ------------------------------------------------------
     Hold the cursor on the button and it fills; take it away and it drains.
     The show starts when it reaches the top.

     THE HOLD IS SPREAD EVENLY FROM 4s TO 10s, since 2026-09-30. 5 years is
     4s, 50 is 10s, and every milestone between adds the same ~0.67s. Numbers
     past 50 stop at 10s. The time for one number is that hold divided by how
     many numbers the counter walks, so the gap is NOT the same at every
     milestone any more:

          5y    5 steps ->  4.0s charge, 800ms a number
         10y   10 steps ->  4.7s charge, 467ms a number
         50y   18 steps -> 10.0s charge, 556ms a number

     It replaced a flat 800ms a number, which made 50 years a 14.4s hold. */
  /* TUNED BY EYE on 2026-09-04 in lab/charge-test.html. These are not defaults
     anybody guessed at — every one of them was dialled in against the real
     effect on a real screen, which is more than can be said for most of the
     numbers in this file. Do not "clean them up" to rounder values. */
  var chargeTune = {
    minS: 4,       // the hold at 5 years, in seconds
    maxS: 10,      // the hold at 50 years, in seconds

    /* How big the number is, as a multiple of the stylesheet's 88px.

       THE TWO ENDS ARE NO LONGER THE SAME KIND OF NUMBER, since 2026-09-07.
       scale0 is taste — how small the first number arrives. scale1 is NOT: it
       is overwritten by aimCounterAtMedal() with whatever makes the finished
       counter exactly the size of the number on the medal. The 1.04 below is a
       placeholder so this object still reads sensibly on its own; editing it
       does nothing. Change the size by changing the medal.

       0.30, not the 0.55 it ran at until the medal match went in. The old value
       started the counter at 48px against a 105px finish, which is barely a
       climb; the number now arrives at 26px and grows 3.5x into the medal's
       own digit. */
    scale0: 0.30,  // at empty  — 26px
    scale1: 1.04,  // at full   — DERIVED, see aimCounterAtMedal()

    // The star. Sizes are a multiple of the 140px box it sits in, so the art
    // runs 91px at rest to 231px at full — deliberately overflowing its own
    // box, which is why .lsa-charge must not clip.
    spark0: 0.65,  // at empty
    spark1: 1.65,  // at full
    glow: 1,       // how strong the bloom behind it gets, at full
    glowBlur: 0.6, // bloom radius, in viewBox units
    hot: 0.5,      // extra brightness on the fill itself, at full

    // The number swap. See swapTick() below for what each one does.
    /* em at the peak. em, so it scales with the font size.

       0.1, NOT THE 0.34 IT WAS UNTIL 2026-09-05. A CAP, NOT A TASTE: 0.34em on
       an 88px digit is ~30px of blur and a bold stroke is only ~11px wide, so
       the strokes bled into each other and averaged out. The number stopped
       being a soft number and became a round grey cloud the size of its own
       box. Checked with .lsa-galaxy hidden, so the dodge is not what made it a
       disc — it only made the disc glow. Keep this under about 0.12 or the
       letterform does not survive. Slider is in the dev panel. */
    blur:  0.1,
    maxMs: 250,    // longest a single swap may take
    frac:  0.85,   // of one step's interval, so it adapts to the milestone
    floor: 0.45,   // brightness at the peak, as a fraction
    peak:  0.65,   // where in the swap the text actually changes
    power: 1,      // curve shape. >1 holds sharp longer, then blurs hard.

    /* ---- The release beat. Both of these have controls in the dev panel.

       pop: the box-shadow flash at a full charge. OFF BY DEFAULT, because
       under the galaxy it produces the exact opposite of what it looks like it
       should.

       An outer box-shadow is never painted INSIDE the element's border box —
       that is ordinary CSS, and it is fine on an opaque control because the
       control covers the gap. This button is transparent. So the flash lays a
       gold ring strictly outside the 140px circle, color-dodge amplifies that
       ring into bright nebula, and the unlit inside stays pure black. What you
       see is a hard-edged BLACK DISC the size of the button, with a bright
       halo around it — a hole in the middle of the flash, not a blob of light.
       Diagnosed 2026-09-05 by screenshotting with the shadow removed; it is
       invisible to every form of inspection short of looking, because nothing
       here is painting anything dark.

       It was already the wrong shape for this control — a round shadow on a
       star, the same mismatch that got the proximity glow removed on 09-04 —
       and this is the second thing that mismatch has now cost. A replacement
       flash has to come from the star's own silhouette. See the halo.

       galaxyFade: how long the galaxy takes to leave, in seconds, read ONCE at
       the release and written to a CSS variable. 0.5 was the original: gone
       almost immediately, which makes the charge end in a hard cut. Measured
       2026-09-04, the release-to-first-burst window is 2.52s at 1440x900 and
       2.33s at 1024x768, so anything up to about 2.3 fades across the whole
       rocket ascent and is still gone before a shell breaks. Past that the
       hard stop in fw.onBurst is what protects the bursts. */
    pop: false,
    galaxyFade: 2.3
  };

  /* scale1 above is a placeholder. This overwrites it with the size that makes
     the finished counter match the medal, and sets where the counter sits. It
     runs here rather than at the mount because it writes into chargeTune. */
  aimCounterAtMedal();

  /* Read per frame rather than cached in a constant, so moving the slider
     mid-charge takes effect immediately instead of finishing at the old rate. */
  function chargeSeconds() {
    var t = Math.min(1, Math.max(0, (YEARS - 5) / 45));
    return chargeTune.minS + (chargeTune.maxS - chargeTune.minS) * t;
  }

  // How long one number is on screen. Varies by milestone; see above.
  function stepSeconds() {
    return chargeSeconds() / steps.length;
  }

  /* Draining is SLOWER than charging, so a moment's wobble off the button
     costs a little progress rather than all of it.

     A RATIO, NOT A CONSTANT, and that is the point. It used to be a flat 6s,
     which happened to be twice the flat 3s charge. Now that the charge
     stretches with the milestone, a flat 6 would quietly collapse to 1:1 at 50
     years — making the LONGEST hold also the least forgiving one, which is
     backwards. Deriving it keeps every milestone equally tolerant of a wobble. */
  var DRAIN_RATIO = 2;

  /* GONE: CHARGE_SWELL, which grew the whole button 6% as it filled.

     Two reasons, and the second is the real one. It said the same thing the
     star's own 0.65 -> 1.65 growth says, 25 times more quietly. And it grew
     THE HIT TARGET — the circle the cursor has to stay inside — under a hand
     being held deliberately still, for up to 14 seconds at 50 years. A target
     that moves mid-gesture is a bug wearing a feature's clothes.

     The rule that replaced it: the ART grows, the TARGET never does. See
     drawCharge(), which scales the <svg> and leaves .lsa-charge alone. */

  /* How soft the growing edge of the light is, as a fraction of the gradient's
     radius. This IS the blur: the fill's leading stop and its trailing opaque
     stop sit this far apart, so the front is a gradient rather than a line.
     Too small and it snaps back to a hard ring; too large and the spark never
     looks properly lit, because the fade eats the whole shape. */
  var SOFT_BAND = 0.18;

  /* The beat between the button filling and the show starting. Short, and it
     is doing real work: without it the flare, the release and the first rocket
     all land on the same frame and read as one indistinct event. A quarter of
     a second of nothing is what separates "it filled up" from "and now it
     fires", and it is the pause that makes the second one feel caused by the
     first rather than simultaneous with it. */
  var RELEASE_PAUSE = 0.25;

  /* How far away the button starts noticing the spark, in px. This is the
     "pull" half of making a hover interaction discoverable: holding a cursor
     still is not a gesture anybody tries unprompted, so the button has to
     answer the pointer BEFORE it arrives. Reacting from a distance is what
     tells you it is reactive at all — by the time you are on top of it, you
     have already had to guess.

     Generous on purpose. Too tight and it only lights up once the cursor is
     effectively there, which is too late to have invited anything. */
  var NEAR_RADIUS = 260;

  /* ---- The step list ----------------------------------------------------
     THE COUNTER NO LONGER SHOWS EVERY NUMBER. It shows every number up to 10,
     then every FIVE, and always lands exactly on the milestone.

     A number needs roughly 200ms on screen to be read at all. Showing all 50
     readably is therefore a 10-second hold, and 6s had already been rejected
     as too long — so the lever that had to move was how MANY numbers there
     are, not how long the hold is.

         5    1 2 3 4 5                       5 steps
         25   1..10, 15, 20, 25              13 steps
         50   1..10, 15, 20 ... 45, 50       18 steps

     FIVES, NOT TENS. Every real milestone is a multiple of five, so stepping
     by five lands on all ten of them cleanly. Stepping by ten was built first
     and rejected: it made the odd milestones stutter at the end (... 20, 30,
     35) — the rhythm changed halfway through for no reason a viewer could see.

     It also keeps a big milestone feeling big, which a fixed 3-second charge
     had quietly removed: 18 steps against 5 is the whole difference between
     them now.

     Works for any positive number, not only multiples of five, because
     `data-years` accepts any — a seven-year award counts 1..7. The final push
     is what guarantees the last number is the milestone itself. */
  function stepsFor(y) {
    var out = [];
    for (var n = 1; n <= 10 && n <= y; n++) out.push(n);
    for (var m = 15; m <= y; m += 5) out.push(m);
    if (out[out.length - 1] !== y) out.push(y);
    return out;
  }

  /* On Liferay this is computed once and never moves: YEARS is read from the
     mount's data-years at build and nothing shipped can change it.

     The dev panel breaks that on purpose, so the whole ladder from 5 to 50 can
     be watched without editing the file and reloading. Hence a `var` that is
     reassigned rather than a constant. */
  var steps = stepsFor(YEARS);

  /* DEV ONLY — reached from the panel's milestone picker and from nowhere
     else. A milestone owns exactly two things on screen: how many numbers the
     counter walks, and the sentence on the card.

     It deliberately does NOT reset the scene. The caller does, after this has
     run, because a reset that fired first would put the old milestone's blank
     counter back and then change the step list underneath it. */
  function setYears(y) {
    YEARS = y;
    steps = stepsFor(YEARS);
    cardText.textContent = cardLine();
    // The medal's number is DOM text now, so a milestone actually reaches the
    // artwork. It used to be baked into the PNG, and a 20-year award showed 5.
    medalNumber.textContent = String(YEARS);
    drawDiamonds();
    // A longer sentence can reflow the card and move the medal, so the counter
    // has to be re-aimed at it. Dev-only in practice — YEARS cannot move on
    // Liferay — but the aim would be silently stale otherwise.
    aimCounterAtMedal();
  }

  var charge = 0;         // 0..1
  var charging = false;   // is the cursor on the button right now
  var charged = false;    // has it reached the top and fired the show

  /* ---- The number swap --------------------------------------------------
     The old number blurs out, the new one blurs in.

     ONE ELEMENT, ONE CURVE. Not an out animation followed by an in animation —
     a single arc. Blur and brightness rise to a peak, the text is swapped AT
     that peak while it cannot be read, then both come back down. Half the
     timing to get right, and the swap itself can never be seen.

     DRIVEN FROM THE FRAME LOOP, NOT A CSS TRANSITION. The loop writes `filter`
     on the number every frame, and a transition on that property would be a
     second writer easing toward values that have already moved on. One writer
     per property is the rule that keeps these effects from fighting.

     THE DURATION ADAPTS TO THE MILESTONE, or would if maxMs let it. It takes
     `frac` of one step's interval so a shorter step gives a shorter swap, then
     caps at `maxMs`. Steps run 467ms to 800ms now (see chargeSeconds), and
     85% of even the shortest is 397ms, so the 250ms cap binds at every
     milestone and the number always sits still for a while between swaps.

     shownCount starts at -1 so the first frame always writes. It matters more
     than it looks: the loop runs 60 times a second and the number only changes
     5 to 18 times in a whole charge, so without this guard the animation would
     restart every frame and never play one to the end. */
  var shownCount = -1;    // the last number actually written to the DOM
  var swapT = -1;         // seconds into the current swap, -1 when idle
  var swapTo = null;      // the text waiting to be written at the peak
  var swapDur = chargeTune.maxMs / 1000;

  // Last stdDeviation written to the halo's blur, so drawCharge() can skip the
  // attribute write on the ~99.99% of frames where it has not moved.
  var haloBlurNow = -1;

  function swapTick(dt) {
    if (swapT < 0) return;

    swapT += dt;
    var p = swapT / swapDur;

    if (p >= 1) {
      // Guard for a frame longer than the whole swap, which would otherwise
      // skip the write at the peak below and strand the old number on screen.
      if (swapTo !== null) { countValue.textContent = swapTo; swapTo = null; }
      countValue.style.filter = '';
      swapT = -1;
      return;
    }

    /* 0 at both ends, 1 at the swap point. TWO HALF-CURVES rather than one
       sine, which is what lets the peak sit off centre: at 0.65 the number
       blurs out slowly and snaps back in, and that is a different feel from
       the symmetric version even at the same duration. */
    var pk = chargeTune.peak;
    var t = (p < pk) ? (p / pk) : ((1 - p) / (1 - pk));
    var k = Math.pow(Math.sin(t * Math.PI / 2), chargeTune.power);

    if (p >= pk && swapTo !== null) {
      countValue.textContent = swapTo;
      swapTo = null;
    }

    /* BRIGHTNESS, NOT OPACITY, and the two are not interchangeable here.
       Opacity fades the letter against what is behind it AFTER it is drawn,
       which flattens the whole thing into an ordinary crossfade. Brightness
       changes how much light the letter is emitting BEFORE the galaxy blends
       with it, and that is what makes the reveal ignite unevenly rather than
       simply appear. `floor` keeps it off zero so the galaxy never loses the
       letter entirely mid-swap.

       BLUR FIRST, THEN BRIGHTNESS. A blurred letter spreads its light over
       more pixels so it reads dimmer, which turns the dodge down; as the blur
       tightens the light concentrates again and the galaxy amplifies it. The
       two feed each other in this order and not the other one. */
    countValue.style.filter =
      'blur(' + (k * chargeTune.blur).toFixed(3) + 'em) ' +
      'brightness(' + ((1 - k * (1 - chargeTune.floor)) * 100).toFixed(1) + '%)';
  }

  function onChargeEnter() { charging = true; }
  function onChargeLeave() { charging = false; }
  chargeBtn.addEventListener('mouseenter', onChargeEnter);
  chargeBtn.addEventListener('mouseleave', onChargeLeave);

  /* Stepped from frame(), on the same rAF clock as everything else rather than
     on its own timer — so it stays in step with the sim, and a backgrounded tab
     pauses the charge instead of quietly completing it while nobody is
     watching. */
  function chargeTick(dt) {
    if (charged) return;

    var secs = chargeSeconds();
    charge += charging ? (dt / secs) : -(dt / (secs * DRAIN_RATIO));
    if (charge < 0) charge = 0;

    if (charge >= 1) {
      charge = 1;
      charged = true;
      charging = false;
      // The show does NOT start here any more — the button flares, then holds
      // for RELEASE_PAUSE, and releaseSparks() below is what fires it.
      releaseIn = RELEASE_PAUSE;
      /* The snap: a single flash of white, a one-shot keyframe.

         IT IS A FLASH AND NOT A JUMP ANY MORE. The keyframe used to overshoot
         the button's scale as well, back when the button grew 6% over the
         whole hold and a 13% pop was therefore a visible event. The star grows
         154% now, so another 13% at the end is invisible — the light is the
         only part of that beat anyone can actually see, so the light is all
         that is left of it.

         Nothing in the loop competes for it: this writes box-shadow, and
         drawCharge() below never touches that property.

         ON A SWITCH NOW. See chargeTune.pop for why — with the galaxy still up
         this flash is the thing dodging hardest on the stage, so it has to be
         removable while the fade is judged. */
      if (chargeTune.pop) chargeBtn.classList.add('lsa-charge--pop');

      /* THE GALAXY LEAVES HERE, at the release — not at the first burst.

         It has to be gone BEFORE a rocket breaks. color-dodge brightens
         whatever is already bright, and from the first burst onward the
         fireworks are by far the brightest thing on the stage; leaving the
         image up would blow them out, and then the medallion behind them.

         The release is the right hook because it buys the whole ascent. The
         fade takes 0.5s and the first rocket does not break for roughly two
         seconds after this, so the image is long gone by the time it matters —
         and it leaves during the pause, while nothing else is moving and
         nobody is looking at the middle of the screen.

         Fading the IMAGE, not a wrapper around it. See the note where it is
         built for why that distinction is the whole effect.

         THE DURATION IS READ HERE, ONCE, and not every frame. It only has to
         be right at the instant the transition starts, and writing a custom
         property on every one of the ~14 seconds' worth of frames before that
         would be pure waste. Set on .lsa-charge's parent rather than on the
         image, because the image is the one element that must not pick up
         anything that could seal the blend. */
      root.style.setProperty('--lsa-galaxy-fade',
                             chargeTune.galaxyFade.toFixed(2) + 's');
      root.classList.add('lsa-root--released');
    }

    drawCharge();
  }

  /* THE COUNTER IS DERIVED FROM THE FILL, never from elapsed time. That is what
     makes it honest: it climbs as the button fills and counts back DOWN as it
     drains, so the number always says what the button looks like. A timer would
     keep climbing through a drain and the two would disagree. */
  function drawCharge() {
    /* THE NUMBER IS DERIVED FROM THE FILL, not from elapsed time, and the step
       list does not change that — it only quantises it. The two still agree,
       so a drain walks the steps BACKWARDS down to nothing rather than
       freezing on the last one it reached.

       ceil, not floor. Each step gets an equal slice of the fill and the last
       slice ends exactly at 1, which is what puts the milestone itself on the
       final frame of a full charge. With floor, fill 0 would already be
       reading step 1 and the counter could never be empty.

       AN EMPTY SPARK SHOWS NO NUMBER AT ALL. A zero is a value — it says the
       counter is running and has counted nothing — and at 88px in the middle
       of a black screen it would be the first thing anyone sees and the
       loudest thing on the stage, which is not what an untouched overlay
       should be saying. idx < 0 is that state, and a full drain returns to it. */
    var idx = Math.ceil(charge * steps.length) - 1;
    if (idx > steps.length - 1) idx = steps.length - 1;
    var count = idx < 0 ? 0 : steps[idx];

    /* THE ONE PLACE THE NUMBER IS WRITTEN, so the blur fires on a real step
       change and on nothing else. Works in both directions: a drain walks the
       steps back down and every one of those is a change too — including the
       last one, back to nothing, which blurs the number away rather than
       cutting it.

       The text, not the number, because 0 is drawn as blank. */
    if (count !== shownCount) {
      var text = count > 0 ? String(count) : '';

      if (shownCount === -1) {
        // First write of this run. Nothing to blur out of, so just put it on.
        countValue.textContent = text;
      } else {
        /* Restarted from the top even if a swap is already running. Shorten
           the step far enough and the next change can land before the last
           swap has finished; riding the curve from the start keeps the number
           continuously soft rather than snapping to sharp between two blurs. */
        swapTo = text;
        swapT = 0;
        swapDur = Math.min(chargeTune.maxMs / 1000,
                           stepSeconds() * chargeTune.frac);
      }
      shownCount = count;
    }

    /* THE NUMBER GROWS WITH THE FILL, NOT WITH THE STEP. Tied to the raw
       charge rather than to the step index, so it swells smoothly through the
       whole hold instead of jumping on each number — and it shrinks back on a
       drain, since the fill runs both ways.

       SCALED, NOT RESIZED. A changing font-size relayouts the line on every
       frame; a transform is painted, so the number swells in place and costs
       nothing. It goes on countValue and not on countEl, which already spends
       its own transform on the translate that centres it.

       transform is the ONLY property written here. swapTick() owns `filter` on
       this same element, and two writers on one property is exactly the trap
       that makes these effects fight each other. */
    var numScale = chargeTune.scale0 +
                   (chargeTune.scale1 - chargeTune.scale0) * charge;
    countValue.style.transform = 'scale(' + numScale.toFixed(3) + ')';
    /* ---- The star ------------------------------------------------------
       GROW THE LIGHT OUTWARD FROM THE CORE. The outer stop is the front edge;
       the inner one trails it by SOFT_BAND, and that gap is the soft front.

       The front is pushed past 1 as it completes — fill * (1 + SOFT_BAND) —
       so that at a full charge the TRAILING stop has reached the rim too.
       Without that, the tips would still be mid-fade at 100% and a fully
       charged spark would never quite look fully lit.

       Fixed to 4 places rather than raw: a drain lands on a residue like
       4.9e-14, and an offset serialised in exponential notation is not a
       number SVG will parse. */
    var front = charge * (1 + SOFT_BAND);
    var trail = front - SOFT_BAND;
    if (front > 1) front = 1;
    if (trail < 0) trail = 0;
    sparkCoreA.setAttribute('offset', trail.toFixed(4));
    sparkCoreB.setAttribute('offset', front.toFixed(4));

    // Feeds the outline's alpha in the stylesheet, so the dormant gold warms
    // up with the light inside it instead of framing it at a constant weight.
    chargeBtn.style.setProperty('--lsa-fill', charge.toFixed(4));

    /* THE ART GROWS, THE TARGET DOES NOT. This scales the <svg> and never
       .lsa-charge, because that element is the 140px circle the cursor has to
       stay inside. See where CHARGE_SWELL used to be for why that matters more
       here than anywhere else in the overlay. */
    var sparkScale = chargeTune.spark0 +
                     (chargeTune.spark1 - chargeTune.spark0) * charge;
    sparkArt.style.transform = 'scale(' + sparkScale.toFixed(3) + ')';

    /* Brightness two ways, and they are different things. The halo is light
       ESCAPING the shape; the brightness filter is the light inside it getting
       hotter. Both ride the fill, so an empty spark is dead and a full one is
       burning. */
    sparkHalo.style.opacity = (charge * chargeTune.glow).toFixed(3);
    sparkFillPath.style.filter =
      'brightness(' + (1 + charge * chargeTune.hot).toFixed(3) + ')';

    /* Only on change. Rewriting a filter primitive's attribute re-renders the
       whole filter region, and this one is 250% of a 140px box — pure waste on
       every frame of a 14-second hold when the value moves only when somebody
       drags the slider. */
    if (haloBlurNow !== chargeTune.glowBlur) {
      haloBlurNow = chargeTune.glowBlur;
      sparkHaloBlur.setAttribute('stdDeviation', haloBlurNow);
    }

    chargeLabel.textContent = charged ? 'Charged'
      : (charging ? 'Charging' : 'Hold your spark here');

    /* GONE: the lsa-charge--idle toggle, which ran a sheen sweeping across an
       untouched button. That was a bar of light crossing a 232x52 capsule,
       clipped to its rounded rectangle. A 140px circle holding a thin star
       outline has no surface for it to cross, so all that is left of it would
       be a rectangle of light passing over empty black. The star's own glow
       and the proximity halo do that job now. */
  }

  /* How close the spark is to the button, 0 to 1, written where the stylesheet
     can reach it. Runs every frame rather than off mousemove, so it stays
     honest under a stationary pointer — and the number it produces is only
     meaningful against a FIXED target, which is one more reason the button
     itself no longer grows. */
  function proximityTick() {
    var near = 0;

    if (sparkSeen && !charged) {
      var b = chargeBtn.getBoundingClientRect();
      var dx = sparkX - (b.left + b.width / 2);
      var dy = sparkY - (b.top + b.height / 2);
      var dist = Math.sqrt(dx * dx + dy * dy);
      near = Math.max(0, 1 - dist / NEAR_RADIUS);
      /* Squared, so the response stays quiet over most of the approach and
         gathers in the last stretch. Linear reads as the button being
         permanently half-lit from across the stage, which says nothing. */
      near *= near;
    }

    chargeBtn.style.setProperty('--lsa-near', near.toFixed(3));
  }

  // Once at build, so the button and counter are not blank for the frame
  // between the overlay appearing and the loop's first tick.
  drawCharge();

  /* ---- The spark cursor -------------------------------------------------
     A cloud of sparkles that launches from the pointer and spreads outward,
     drawn additively on its own canvas above everything else.

     THE SHAPE is assets/Path.svg's own four-pointed sparkle, read as SVG path
     data straight into a Path2D — Path2D accepts a path string as-is — rather
     than loaded as an <img>. That is what lets every ember take its own fill
     colour with no raster/tint pass. Built once below, at module scope; each
     ember reuses that same Path2D under its own translate/rotate/scale.

     COLOUR rides on cfg.goColors.mix — the same hues the show's biggest
     firework bursts with, plus one warm white — so the cursor leading into
     the show is already wearing its colours.

     ORIGINATE AND SPREAD, replacing the 2026-09-01 model of a small random
     scatter plus a constant upward rise: every ember now launches from the
     cursor's exact position at a random angle and a real outward speed,
     shrinking and fading as it goes, so a held-still cursor reads as a small
     firework puff rather than a drifting trail.

     Still deliberately cheap — SPARK_MAX stays a fraction of one firework's
     200 sparkles, and there is no trail buffer or glow pass.

     EMBERS SPAWN AT A STEADY RATE WHETHER OR NOT THE POINTER IS MOVING. That
     is not laziness: charging the button means holding the cursor perfectly
     still for three seconds, and a trail that only lived on movement would go
     quiet at exactly the moment the user is being asked to hold position. At
     rest the same rate reads as a small fountain instead. */
  var SPARK_MAX = 40;
  var SPARK_LIFE = 0.6;         // s
  var SPARK_PER_SEC = 45;       // embers spawned per second
  var SPARK_SPEED_MIN = 50;     // px/s outward from the cursor
  var SPARK_SPEED_MAX = 170;
  var SPARK_SIZE_MIN = 10;      // px, the shape's on-screen footprint
  var SPARK_SIZE_MAX = 20;
  var SPARK_SPIN_MAX = 5;       // rad/s, +/- — a slow tumble, not a spin cycle
  var SPARK_GLOW_RADIUS = 14;   // px, the cursor's own soft glow

  /* The sparkle itself, straight from assets/Path.svg's own path data — a
     15x15 viewBox with the shape centred at (7.44, 7.44). SPARK_SHAPE_CENTER
     is that centre, so a draw can pivot the scale/rotate on the shape rather
     than on its corner. */
  // SPARK_PATH, defined up with the charge button — the same path data the
  // button's three SVG copies use. One shape, one string.
  var SPARK_SHAPE = new Path2D(SPARK_PATH);
  var SPARK_SHAPE_CENTER = 7.44;

  /* Built once, not per ember — see the stamp-system lesson that fillStyle
     construction, not geometry, is what costs on a canvas draw loop. */
  var SPARK_COLORS = cfg.goColors.mix.hues.map(function (h) {
    return 'hsl(' + h + ', 90%, 62%)';
  }).concat(['#FFF6D6']);

  var sparkCtx = sparkCanvas.getContext('2d');
  var sparks = [];
  var sparkX = -1000, sparkY = -1000;
  var sparkSeen = false;      // has the pointer been inside the overlay yet
  var sparkDebt = 0;          // fractional embers carried between frames
  var sparkW = 0, sparkH = 0, sparkDpr = 0;

  function sparkResize() {
    var w = sparkCanvas.clientWidth || 1;
    var h = sparkCanvas.clientHeight || 1;
    var dpr = window.devicePixelRatio || 1;
    if (w === sparkW && h === sparkH && dpr === sparkDpr) return;
    sparkW = w; sparkH = h; sparkDpr = dpr;
    sparkCanvas.width = Math.round(w * dpr);
    sparkCanvas.height = Math.round(h * dpr);
    // Everything below is then written in CSS pixels, as the engine does.
    sparkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sparkTick(dt) {
    if (!sparkSeen) return;

    /* Spawned on a debt counter rather than a whole number per frame, so the
       rate is per SECOND and does not quietly double on a 120Hz display. */
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
        // Swap-and-pop: order is irrelevant under additive blending.
        sparks[i] = sparks[sparks.length - 1];
        sparks.pop();
      }
    }
  }

  function sparkDraw() {
    sparkResize();
    sparkCtx.clearRect(0, 0, sparkW, sparkH);
    if (!sparkSeen) return;

    sparkCtx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      // Shrinks as well as fades, so a sparkle closes rather than blinking off.
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
    // Each ember's alpha is already undone by its own restore() above; reset
    // explicitly anyway; a canvas.globalAlpha left behind is exactly the bug
    // the stamp system's per-ball flash hit once already.
    sparkCtx.globalAlpha = 1;

    /* The spark itself: a soft glow rather than a hard-edged dot, drawn last
       so it sits on top of the sparkles rather than under whatever spawned
       most recently. Same radial-gradient idiom the engine's own flash uses
       in drawBlasts() — a bright core fading through warm gold to fully
       transparent — rebuilt every frame since, unlike a blast, this centre
       moves on every one of them. */
    var glowR = SPARK_GLOW_RADIUS;
    var glow = sparkCtx.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, glowR);
    glow.addColorStop(0,    'rgba(255, 250, 235, 0.95)');
    glow.addColorStop(0.3,  'rgba(255, 246, 214, 0.55)');
    glow.addColorStop(1,    'rgba(255, 246, 214, 0)');
    sparkCtx.fillStyle = glow;
    sparkCtx.fillRect(sparkX - glowR, sparkY - glowR, glowR * 2, glowR * 2);

    sparkCtx.globalCompositeOperation = 'source-over';
  }

  /* ---- The discharge ---------------------------------------------------
     The pause between a full button and the show starting. releaseSparks()
     used to fire a burst at the button itself before calling onGo() — removed
     2026-09-02, it read as an unwanted sixth firework rather than the button
     coming apart. Kept: the beat of nothing (RELEASE_PAUSE) before the real
     sequence starts, and the geography — the first rocket still launches from
     x 0.5 at the bottom of the canvas, where the button is, so the show still
     reads as starting from the thing the user just charged. */
  var releaseIn = -1;     // seconds until release; -1 when idle

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

    for (var i = 0; i < REVEAL_STEPS.length; i++) {
      black.classList.remove(REVEAL_STEPS[i]);
    }
    revealed = 0;
    ambNext = 0;
    amb.clear();

    // The button goes back to empty too, so the whole thing can be charged and
    // watched again. Same rule as the rest of this function: scene only,
    // nothing tuned is touched.
    charge = 0;
    charging = false;
    charged = false;
    releaseIn = -1;

    /* The counter, back to nothing. shownCount to -1 is what makes the
       drawCharge() below take its first-write path and put the blank on
       directly, rather than starting a swap that blurs away a number the
       reset has already removed. Clearing the filter by hand matters too: a
       RESET pressed mid-swap would otherwise strand whatever blur and
       brightness that frame happened to be writing. */
    shownCount = -1;
    swapT = -1;
    swapTo = null;
    countValue.style.filter = '';
    // Taken off so the snap plays again on the next charge. An animation only
    // runs when the class arrives, so leaving it on would give a silent second
    // run of the show.
    chargeBtn.classList.remove('lsa-charge--pop');
    // Brings the button and counter back so the whole thing can be watched
    // again from the top — and the galaxy with them, or the second run would
    // charge with no ignition in the number.
    root.classList.remove('lsa-root--fired');
    root.classList.remove('lsa-root--released');
    /* And the duration goes with it, back to the stylesheet's 0.5s fallback.
       Removing --released runs the same transition BACKWARDS, so leaving a
       long fade set here would make RESET sit through two and a half seconds
       of the galaxy creeping back in before the stage is ready again. The
       release writes it fresh on every run, so there is nothing to preserve. */
    root.style.removeProperty('--lsa-galaxy-fade');
    /* And the inline pair cutGalaxyShort() left on the image. This one is not
       tidying: it writes opacity 0 directly on the element, which beats the
       class, so leaving it would give the second run no galaxy at all — and the
       number would charge with nothing igniting it, for a reason nothing on
       screen could explain. */
    galaxy.style.removeProperty('transition');
    galaxy.style.removeProperty('opacity');
    drawCharge();
  }

  /* ---- Background fireworks · the scheduler -----------------------------
     Random in both senses the ask has: a random moment, and a random place.

     GATED ON THE REVEAL, not on the clock and not on GO. The condition is
     `revealed >= REVEAL_STEPS.length` — the same counter advanceReveal()
     drives — so these begin on the exact frame the veil finishes and the card
     lands. Tying it to a time instead would drift the moment the sequence is
     retimed, and tying it to GO would put them on screen during the ascent,
     where they would be hidden behind opaque black anyway.

     That gate is also the whole of the stop condition. RESET puts `revealed`
     back to 0, which silences this on the next frame without needing to know
     anything about it.

     `ambNext` starts at 0, so the first burst lands on the reveal frame rather
     than one gap after it. */
  var ambNext = 0;        // seconds until the next background burst

  function ambientGap() {
    var A = cfg.ambient;
    // Never zero or negative, however the vary slider is set: a gap of 0 would
    // burst every frame and empty the pool in well under a second.
    return Math.max(0.05, A.every * (1 + (Math.random() * 2 - 1) * A.vary));
  }

  function ambientTick(dt) {
    var A = cfg.ambient;
    if (!A.enabled || revealed < REVEAL_STEPS.length) return;

    ambNext -= dt;
    if (ambNext > 0) return;

    /* burst(), not launch(). These are meant to read as distant fireworks
       already in the sky, and a rocket climbing from the bottom of the screen
       would draw the eye down and across the card rather than settling behind
       it. Bursting outright also costs nothing to aim: the band below is where
       the light appears, full stop, with no ascent to solve for.

       ONE COLOUR PER BURST, ANYWHERE ON THE WHEEL. The hue is rolled here and
       handed over as a single-entry `hues` list, which pickHue() then returns
       for every sparkle in the burst — and for its flash, which reads the same
       spec, so the bloom matches the debris it throws.

       It has to be done this way round. `palette: 'random'` looks like the
       same thing and is not: pickHue() runs PER PARTICLE, so that setting
       rolls a fresh hue for every sparkle and a burst comes out as confetti
       rather than as one colour. A spec is the only way to fix a hue for the
       whole burst. The instance's own `palette` is dead as a result — a spec
       with hues always wins — which is why the panel has no colour-set control
       for these.

       `scale` is deliberately left off the spec: scaleOf() takes spec.scale OR
       cfg.scale, so omitting it lets ambientLook.scale keep governing. Putting
       a number here would silently cut the Size slider out of the loop. */
    var w = ambCanvas.clientWidth;
    var h = ambCanvas.clientHeight;
    var m = A.margin * w;
    var band = Math.max(0, A.bottom - A.top);

    amb.burst(m + Math.random() * Math.max(1, w - m * 2),
              (A.top + Math.random() * band) * h,
              { hues: [Math.random() * 360] });

    ambNext = ambientGap();
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
    /* Cleared before the engine runs, because fw.onBurst fires from inside
       update() — every rocket breaking on this frame reports during the call
       below, and the first of them claims the veil's one step for the frame. */
    revealStepped = false;

    fw.update(dt);

    /* The blue veil used to pull back to 60% here, detected off the first
       burst reaching fw.stats(). Removed with the black layer: that one is now
       the only thing that changes during the show.

       The lesson it was built on still applies to anything that replaces it —
       start on the first BREAK, never on the button press. The rocket climbs
       for over two seconds first, and dimming the page during the ascent reads
       as the overlay closing rather than as the sky lighting up. And it should
       hang off fw.onBurst, like the veil does, not off a clock. */

    /* AFTER the reveal, so the frame that finishes it is also the frame the
       first background burst can fire on. Before it, `revealed` is still
       one short and this returns immediately.

       The background canvas has its own engine and its own config, so nothing
       the main show does to `cfg` can reach it. */
    ambientTick(dt);
    amb.update(dt);

    // After the engine, so a rocket launched on this frame is first integrated
    // on the next one — the same ordering the sequence has always had.
    updateSequence(dt);

    /* The charge. Deliberately AFTER updateSequence, so the frame that fills
       the button queues its rockets on the very next one rather than racing it.

       There is no longer a "re-arm the button when the run ends" step here. GO
       could be pressed again as soon as the rockets were gone; the charge
       button stays charged once it has fired, and RESET is the only way back to
       empty. Holding the cursor on a spent button should not quietly stage a
       second show behind the first. */
    chargeTick(dt);
    /* NOT called from chargeTick, deliberately. That one returns early the
       moment the button is charged, and the last number's swap is still
       playing at that point — running the swap from there would freeze it
       half-blurred on the milestone itself, at the exact moment it matters
       most. It also has to keep running through the release and the ascent,
       which chargeTick sits out entirely. */
    swapTick(dt);
    // After the charge, so the frame that fills the button starts its pause on
    // the next one rather than eating a slice of it immediately.
    dischargeTick(dt);
    proximityTick();

    sparkTick(dt);

    // Separate canvases, so the order of these is a formality — but they are
    // written back to front, the way the layers are built.
    amb.draw(dt);
    fw.draw(dt);
    sparkDraw();
  }

  /* ---- DEV CONTROL PANEL — never ships ----------------------------------
     Built only when the page opts in with data-lsa-dev, exactly like the
     __lsaDev hook below. The Liferay fragment does not set it, so on the
     intranet no panel is built and none of these listeners exist.

     Five tabs, one per firework, over the settings table above. A control
     writes into that firework's row rather than into `cfg`. The row rides out
     on that firework's spec when it launches, and the engine swaps it in for
     exactly the moments it reads it — which is what keeps it to the one
     firework. The exceptions are the two things that were already
     per-firework (colour set, size), which write to `goSequence` and
     `fireworkSize` where they have always lived, and the "Whole show" section
     at the bottom, which writes into `cfg` directly because those values
     cannot be aimed at all.

     Rows are handed over BY REFERENCE, so a slider moved here reaches the next
     run with no reload — the same way the size slider always has.

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
      // The second engine's own config, not a branch of the main one.
      if (def.kind === 'ambient') return readPath(cfg.ambientLook, def.path);
      // NOT on cfg, deliberately. chargeTune belongs to the show's chrome, not
      // to the engine, and Copy config dumps cfg for the engine's benefit.
      if (def.kind === 'charge') return chargeTune[def.path];
      if (def.kind === 'coin') return coinTune[def.path];
      // A <select>'s value is a string, and YEARS is a number.
      if (def.kind === 'years') return String(YEARS);
      if (def.kind === 'color') { var r = seqRowOf(); return r ? r.color : ''; }
      return lookOf()[def.path];
    }

    function setVal(def, v) {
      if (def.kind === 'size') { cfg.fireworkSize[current] = v; return; }
      if (def.kind === 'global') { writePath(cfg, def.path, v); return; }
      if (def.kind === 'ambient') { writePath(cfg.ambientLook, def.path, v); return; }
      if (def.kind === 'charge') { chargeTune[def.path] = v; return; }
      // `depth` is the only coin value left, and it lands live — it re-places
      // 69 elements and shows at once with nothing to replay.
      if (def.kind === 'coin') {
        coinTune[def.path] = v;
        applyCoinDepth();
        return;
      }
      /* The one control that changes the SCENE rather than a tuned value, so
         it is also the one that resets. Without the reset the new milestone
         would not appear until something else put the counter back, and a
         picker that looks like it did nothing is worse than no picker. */
      if (def.kind === 'years') { setYears(parseInt(v, 10)); resetScene(); return; }
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

    /* The release beat — the handover from the charge to the show.

       The only two charge values with controls so far. The other fourteen are
       still edit-the-file only; these two are here because the moment they
       describe is the one being judged right now, and because they interact:
       the flash is a cream mid-tone and the galaxy is a dodge, so how long the
       image hangs around changes how loud the flash is. Judging either one
       with the other fixed gives the wrong answer. */
    var CHARGE_SETTINGS = [
      /* The one swap value with a control, because it is the one that was
         wrong. At 0.34em on an 88px digit the blur is ~30px and a bold stroke
         is ~11px, so the strokes bleed into each other and average out: the
         number stops being a soft number and becomes a round grey cloud the
         size of its own box. Confirmed on 2026-09-05 with the galaxy hidden,
         so the dodge is not what makes it a disc — it only makes the disc
         glow. Under about 0.12 the letterform survives and it reads as out of
         focus instead of erased.

         Unlike the two below, this one lands DURING a hold: swapTick() reads
         chargeTune.blur on every frame it runs, so the next number to change
         uses whatever the slider says. */
      { head: 'The number swap' },
      { note: 'Hold the spark and watch the number change. Big values turn ' +
              'the digit into a round blob — the blur has to stay narrower ' +
              'than the stroke.' },
      { kind: 'charge', path: 'blur', label: 'Blur at the peak (em)',
        min: 0.02, max: 0.4, step: 0.01 },

      /* THE START SIZE, AND ONLY THE START SIZE. There is no slider for the
         finish and there should not be: aimCounterAtMedal() writes scale1 from
         the medal's own number, so a control here would be overwritten the next
         time the milestone changes and would read as broken.

         Lands mid-hold, like the blur above — drawCharge() reads it every frame,
         so the number resizes under the cursor while you drag. */
      { head: 'The counter grows' },
      { note: 'Where the number starts, as a multiple of 88px. It always ' +
              'finishes at the size of the number on the medal, which is why ' +
              'there is no control for the other end.' },
      { kind: 'charge', path: 'scale0', label: 'Number starts at (x)',
        min: 0.1, max: 1, step: 0.01 },

      { head: 'The release' },
      { note: 'The moment the spark fills. RESET, then hold the spark to ' +
              'watch these — both are read when the charge completes, so a ' +
              'change lands on the next run, not the one playing.' },
      { kind: 'charge', path: 'pop', label: 'Flash when charged', bool: true },
      { kind: 'charge', path: 'galaxyFade', label: 'Galaxy fades over (s)',
        min: 0.1, max: 4, step: 0.1 },

      /* The medal's thickness. Judge it by moving the cursor across the stage
         so the coin leans — face-on there is no rim to see. */
      { head: 'Medal thickness' },
      { note: 'The rim is 68 flat copies of one silhouette, not real ' +
              'geometry, so it only reads as solid while the coin is turned ' +
              'a little. Raising this without raising the layer count opens ' +
              'gaps between them. Lands live.' },
      { kind: 'coin', path: 'depth', label: 'Rim thickness (px)',
        min: 0, max: 160, step: 1.2 }
    ];

    /* The milestone. DEV ONLY — on Liferay this comes from data-years and
       cannot move, so there is no control for it there and no way to reach
       one.

       The ten real milestones only. `data-years` itself accepts any positive
       number, and stepsFor() handles a seven-year award correctly, but a
       picker is for walking the ladder that actually exists. */
    var MILESTONE_SETTINGS = [
      { head: 'The milestone' },
      { note: 'Changing this resets the stage. Hold the spark to watch the ' +
              'counter walk it, or press Play show to skip straight to the ' +
              'fireworks — 50 years is a 14.4-second hold.' },
      { kind: 'years', label: 'Years',
        options: ['5', '10', '15', '20', '25', '30', '35', '40', '45', '50'] }
    ];

    /* Last, with the other whole-show sections. The tab strip at the top of
       the panel selects a FIREWORK, so anything global has to sit clear of it
       or it reads as belonging to whichever tab is lit. */
    FIREWORK_SETTINGS.concat(SHOW_SETTINGS).concat(AMBIENT_SETTINGS)
      .concat(CHARGE_SETTINGS).concat(MILESTONE_SETTINGS).forEach(addRow);

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

    /* Replay without the hold. The charge is the only route into the show for
       a real user and stays that way, but judging the fireworks at 50 years
       through a 14.4-second hold every time makes the comparison useless —
       and holding tells you nothing about the fireworks that the hold has not
       already told you.

       Reset first, always. onGo() returns early while anything is still
       scheduled, so pressing this mid-show would otherwise do nothing at all
       and read as a broken button. */
    var playBtn = document.createElement('button');
    playBtn.className = 'lsa-panel-copy';
    playBtn.type = 'button';
    playBtn.textContent = 'Play show';

    function onPlay() {
      resetScene();
      onGo();
    }
    playBtn.addEventListener('click', onPlay);
    devCleanup.push(function () { playBtn.removeEventListener('click', onPlay); });

    panel.appendChild(playBtn);

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
    chargeBtn.removeEventListener('mouseenter', onChargeEnter);
    chargeBtn.removeEventListener('mouseleave', onChargeLeave);
    root.removeEventListener('mousemove', onStageMove);
    cancelAnimationFrame(rafId);
    // Both engines, each of which owns its own resize listener and observer.
    fw.destroy();
    amb.destroy();
    root.remove();
    document.body.style.overflow = previousOverflow;
  }

  // ---- LOCAL DEV HOOK — inert in production -----------------------------
  // The one place this file touches `window`, and only when the page opts in
  // by putting data-lsa-dev on <html>. The Liferay markup does not, so on the
  // intranet this branch never runs and no global is ever created.
  if (document.documentElement.hasAttribute('data-lsa-dev')) {
    /* Hidden on 2026-09-10 and back the same day: the coin's three values need
       somewhere to live, and this is where sliders go. */
    buildDevPanel();

    window.__lsaDev = {
      cfg: cfg,
      fw: fw,
      amb: amb,             // the background canvas's own engine
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
