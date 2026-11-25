"use strict";

const form = document.querySelector("#search-form");
const query = document.querySelector("#query");
const queryCount = document.querySelector("#query-count");
const searchButton = document.querySelector("#search-button");
const buttonLabel = document.querySelector("#button-label");
const examples = document.querySelectorAll(".example");
const resultsPanel = document.querySelector("#results-panel");
const count = document.querySelector("#result-count");
const results = document.querySelector("#results");
const feedback = document.querySelector("#feedback");
const feedbackTitle = document.querySelector("#feedback-title");
const feedbackMessage = document.querySelector("#feedback-message");
const announcement = document.querySelector("#announcement");
const summary = document.querySelector("#summary");
const candidates = document.querySelector("#candidates");
const candidateTemplate = document.querySelector("#candidate-template");
const { drawStructure } = window.MoleculeSearchDrawing;
const demo = window.MoleculeSearchDemo;
const searchStateKey = "molecule-search:last-search";

function readSearch() {
  try {
    return JSON.parse(sessionStorage.getItem(searchStateKey));
  } catch {
    return null;
  }
}

function candidateId(searchId, index) {
  return `${searchId}-${index}`;
}

function saveSearch(description, data) {
  const state = { id: Date.now().toString(36), description, data };
  try {
    sessionStorage.setItem(searchStateKey, JSON.stringify(state));
  } catch {
    // CID detail links still work when the browser blocks storage.
  }
  return state;
}

function updateQuery() {
  query.setCustomValidity("");
  queryCount.textContent = `${query.value.length} / ${query.maxLength}`;
}

function showFeedback(state, title, message) {
  results.hidden = true;
  count.hidden = true;
  feedback.hidden = false;
  feedback.dataset.state = state;
  feedbackTitle.textContent = title;
  feedbackMessage.textContent = message;
  announcement.textContent = `${title}。${message}`;
}

function createCandidate(candidate, id) {
  const card = candidateTemplate.content.cloneNode(true);
  const detail = card.querySelector(".candidate-link");
  const detailParams = new URLSearchParams({ candidate: id });
  if (candidate.pubchem) detailParams.set("cid", candidate.pubchem.cid);
  detail.href = `/molecule-search/detail.html?${detailParams}`;
  detail.textContent = candidate.name;
  detail.setAttribute("aria-label", `查看${candidate.name}的详情`);
  const english = card.querySelector(".candidate-english");
  english.textContent = candidate.lookup_name;
  english.hidden = candidate.name.toLowerCase() === candidate.lookup_name.toLowerCase();
  card.querySelector(".candidate-reason").textContent = candidate.reason;
  const caveat = card.querySelector(".candidate-caveat");
  caveat.textContent = candidate.caveat;
  caveat.hidden = !candidate.caveat;

  const structure = card.querySelector(".candidate-structure");
  const note = structure.querySelector(".structure-note");
  if (candidate.pubchem) {
    const { cid, formula, smiles } = candidate.pubchem;
    const formulaLabel = card.querySelector(".formula");
    formulaLabel.textContent = formula;
    formulaLabel.hidden = false;

    const source = card.querySelector(".source-link");
    source.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
    source.textContent = `PubChem CID ${cid} ↗`;
    source.hidden = false;
    note.textContent = "正在加载二维结构…";
    void drawStructure(structure, smiles, candidate.name, 224, 180);
  } else {
    note.textContent = "暂无可核验结构";
    card.querySelector(".unverified").hidden = false;
  }
  return card;
}

function showResults({ id, data }) {
  if (!data.candidates.length) {
    showFeedback("empty", "没有合适的候选", data.summary);
    return;
  }
  summary.textContent = data.summary;
  candidates.replaceChildren(...data.candidates.map((candidate, index) => createCandidate(candidate, candidateId(id, index))));
  count.textContent = `${data.candidates.length} 个候选分子`;
  count.hidden = false;
  feedback.hidden = true;
  results.hidden = false;
  announcement.textContent = `找到 ${count.textContent}。`;
}

function setSearching(searching) {
  searchButton.disabled = searching;
  query.readOnly = searching;
  examples.forEach((example) => { example.disabled = searching; });
  buttonLabel.textContent = searching ? "搜索中…" : "搜索分子";
}

query.addEventListener("input", updateQuery);
query.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (!searchButton.disabled) form.requestSubmit();
  }
});

examples.forEach((example) => {
  example.addEventListener("click", () => {
    query.value = example.querySelector(".example-query").textContent;
    updateQuery();
    query.focus();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (searchButton.disabled) return;

  const description = query.value.trim();
  if (!description) {
    query.setCustomValidity("请输入想找的分子、结构特征或性质。");
    query.reportValidity();
    return;
  }

  setSearching(true);
  showFeedback("loading", "正在搜索分子", demo ? "正在匹配试运行示例。" : "AI 正在理解描述，并通过 PubChem 查询候选结构。");
  if (resultsPanel.getBoundingClientRect().top > window.innerHeight - 90) {
    resultsPanel.scrollIntoView({ block: "start" });
  }

  try {
    let data;
    if (demo) {
      data = demo.search(description);
    } else {
      const response = await fetch("/api/molecule-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: description }),
      });
      data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.candidates)) {
        showFeedback("error", "搜索暂未完成", data?.error || "搜索服务暂时无法响应，请稍后再试。");
        return;
      }
    }
    showResults(saveSearch(description, data));
  } catch {
    showFeedback("error", "搜索暂未完成", "连接搜索服务失败，请检查网络后重试。");
  } finally {
    setSearching(false);
  }
});

const saved = readSearch();
if (Array.isArray(saved?.data?.candidates)) {
  query.value = saved.description;
  showResults(saved);
}
updateQuery();
