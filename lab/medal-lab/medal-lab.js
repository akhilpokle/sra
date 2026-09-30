/* Medal lab. The card, the medal and the medal's cursor tilt, copied from
   lsa-experience.js as of 2026-09-30. Values are production's. Nothing else
   from the overlay is here: no fireworks, no charge, no veil, no teardown. */
(function () {
  'use strict';

  var YEARS = 5;

  // Resolved against the PAGE, which is lab/medal-lab/.
  var ASSET_PATH = '../../assets/';

  var root = document.createElement('div');
  root.className = 'lsa-root';

  /* ---- The stage -------------------------------------------------------
     Centres the medal on screen. It took the card's place; the card, its
     plate and its sentence were removed from this lab. */

  var stage = document.createElement('div');
  stage.className = 'lsa-medal-stage';

  var medalScene = document.createElement('div');
  medalScene.className = 'lsa-medal-scene';

  var medalCoin = document.createElement('div');
  medalCoin.className = 'lsa-medal-coin';

  var coinFront = document.createElement('div');
  coinFront.className = 'lsa-medal-face lsa-coin-front';

  /* medal.svg since 2026-09-30, in place of Front.png. Its 563x565 viewBox is
     Front.png's 2250x2260 at a quarter, so it fills the same 320x321 box.

     INLINED, not an <img>. An SVG inside an <img> is a closed document that
     CSS and JS cannot reach into, and the point is to target its "image"
     layer. This div holds the <svg> once it has loaded. */
  var medalImg = document.createElement('div');
  medalImg.className = 'lsa-medal-img';
  coinFront.appendChild(medalImg);

  /* The "image" layer: the round radial texture in the middle of the face.
     In the file it is a 387x387 circle at 0.7 opacity, filled by a pattern
     that holds the embedded PNG (#image0_5482_71034). The circle is what
     draws, so that is what gets the class. */
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

  // The milestone, drawn over the blank face. Inside coinFront so it rides
  // the tilt with the face.
  var medalNumber = document.createElement('div');
  medalNumber.className = 'lsa-medal-number';
  medalNumber.setAttribute('aria-hidden', 'true');
  medalNumber.textContent = String(YEARS);
  coinFront.appendChild(medalNumber);

  medalCoin.appendChild(coinFront);
  medalScene.appendChild(medalCoin);
  stage.appendChild(medalScene);

  root.appendChild(stage);

  /* ---- Thickness, faked --------------------------------------------------
     EDGE_COUNT copies of the textless silhouette stacked along Z. Go deeper
     by raising the COUNT, not the step, or gaps open between slices. */
  var EDGE_COUNT = 68;
  var EDGE_STEP = 1.2;    // px between layers; 68 x 1.2 gives ~81.6px of depth

  // Inert 3D wrapper. It carried the flip's squeeze until 2026-09-21.
  var medalDepth = document.createElement('div');
  medalDepth.className = 'lsa-medal-depth';
  medalCoin.appendChild(medalDepth);

  // appendChild MOVES the node, so this re-parents coinFront.
  medalDepth.appendChild(coinFront);

  for (var e = 0; e < EDGE_COUNT; e++) {
    var edge = document.createElement('div');
    edge.className = 'lsa-coin-edge';

    var edgeImg = document.createElement('img');
    edgeImg.src = ASSET_PATH + 'Stack.png';
    edgeImg.alt = '';
    edge.appendChild(edgeImg);

    medalDepth.appendChild(edge);
  }

  // The face is a shade smaller than its box so it does not stand proud of
  // the rim. On the img, not the face, so the number does not move.
  var FACE_SCALE = 0.992;
  medalImg.style.transform = 'scale(' + FACE_SCALE + ')';

  var coinTune = {
    depth: EDGE_COUNT * EDGE_STEP   // 81.6px
  };

  // One formula for all 69 pieces: the layers and the front cap.
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

  /* ---- The tilt ----------------------------------------------------------
     Written on the perspective root, so the whole coin turns as one body.
     Leans toward the cursor from anywhere on the stage; only the STRENGTH
     falls off with distance. Holds its last lean when the pointer leaves. */
  var MAX_TILT = 25;      // degrees of lean at the edge of the element
  var FAR_TILT = 0.12;    // strength at the far corner of the screen, 0-1
  var TILT_FALLOFF = 0.6; // curve between the medal's edge and that corner

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // From LAYOUT, not from the rect: a rotated element's rect changes with the
  // rotation, and the tilt would feed on its own output.
  function medalBox() {
    var stageRect = stage.getBoundingClientRect();
    var halfW = medalScene.offsetWidth / 2;
    var halfH = medalScene.offsetHeight / 2;
    return {
      halfW: halfW,
      halfH: halfH,
      cx: stageRect.left + medalScene.offsetLeft + halfW,
      cy: stageRect.top + medalScene.offsetTop + halfH
    };
  }

  function onStageMove(ev) {
    var b = medalBox();
    var halfW = b.halfW;
    var halfH = b.halfH;

    var px = ev.clientX - b.cx;
    var py = ev.clientY - b.cy;

    // Direction, clamped to the box.
    var dx = clamp(px / halfW, -1, 1);
    var dy = clamp(py / halfH, -1, 1);

    // Strength: distance from the medal's corner to the screen's corner, 0-1.
    var edge = Math.sqrt(halfW * halfW + halfH * halfH);
    var reach = Math.sqrt(window.innerWidth * window.innerWidth +
                          window.innerHeight * window.innerHeight) / 2;
    var t = clamp((Math.sqrt(px * px + py * py) - edge) /
                  Math.max(1, reach - edge), 0, 1);

    var k = 1 - (1 - FAR_TILT) * Math.pow(t, TILT_FALLOFF);

    // Y inverted, so the medal leans TOWARD the cursor.
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

  document.body.appendChild(root);
})();
