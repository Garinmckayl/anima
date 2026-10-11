# Biology visualization

## Start with the biology

Name the organism, tissue, cell type, developmental stage and experimental or physiological context when they affect the explanation. Distinguish established structure from a teaching simplification. Keep each label tied to a real structure, and show causal mechanisms rather than decorative motion.

Choose one of two modes:

- **Literal anatomy:** depict biological structures and their relative arrangement as faithfully as the selected view allows.
- **Mechanical metaphor:** map a process to a familiar mechanism only when it helps. Label the metaphor, preserve the biological explanation, and state where the analogy stops.

## Sources

Use primary research or authoritative references such as curated textbooks, peer-reviewed reviews, NCBI Bookshelf, PubMed records and regulatory product labels. Prefer sources that directly report the depicted structure or measurement. For drugs, use the applicable official label and clinical/pharmacology sources rather than inferring human dosing from a molecular binding value.

Every number shown in the figure, including ranges and model parameters, needs a citation in the caption or a sources block. Record units, conditions and source context next to model values. Do not silently combine measurements from different species, tissues, temperatures, routes or assays. If sources disagree, describe the range and context or omit the number. Do not turn a schematic dimension into an asserted measurement.

## Scale

Declare `unitsPerMicron` whenever geometry is intended to have a biological scale. It means drawing-world units per micrometre. For a structure whose physical dimension is known, calculate its world dimension from that factor and retain the source citation. Keep one scale across a figure unless a clearly marked inset uses a different scale.

If the object cannot fit at a useful size, use an explicit scale break or state “schematic, not to scale.” Never imply that visual size communicates relative abundance, concentration, affinity or clinical importance unless it has been encoded and sourced.

## Visual conventions

- Use a cutaway only when it reveals the relevant structure, and make the cut surface legible.
- Place labels on existing parts; do not create unlabeled structures solely for visual balance.
- Use distinct color sparingly and consistently. Do not rely on color alone to distinguish structures.
- Keep molecular interactions and membrane transport directionally clear. Distinguish binding, gating, transport and downstream signaling.
- Include an educational-use note for clinical or pharmacological subjects. Drug figures are not medical advice.

## Verification

Check that every labeled part exists and is represented by the intended geometry. Run `node kit/bio-audit.mjs` through the exported audit function or the example's check. Confirm that membrane boundaries do not intersect, known dimensions use the declared scale and citations support all displayed values. A passing geometry check does not validate biological accuracy; review the references separately.
