#!/usr/bin/env python3
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()
svg_text = re.search(r'<svg id="stage-svg".*?</svg>', html, re.S).group(0)
svg = ET.fromstring(svg_text)

def num(v):
    f = float(v)
    return int(f) if f == int(f) else round(f, 4)

def nid(s):
    return s.replace("-", "_")

TOKENS = {"anatomy-strong": "strong", "anatomy-text": "text", "pam-rose": "pam_rose", "anatomy-halo": "halo"}

def paint(v):
    if v is None:
        return None
    v = v.strip()
    m = re.fullmatch(r"url\(#([\w-]+)\)", v)
    if m:
        return {"gradient": nid(m.group(1))}
    m = re.fullmatch(r"var\(--([\w-]+)\)", v)
    if m:
        return {"token": TOKENS[m.group(1)]}
    return v

def common(a, keys):
    o = {}
    if "id" in a:
        o["id"] = nid(a["id"])
    for k in keys:
        pass
    return o

def style_attrs(a, o, fill=True, stroke=True):
    if fill and "fill" in a:
        o["fill"] = paint(a["fill"])
    if stroke and "stroke" in a:
        o["stroke"] = paint(a["stroke"])
    if "stroke-width" in a:
        o["strokeWidth"] = num(a["stroke-width"])
    if "stroke-opacity" in a:
        o["strokeOpacity"] = num(a["stroke-opacity"])
    if "stroke-linecap" in a:
        o["linecap"] = a["stroke-linecap"]
    if "stroke-dasharray" in a:
        o["dash"] = [num(x) for x in a["stroke-dasharray"].split()]
    if "opacity" in a:
        o["opacity"] = num(a["opacity"])
    if a.get("filter") == "url(#glow-filter)":
        o["effect"] = "glow"

def shape(el):
    a, t = el.attrib, el.tag
    assert "transform" not in a, f"unexpected transform on {a.get('id')}"
    o = {"type": t}
    if "id" in a:
        o["id"] = nid(a["id"])
    if t == "path":
        o["d"] = re.sub(r"\s+", " ", a["d"]).strip()
        style_attrs(a, o)
    elif t == "circle":
        o.update(cx=num(a["cx"]), cy=num(a["cy"]), r=num(a["r"]))
        style_attrs(a, o)
    elif t == "ellipse":
        o.update(cx=num(a["cx"]), cy=num(a["cy"]), rx=num(a["rx"]), ry=num(a["ry"]))
        style_attrs(a, o)
    elif t == "line":
        o.update(x1=num(a["x1"]), y1=num(a["y1"]), x2=num(a["x2"]), y2=num(a["y2"]))
        style_attrs(a, o, fill=False)
    elif t == "polyline":
        o["points"] = [[num(x) for x in p.split(",")] for p in a["points"].split()]
        style_attrs(a, o, fill=False)
        assert a.get("fill") == "none", "polyline fill must be none"
    elif t == "rect":
        o.update(x=num(a["x"]), y=num(a["y"]), width=num(a["width"]), height=num(a["height"]))
        if "rx" in a:
            o["rx"] = num(a["rx"])
        style_attrs(a, o)
    elif t == "text":
        o.update(x=num(a["x"]), y=num(a["y"]), text=(el.text or "").strip())
        o["size"] = num(a.get("font-size", "10"))
        o["fill"] = paint(a.get("fill")) or {"token": "text"}
        if a.get("font-weight") == "bold":
            o["weight"] = "bold"
        if "text-anchor" in a:
            o["anchor"] = a["text-anchor"]
        if "opacity" in a:
            o["opacity"] = num(a["opacity"])
    else:
        raise ValueError(f"unhandled element {t}")
    return o

def flatten(g, rungs):
    shapes = []
    for ch in g:
        if ch.tag == "g":
            if ch.get("id") == "hybrid-basepairs":
                shapes.extend(rungs)
            else:
                shapes.extend(flatten(ch, rungs))
        else:
            shapes.append(shape(ch))
    return shapes

