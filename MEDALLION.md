# 3D Medallion Component — Implementation Spec

Build an interactive 3D medallion: a coin-shaped medal that sits at full size, tilts
toward the mouse pointer, catches a moving specular shimmer, and flips to its back
face on click.

**No dependencies.** Pure CSS 3D transforms + vanilla JS. No GSAP, no ScrollTrigger,
no animation library. (The original this is ported from used GSAP only for a
scroll-driven grow-in, which is explicitly out of scope here.)

---

## 1. Assets required

Four image files. Copy them into your project's static/public directory.

| File | Role | Notes |
|------|------|-------|
| `medal.svg` | Front face | The full detailed medal artwork. Transparent background. |
| `medal-edge.svg` | Edge/rim layer | **Solid, textless silhouette** of the same shape. This is the critical one — it gets stacked ~34 times along Z to fake physical thickness. Must be the same outline as the front face, filled with a flat rim color, with no text or detail (it is visible from both sides, so any text would appear mirrored). |
| `back.png` | Back face | Reverse side artwork. |
| `shimmer.png` | Shimmer mask | A soft radial/streak alpha mask. Used as a CSS `mask-image` over a warm gradient to make the highlight. |

If you don't have `medal-edge.svg`, you must author it: take the front artwork,
strip everything but the outer silhouette, fill it with a single mid-tone metal
color. The illusion of a solid 3D coin depends entirely on this file.

Everything below assumes assets resolve at `/medal.svg`, `/medal-edge.svg`,
`/back.png`, `/shimmer.png`. **Adjust these paths to your project's asset
convention** — they appear in three places: the HTML `src` attributes, the
`mask-image` URL in CSS, and the `img.src` inside `buildCoinEdges()`.

---

## 2. How the 3D works (read this before editing anything)

The medallion is a stack of nested `transform-style: preserve-3d` layers:

```
.medal-scene      ← perspective root (1000px). Mouse tilt transform written HERE.
  .medal-coin     ← flip wrapper. Click toggles rotateY(180deg) with a CSS transition.
    .coin-front   ← translateZ(+halfThickness)
    .coin-back    ← rotateY(180deg) translateZ(+halfThickness)
    .coin-edge ×34 ← translateZ(-20.4px … +20.4px), injected by JS
```

**Thickness model.** There is no real 3D geometry. `buildCoinEdges()` injects
`edgeCount` copies of `medal-edge.svg`, each offset along Z by `step` px. With the
defaults (34 layers × 1.2px) the stack spans ~40.8px, and the front and back faces
are pushed out to ±20.4px so they cap the stack. Viewed from any angle off-axis,
the 34 slices read as a solid rim. More layers = smoother rim but more compositing
cost; fewer layers = visible banding when tilted hard.

**Why the edges have no `backface-visibility: hidden`.** The faces do (so the flip
never shows mirrored front artwork through the back), but the edge layers
deliberately don't — the rim must stay visible from front, back, and every angle in
between. This asymmetry is intentional; don't "fix" it.

**Why the tilt is written on the perspective root.** Rotating `.medal-scene` rotates
the entire 3D subtree as one rigid body under a fixed perspective, which is what
makes it feel like a physical object rather than a rotating image. The 0.15s CSS
transition on that element is what gives the tilt its slight lag/weight.

---

## 3. HTML

```html
<div class="medal-scene" id="medal-scene">
  <div class="medal-coin" id="medal-coin">

    <!-- Front face -->
    <div class="medal-face coin-front">
      <img src="/medal.svg" alt="Medal" class="medal-img" />
      <div class="medal-shimmer" id="medal-shimmer"></div>
    </div>

    <!-- Back face -->
    <div class="medal-face coin-back">
      <img src="/back.png" alt="" class="medal-img" />
      <!-- Optional: absolutely-positioned inscription markup goes here -->
    </div>

  </div>
</div>
```

Edge layers are **not** in the markup — JS injects them into `.medal-coin`.

---

## 4. CSS

