# Click-to-flip on the medallion — removed 2026-09-21

Built 2026-09-10, taken out of `lsa-experience.js` / `lsa-experience.css` on
2026-09-21 at the client's request. **The cursor tilt was NOT removed** — the
medal still leans toward the pointer from anywhere on the stage. Only the
click-and-it-turns-over half is gone.

Everything below is verbatim from the files it came out of, with the wiring
notes needed to put it back. Nothing here is live.

---

## What it did

Once the veil had fully cleared, clicking on the medallion turned it over
through 180 degrees to show `assets/back.png`, and clicking again turned it
back. `RESET` and the start of every run put it face-up again.

The turn was 0.9s, eased in-out, and while it ran the rim's 68-layer Z stack
was squeezed almost flat so the coin did not come apart edge-on.

## What stayed behind

- **The tilt.** `MAX_TILT`, `FAR_TILT`, `TILT_FALLOFF`, `medalBox()`,
  `onStageMove()`, and the 0.15s transition on `.lsa-medal-scene`.
- **The rim.** `EDGE_COUNT` 68, `EDGE_STEP` 1.2, `applyCoinDepth()`,
  `coinTune.depth` and its dev slider. The rim is what the tilt shows off.
- **Two wrapper divs**, `.lsa-medal-coin` and `.lsa-medal-depth`. They were
  built for the flip and are inert now — no transform, no transition, no
  animation. Left in place because the 3D chain hangs off them and pulling them
  out means re-parenting 70 elements for no visible gain. **Put the flip back
  here.**
- **`assets/back.png`** is on disk and nothing loads it, the same way
  `medal.svg` and `shimmer.png` sit there.

---

## JS — `lsa-experience.js`

### 1. The back face

Sat right after `medalImg.style.transform = 'scale(' + FACE_SCALE + ')';` and
before the `coinTune` block.

```js
  /* ---- The back face, and the flip ------------------------------------
     back.png finally gets used. It is the same 2250x2260 artwork as the face,
     so it needs no measuring — it caps the far end of the stack exactly the
     way coinFront caps the near end.

     ONE STEP FURTHER OUT THAN EDGE LAYER 0, not level with it. The near cap
     sits one step beyond the last edge (40.8 against 38.4); putting the far cap
     at exactly -40.8 would land it on top of edge 0 and let the two Z-fight.
     Derived from the same two constants, so it follows them.

     ORDER AND SIGN GO TOGETHER. rotateY(180deg) flips the local Z axis, so
     `translateZ(-43.2px) rotateY(180deg)` below and the more common
     `rotateY(180deg) translateZ(43.2px)` land in the same place. What is NOT
     interchangeable is keeping the sign when you swap the order: rotate first
     and then translate by a NEGATIVE offset and the back cap ends up in front
     of the medal. Written this way round so both caps read off the same axis.

     It shares .lsa-medal-face, which already hides its own backface, so the
     front and back swap over on their own as the coin turns. Nothing has to
     toggle visibility. */
  var coinBack = document.createElement('div');
  coinBack.className = 'lsa-medal-face lsa-coin-back';

  var backImg = document.createElement('img');
  backImg.className = 'lsa-medal-img';
  backImg.src = ASSET_PATH + 'back.png';
  backImg.alt = '';
  // Same lip, same fix. back.png measures 100% x 99.60%, so it stood proud of
  // the stack by the same amount the front did.
  backImg.style.transform = 'scale(' + FACE_SCALE + ')';
  coinBack.appendChild(backImg);
  medalDepth.appendChild(coinBack);
```

### 2. The two squeeze values

`coinTune` kept `depth` and lost these two. The comment above it went with
them — it is reproduced here because it is the record of why the three could
not be judged apart.

