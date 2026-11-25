# Swarm Agents — Working Guide for Anima

This document summarizes the repository layout and gives autonomous coding agents the rules and patterns they need to work inside this project without human direction.

## Directory Layout

| Path | Purpose |
|---|---|
| `ani/` | Core engine: the `.ani` schema, renderer, validator, patcher, CLI (`bin/ani.js`), export pipeline and tests. Only directory with npm deps (Ajv). |
| `kit/` | Drawing primitives and utilities shared by every figure. Includes WebGL glue (`gl.mjs`, `gl-shared.mjs`), isometric scene kit (`iso-kit.mjs`, `tube.mjs`, `branch.mjs`, `lathe.mjs`, `blob.mjs`), canvas painter, chemistry helpers (`chem.mjs`), and build/audit scripts (`turn.mjs`, `turn-build.mjs`, `audit.mjs`, `bio-audit.mjs`, `turn-audit.mjs`, `turn-fixed.mjs`). Also ships a small React subset under `kit/react/`. |
| `examples/` | The eight shipped biological figures. Each sub-folder holds a single `build.mjs` that writes a standalone HTML page. Add `--light` for the light theme. Examples are committed after building. |
| `scripts/` | CI and developer tooling: `capture.mjs` (screenshot suite), `drive.mjs` (scripted interactions), `lines.mjs` (line-end audit), `turn-check.mjs` / `turn-bench.mjs` (3D checks), `smoke.mjs` (fast sanity run), `inline-kit.mjs` (bundles kit into a figure at build time). |
| `references/` | Domain guides and style docs (`bio.md`, `craft.md`, `neuro.md`, `molecular.md`, `pharma.md`, `kinetics.md`, `react.md`, `verify.md`, `3d.md`, `webgl.md`, `kit.md`). Used as context when generating or auditing biology figures. |
| `assets/` | Thumbnails, demo GIF/MP4 and the Anilogy domain CNAME. |
| `evals/` | Evaluation harnesses for automated quality scoring. |
| `.github/workflows/` | CI pipelines (`ci.yml` builds all examples, `ani.yml` runs `ani/` tests). |

### Key Files

- `SKILL.md` — The master prompt the agent follows. It defines the creative workflow, accuracy rules, representation choices (literal vs metaphor) and the end-to-end process from sizing to verification. **Read first.**
- `ani/SPEC.md` — The `.ani` format specification (v0.1 draft). Every `.ani` document must conform to this schema. Contains the identity, evidence, behaviour, editing contract and design notes.
- `ani/src/index.js` → `renderSvg()` + `exportHtml()` → public API entry point.
- `ani/src/runtime.js` — Declarative runtime (clock, variables, bindings, controls).
- `ani/src/render.js` — SVG scene renderer, theme palette, depth order.
- `ani/src/validate.js` — AJV-driven JSON Schema validation + semantic checks.
- `ani/src/expr.js` — Expression evaluator (typed JSON AST, no side effects, depth ≤ 24, nodes ≤ 256).
- `ani/src/patch.js` — Atomic RFC 6902 JSON Patch application with stale-base rejection and scope-hash tracking.
- `ani/src/review.js` — Provenance / review management (source-support, scientific-accuracy).
- `ani/bin/ani.js` — CLI commands: `validate`, `hash`, `report`, `patch`, `render`, `export`.
- `CONTRIBUTING.md` — Human-facing contribution guide; mirrors many house rules found in SKILL.md.

## Rules for Autonomous Agents

### Code Style

1. **No comments in code.** Not headers, not inline notes, not JSDoc. Put explanations in names and structure. Tool directives like `"use client"` are not comments and may stay.
2. **Zero runtime dependencies** outside `ani/`. The kit and examples use only Node built-ins and browser APIs.
3. **Both themes always work.** Every colour token carries a `dark` override and a `light` base. Build with `--light` and verify both pages look correct.
4. **Kit changes are opt-in.** Any change to `kit/` must preserve existing behaviour by default. Every example must rebuild byte-identical. If a change intentionally alters a figure, document it and commit the rebuilt pages.

