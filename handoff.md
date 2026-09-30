# Long Service Award Overlay · Handoff

**The developer handoff is [handoff/README.md](handoff/README.md).** It covers
what ships, how to put it on Liferay, the per-user data, the CSP, safety, and
how the code is laid out. The `handoff/` folder is what the Liferay team gets.

## Working in this repo

- **Shipped files** live in the root: `lsa-experience.js`,
  `lsa-experience.css`, `lsa-mount.html` and `assets/`. `handoff/` holds
  copies. After changing a root file, copy it into `handoff/` again.
- **Demo:** `node .claude/serve.js . 8126`, then
  `http://localhost:8126/lsa-demo.html?years=50` (or `&name=Priya`). Live at
  https://akhilpokle.github.io/sra/?years=50.
- **Regression checker:** `lab/regression/index.html`. It runs the saved
  version in `lab/regression/before/` against the current files with the same
  random numbers and compares them frame by frame at 5, 25 and 50 years. To
  make a new baseline after an intended change, copy the current
  `lsa-experience.js` and `lsa-experience.css` into `lab/regression/before/`
  and delete the old `fireworks-engine-2.js` there.
- **Fireworks lab:** frozen. `lab/fireworks-lab-2.html` runs its own copy of
  the old engine, `lab/fireworks-engine-2.js`, and is no longer connected to
  the overlay. Git tag `lab-freeze` marks the last version where the two were
  shared.
- **Old assets** that nothing loads are in `assets/_old/`.

## History

`progress.md` is the narrative log. The long version of this file, with every
design decision up to 2026-09-30, is in git at tag `lab-freeze`
(`git show lab-freeze:handoff.md`).
