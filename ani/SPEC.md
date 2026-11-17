# .ani format, version 0.1 (draft)

An `.ani` file is UTF-8 JSON describing an **explanatory** scientific figure: the biology, the evidence for it,
how it behaves, and how it is drawn, as separate layers. Any conforming engine can render and play it.
This spec and its reference implementation are open source and do not depend on any hosted product.

## Identification
* Detect by content, never by extension alone (`.ani` is also the Windows animated-cursor extension, a RIFF file).
  A document starts with `{` and has `"format": "ani"` and `"formatVersion": "MAJOR.MINOR.PATCH"`.
* Proposed media type: `application/vnd.anima.ani+json`. (Not registered.)
* A reader that does not implement every entry of `requirements.capabilities` **must refuse** the document and say which
  capability is missing. It must not render an approximation. Documents must declare every capability they use.

## Identity
* IDs match `^[a-z][a-z0-9_]{0,63}$`, so a JSON Pointer never needs escaping. Collections are ID-keyed maps; draw order is an explicit `z`.
* Biology and graphics have separate IDs. `scenes.*.nodes.X.entityId` points at `biology.entities`; an edge points at a `relationshipId`.
  Moving a node changes a drawing. Changing a relationship changes biology.
* Cross-references use structured objects (`{scene, node, shape}`), not path strings.
* Revision: `document.revision` is a counter owned by the engine. The **base hash** is `sha256` of the RFC 8785 (JCS) canonical
  form of the whole document. Patches name the hash they were made against.

## Evidence (three states, never collapsed)
| State | Meaning | Where |
|---|---|---|
| cited | the claim lists `sourceIds` | `evidence.claims.*.sourceIds` |
| source-support reviewed | a person checked the sources say it | `provenance.reviews` (`aspect: source-support`) |
| scientifically reviewed | a person checked the science | `provenance.reviews` (`aspect: scientific-accuracy`) |

`kind` is `established`, `hypothesis` or `illustrative`. Illustrative claims need no source and are shown as illustrative.

**Review scope.** A review records `scopeHash` = hash of: the claim, the entities/relationships/variables it `describes`
(plus the endpoints of described relationships), and the sources it cites. Back-pointers (`claimIds`) and `extensions` are
excluded. Layout, colours, camera, bindings and presentation text are **not** in scope. A review is `current` when the
recomputed hash equals `scopeHash`, `stale` when it differs, `orphaned` when its claim is gone (which is also a validation error).
Patch results list `newlyStaleReviews`.

## Behavior (bounded, declarative, no code)
* Clock: `duration`, `loop`, `initialTime`, `autoplay`, `reducedMotion.time`. Step per frame is capped at 0.1 s.
* Variables: `boolean`, `enum`, `number` (with `min`/`max`). `derived` values are named expressions; cycles are errors.
* Controls: `toggle`, `selector`, `slider`, `playback`, `restart`, `scrubber`. Effects: `setVariable`, `setTime`, `play`, `pause`.
  Automatic `play` never overrides reduced motion; an explicit user play does.
* Expressions are a typed JSON AST: arithmetic, `min max clamp ease sin cos pow round floor`, comparisons, `and or not if`,
  `concat str`, plus `progress`, `time`, `ref`, and (inside a binding with `shapes`) `index`/`count`. Total (non-finite becomes 0),
  side-effect free; depth <= 24, nodes <= 256.
* Bindings drive `visible opacity translateX translateY rotate text attr.{x1,y1,x2,y2,cx,cy,r}` of a node or shape.
* No scripts, network, or file access. Path data and colours are whitelisted; sources must be `https`.
* `explanatory` profile: state changes illustrate declared mechanisms. A moving particle is not a prediction.
  Quantitative simulation is a future profile with explicit equations, units and validation.

## Extensions
Namespaced keys (`vendor.feature`) under `extensions` at the root and on entities, relationships, claims and nodes.
Tools must preserve them when editing.

## Editing contract (for AI and tools)
`validateDocument` returns `[{code, path, message, severity}]`. `applyPatch(doc, jsonPatch, {baseHash})` is RFC 6902, atomic,
rejects stale bases, protects `/format` and `/document/revision`, forbids `__proto__`/`constructor`/`prototype` segments,
and only commits a patch whose result validates. Warnings (unsourced claims, unexplained relationships) never block.

## Not in 0.1
Packaged assets, physical coordinates and units, quantitative simulation, SBML/SBGN import/export, camera, edges' visual
styling, keyboard bindings, a standalone-HTML exporter and SVG renderer (next), signing.

## Design notes
* Canonical JSON: keys sorted by UTF-16 code unit, ECMAScript number serialization, no insignificant whitespace (RFC 8785).
* `ease(x)` is `t*t*(3-2t)` with `t = clamp(x, 0, 1)`. Division and power results that are not finite become 0 so every document evaluates.
* A selector option's effects run after its variable is set. `restart` runs only its own `effects`.
* A binding with `shapes` evaluates once per listed shape, with `index` from 0 and `count` the list length.
* Absent `fill` or `stroke` on a shape means `none`, not the SVG default of black.
* Palette tokens carry a `dark` and a `light` value; the renderer picks by theme.
* Shapes inside a node are an ordered list and may carry an optional `id` for bindings; everything else is an ID-keyed map.