### Biological Accuracy

5. **Sources first.** Every number on screen must be traceable to a citation in the caption or a sources block. No inferred precision. Omit unverifiable numbers rather than rounding them.
6. **Literal anatomy preferred.** Draw recognisable structures. Mechanical metaphors are allowed only when labelled as such and never confused with real biology.
7. **State uncertainty.** Separate what is established from what is a leading model. Distinguish rodent from human work. When human evidence is weak, say so explicitly.
8. **Educational, never advice.** Drug figures explain mechanism only—no doses, routes, schedules or recommendations.

### Workflow

9. **Size it first.** Tell the user which size (Figure / Hero / Epic) applies and estimate time before any other work. Figure = one mechanism (~30–90 min); Hero = dense object (~2–4 h); Epic = multi-scale system (6+ h; propose a Hero version unless the user insists).
10. **Parts list before geometry.** List structures, molecules, channels, ligands and dynamic elements. Decide literal vs metaphor. This determines everything downstream.
11. **Build early.** Have a working page that opens in the browser within the first hour of work; deepen it incrementally.
12. **Verify at 4×.** Zoom to 4× and check every joint, line end, label target and shader transition against the source. Attach screenshots in both themes.

### File & Build Conventions

13. **Adding an example.** Create a folder under `examples/<name>/` with `build.mjs` that writes `<name>.html` and `<name>-light.html` (with `--light`). Register the folder in `SKILL.md`, the README gallery table, and `.github/workflows/ci.yml` build loops. Commit the built HTML files.
14. **Building everything.**
    ```sh
    node kit/smoke.mjs
    for dir in examples/*/; do
      node "${dir}build.mjs"
      node "${dir}build.mjs" --light
    done
    ```
    After a clean build `git status --short` must show nothing unexpected. CI enforces this.
15. **Running the test suite.**
    ```sh
    cd ani && npm ci && npm test
    ```
    Unit tests live under `ani/test/`. They validate schema, rendering equivalence, patch mechanics and CLI output.

### Verification Checklist Before Submitting

- [ ] Every example rebuilds cleanly (`node kit/smoke.mjs` + loop).
- [ ] `git status --short` has no untracked or modified HTML outside intentional changes.
- [ ] All colours are tokens (no literals). Both dark and light pages render correctly.
- [ ] Every displayed number has a visible citation.
- [ ] Shaders never pop (envelopes on attack/decay, crossfades on phase changes, zero-bound at edges).
- [ ] Lines end on strokes, dots or outlines. No dead ends.
- [ ] No overlaps pass through other objects; true depth order proven by the audit.
- [ ] Reduced motion shows a static frame. Keyboard navigation reaches all interactive controls.
- [ ] For 3D figures: `scripts/turn-check.mjs --quick` then full audit passes.

## Quick Reference — Where to Go

| Task | Start Here |
|---|---|
| Generate a new figure | `SKILL.md` (§The one idea, §Workflow) |
| Understand the `.ani` format | `ani/SPEC.md` |
| Implement / modify the engine | `ani/src/` (index → runtime → render → validate → expr → patch) |
| Build a drawing primitive | `kit/` (iso-kit → tube → branch → lathe → blob → canvas-painter) |
| Run capture & drive checks | `scripts/capture.mjs`, `scripts/drive.mjs` |
| Check a 3D figure | `scripts/turn-check.mjs`, `scripts/turn-bench.mjs` |
| Audit line ends | `scripts/lines.mjs`, `kit/audit.mjs`, `kit/bio-audit.mjs` |
| Look up domain knowledge | `references/bio.md`, `references/neuro.md`, `references/pharma.md`, etc. |
| Read the contribution rules | `CONTRIBUTING.md` |