gradients = {}
for gr in svg.find("defs"):
    if gr.tag not in ("linearGradient", "radialGradient"):
        continue
    pct = lambda v: round(float(v.rstrip("%")) / 100, 4)
    g = {"kind": "linear" if gr.tag == "linearGradient" else "radial", "stops": []}
    a = gr.attrib
    if g["kind"] == "linear":
        g["from"] = [pct(a["x1"]), pct(a["y1"])]
        g["to"] = [pct(a["x2"]), pct(a["y2"])]
    else:
        g["center"] = [pct(a["cx"]), pct(a["cy"])]
        g["radius"] = pct(a["r"])
    for s in gr:
        st = {"offset": pct(s.get("offset")), "color": paint(s.get("stop-color"))}
        if "stop-opacity" in s.attrib:
            st["opacity"] = num(s.get("stop-opacity"))
        g["stops"].append(st)
    gradients[nid(a["id"])] = g

palette = {
    "strong": {"dark": "#ebebf5", "light": "#111827"},
    "text": {"dark": "#9e9ea8", "light": "#4b5563"},
    "pam_rose": {"dark": "#f43f5e", "light": "#e11d48"},
    "halo": {"dark": "#06060a", "light": "#d1d5db"},
}

def bez(p0, p1, p2, p3, u):
    v = 1 - u
    return [v**3 * p0[i] + 3 * v * v * u * p1[i] + 3 * v * u * u * p2[i] + u**3 * p3[i] for i in (0, 1)]

def along(segs, u):
    k = min(int(u * len(segs)), len(segs) - 1)
    return bez(*segs[k], u * len(segs) - k)

TS = [((270, 350), (310, 320), (360, 250), (440, 240)), ((440, 240), (520, 230), (600, 200), (680, 180))]
RNA = [((275, 340), (315, 310), (365, 240), (445, 230)), ((445, 230), (525, 220), (605, 190), (685, 170))]
rungs = []
for i in range(20):
    u = (i + 0.5) / 20
    (x1, y1), (x2, y2) = along(TS, u), along(RNA, u)
    rungs.append({"type": "line", "id": f"rung_{i + 1:02d}", "x1": round(x1, 1), "y1": round(y1, 1),
                  "x2": round(x2, 1), "y2": round(y2, 1), "stroke": "#fde68a", "strokeWidth": 1.4, "strokeOpacity": 0.9})

NODE_MAP = {
    "rec-lobe-group": ("rec_lobe", "rec_lobe", "figure"),
    "bridge-helix": ("bridge_helix", "bridge_helix", "figure"),
    "pi-domain": ("pi_domain", "pi_domain", "figure"),
    "ruvc-domain": ("ruvc_domain", "ruvc_domain", "figure"),
    "distal-dna-stem": ("distal_dna", "distal_dna", "figure"),
    "pam-dna-flank": ("pam_region", "pam_motif", "figure"),
    "nts-strand-group": ("non_target_strand", "non_target_strand", "figure"),
    "heteroduplex-group": ("heteroduplex", "r_loop", "figure"),
    "grna-scaffold-group": ("grna_scaffold", "sgrna", "figure"),
    "hnh-domain-group": ("hnh_domain", "hnh_domain", "figure"),
    "hud-measuring-line": ("hud_measuring_line", None, "annotation"),
    "cleavage-products": ("cleavage_products", None, "figure"),
    "leaders-group": ("callouts", None, "annotation"),
}
nodes, descriptions = {}, {}
z = 0
for ch in svg:
    if ch.tag == "defs":
        continue
    z += 10
    if ch.tag == "ellipse":
        nodes["floor_halo"] = {"role": "decoration", "z": z, "shapes": [shape(ch)]}
        continue
    node_id, entity, role = NODE_MAP[ch.get("id")]
    n = {"role": role, "z": z, "shapes": flatten(ch, rungs)}
    if entity:
        n["entityId"] = entity
    if ch.get("data-label"):
        n["label"] = ch.get("data-label")
        descriptions[entity] = (ch.get("data-label"), ch.get("data-desc"))
    if "opacity" in ch.attrib:
        n["opacity"] = num(ch.get("opacity"))
    if node_id == "hnh_domain":
        n["transformOrigin"] = [438, 275]
    nodes[node_id] = n

