# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `sunflower-bend`, a live figure of BendLab's two-state phototropism model (sensing lag, saturating bend rate), with parameter sliders, a flip-the-light option and a trajectory chart that shows when the rate limit cannot be read from the data, and three fitted presets supplied by BendLab's author. Credited to BendLab, with a link to its repository.

## [0.1.0] - 2026-10-13

### Added

- Renamed the project to Anima (skill `anima`, command `/anima`), with the landing page served from `anima.arcumet.com`.
- Four pharmacology and neuroscience figures: `dopamine-receptors` (D1 and D2 signalling), `stimulants-dat` (cocaine and amphetamine at the dopamine transporter), `reward-addiction` (the mesolimbic pathway and a repeated-exposure model) and `semaglutide-glp1` (a GLP-1 receptor agonist on a pancreatic beta cell).
- `estrogen-aggression`, which follows testosterone through aromatase to estrogen receptor α and states the weak human evidence plainly.
- A `record` action in `scripts/drive.mjs` that writes evenly spaced frames, and `scripts/make-demo.mjs`, which records every figure and encodes `assets/demo.mp4` and `assets/demo.gif`.
- A 35-second launch video (`assets/anima-launch.mp4`), rendered with HyperFrames from recordings of the figures.
- A landing page (`index.html`), thumbnails and a social preview image in `assets/`.
- Evaluation prompts for the new figures, and pharmacology guidance for drugs of abuse and incretin figures.

### Changed

- The example set is now biology only. The mechanical examples are no longer shipped; the reference guides describe them instead.
- CI builds every example in both themes and checks that the committed pages are unchanged.
- The README, CONTRIBUTING guide and issue template describe the biology examples.
- The README gallery links to the live pages, adds badges and more prompts, and tones down the star calls to action.

### Removed

- The mechanical examples (arcade cabinet, desk computer, dial indicator, rocket engine, ripple tank, spot plate, test rig, turning dial) and the test-rig walkthrough.

## Earlier

- Adapted the skill for sourced visualizations of anatomy, neurobiology, pharmacology, cell biology and molecular biology, with organic, branching and molecular drawing primitives, a biology-specific audit, domain references and a neuron action-potential example.
