# Biology Anatomy

A Claude Code skill for visualizing biology: anatomy, neurobiology, pharmacology and drugs, cell biology, and molecular biology. It shows real biological structures accurately and makes their mechanisms visible, using literal anatomy or a clearly identified mechanical metaphor.

Adapted from the MIT-licensed [Anatomy skill](https://github.com/wheresryan22/anatomy) by [wheresryan22](https://github.com/wheresryan22). See [LICENSE](LICENSE) for copyright notices.

## Install

```sh
npx skills add Garinmckayl/biology-anatomy -g -a claude-code
```

Requires Claude Code and Node.js 20.10 or later. The drawing kit uses only Node built-ins and has zero runtime dependencies. Chrome/Chromium is needed only for the inherited browser-based capture and verification scripts.

## Usage

Ask for a biological subject, the mechanism to explain, the intended audience and output format. Use `/biology-anatomy` in Claude Code:

```text
/biology-anatomy show an action potential traveling along a myelinated axon, with cited membrane-potential values and a live readout; standalone HTML
```

```text
/biology-anatomy visualize a ligand binding a GPCR and show dose versus receptor occupancy, with sources and an educational-use note; dark theme
```

```text
/biology-anatomy make a cutaway of the cardiac cycle showing chamber flow and valve states; cite every quantitative value
```

The skill supports two representations: **literal anatomy**, which depicts biological structures faithfully, and **mechanical metaphor**, such as a receptor–ligand interaction shown as a lock and key. Metaphors must be identified as analogies and must not replace or distort the biology.

## Gallery

| Neuron | Heart | Drug–receptor |
|---|---|---|
| [Preview](examples/neuron/neuron.html) | Placeholder | Placeholder |

## Examples

`examples/neuron/` is the first framework-free biological example. Build either theme with:

```sh
node examples/neuron/build.mjs
node examples/neuron/build.mjs --light
```

The build writes a standalone HTML visualization of a neuron, myelinated axon, saltatory action-potential animation and synapse hover detail. Values are cited in the figure. See `examples/` for inherited kit examples.

## Requirements

- Claude Code for skill invocation.
- Node.js >= 20.10 for build scripts and kit modules.
- Zero runtime dependencies.
- Chrome/Chromium only for the inherited browser-based capture and verification scripts.

## Sources and limits

Every displayed number—including sizes, concentrations, membrane potentials, rates and doses—must cite its source in the figure caption or a sources block. Identify the relevant species, tissue, conditions and units; disclose uncertainty and label schematic scales clearly.

Figures are educational, not medical advice. Drug and dosing visualizations are not prescribing recommendations and must not be used to guide treatment. Biology varies between species, tissues and individuals, and a 2D/isometric illustration cannot capture every spatial relationship. Do not invent unsupported details or present an illustration as a diagnostic or validated scientific tool.

## How it works

- `SKILL.md` defines the workflow, visual standards, sourcing rules and safety limits.
- `kit/` contains the isometric drawing library plus organic forms (`blob.mjs`), branch structures (`branch.mjs`), molecular shapes (`chem.mjs`) and the biology-specific audit.
- `references/` contains general, neurobiology, pharmacology and molecular-biology guidance alongside upstream craft and rendering guides.
- `evals/evals.json` contains representative biology requests.

The original `kit/audit.mjs` remains available for rigid geometry. `kit/bio-audit.mjs` checks membrane intersections, label targets and declared scale consistency for biological figures.

## Credit

The drawing kit, original examples, scripts and craft workflow are adapted from [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy), an MIT-licensed project. Upstream copyright is retained in [LICENSE](LICENSE).

## License

MIT. See [LICENSE](LICENSE).
