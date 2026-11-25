# SwAgents — an Anima skill

Anima figures are built through a single prompt. This file describes the workflow you should follow when creating or editing a figure.

## Quick start

1. Decide size: **Figure** (~30–90 min), **Hero** (~2–4 h), or **Epic** (>6 h). For Epic, propose a Hero version first.
2. Collect sources for every number you plan to show. Write them alongside the data.
3. Sketch the anatomy and label every structure before you touch geometry.
4. Code the model as a small pure module; drive motion and readouts from it.
5. Build the static SVG page (`node kit/smoke.mjs` or `node examples/<name>/build.mjs`).
6. Test with `node kit/audit.mjs` and open both themes at 4× zoom.

## File layout

```
anima/
├── ani/             .ani reference package (JSON Schema + runtime)
│   ├── schema/      JSON Schema drafts
│   └── src/         JS source + bin/ani.js CLI
├── examples/        biology figures (each has build.mjs → *.html + *-light.html)
├── kit/             smoke test + helpers
├── scripts/         audit, capture, drive, inline-kit…
├── references/      craft guides (3d, bio, molecular, webgl…)
├── CHANGELOG.md     keep a line under Unreleased for every PR
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md  how to contribute
├── README.md
└── SKILL.md         ← you are reading an extracted copy
```

## Git workflow

```sh
git clone https://github.com/Garinmckayl/anima.git
cd anima
# build everything once
node kit/smoke.mjs && for d in examples/*/; do node "$d/build.mjs" --light; done
# commit
git add -A
git commit -m "Add <example-name>"
git push origin <branch>
gh pr create --fill
```

### Branching

Use descriptive branches: `feat/cas9-zipper`, `fix/dopamine-colour`, `docs/update-sources`.
Keep one change per branch. Push early; CI runs on push.

### Commit messages

Present-tense imperative, max ~72 chars, subject only for trivial changes. Use body + footer when needed.

```
Add crispr-cas9 R-loop zipper animation

Show HNH domain docking, seed-mismatch toggle, blunt cut −3 nt.
Sources: PMID 24733385, PMID 23263965, PMID 22745000.
Refs: references/molecular.md
```

### PR checklist

- [ ] Only touched what the title says
- [ ] Both `*.html` and `*-light.html` rebuild byte-identical
- [ ] Sources updated wherever new numbers appear
- [ ] `CHANGELOG.md` has an Unreleased line
- [ ] Visual diff attached for any figure change

## Common pitfalls

- Invented anatomy or unsourced numbers → reject
- Overlapping pipes / cables → geometry fix needed, not key-bias fix
- Shaders that pop → use envelope with attack + decay
- Comments in code → remove; put explanation in names
- Light theme broken → tokens missing, wrong alpha mode, `screen` instead of normal premultiplied