for nn in ("heteroduplex", "non_target_strand"):
    for s in nodes[nn]["shapes"]:
        if s.get("id") in ("ts_flash", "nts_flash"):
            s.update(stroke="#ffffff", strokeWidth=2.5)

def D(entity):
    return descriptions[entity][1]

entities = {
    "cas9": {"kind": "complex", "label": "SpCas9–sgRNA–DNA complex", "species": "Streptococcus pyogenes", "claimIds": ["c_structure_basis"],
             "description": "Streptococcus pyogenes Cas9 in complex with single-guide RNA and target DNA, as modelled in this figure."},
    "rec_lobe": {"kind": "protein-domain", "label": "REC Lobe", "partOf": "cas9", "description": D("rec_lobe"), "claimIds": ["c_rec_lobe"]},
    "bridge_helix": {"kind": "protein-domain", "label": "Bridge Helix (BH)", "partOf": "cas9", "description": D("bridge_helix"), "claimIds": ["c_bridge_helix"]},
    "pi_domain": {"kind": "protein-domain", "label": "PAM-Interacting (PI) Domain", "partOf": "cas9", "description": D("pi_domain"), "claimIds": ["c_pam_recognition"]},
    "ruvc_domain": {"kind": "protein-domain", "label": "RuvC Domain", "partOf": "cas9", "description": D("ruvc_domain"), "claimIds": ["c_catalytic_cleavage"]},
    "hnh_domain": {"kind": "protein-domain", "label": "HNH Nuclease Domain", "partOf": "cas9", "description": D("hnh_domain"), "claimIds": ["c_rloop_allostery", "c_catalytic_cleavage"]},
    "sgrna": {"kind": "rna", "label": "gRNA Scaffold / tracrRNA", "description": D("sgrna"), "claimIds": ["c_scaffold"]},
    "target_strand": {"kind": "dna", "label": "Target strand (TS)", "description": "DNA strand complementary to the guide RNA spacer; cleaved by the HNH domain.", "claimIds": ["c_catalytic_cleavage"]},
    "non_target_strand": {"kind": "dna", "label": "Non-Target Strand (NTS)", "description": D("non_target_strand"), "claimIds": ["c_catalytic_cleavage"]},
    "pam_motif": {"kind": "dna", "label": "PAM Region (5'-NGG-3')", "description": D("pam_motif"), "claimIds": ["c_pam_recognition"]},
    "distal_dna": {"kind": "dna", "label": "PAM-Distal Target DNA", "description": D("distal_dna")},
    "r_loop": {"kind": "complex", "label": "RNA:DNA Heteroduplex (R-Loop)", "description": D("r_loop"), "claimIds": ["c_rloop_allostery"]},
    "seed_mismatch": {"kind": "condition", "label": "PAM-proximal seed mismatch", "description": "Mismatch between guide and target within the PAM-proximal seed region.", "claimIds": ["c_seed_mismatch"]},
}
relationships = {
    "pam_recognition": {"kind": "binds", "source": "pi_domain", "target": "pam_motif", "claimIds": ["c_pam_recognition"]},
    "r_loop_formation": {"kind": "hybridizes", "source": "sgrna", "target": "target_strand", "claimIds": ["c_rloop_formation"]},
    "rloop_activates_hnh": {"kind": "activates", "source": "r_loop", "target": "hnh_domain", "claimIds": ["c_rloop_allostery"]},
    "hnh_cleaves_ts": {"kind": "cleaves", "source": "hnh_domain", "target": "target_strand", "claimIds": ["c_catalytic_cleavage"]},
    "ruvc_cleaves_nts": {"kind": "cleaves", "source": "ruvc_domain", "target": "non_target_strand", "claimIds": ["c_catalytic_cleavage"]},
    "mismatch_blocks_hnh": {"kind": "inhibits", "source": "seed_mismatch", "target": "hnh_domain", "claimIds": ["c_seed_mismatch", "c_mismatch_illustration"]},
}

