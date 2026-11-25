(function () {
  "use strict";

  const samples = new Map(Object.entries({"找含苯环和羟基的小分子": {"candidates": [{"caveat": "", "lookup_name": "salicylic acid", "name": "水杨酸", "pubchem": {"cid": 338, "formula": "C7H6O3", "smiles": "C1=CC=C(C(=C1)C(=O)O)O"}, "reason": "苯环上相邻的取代基为羟基和羧基。"}, {"caveat": "", "lookup_name": "vanillin", "name": "香兰素", "pubchem": {"cid": 1183, "formula": "C8H8O3", "smiles": "COC1=C(C=CC(=C1)C=O)O"}, "reason": "苯环上有羟基，另有甲氧基和醛基。"}], "summary": "这两种分子都含有直接连接在苯环上的羟基。"}, "哪些有机酸容易溶于水": {"candidates": [{"caveat": "", "lookup_name": "citric acid", "name": "柠檬酸", "pubchem": {"cid": 311, "formula": "C6H8O7", "smiles": "C(C(=O)O)C(CC(=O)O)(C(=O)O)O"}, "reason": "柠檬酸含三个羧基和一个羟基，易溶于水。"}, {"caveat": "溶解度随温度变化。", "lookup_name": "L-malic acid", "name": "L-苹果酸", "pubchem": {"cid": 222656, "formula": "C4H6O5", "smiles": "C([C@@H](C(=O)O)O)C(=O)O"}, "reason": "L-苹果酸是易溶于水的有机酸，结构含两个羧基和一个羟基。"}], "summary": "柠檬酸和 L-苹果酸都容易溶于水，均含多个羧基。"}, "茶叶中的常见小分子有哪些": {"candidates": [{"caveat": "不同茶类和冲泡方式会影响茶汤中的含量。", "lookup_name": "caffeine", "name": "咖啡因", "pubchem": {"cid": 2519, "formula": "C8H10N4O2", "smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"}, "reason": "茶叶中的常见生物碱。"}, {"caveat": "", "lookup_name": "L-theanine", "name": "L-茶氨酸", "pubchem": {"cid": 439378, "formula": "C7H14N2O3", "smiles": "CCNC(=O)CC[C@@H](C(=O)O)N"}, "reason": "茶叶中常见的游离氨基酸，与鲜味相关。"}], "summary": "咖啡因和 L-茶氨酸都是茶叶中的常见小分子。"}, "哪些分子有两个羧基且溶于水": {"candidates": [{"caveat": "溶解度随温度变化。", "lookup_name": "L-malic acid", "name": "L-苹果酸", "pubchem": {"cid": 222656, "formula": "C4H6O5", "smiles": "C([C@@H](C(=O)O)O)C(=O)O"}, "reason": "L-苹果酸是易溶于水的有机酸，结构含两个羧基和一个羟基。"}, {"caveat": "溶解度随温度变化。", "lookup_name": "succinic acid", "name": "琥珀酸", "pubchem": {"cid": 1110, "formula": "C4H6O4", "smiles": "C(CC(=O)O)C(=O)O"}, "reason": "琥珀酸由两个端位羧基连接一段两碳链，能溶于水。"}], "summary": "L-苹果酸和琥珀酸都含有两个羧基，并能溶于水。"}}));
  const details = {"311": {"cid": 311, "title": "Citric Acid", "formula": "C6H8O7", "smiles": "C(C(=O)O)C(CC(=O)O)(C(=O)O)O", "iupac_name": "2-hydroxypropane-1,2,3-tricarboxylic acid", "molecular_weight": "192.12", "inchikey": "KRKNYBCHXYNGOX-UHFFFAOYSA-N", "exact_mass": "192.02700259", "xlogp": -1.7, "tpsa": 132, "h_bond_donors": 4, "h_bond_acceptors": 7, "rotatable_bonds": 5, "heavy_atoms": 13, "formal_charge": 0, "defined_atom_stereocenters": 0}, "338": {"cid": 338, "title": "Salicylic Acid", "formula": "C7H6O3", "smiles": "C1=CC=C(C(=C1)C(=O)O)O", "iupac_name": "2-hydroxybenzoic acid", "molecular_weight": "138.12", "inchikey": "YGSDEFSMJLZEOE-UHFFFAOYSA-N", "exact_mass": "138.031694049", "xlogp": 2.3, "tpsa": 57.5, "h_bond_donors": 2, "h_bond_acceptors": 3, "rotatable_bonds": 1, "heavy_atoms": 10, "formal_charge": 0, "defined_atom_stereocenters": 0}, "1110": {"cid": 1110, "title": "Succinic Acid", "formula": "C4H6O4", "smiles": "C(CC(=O)O)C(=O)O", "iupac_name": "butanedioic acid", "molecular_weight": "118.09", "inchikey": "KDYFGRWQOYBRFD-UHFFFAOYSA-N", "exact_mass": "118.02660867", "xlogp": -0.6, "tpsa": 74.6, "h_bond_donors": 2, "h_bond_acceptors": 4, "rotatable_bonds": 3, "heavy_atoms": 8, "formal_charge": 0, "defined_atom_stereocenters": 0}, "1183": {"cid": 1183, "title": "Vanillin", "formula": "C8H8O3", "smiles": "COC1=C(C=CC(=C1)C=O)O", "iupac_name": "4-hydroxy-3-methoxybenzaldehyde", "molecular_weight": "152.15", "inchikey": "MWOOGOJBHIARFG-UHFFFAOYSA-N", "exact_mass": "152.047344113", "xlogp": 1.2, "tpsa": 46.5, "h_bond_donors": 1, "h_bond_acceptors": 3, "rotatable_bonds": 2, "heavy_atoms": 11, "formal_charge": 0, "defined_atom_stereocenters": 0}, "2519": {"cid": 2519, "title": "Caffeine", "formula": "C8H10N4O2", "smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "iupac_name": "1,3,7-trimethylpurine-2,6-dione", "molecular_weight": "194.19", "inchikey": "RYYVLZVUVIJVGH-UHFFFAOYSA-N", "exact_mass": "194.08037557", "xlogp": -0.1, "tpsa": 58.4, "h_bond_donors": 0, "h_bond_acceptors": 3, "rotatable_bonds": 0, "heavy_atoms": 14, "formal_charge": 0, "defined_atom_stereocenters": 0}, "222656": {"cid": 222656, "title": "L-Malic Acid", "formula": "C4H6O5", "smiles": "C([C@@H](C(=O)O)O)C(=O)O", "iupac_name": "(2S)-2-hydroxybutanedioic acid", "molecular_weight": "134.09", "inchikey": "BJEPYKJPYRNKOW-REOHCLBHSA-N", "exact_mass": "134.02152329", "xlogp": -1.3, "tpsa": 94.8, "h_bond_donors": 3, "h_bond_acceptors": 5, "rotatable_bonds": 3, "heavy_atoms": 9, "formal_charge": 0, "defined_atom_stereocenters": 1}, "439378": {"cid": 439378, "title": "L-Theanine", "formula": "C7H14N2O3", "smiles": "CCNC(=O)CC[C@@H](C(=O)O)N", "iupac_name": "(2S)-2-amino-5-(ethylamino)-5-oxopentanoic acid", "molecular_weight": "174.20", "inchikey": "DATAGRPVKZEWHA-YFKPBYRVSA-N", "exact_mass": "174.10044231", "xlogp": -3.6, "tpsa": 92.4, "h_bond_donors": 3, "h_bond_acceptors": 4, "rotatable_bonds": 5, "heavy_atoms": 12, "formal_charge": 0, "defined_atom_stereocenters": 1}};
  const conformers = {"311": "/molecule-search/conformers/311.sdf", "338": "/molecule-search/conformers/338.sdf", "1110": "/molecule-search/conformers/1110.sdf", "1183": "/molecule-search/conformers/1183.sdf", "2519": "/molecule-search/conformers/2519.sdf", "222656": "/molecule-search/conformers/222656.sdf", "439378": "/molecule-search/conformers/439378.sdf"};

  // PubChem PUG REST compound property snapshots for the classroom examples.
  Object.assign(details, {
    962: {
      cid: 962,
      title: "Water",
      formula: "H2O",
      smiles: "O",
      iupac_name: "oxidane",
      molecular_weight: "18.015",
      inchikey: "XLYOFNOQVPJJNP-UHFFFAOYSA-N",
      exact_mass: "18.010564683",
      xlogp: -0.5,
      tpsa: 1,
      formal_charge: 0,
      h_bond_donors: 1,
      h_bond_acceptors: 1,
      heavy_atoms: 1,
      rotatable_bonds: 0,
      defined_atom_stereocenters: 0,
    },
    297: {
      cid: 297,
      title: "Methane",
      formula: "CH4",
      smiles: "C",
      iupac_name: "methane",
      molecular_weight: "16.043",
      inchikey: "VNWKTOKETHGBQD-UHFFFAOYSA-N",
      exact_mass: "16.0313001276",
      xlogp: 0.6,
      tpsa: 0,
      formal_charge: 0,
      h_bond_donors: 0,
      h_bond_acceptors: 0,
      heavy_atoms: 1,
      rotatable_bonds: 0,
      defined_atom_stereocenters: 0,
    },
  });

  const basicMolecules = [
    { cid: 962, name: "水", aliases: ["水分子", "h2o", "water"], reason: "水分子是弯曲的。两个氢原子与一个氧原子相连。" },
    { cid: 297, name: "甲烷", aliases: ["甲烷分子", "ch4", "methane"], reason: "甲烷的四个氢原子围绕碳原子排列，形成四面体。" },
    { cid: 2519, name: "咖啡因", aliases: ["咖啡因分子", "caffeine", "c8h10n4o2"], reason: "旋转模型可以观察咖啡因的双环骨架和伸出环外的取代基。" },
  ];
  const basicByName = new Map();
  for (const { cid, name, reason, aliases } of basicMolecules) {
    const { title, formula, smiles } = details[cid];
    conformers[cid] ??= `/molecule-search/conformers/${cid}.sdf`;
    const result = { name, lookup_name: title, reason, caveat: "", pubchem: { cid, formula, smiles } };
    for (const alias of [name, ...aliases]) basicByName.set(alias, result);
  }

  window.MoleculeSearchDemo = {
    details,
    conformers,
    conformerSources: { 962: "RDKit 计算构象", 297: "RDKit 计算构象" },
    search(description) {
      const key = description.replace(/^例如[，：]\s*/, "").replace(/[，,]/g, "").replace(/[？?]+$/, "");
      const name = key.toLowerCase().replace(/[。.!！]+$/, "")
        .replace(/^(?:请\s*)?(?:显示|展示|查看|看看|看一下|show\s+me)\s*/, "")
        .replace(/(?:的?(?:三维|3d)?\s*(?:结构|模型))$/, "")
        .trim();
      const basic = basicByName.get(name);
      if (basic) return { summary: basic.reason, candidates: [basic] };
      return samples.get(key) || {
        summary: "课堂示例支持水、甲烷、咖啡因，以及左侧的示例描述。",
        candidates: [],
      };
    },
  };
})();