```css
/* Perspective root — mouse tilt is applied to this element */
.medal-scene {
  perspective: 1000px;
  width: 320px;
  height: 321px;
  cursor: pointer;
  transform-style: preserve-3d;
  transition: transform 0.15s ease-out;   /* gives the tilt its lag */
}

/* Flip wrapper */
.medal-coin {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 2.8s ease-in-out;  /* slow, weighty flip */
}

.medal-coin.is-flipped {
  transform: rotateY(180deg) !important;
}

/* Shared face styles — backface-visibility hides away-facing faces so the flip
   can never show mirrored front content. Works on <img> children. */
.medal-face {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* Placeholder transforms — overwritten by buildCoinEdges() at runtime */
.coin-front { transform: translateZ(1px); }
.coin-back  { transform: rotateY(180deg) translateZ(1px); z-index: 1; }

/* Edge layers — NO backface-visibility: the rim must show from both sides */
.coin-edge {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Fully opaque: 34 medal-shaped copies stack into a solid mass; the SVG's own
   transparent background preserves the silhouette */
.coin-edge img {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 1;
}

.medal-img {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  user-select: none;
}

/* Shimmer — a warm radial gradient, masked by shimmer.png, whose mask position
   follows the cursor via the --sx / --sy custom properties set in JS */
.medal-shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(circle at center,
    rgba(255,248,220,0.95) 0%,
    rgba(255,230,170,0.6)  35%,
    rgba(255,210,130,0)    70%);
  -webkit-mask-image: url(/shimmer.png);
          mask-image: url(/shimmer.png);
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-size: 180% 180%;
          mask-size: 180% 180%;
  -webkit-mask-position: var(--sx, 50%) var(--sy, 50%);
          mask-position: var(--sx, 50%) var(--sy, 50%);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 0.25s ease-out;
}
```

**`mix-blend-mode: screen` needs a dark backdrop to read correctly.** On a light
background the shimmer will look washed out or invisible. If your host page is
light, either swap to `mix-blend-mode: overlay` / `soft-light`, or drop the blend
mode and lower the gradient alphas.

---

## 5. JavaScript

```js
// ─────────────────────────────────────────────────────────────────────────────
// buildCoinEdges — stacks SVG copies along Z to fake medal thickness.
// edgeCount: number of layers   step: px gap between each layer
// ─────────────────────────────────────────────────────────────────────────────
function buildCoinEdges(coinSelector, edgeCount = 34, step = 1.2) {
  const coinEl = document.querySelector(coinSelector);
  if (!coinEl) return;

  // Remove any old edges (makes this safe to call again on resize/HMR)
  coinEl.querySelectorAll('.coin-edge').forEach(e => e.remove());

  for (let i = 0; i < edgeCount; i++) {
    const edge = document.createElement('div');
    edge.classList.add('coin-edge');

    const img = document.createElement('img');
    img.src = '/medal-edge.svg';   // solid textless silhouette — safe from both sides
    img.alt = '';
    edge.appendChild(img);

    const offset = (i - edgeCount / 2) * step;
    edge.style.transform = `translateZ(${offset}px)`;
    coinEl.appendChild(edge);
  }

  // Push the front + back faces out past the ends of the edge stack so they cap it
  const maxOffset = (edgeCount / 2) * step;
  const front = coinEl.querySelector('.coin-front');
  const back  = coinEl.querySelector('.coin-back');
  if (front) front.style.transform = `rotateY(0deg) translateZ(${maxOffset}px)`;
  if (back)  back.style.transform  = `rotateY(180deg) translateZ(${maxOffset}px)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// initMedallion — thickness, click-to-flip, mouse tilt + shimmer tracking