sources = {
    "anders2014": {"type": "structure-entry", "title": "Crystal structure of Cas9 bound to PAM-containing DNA target", "authors": ["Anders C", "Niewoehner O", "Duerst A", "Jinek M"],
                   "year": 2014, "pdb": "4UN3", "metadataStatus": "verified",
                   "note": "Entry title, depositors and ID checked against the RCSB record. The original figure attributed 4UN3 to Nishimasu et al., Cell 2014."},
    "jiang2016": {"type": "article", "title": "Structures of a CRISPR-Cas9 R-loop complex primed for DNA cleavage", "authors": ["Jiang F et al."], "container": "Science", "year": 2016,
                  "pdb": "5F9R", "metadataStatus": "unchecked", "note": "Cited by the original figure as 'Jiang et al., Science 2016'. Bibliographic fields not independently checked."},
    "sternberg2015": {"type": "article", "title": "Conformational control of DNA target cleavage by CRISPR-Cas9", "authors": ["Sternberg SH et al."], "container": "Nature", "year": 2015,
                      "pmid": "26524520", "metadataStatus": "unchecked",
                      "note": "Replaces 'Sternberg et al., Nature 2014' cited by the original figure, which is the DNA-interrogation paper. Title and PMID were seen in a search result; journal and authors not checked."},
    "dagdas2017": {"type": "article", "title": "A conformational checkpoint between DNA binding and cleavage by CRISPR-Cas9", "authors": ["Dagdas YS", "Chen JS", "Sternberg SH", "Doudna JA", "Yildiz A"],
                   "container": "Science Advances", "year": 2017, "doi": "10.1126/sciadv.aao0027", "pmid": "28808686", "metadataStatus": "verified",
                   "note": "The original figure said 'Science 2017'. Checked against PubMed: Sci Adv 3(8):eaao0027."},
    "szczelkun2014": {"type": "article", "title": "Direct observation of R-loop formation by single RNA-guided Cas9 and Cascade effector complexes", "authors": ["Szczelkun MD et al."],
                      "container": "PNAS", "year": 2014, "metadataStatus": "unchecked", "note": "Cited by the original figure as 'Szczelkun et al., PNAS 2014'. Title from memory; not checked."},
    "jinek2012": {"type": "article", "title": "A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity", "authors": ["Jinek M et al."],
                  "container": "Science", "year": 2012, "doi": "10.1126/science.1225829", "metadataStatus": "unchecked", "note": "Cited by the original figure as 'Jinek et al., Science 2012'."},
}
SP = {"species": "Streptococcus pyogenes"}
claims = {
    "c_structure_basis": {"statement": "The figure models S. pyogenes Cas9 in complex with single-guide RNA and target DNA, based on PDB entries 4UN3 and 5F9R.", "kind": "established",
                          "describes": [{"type": "entity", "id": "cas9"}], "sourceIds": ["anders2014", "jiang2016"], "locators": {"anders2014": "PDB 4UN3", "jiang2016": "PDB 5F9R"},
                          "context": {**SP, "method": "X-ray crystallography"},
                          "limitations": ["A schematic drawing is not a structural model; domain shapes and positions are stylized."]},
    "c_rec_lobe": {"statement": "The recognition lobe (REC1–REC3) is an alpha-helical scaffold that wraps around the 20-bp guide RNA:target DNA heteroduplex.", "kind": "established",
                   "describes": [{"type": "entity", "id": "rec_lobe"}], "sourceIds": [], "context": SP},
    "c_bridge_helix": {"statement": "The bridge helix is a conserved arginine-rich alpha-helix (Arg63–Lys94) that initiates DNA unwinding upon target interrogation.", "kind": "established",
                       "describes": [{"type": "entity", "id": "bridge_helix"}], "sourceIds": [], "context": SP},
    "c_pam_recognition": {"statement": "The PAM-interacting domain reads the 5'-NGG-3' protospacer adjacent motif in the major groove of target DNA via Arg1333 and Arg1335.", "kind": "established",
                          "describes": [{"type": "entity", "id": "pi_domain"}, {"type": "entity", "id": "pam_motif"}, {"type": "relationship", "id": "pam_recognition"}], "sourceIds": [], "context": SP,
                          "limitations": ["The original figure gave no citation for this statement. 4UN3 is the PAM-complex structure and is a likely source, but no attribution is made here."]},
    "c_scaffold": {"statement": "The crRNA:tracrRNA scaffold forms a repeat:anti-repeat duplex with tetraloop and stem loops 1–3, accommodated on the REC surface.", "kind": "established",
                   "describes": [{"type": "entity", "id": "sgrna"}], "sourceIds": [], "context": SP},
    "c_rloop_formation": {"statement": "The guide RNA spacer base-pairs with the target strand over 20 nucleotides, displacing the non-target strand to form an R-loop.", "kind": "established",
                          "describes": [{"type": "relationship", "id": "r_loop_formation"}, {"type": "entity", "id": "non_target_strand"}], "sourceIds": [], "context": SP},
    "c_rloop_allostery": {"statement": "Complete 20-nt R-loop propagation acts as an allosteric switch that moves the HNH domain (about 180° rotation, about 30 Å) from an inactive checkpoint conformation onto the target-strand scissile phosphate.",
                          "kind": "established", "describes": [{"type": "entity", "id": "hnh_domain"}, {"type": "entity", "id": "r_loop"}, {"type": "relationship", "id": "rloop_activates_hnh"}],
                          "sourceIds": ["sternberg2015", "dagdas2017"], "context": {**SP, "method": "single-molecule FRET; cryo-EM (as stated by the original figure)"},
                          "limitations": ["Sources were changed from the original figure's citations (see sources[].note); whether they support the specific magnitudes (about 180°, about 30 Å) has not been checked."]},
    "c_seed_mismatch": {"statement": "Mismatches in the PAM-proximal seed region (positions 1–8) stall R-loop propagation, prevent REC3 distortion and trap HNH in an inactive state, which prevents cleavage.", "kind": "established",
                        "describes": [{"type": "entity", "id": "seed_mismatch"}, {"type": "relationship", "id": "mismatch_blocks_hnh"}], "sourceIds": ["szczelkun2014"], "context": SP,
                        "limitations": ["The cited paper is about R-loop formation; whether it supports the REC3 and HNH-trapping part of the statement is unchecked. The original text also says this 'terminates off-target DNA cleavage', which is a stronger claim than 'prevents cleavage in this state'."]},
    "c_catalytic_cleavage": {"statement": "RuvC (Asp10, Glu762, His983, Asp986) cleaves the non-target strand and HNH (Asp839, His840, Asn863) cleaves the target strand, each 3 nt from the PAM, producing a blunt double-strand break.", "kind": "established",
                             "describes": [{"type": "relationship", "id": "ruvc_cleaves_nts"}, {"type": "relationship", "id": "hnh_cleaves_ts"}], "sourceIds": ["jinek2012"], "context": SP,
                             "limitations": ["Per-residue assignments (for example His983 and Asn863) were not checked against the cited source."]},
    "c_mismatch_illustration": {"statement": "In this figure a seed mismatch limits pairing to 6 of 20 nucleotides and keeps HNH undocked; the extent of pairing is a teaching simplification.", "kind": "illustrative",
                                "describes": [{"type": "relationship", "id": "mismatch_blocks_hnh"}], "sourceIds": []},
    "c_timeline_illustration": {"statement": "The 9 s timeline and its phases (pairing from 8% to 56%, HNH docking from 52% to 76%, cleavage after 82%) form a teaching sequence, not measured kinetics.", "kind": "illustrative",
                                "describes": [], "sourceIds": []},
}

