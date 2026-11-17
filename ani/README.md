# Anima `.ani` (draft 0.1)

Reference implementation of the `.ani` scientific document format. **Open source. No dependency on any hosted product.**

| | |
|---|---|
| `schema/ani-0.1.schema.json` | public structural contract (JSON Schema 2020-12) |
| `src/` | validate, patch (atomic, hash-based), evidence/review staleness, headless behavior runtime |
| `examples/crispr-cas9.ani` | the CRISPR-Cas9 figure converted from its HTML original |
| `tools/convert_crispr.py` | one-off migration from `examples/source/crispr-cas9.source.html`; every change it makes is listed in the output's `provenance.notes` |
| `tools/capture_oracle.mjs` | records the *original* figure's rendered state in Chrome (`CHROME_PATH` or a Playwright Chromium) |
| `test/` | 24 tests incl. equivalence against the recorded original |

    npm install && npm test

## Boundary with hosted products
Hosted products are consumers of this package, never dependencies of it. Accounts, billing, storage, model calls and
product-only primitives live in the product and attach through namespaced `extensions` and `provenance.createdBy`.
Nothing here imports from or calls out to a hosted service. Anything a third party needs to open, edit, validate or
play a document must be in this repository.

## Open decisions
* Licensed MIT with the rest of this repository. A separate spec licence (for example CC-BY) can be chosen before 0.1 is final.
* `"format": "ani"` is a single string; change it before 0.1 is published, not after.
* Documents in `examples/` carry no `license` field until their owner sets one.
* Unlike the rest of this repository, `ani/` has one runtime dependency (Ajv, for the JSON Schema). It is isolated: nothing outside `ani/` uses it, and CI for it is a separate path-filtered workflow.

## Equivalence test
`test/fixtures/crispr-oracle.json` holds 418 states recorded from the original HTML figure by driving its own slider and fidelity
buttons. The runtime must reproduce every readout, transform and opacity. Opacities read from `element.style` are serialized by
browsers to 6 decimals, so they are compared at 1e-6; attributes are compared at 1e-9.
