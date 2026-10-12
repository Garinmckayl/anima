# Contributing to Biology Anatomy

Thank you for helping. Anatomy is judged by how its figures look at 4× zoom, so most of this guide is about checking your work before anyone else does.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need:

- **Node.js 20.10 or later.** Nothing to install: the kit, the build scripts and the checks use only Node's built-in modules.
- **Google Chrome or Chromium** for the browser checks. The scripts find it in the usual places; otherwise set `CHROME_PATH` to the binary.
- **Claude Code**, to try the skill itself.

```sh
git clone https://github.com/Garinmckayl/biology-anatomy.git
cd biology-anatomy
```

To use your working copy as the skill while you change it, link it into your personal skills folder (move any installed copy out of the way first):

```sh
ln -s "$PWD" ~/.claude/skills/biology-anatomy
```

## Building the examples

Each framework-free example is one script that writes standalone pages next to itself. The built pages are committed.

```sh
node kit/smoke.mjs
for dir in examples/*/; do node "${dir}build.mjs"; node "${dir}build.mjs" --light; done
```

Every example builds in seconds.

After a build, `git status --short` must show nothing unless you meant to change a figure. CI runs exactly these commands and then `git diff --exit-code`.

## The checks

Run the ones that match what you touched, and read every PNG they write: open it and look. Put screenshots in `shots/`, which is ignored.

**Geometry audit.** For figures built from pipes, cables or round parts with `A.recorder`. It must end `audit passed`, with every failing line at 0. The biology examples are organic and do not use it; `kit/bio-audit.mjs` checks membrane intersections, label targets and declared scale instead.

**Line ends.** Every seam, rib, tick and pointer must end on a stroke, a dot or an outline. It must print `line ends: 0`; `--out` rings the failures.

```sh
node scripts/lines.mjs examples/neuron/neuron-light.html --out shots/lines-light.png
node scripts/lines.mjs examples/neuron/neuron.html --out shots/lines.png
```

**Capture.** Stills, phone width, hover, keys and 4× close-ups, with WebGL on.

```sh
node scripts/capture.mjs examples/neuron/neuron-light.html --out shots/desk.png
node scripts/capture.mjs examples/neuron/neuron-light.html --out shots/phone.png --width 390
node scripts/capture.mjs examples/neuron/neuron-light.html --out shots/joint.png --zoom 200,80,220,170
node scripts/capture.mjs examples/neuron/neuron-light.html --out shots/still.png --reduced
```

**Drive.** Scripted sessions: move, click, key, wait for a phase, and contact sheets slowed down to catch pops in a shader. `--no-webgl` checks the SVG fallback.

```sh
node scripts/drive.mjs examples/estrogen-aggression/estrogen-aggression.html --actions block.json
```

Anything with `until` or `eval` goes in an actions file. This `block.json` blocks aromatase, waits, and shoots the state:

```json
[
  ["wait", 1500],
  ["eval", "document.getElementById('block').click()"],
  ["wait", 3500],
  ["shot", "shots/blocked.png"]
]
```

**3D figures.** The 3D mode is optional and none of the shipped biology examples use it. If you build one, `scripts/turn-check.mjs` and `scripts/turn-bench.mjs` check fidelity, order, pops, line ends and frame timing. The orbit audit is slow, so iterate with `--quick` and run the full audit in the background; only a full run's `turn audit passed` counts.

[`references/verify.md`](references/verify.md) has every option, the review checklist and the common faults. [`references/3d.md`](references/3d.md) covers the 3D checks.

## House rules

These come from [`SKILL.md`](SKILL.md) and [`references/`](references). A pull request that breaks one will be asked to change.

- **No comments in code.** Not a header, not a note beside a tricky line, not a JSDoc. Put the explanation in names and structure. Tool directives such as `"use client"` are not comments and stay.
- **Kit changes are opt-in.** A change to `kit/` or `scripts/inline-kit.mjs` adds an option or a function whose default is the old behaviour. Every existing example must rebuild byte-identical; CI checks it. If a change is meant to alter a figure, say so in the pull request and commit the rebuilt pages with it.
- **Both themes work, and light ships.** Every colour is a token with a light value and a dark override, never a literal in a figure's CSS or shader. Light shaders are designed for paper (normal premultiplied alpha, never `screen`), not dark glows darkened. Build with `--light` and check both pages.
- **No overlaps.** No pipe or cable passes through anything, at rest, apart or in any frame of a motion. Every crossing is drawn in true depth order, proved by the audit, never tuned by eye. Fix an interlock in the geometry, never with a key bias, and record the true shape of what you draw: a stand-in shape that quiets the audit is a bug.
- **Lines resolve and textures fade.** Every line ends on something. A rib row, bolt circle, seam or rule line ends on a real edge or fades out; it never stops in the middle of a surface. Curved surfaces shade smoothly, with no tone staircase.
- **Shaders never pop.** Every uniform rides an envelope with an attack and a decay, a phase change is a crossfade, and every term reaches zero before any bound or canvas edge. The effect lives in world space in the figure's own camera, and the SVG still reads without WebGL.
- **Sources first.** Every number shown in a biological figure (including size, concentration, membrane potential, rate and dose) has a citation in its caption or sources block. Figures are educational, not medical advice, especially for drugs and dosing.
- **Biological accuracy.** State species, tissue and conditions where relevant; distinguish schematic from measured scale; do not invent unsupported anatomy or imply that a metaphor is literal.
- **Read every PNG.** Look at 4× close-ups of every joint in both themes before you ask for a review.

## Changing the skill's text

`SKILL.md` and `references/` are instructions Claude follows, so keep them short, exact and in the same plain voice. When you change a kit API, update the relevant reference in the same pull request. When you add an example, give it a folder under `examples/` with a `build.mjs` that writes `<name>.html` and, with `--light`, `<name>-light.html`; add it to the list in `SKILL.md`, the table in the README and the build list in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Pull requests

1. Open an issue first for anything larger than a fix, so we can agree on the approach.
2. Fork the repository and branch from `main`.
3. Make one change per pull request.
4. Rebuild every example and confirm that `git status --short` shows only what you meant to change.
5. Run the checks that apply, and attach screenshots in both themes for any visual change.
6. Add a line under `Unreleased` in [`CHANGELOG.md`](CHANGELOG.md).
7. Fill in the pull request template.

CI must pass before a merge.

## Reporting a bug or asking for a figure

Use the [issue forms](https://github.com/wheresryan22/anatomy/issues/new/choose). For a figure that came out wrong, include the prompt, the theme, where the figure lives (HTML, SVG or React), and a screenshot or close-up of the fault.