// ─────────────────────────────────────────────────────────────────────────────
function initMedallion() {
  const medalScene = document.getElementById('medal-scene');
  const medalCoin  = document.getElementById('medal-coin');
  const shimmerEl  = document.getElementById('medal-shimmer');
  if (!medalScene || !medalCoin) return;

  // Build the 3D thickness
  buildCoinEdges('#medal-coin', 34, 1.2);

  // ── Click to flip ─────────────────────────────────────────────────────────
  medalScene.addEventListener('click', () => {
    medalCoin.classList.toggle('is-flipped');
  });

  // ── Mouse tilt + shimmer ──────────────────────────────────────────────────
  const MAX_TILT = 25;   // degrees at the edge of the element

  medalScene.addEventListener('mousemove', (e) => {
    const rect = medalScene.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    // Normalise cursor offset from element centre: -1 → +1
    const dx = (e.clientX - cx) / (rect.width  / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    // Y inverted so the medal leans *toward* the cursor
    const rx = -Math.max(-1, Math.min(1, dy)) * MAX_TILT;
    const ry =  Math.max(-1, Math.min(1, dx)) * MAX_TILT;
    medalScene.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    // Shimmer mask follows the raw cursor position as a % of the element
    if (shimmerEl) {
      const sx = ((e.clientX - rect.left) / rect.width)  * 100;
      const sy = ((e.clientY - rect.top)  / rect.height) * 100;
      shimmerEl.style.setProperty('--sx', `${sx}%`);
      shimmerEl.style.setProperty('--sy', `${sy}%`);
      shimmerEl.style.opacity = '1';
    }
  });

  medalScene.addEventListener('mouseleave', () => {
    medalScene.style.transform = 'rotateX(0deg) rotateY(0deg)';
    if (shimmerEl) shimmerEl.style.opacity = '0';
  });
}

initMedallion();   // call after the DOM exists
```

---

## 6. Tuning constants

| Constant | Default | Effect |
|---|---|---|
| `perspective` | `1000px` | Lower = more dramatic/distorted 3D. Below ~600px the tilt gets fisheye-ish. |
| `.medal-scene` width/height | `320px / 321px` | Must match your artwork's aspect ratio. |
| `edgeCount` | `34` | Rim smoothness vs. compositing cost. |
| `step` | `1.2` | Px between layers. `edgeCount × step` = total thickness (~40.8px). Raise `step` without raising `edgeCount` and you'll see gaps between slices. |
| `MAX_TILT` | `25` | Degrees of lean at the element edge. |
| `.medal-scene` transition | `0.15s ease-out` | Tilt lag/weight. |
| `.medal-coin` transition | `2.8s ease-in-out` | Flip duration. |
| `mask-size` | `180% 180%` | Shimmer highlight size. |

---

## 7. Gotchas

1. **Never set a CSS `transform` on `.medal-scene` in a stylesheet.** JS writes
   `style.transform` there on every mousemove; a CSS rule on the same element will
   be clobbered or will fight it. Same applies if you later add any JS animation
   library to these elements — pick one writer per element.
2. **`edgeCount × step` must stay coherent with the face offsets.** The faces are
   placed at `(edgeCount / 2) * step`. If you change either constant, the faces
   reposition automatically *because* the code derives `maxOffset` — don't hardcode it.
3. **`medal-edge.svg` must be textless.** Edge layers render from both sides; any
   text or asymmetric detail will appear mirrored when the coin flips.
4. **Don't add `backface-visibility: hidden` to `.coin-edge`.** It will make the rim
   vanish for half the flip.
5. **Fading the medallion:** if you ever need to fade it in/out, wrap it in a plain
   2D `<div>` with no `perspective` and no `preserve-3d`, and animate *that*
   wrapper's opacity. Animating opacity on a `preserve-3d` element flattens the 3D
   context and collapses the coin into a flat image mid-fade.
6. **Touch devices** get no mousemove — the medallion will sit flat with no shimmer.
   Click-to-flip still works. If you need tilt on touch, add a `touchmove` handler
   using `e.touches[0].clientX/Y` with the same math.
7. **`will-change: transform`** on `.medal-scene` can help if the tilt stutters, but
   34 stacked layers already occupy a fair amount of compositor memory — measure
   before adding it.

---

## 8. Verify it works

- Medallion renders at full size, front face visible, with a visible rim thickness
  when you tilt it off-axis.
- Moving the mouse over it leans it toward the cursor, max ~25°, with a slight lag.
- A warm highlight tracks the cursor across the face and fades out on mouse-leave.
- Clicking flips it over ~2.8s; the back face is correct (not mirrored), and the
  rim stays visible through the whole rotation.
- Moving the mouse off it returns it to flat.