def ref(i): return {"op": "ref", "id": i}
def op(o, *a): return {"op": o, "args": list(a)}

derived = {
    "p": {"expression": {"op": "progress"}},
    "is_match": {"expression": op("eq", ref("fidelity"), "match")},
    "pairing_raw": {"expression": op("clamp", op("div", op("sub", ref("p"), 0.08), 0.48), 0, 1)},
    "pairing": {"expression": op("if", ref("is_match"), ref("pairing_raw"), op("min", 0.3, ref("pairing_raw")))},
    "dock": {"expression": op("if", ref("is_match"), op("ease", op("div", op("sub", ref("p"), 0.52), 0.24)), 0)},
    "cut": {"expression": op("and", ref("is_match"), op("gt", ref("p"), 0.82))},
    "pairs": {"expression": op("round", op("mul", 20, ref("pairing")))},
    "hnh_state": {"expression": op("if", op("not", ref("is_match")), "CHECKPOINT", op("if", ref("cut"), "CLEAVED", op("if", op("gt", ref("dock"), 0.95), "DOCKED", op("if", op("gt", ref("dock"), 0), "DOCKING", "SEARCHING"))))},
    "flash_opacity": {"expression": op("if", ref("cut"), op("add", 0.35, op("mul", 0.45, op("pow", op("sin", op("mul", op("sub", ref("p"), 0.82), 40)), 2))), 0)},
    "hnh_pulse": {"expression": op("add", 0.65, op("mul", op("mul", 0.35, op("sub", 1, op("cos", op("mul", op("mul", ref("p"), math.pi), 2)))), 0.5))},
}
S = lambda scene_node, **kw: {"scene": "overview", "node": scene_node, **kw}
bindings = {
    "hnh_translate_x": {"target": S("hnh_domain"), "property": "translateX", "expression": op("mul", -103, ref("dock"))},
    "hnh_translate_y": {"target": S("hnh_domain"), "property": "translateY", "expression": op("mul", 10, ref("dock"))},
    "hnh_rotate": {"target": S("hnh_domain"), "property": "rotate", "expression": op("mul", 24, ref("dock"))},
    "hnh_pulse_opacity": {"target": S("hnh_domain"), "property": "opacity", "expression": ref("hnh_pulse")},
    "rung_opacity": {"target": S("heteroduplex", shapes=[r["id"] for r in rungs]), "property": "opacity",
                     "expression": op("if", op("gt", ref("pairing"), op("div", {"op": "index"}, {"op": "count"})), 1, 0.09)},
    "spacer_opacity": {"target": S("heteroduplex", shape="grna_spacer_path"), "property": "opacity", "expression": op("add", 0.35, op("mul", 0.65, ref("pairing")))},
    "products_opacity": {"target": S("cleavage_products"), "property": "opacity", "expression": op("if", ref("cut"), 1, 0)},
    "ts_flash_opacity": {"target": S("heteroduplex", shape="ts_flash"), "property": "opacity", "expression": ref("flash_opacity")},
    "nts_flash_opacity": {"target": S("non_target_strand", shape="nts_flash"), "property": "opacity", "expression": ref("flash_opacity")},
    "hud_line_x1": {"target": S("hud_measuring_line", shape="hnh_ts_dist_line"), "property": "attr.x1", "expression": op("sub", 438, op("mul", 103, ref("dock")))},
    "hud_line_y1": {"target": S("hud_measuring_line", shape="hnh_ts_dist_line"), "property": "attr.y1", "expression": op("add", 275, op("mul", 10, ref("dock")))},
    "hud_text": {"target": S("hud_measuring_line", shape="hud_dist_text"), "property": "text", "expression": op("if", op("gt", ref("dock"), 0.95), "HNH DOCKED", "HNH CHECKPOINT")},
}
behavior = {
    "clock": {"duration": 9, "loop": True, "initialTime": 0, "autoplay": True, "reducedMotion": {"time": 6.5}},
    "variables": {"fidelity": {"type": "enum", "options": ["match", "mismatch"], "initial": "match", "label": "Target fidelity"}},
    "derived": derived,
    "controls": {
        "playback": {"kind": "playback", "label": "Play / pause"},
        "restart": {"kind": "restart", "label": "Replay reaction cycle", "effects": [{"op": "setTime", "value": 0}, {"op": "play"}]},
        "scrub": {"kind": "scrubber", "label": "Step"},
        "fidelity_selector": {"kind": "selector", "label": "Fidelity", "variable": "fidelity", "options": [
            {"value": "match", "label": "On-target (match)", "effects": [{"op": "setTime", "value": 0}, {"op": "play"}]},
            {"value": "mismatch", "label": "Seed mismatch (off-target)", "effects": [{"op": "setTime", "value": 3.6}, {"op": "play"}]}]},
    },
    "bindings": bindings,
}