```js
  /* ---- The three coin values, and their sliders -------------------------
     `depth` is the medal's thickness; `thin` and `hold` are the squeeze that
     makes the turn survivable. They are here together because they pull
     AGAINST each other and cannot be judged apart:

       - a thicker rim is a better-looking medal at rest and a worse turn
       - squeezing early kills the 30-80 degree ghosting but you can see the
         medal squash while it is still nearly face-on
       - squeezing late keeps the thickness honest and lets the ghost back in

     There is no known setting where all three are right, which is why this is a
     slider and not a constant. The way out of the trade is a rim that is
     actually solid rather than 68 stacked pictures. */
  var coinTune = {
    depth: EDGE_COUNT * EDGE_STEP,  // 81.6px, the current look
    thin: 0.06,                     // scaleZ at the halfway point of the turn
    hold: 25                        // % of the turn at full depth before it goes
  };
```

### 3. The back cap's line inside `applyCoinDepth()`

The function stays; these two lines came off the end of it.

```js
    coinBack.style.transform =
      'translateZ(' + (-((EDGE_COUNT / 2) + 1) * step) + 'px) rotateY(180deg)';
```

### 4. `applyCoinSqueeze()` and its call

```js
  /* The squeeze lives in a @keyframes rule, so tuning it means REWRITING THAT
     RULE rather than setting a property. The alternative was to drive scaleZ
     from the frame loop, which would put a second writer on medalDepth and
     hand the browser 54 style recalcs per turn for something the compositor
     already interpolates for free.

     Rebuilt from scratch each time rather than edited in place: deleting by
     keyText and re-appending is the only way to move a keyframe's POSITION,
     and `hold` moves two of them. */
  function applyCoinSqueeze() {
    var kf = null;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length && !kf; i++) {
      var rules;
      // A stylesheet from another origin throws on .cssRules rather than
      // returning null. Nothing here is cross-origin today, but the Google
      // Fonts sheet two tags up in lsa-demo.html is exactly that shape.
      try { rules = sheets[i].cssRules; } catch (err) { continue; }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) {
        if (rules[j].type === 7 && rules[j].name === 'lsa-coin-thin') {
          kf = rules[j];
          break;
        }
      }
    }
    if (!kf) return;

    while (kf.cssRules.length) kf.deleteRule(kf.cssRules[0].keyText);

    var h = clamp(coinTune.hold, 0, 45);
    kf.appendRule('0% { transform: scaleZ(1); }');
    if (h > 0) kf.appendRule(h + '% { transform: scaleZ(1); }');
    kf.appendRule('50% { transform: scaleZ(' + coinTune.thin + '); }');
    if (h > 0) kf.appendRule((100 - h) + '% { transform: scaleZ(1); }');
    kf.appendRule('100% { transform: scaleZ(1); }');
  }

  applyCoinDepth();
  applyCoinSqueeze();
```

⚠ `applyCoinSqueeze()` calls `clamp()`, which is declared **further down the
file** next to the tilt. It worked because it is a function declaration and is
hoisted, and because nothing called `applyCoinSqueeze()` before then. If this
comes back, keep that in mind.

### 5. `setFlip()` and the `flipped` flag

```js
  /* THE FLIP IS WRITTEN ON .lsa-medal-coin, the tilt on .lsa-medal-scene, and
     that separation is the whole reason this is cheap. Both on one element
     would mean one string carrying two independent animations, recomposed on
     every mousemove. One writer per element, which the stylesheet already
     insists on for the scene.

     The transition lives in the CSS. ease-in-out is deliberate rather than the
     default: the coin is at its worst edge-on, and an ease-in-out is at its
     FASTEST through the middle of the turn, so it spends least time there. The
     squeeze on medalDepth is what makes edge-on survivable at all; this only
     keeps it brief. */
  var flipped = false;

  function setFlip(on) {
    // No turn, no squeeze. resetScene() calls this on every RESET, and without
    // the guard a coin that was already face-up would thin and swell for no
    // reason with nothing rotating.
    if (on === flipped) return;
    flipped = on;
    medalCoin.style.transform = 'rotateY(' + (on ? 180 : 0) + 'deg)';

    /* RESTARTING THE SQUEEZE IS THE FIDDLY PART. Re-adding a class that is
       already there does not replay a CSS animation, and a second flip inside
       0.9s would then turn with the rim at full depth — the exact case the
       squeeze exists for. Removing the class, reading offsetWidth to force the
       style change to be flushed, then re-adding it is the standard way to make
       the engine treat it as a new animation.

       The read is not dead code and must not be "optimised" away: without it
       both writes coalesce into one frame and nothing restarts. */
    medalDepth.classList.remove('lsa-medal-depth--flip');
    void medalDepth.offsetWidth;
    medalDepth.classList.add('lsa-medal-depth--flip');
  }
```

