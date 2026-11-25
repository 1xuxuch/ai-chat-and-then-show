(function () {
  "use strict";

  // Model styles and rotation controls adapted from Shihab Ahmed's
  // Molecule Viewer (MIT). See /LICENSE-Molecule-Viewer.txt.
  const styles = {
    "ball-stick": { name: "球棍", atoms: { stick: { radius: 0.15 }, sphere: { scale: 0.28 } } },
    stick: { name: "棍状", atoms: { stick: { radius: 0.15 } } },
    "space-filling": { name: "空间填充", atoms: { sphere: { scale: 0.65 } } },
  };

  function animationAngle(progress, { from, to, motion }) {
    const position = Math.max(0, Math.min(1, progress));
    return from + (to - from) * (motion === "oscillate" ? 1 - Math.abs(2 * position - 1) : position);
  }

  function conformerRecord(data, source) {
    const first = typeof data === "string" ? data.split("$$$$", 1)[0] : "";
    if (!/^M {2}END(?:\s|$)/m.test(first)) throw new Error(`${source} 返回的三维结构无法读取。`);
    return { sdf: first, source };
  }

  async function fetchConformer(cid, signal) {
    const demo = window.MoleculeSearchDemo;
    const path = demo ? demo.conformers[cid] : `/api/pubchem/cid/${cid}/SDF?record_type=3d`;
    if (!path) return null;

    const response = await fetch(path, { signal, headers: { Accept: "chemical/x-mdl-sdfile, text/plain" } });
    if (response.ok) {
      const source = demo?.conformerSources?.[cid] || "PubChem";
      return conformerRecord(await response.text(), source);
    }
    if (response.status !== 404) throw new Error("暂时无法读取三维构象，请稍后重试。");
    if (demo) return null;

    const fallback = await fetch(`/api/nist/3d/${cid}`, { signal, headers: { Accept: "application/json" } });
    if (!fallback.ok) throw new Error("暂时无法查询 NIST 的三维构象，请稍后重试。");
    const data = await fallback.json().catch(() => null);
    return data?.found === false ? null : conformerRecord(data?.sdf, "NIST Chemistry WebBook");
  }

  function mount(element) {
    const canvas = element.querySelector("[data-molecule-canvas]");
    const empty = element.querySelector("[data-molecule-empty]");
    const status = element.querySelector("[data-molecule-status]");
    const actions = element.querySelector("[data-molecule-actions]");
    const spinButton = actions.querySelector('[data-action="spin"]');
    const previewButton = actions.querySelector('[data-action="preview"]');
    const animationPanel = actions.querySelector(".molecule-animation");
    const previewControls = [...actions.querySelectorAll("button, input, select")].filter((control) => control !== previewButton);
    const styleButtons = actions.querySelectorAll("[data-model]");
    const speedInput = actions.querySelector("#molecule-rotation-speed");
    const speedValue = actions.querySelector("[data-speed-value]");
    const fromInput = actions.querySelector("#molecule-animation-from");
    const toInput = actions.querySelector("#molecule-animation-to");
    const motionInput = actions.querySelector("#molecule-animation-motion");
    const durationInput = actions.querySelector("#molecule-animation-duration");
    const records = new Map();
    let viewer;
    let initialView;
    let fittedView;
    let pending;
    let displayedCid;
    let displayedName;
    let style = "ball-stick";
    let preview = null;
    let spinning = false;
    let ready = false;

    function labelCanvas() {
      canvas.setAttribute("aria-label", `${displayedName}的三维${styles[style].name}模型，可用方向键旋转`);
    }

    function setSpinning(active) {
      spinning = active;
      viewer?.spin(active && !preview ? "vy" : false, -speedInput.valueAsNumber);
      spinButton.setAttribute("aria-pressed", String(active));
      spinButton.textContent = active ? "暂停旋转" : "自动旋转";
    }

    function updateSpeed() {
      const speed = speedInput.valueAsNumber;
      speedValue.value = `${speed.toFixed(2)}×`;
      speedInput.setAttribute("aria-valuetext", `${speed} 倍`);
      if (spinning) setSpinning(true);
    }

    function changeStyle(next) {
      if (!ready || next === style || !Object.hasOwn(styles, next)) return;
      style = next;
      viewer.getModel().setStyle({}, styles[style].atoms);
      styleButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.model === style));
      });
      labelCanvas();
      viewer.render();
    }

    function finishPreview() {
      if (!preview) return;
      const { view, frame } = preview;
      preview = null;
      cancelAnimationFrame(frame);
      previewControls.forEach((control) => { control.disabled = false; });
      canvas.classList.remove("is-previewing");
      previewButton.textContent = "预览动画";
      viewer.setView(view);
      viewer.render();
      if (spinning) setSpinning(true);
    }

    function togglePreview() {
      if (preview) {
        finishPreview();
        return;
      }
      if (![fromInput, toInput, durationInput].every((input) => input.reportValidity())) return;
      const settings = { from: fromInput.valueAsNumber, to: toInput.valueAsNumber, motion: motionInput.value };
      const duration = durationInput.valueAsNumber * 1000;
      const view = viewer.getView().slice();
      preview = { view, frame: 0 };
      viewer.spin(false);
      previewControls.forEach((control) => { control.disabled = true; });
      canvas.classList.add("is-previewing");
      previewButton.textContent = "停止预览";

      function renderFrame(progress) {
        viewer.setView(view);
        viewer.rotate(-animationAngle(progress, settings), "vy");
        viewer.render();
      }

      let started;
      function step(now) {
        started ??= now;
        const progress = Math.min((now - started) / duration, 1);
        renderFrame(progress);
        if (progress < 1) preview.frame = requestAnimationFrame(step);
        else finishPreview();
      }

      renderFrame(0);
      preview.frame = requestAnimationFrame(step);
    }

    function resize() {
      if (!ready || !canvas.clientWidth) return;
      viewer.resize();
      viewer.render();
    }

    function setMessage(message) {
      pending?.abort();
      pending = null;
      displayedCid = undefined;
      ready = false;
      setSpinning(false);
      finishPreview();
      canvas.hidden = true;
      actions.hidden = true;
      empty.hidden = false;
      empty.textContent = message;
      status.textContent = message;
      status.classList.add("sr-only");
    }

    function render({ sdf, source }, name, cid) {
      canvas.hidden = false;
      empty.hidden = true;
      displayedName = name;
      labelCanvas();
      viewer ??= window.$3Dmol.createViewer(canvas, {
        backgroundColor: getComputedStyle(canvas.parentElement).backgroundColor,
        antialias: true,
      });
      if (!viewer) throw new Error("WebGL unavailable");
      initialView ??= viewer.getView();

      if (displayedCid !== cid) {
        viewer.clear();
        const model = viewer.addModel(sdf, "sdf", { keepH: true });
        if (!model.selectedAtoms({}).length) throw new Error("Empty SDF record");
        model.setStyle({}, styles[style].atoms);
        viewer.setProjection("orthographic");
        viewer.setView(initialView);
        viewer.zoomTo();
        fittedView = viewer.getView();
        displayedCid = cid;
      }

      ready = true;
      actions.hidden = false;
      status.classList.remove("sr-only");
      status.textContent = `${source} · 拖动旋转，滚轮缩放`;
      resize();
    }

    async function show(record) {
      const cid = String(record?.cid ?? "");
      if (!/^[1-9]\d{0,11}$/.test(cid)) {
        setMessage("暂无可核验的三维构象。");
        return;
      }
      if (displayedCid === cid && records.has(cid)) {
        displayedName = record.name;
        labelCanvas();
        resize();
        return;
      }

      setMessage("正在加载三维结构…");
      const request = new AbortController();
      pending = request;
      let conformer;
      try {
        if (records.has(cid)) conformer = records.get(cid);
        else {
          conformer = await fetchConformer(cid, request.signal);
          if (conformer) records.set(cid, conformer);
        }
      } catch (error) {
        if (pending === request) {
          setMessage(error instanceof TypeError ? "无法连接三维结构服务，请稍后再试。" : error.message);
        }
        return;
      }
      if (pending !== request) return;
      pending = null;

      if (!conformer) {
        setMessage("暂无该分子的三维构象。可在详情中查看二维结构。");
        return;
      }
      try {
        render(conformer, record.name, cid);
      } catch {
        setMessage("此浏览器暂时无法显示三维模型。二维结构仍可查看。");
      }
    }

    function applyAction(action) {
      if (!ready) return;
      if (action === "reset") {
        setSpinning(false);
        viewer.setView(fittedView);
        viewer.render();
      } else if (action === "spin") {
        setSpinning(!spinning);
      } else if (action === "speed-normal") {
        speedInput.value = "1";
        updateSpeed();
      } else if (action === "preview") {
        togglePreview();
      } else if (action === "zoom-in" || action === "zoom-out") {
        viewer.zoom(action === "zoom-in" ? 1.2 : 1 / 1.2);
        viewer.render();
      }
    }

    actions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action], button[data-model]");
      if (!button) return;
      if (button.dataset.model) changeStyle(button.dataset.model);
      else applyAction(button.dataset.action);
    });
    actions.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !event.target.matches(".molecule-animation input")) return;
      event.preventDefault();
      applyAction("preview");
    });
    speedInput.addEventListener("input", updateSpeed);
    animationPanel.addEventListener("toggle", () => {
      if (!animationPanel.open) finishPreview();
    });
    canvas.addEventListener("keydown", (event) => {
      if (!ready || preview || event.ctrlKey || event.altKey || event.metaKey) return;
      const rotations = { ArrowLeft: [12, "y"], ArrowRight: [-12, "y"], ArrowUp: [12, "x"], ArrowDown: [-12, "x"] };
      const keys = { "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", "0": "reset" };
      if (Object.hasOwn(rotations, event.key)) {
        event.preventDefault();
        setSpinning(false);
        viewer.rotate(...rotations[event.key]);
      } else if (Object.hasOwn(keys, event.key)) {
        event.preventDefault();
        applyAction(keys[event.key]);
      }
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pageshow", resize);
    window.addEventListener("pagehide", (event) => {
      setSpinning(false);
      finishPreview();
      if (event.persisted) return;
      pending?.abort();
      observer.disconnect();
      viewer?.clear();
    });

    return {
      show,
      pause() {
        setSpinning(false);
        finishPreview();
        pending?.abort();
        pending = null;
      },
    };
  }

  window.MoleculeView = { mount };
})();