no_match = op("not", ref("is_match"))
presentation = {
    "defaultScene": "overview",
    "plate": {"figureLabel": "FIG 01 · SP-CAS9 ENDONUCLEASE", "title": "R-LOOP MEDIATED DNA TARGETING & CLEAVAGE",
              "hint": "HOVER DOMAINS · TOGGLE TARGET FIDELITY · DRAG TIME", "summaryReadoutId": "summary"},
    "readouts": {
        "summary": {"label": "Summary", "value": op("concat", "PAM: BOUND | R-LOOP: ", op("str", ref("pairs")), "/20 nt | HNH: ", ref("hnh_state"))},
        "rloop": {"label": "Target Annealing & R-Loop", "claimIds": ["c_rloop_formation", "c_seed_mismatch"],
                  "value": op("concat", op("str", ref("pairs")), " / 20 bp (", op("if", no_match, "Seed mismatch", op("if", op("ge", ref("pairing"), 1), "Full zippering", "Zippering")), ")"),
                  "description": op("if", ref("is_match"), "Guide RNA pairs with the complementary target DNA, forming the R-loop.", "The chosen seed mismatch stalls pairing and blocks the catalytic checkpoint in this illustration.")},
        "hnh": {"label": "HNH Conformation", "claimIds": ["c_rloop_allostery"],
                "value": op("if", no_match, "Inactive (Checkpoint)", op("if", op("gt", ref("dock"), 0.95), "Active (Catalytic Docked)", op("if", op("gt", ref("dock"), 0), "Docking to target strand", "Inactive (Undocked)"))),
                "description": op("if", ref("is_match"), "R-loop formation permits HNH to dock near the target-strand cleavage site.", "The HNH domain remains undocked in the mismatch state.")},
        "cleavage": {"label": "Cleavage State", "claimIds": ["c_catalytic_cleavage"],
                     "value": op("if", ref("cut"), "Dual Hydrolysis (DSB)", op("if", no_match, "Cleavage blocked", "DNA intact")),
                     "description": op("if", ref("cut"), "Both strands are cut upstream of the PAM. Cas9 remains bound to the DNA products.", op("if", no_match, "This mismatch state does not pass the cleavage checkpoint.", "Recognition and conformational activation precede cleavage."))},
    },
    "legend": [
        {"color": "#7c3aed", "label": "Cas9 Protein (REC & NUC Lobes)", "entityIds": ["rec_lobe", "bridge_helix", "pi_domain"]},
        {"color": "#a78bfa", "label": "HNH Mobile Domain", "entityIds": ["hnh_domain"]},
        {"color": "#4c1d95", "label": "RuvC Catalytic Core", "entityIds": ["ruvc_domain"]},
        {"color": "#2dd4bf", "label": "Target DNA (Luminous Teal)", "entityIds": ["target_strand", "non_target_strand", "distal_dna"]},
        {"color": "#f59e0b", "label": "Guide RNA (Amber)", "entityIds": ["sgrna"]},
        {"color": "#f43f5e", "label": "PAM / Scissile Cleavage Phosphates", "entityIds": ["pam_motif"]},
        {"color": "#93c5fd", "label": "Catalytic Mg²⁺ Cofactors"},
    ],
    "disclaimer": "Educational molecular visualization. Represents established biochemical consensus of SpCas9 mechanism. Not clinical advice, gene therapy dosing guidance, or diagnostic instruction.",
}