### 6. `overMedal()`

The click was the only caller. `medalBox()`, which it leans on, **stays** —
the tilt uses it every mousemove.

```js
  // Box, not silhouette. The medal is a four-point star, so the corners of this
  // are not on the artwork — but it is the same box the tilt has always used to
  // decide it was "on" the medal, and a path test buys nothing here.
  function overMedal(x, y) {
    var b = medalBox();
    return Math.abs(x - b.cx) <= b.halfW && Math.abs(y - b.cy) <= b.halfH;
  }
```

### 7. The click branch

`onCanvasClick()` stays and now always launches a rocket. This is what came
out of the top of it:

```js
  /* Click launches a rocket that bursts where you clicked, rather than
     bursting there outright — the lab had no ascent to exercise.

     UNLESS IT LANDS ON THE MEDAL, in which case it flips the coin and no rocket
     goes up. The two gestures had to be separated because the card takes no
     pointer events of its own: it sits under the canvas so the fireworks burst
     over it, so every click on the medal is really a click on the canvas, and
     the only thing telling them apart is geometry.

     GATED ON THE REVEAL BEING FINISHED, using the same counter the background
     fireworks wait on. Before that the medal is behind the veil, and flipping
     something the viewer cannot see would spend the gesture on nothing — worse,
     it would be flipped when the veil cleared. */
  function onCanvasClick(e) {
    if (revealed >= REVEAL_STEPS.length && overMedal(e.clientX, e.clientY)) {
      setFlip(!flipped);
      return;
    }
    var r = canvas.getBoundingClientRect();
    fw.launch(e.clientX - r.left, e.clientY - r.top);
  }
```

### 8. The `resetScene()` line

```js
    // Scene state like everything else here, so a coin left face-down does not
    // survive into the next run. It turns back over its own transition rather
    // than snapping, which is the same thing the veil does two lines up.
    setFlip(false);
```

### 9. The dev panel

`setVal()`'s `coin` branch lost its fork — `depth` is the only coin value
left, so it calls `applyCoinDepth()` outright.

```js
      /* Both land live, but by different routes. `depth` re-places 70 elements
         and shows at once with nothing to replay. `thin` and `hold` rewrite the
         keyframes, so the CHANGE is instant but you only SEE it on the next
         flip — the running animation keeps the rule it started with. */
      if (def.kind === 'coin') {
        coinTune[def.path] = v;
        if (def.path === 'depth') applyCoinDepth();
        else applyCoinSqueeze();
        return;
      }
```

The heading and note were rewritten and the two squeeze sliders dropped. The
`depth` slider stays.

```js
      /* The medal's thickness and the squeeze that hides it edge-on. Click the
         medal to flip it — the reveal has to have finished first, so press
         Play show once before judging any of these. */
      { head: 'Medal thickness and the flip' },
      { note: 'The rim is 68 flat copies of one silhouette, not real ' +
              'geometry, so edge-on you can see between them. The squeeze ' +
              'packs them together while the coin turns. Thickness lands ' +
              'live; the two squeeze values land on the NEXT flip.' },
      { kind: 'coin', path: 'depth', label: 'Rim thickness (px)',
        min: 0, max: 160, step: 1.2 },
      { kind: 'coin', path: 'thin', label: 'Squeezes to (x) at 90 deg',
        min: 0.02, max: 1, step: 0.01 },
      { kind: 'coin', path: 'hold', label: 'Holds full depth for (% of turn)',
        min: 0, max: 45, step: 1 }
```

---

## CSS — `lsa-experience.css`

### The flip's transition on `.lsa-medal-coin`

