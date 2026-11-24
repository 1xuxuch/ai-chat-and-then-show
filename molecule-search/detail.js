"use strict";

const parameters = new URLSearchParams(window.location.search);
const nameHeading = document.querySelector("#molecule-name");
const englishName = document.querySelector("#molecule-english");
const structure = document.querySelector("#molecule-structure");
const statusNote = document.querySelector("#detail-status");
const facts = document.querySelector("#detail-facts");
const source = document.querySelector("#detail-source");
const structureTabs = [...document.querySelectorAll(".detail-view-tabs [role=tab]")];
const threeStatus = document.querySelector("#detail-3d-status");
const unavailable = "暂无记录";
let displayedSmiles = null;
let threeView = null;

function selectStructureTab(target) {
  structureTabs.forEach((tab) => {
    const selected = tab === target;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
  });

  if (target.id === "detail-tab-3d") void threeView?.show();
  else threeView?.hide();
}

structureTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectStructureTab(tab));
  tab.addEventListener("keydown", (event) => {
    const targets = {
      ArrowLeft: (index + structureTabs.length - 1) % structureTabs.length,
      ArrowRight: (index + 1) % structureTabs.length,
      Home: 0,
      End: structureTabs.length - 1,
    };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    const target = structureTabs[targets[event.key]];
    selectStructureTab(target);
    target.focus();
  });
});

function isCid(value) {
  return /^[1-9]\d{0,11}$/.test(String(value));
}

function cachedCandidate(candidateId) {
  const match = /^([a-z0-9]{1,32})-([0-9]{1,2})$/.exec(candidateId || "");
  if (!match) return null;
  const [, searchId, index] = match;
  try {
    const search = JSON.parse(sessionStorage.getItem("molecule-search:last-search"));
    const candidate = search?.id === searchId ? search.data?.candidates?.[Number(index)] : null;
    return typeof candidate?.name === "string" && candidate.name ? candidate : null;
  } catch {
    return null;
  }
}

function showError(message) {
  document.querySelector("#detail-workspace").hidden = true;
  document.querySelector("#detail-error-message").textContent = message;
  document.querySelector("#detail-error").hidden = false;
}

function setStatus(message) {
  statusNote.textContent = message;
  statusNote.hidden = !message;
}

function showName(name, displayEnglish = "") {
  nameHeading.textContent = name;
  document.title = `${name} · 分子探索`;
  englishName.textContent = displayEnglish;
  englishName.hidden = !displayEnglish || name.toLowerCase() === displayEnglish.toLowerCase();
}

function showMatch(candidate) {
  if (!candidate) return;
  if (window.MoleculeSearchDemo) document.querySelector("#match-title").textContent = "示例匹配说明";
  const reason = document.querySelector("#detail-reason");
  const caveat = document.querySelector("#detail-caveat");
  reason.textContent = candidate.reason || "";
  caveat.textContent = candidate.caveat || "";
  reason.hidden = !reason.textContent;
  caveat.hidden = !caveat.textContent;
  document.querySelector("#detail-match").hidden = reason.hidden && caveat.hidden;
}

function withUnit(value, unit) {
  return value === null || value === undefined || value === "" ? null : `${value} ${unit}`;
}

function showProperties(record, name) {
  const weight = Number(record.molecular_weight);
  const values = {
    formula: record.formula,
    mass: Number.isFinite(weight) && weight > 0 ? `${record.molecular_weight} g/mol` : "",
    cid: record.cid,
    iupac: record.iupac_name,
    smiles: record.smiles,
    inchikey: record.inchikey,
    "exact-mass": withUnit(record.exact_mass, "Da"),
    xlogp: record.xlogp,
    tpsa: withUnit(record.tpsa, "Å²"),
    "h-bond-donors": record.h_bond_donors,
    "h-bond-acceptors": record.h_bond_acceptors,
    "rotatable-bonds": record.rotatable_bonds,
    "heavy-atoms": record.heavy_atoms,
    "formal-charge": record.formal_charge > 0 ? `+${record.formal_charge}` : record.formal_charge,
    stereocenters: record.defined_atom_stereocenters,
  };
  for (const [field, value] of Object.entries(values)) {
    document.querySelector(`#detail-${field}`).textContent = value === "" ? unavailable : value ?? unavailable;
  }
  facts.hidden = false;
  source.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${record.cid}`;

  const smiles = record.smiles || "";
  if (smiles === displayedSmiles) return;
  displayedSmiles = smiles;
  const note = document.createElement("span");
  note.className = "structure-note";
  note.textContent = smiles ? "正在绘制二维结构…" : "暂无可核验结构";
  structure.replaceChildren(note);
  if (smiles) void window.MoleculeSearchDrawing.drawStructure(structure, smiles, name, 440, 275);
}

async function loadDetails(cid) {
  const demoRecord = window.MoleculeSearchDemo?.details?.[cid];
  if (String(demoRecord?.cid) === cid) return demoRecord;

  const response = await fetch(`/api/molecule-search/details/${cid}`, { headers: { Accept: "application/json" } }).catch(() => null);
  if (!response) throw new Error("无法连接分子详情服务，请稍后重试。");
  const data = await response.json().catch(() => null);
  if (!response.ok || String(data?.cid) !== cid) {
    throw new Error(data?.error || "暂时无法读取 PubChem 详情，请稍后重试。");
  }
  return data;
}

async function openDetails() {
  let candidate = cachedCandidate(parameters.get("candidate"));
  const requestedCid = parameters.get("cid");
  if (requestedCid !== null && !isCid(requestedCid)) {
    showError("分子编号无效。请返回搜索结果重新选择分子。");
    return;
  }
  if (requestedCid !== null && String(candidate?.pubchem?.cid) !== requestedCid) candidate = null;
  const cachedRecord = isCid(candidate?.pubchem?.cid) ? candidate.pubchem : null;
  const cid = requestedCid || (cachedRecord ? String(cachedRecord.cid) : null);

  if (!candidate && !cid) {
    showError("请从分子搜索结果中选择一个候选。");
    return;
  }

  document.querySelector("#detail-workspace").hidden = false;
  showName(candidate?.name || `PubChem CID ${cid}`, candidate?.lookup_name);
  showMatch(candidate);

  if (!cid) {
    structure.querySelector(".structure-note").textContent = "暂无可核验结构";
    threeStatus.textContent = "暂无可核验的三维构象。";
    setStatus("PubChem 暂未确认该候选。");
    return;
  }

  if (window.MoleculeDetail3D) {
    threeView = window.MoleculeDetail3D.mount({
      cid,
      host: document.querySelector("#detail-3d-host"),
      status: threeStatus,
      controls: document.querySelector("#detail-3d-controls"),
    });
  } else {
    threeStatus.textContent = "三维视图加载失败，请刷新页面后重试。";
  }

  setStatus("正在读取 PubChem 详细属性…");
  if (cachedRecord) showProperties(cachedRecord, nameHeading.textContent);
  try {
    const record = await loadDetails(cid);
    showName(candidate?.name || record.title || `PubChem CID ${cid}`, candidate?.lookup_name || record.title);
    showProperties({
      ...record,
      formula: record.formula || cachedRecord?.formula,
      smiles: record.smiles || cachedRecord?.smiles,
    }, nameHeading.textContent);
    setStatus("");
  } catch (error) {
    if (cachedRecord) setStatus("暂时无法读取 PubChem 的补充属性，仍可查阅搜索时获取的资料。");
    else showError(error.message || "暂时无法读取 PubChem 详情，请稍后重试。");
  }
}

void openDetails();