notes = [
    "Converted from the standalone HTML figure by tools/convert_crispr.py. Geometry is extracted unchanged except where listed below.",
    "CHANGE 1: the original 'hybrid-basepairs' group was empty and nothing populated it, so the 20 R-loop rungs never rendered. 20 rungs (rung_01..rung_20) were generated between the target-strand and guide-RNA paths, ordered PAM-proximal first, and bound to R-loop progress as the original script intended.",
    "CHANGE 2: the 'ts_flash' and 'nts_flash' circles had no stroke, so animating their opacity was invisible. A white 2.5-unit stroke was added (the original stylesheet's unused .cut-flash used a white stroke).",
    "CHANGE 3: source attributions were corrected where they could be checked: PDB 4UN3 is Anders et al., not Nishimasu et al.; Dagdas et al. 2017 is Science Advances, not Science; the HNH conformational-control paper is Sternberg et al. 2015, not 2014. See evidence.sources[].note. No claim has been reviewed.",
    "DROPPED: static explanatory text in the original HTML that its script overwrote on first render (for example the '~22 kcal/mol' sentence and the '29.4 Å' distance label) was never visible and is not carried over.",
    "NOT MODELLED IN 0.1: keyboard shortcuts (Space, 1, 2, R), the hover info panel's default text, and the glow filter's exact blur radius (the built-in 'glow' effect is used). Hover info is derived from each node's entity description. The heteroduplex group is one node, so hovering the target strand reports the R-loop, as in the original.",
    "The rung fade threshold is index/count over 20 rungs; the original used index/length over the same 20 positions.",
]
doc = {
    "format": "ani",
    "formatVersion": "0.1.0",
    "profile": "explanatory",
    "document": {"id": "crispr-cas9-cleavage", "title": "CRISPR-Cas9 endonuclease DNA cleavage mechanism", "revision": 1,
                 "description": "R-loop mediated target recognition, HNH activation and double-strand cleavage by SpCas9, with an on-target / seed-mismatch comparison."},
    "requirements": {"capabilities": ["scene.svg", "behavior.clock", "behavior.enum", "behavior.expressions", "presentation.readouts"]},
    "biology": {"entities": entities, "relationships": relationships},
    "evidence": {"sources": sources, "claims": claims},
    "behavior": behavior,
    "scenes": {"overview": {"title": "Cas9 targeting and cleavage", "coordinateSystem": "schematic", "viewBox": [0, 0, 960, 560],
                            "palette": palette, "gradients": gradients, "nodes": nodes}},
    "presentation": presentation,
    "provenance": {"createdBy": {"tool": "tools/convert_crispr.py", "version": "0.1.0-draft"},
                   "derivedFrom": [{"kind": "html-figure", "ref": "ani/examples/source/crispr-cas9.source.html", "note": "Standalone interactive figure, kept unmodified beside this file."}],
                   "notes": notes, "reviews": {}},
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"wrote {out}: {len(nodes)} nodes, {sum(len(n['shapes']) for n in nodes.values())} shapes, {len(claims)} claims")