The rule stays; the `transition` line and the comment above it came out.

```css
/* The rigid body the FLIP turns, separate from the scene the tilt turns.
   lsa-experience.js writes style.transform here, so — same rule as
   .lsa-medal-scene — ** never put a transform in this rule. ** One writer.

   ease-in-out is picked, not inherited. The faked rim comes apart into visible
   slices between roughly 87 and 93 degrees, and an ease-in-out is at its
   fastest through the middle of the turn, which is exactly where that window
   sits — it crosses in about one frame at 60Hz. A linear flip would dwell
   there, and an ease-out would be at its slowest right in the worst place. */
.lsa-medal-coin {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.9s ease-in-out;
}
```

### `.lsa-coin-back`

```css
/* The far cap of the edge stack. Its Z offset and its 180-degree turn are both
   written from lsa-experience.js, derived from the layer count and spacing, so
   nothing here restates them. It shares .lsa-medal-face, which is where the
   backface-visibility that swaps the two faces over comes from. */
.lsa-coin-back {
  transform: translateZ(-1px) rotateY(180deg);
}
```

### The squeeze keyframes and its class

```css
/* ** THE DURATION MUST MATCH .lsa-medal-coin's TRANSITION ABOVE. ** They are
   two halves of one movement and there is nothing to keep them in step but
   this comment. Change one, change the other.

   THE CURVE IS NOT SYMMETRIC WITH THE ROTATION, on purpose. The flip is eased,
   so it is still only ~30 degrees over at a quarter of the way through, but the
   stack has to be thin BEFORE it gets there — 30 to 80 degrees is where a
   spread stack of flat copies stops reading as a rim and starts reading as a
   smeared ghost. So the depth is already down to 40% at 25% of the time, well
   ahead of the angle that needs it.

   0.06 rather than 0 at the midpoint. At zero the coin has no thickness at all
   and vanishes for a frame; at 0.06 the 81.6px band becomes about 5px, which is
   68 planes overlapping into one solid line — a coin seen edge-on, which is
   what it is. */
@keyframes lsa-coin-thin {
  0%   { transform: scaleZ(1); }
  25%  { transform: scaleZ(0.4); }
  50%  { transform: scaleZ(0.06); }
  75%  { transform: scaleZ(0.4); }
  100% { transform: scaleZ(1); }
}

.lsa-medal-depth--flip {
  animation: lsa-coin-thin 0.9s ease-in-out;
}
```

⚠ `applyCoinSqueeze()` above rewrites this keyframe's stops at runtime, so the
values sitting in the stylesheet are only what the page starts with. The
`hold: 25` default is what puts the 25% and 75% stops there.

### `backface-visibility` on `.lsa-medal-face`

Two lines came off this rule. They existed to swap the front and back caps over
as the coin turned; with no back cap there is nothing to swap, and the tilt
never takes the face past 25 degrees.

```css
.lsa-medal-face {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}
```

The comment on `.lsa-coin-edge` below it pointed at this as a deliberate
asymmetry. It was reworded when these came out; here is the original.

```css
/* Thickness is faked by stacking copies of the textless silhouette along Z.

   NO backface-visibility here, deliberately: the rim has to stay visible from
   every angle, and hiding the away-facing half would make it disappear as the
   coin tilts. The asymmetry with .lsa-medal-face above is intentional — it is
   not an oversight, and it should not be "fixed". */
```

---

## The three notes worth keeping if it comes back

1. **The rim is 68 pictures, not geometry.** Edge-on it combs apart and the
   card shows through the gaps. The squeeze exists for that and nothing else;
   a finer step gives more, thinner stripes, never a solid band. The real fix
   is a rim that is actually solid.
2. **The squeeze has to lead the rotation.** An eased flip is only ~30 degrees
   over at a quarter of the way through, but the stack has to be thin before it
   gets there. Symmetric curves look right on paper and ghost on screen.
3. **`void medalDepth.offsetWidth` is load-bearing.** It is what makes a second
   flip inside 0.9s replay the squeeze instead of turning at full depth.
