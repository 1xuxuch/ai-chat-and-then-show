(function () {
  "use strict";

  const rotationStep = 0.16;
  const arrowRotations = new Map([
    ["ArrowLeft", [0, rotationStep]],
    ["ArrowRight", [0, -rotationStep]],
    ["ArrowUp", [rotationStep, 0]],
    ["ArrowDown", [-rotationStep, 0]],
  ]);
  const keyActions = new Map([
    ["+", "zoom-in"], ["=", "zoom-in"], ["-", "zoom-out"], ["0", "reset"],
  ]);

  function parseConformer(sdf, source) {
    try {
      const record = sdf.split("$$$$", 1)[0];
      if (!/^M {2}END(?:\s|$)/m.test(record)) throw new Error("Invalid SDF record");
      const model = window.MoleculeCore.parseSdf(record);
      if (!model.atoms.length) throw new Error("Empty SDF record");
      return { model, source };
    } catch {
      throw new Error(`暂时无法读取 ${source} 返回的三维结构。`);
    }
  }

  async function fetchConformer(cid) {
    const demo = window.MoleculeSearchDemo;
    const path = demo ? demo.conformers?.[cid] : `/api/pubchem/cid/${cid}/SDF?record_type=3d`;
    if (!path) return null;

    const response = await fetch(path, { headers: { Accept: "chemical/x-mdl-sdfile, text/plain" } });
    if (response.ok) return parseConformer(await response.text(), "PubChem");
    if (response.status !== 404) throw new Error("暂时无法获取 PubChem 三维结构，请稍后重试。");
    if (demo) return null;

    const fallback = await fetch(`/api/nist/3d/${cid}`, { headers: { Accept: "application/json" } });
    if (!fallback.ok) throw new Error("暂时无法查询 NIST 的三维结构，请稍后重试。");
    const data = await fallback.json().catch(() => null);
    if (data?.found === false) return null;
    return parseConformer(data?.sdf, "NIST Chemistry WebBook");
  }

  function mount({ cid, host, status, controls }) {
    let active = false;
    let viewer = null;
    let observer;
    let conformer;
    let pending = null;

    function setStatus(message) {
      status.hidden = false;
      status.textContent = message;
    }

    function resize() {
      if (!active || !viewer) return;
      viewer.resize();
      viewer.render();
    }

    function applyAction(action) {
      if (!active || !viewer) return;
      if (action === "reset") {
        viewer.resetView();
      } else if (action === "zoom-in" || action === "zoom-out") {
        const distance = viewer.controls.getDistance();
        viewer.controls.setDistance(action === "zoom-in" ? distance / 1.2 : distance * 1.2);
      }
    }

    controls.addEventListener("click", (event) => {
      applyAction(event.target.closest("button[data-action]")?.dataset.action);
    });

    host.addEventListener("keydown", (event) => {
      if (!active || !viewer || event.ctrlKey || event.metaKey || event.altKey) return;
      const rotation = arrowRotations.get(event.key);
      if (rotation) {
        event.preventDefault();
        viewer.group.rotation.x += rotation[0];
        viewer.group.rotation.y += rotation[1];
        viewer.render();
      } else if (keyActions.has(event.key)) {
        event.preventDefault();
        applyAction(keyActions.get(event.key));
      }
    });

    window.addEventListener("pageshow", resize);
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      observer?.disconnect();
      viewer?.destroy();
    });

    function display() {
      host.hidden = false;
      try {
        if (!viewer) {
          viewer = window.MoleculeViewer3D.createViewer(host);
          viewer.setMolecule(conformer.model);
          viewer.renderer.domElement.tabIndex = 0;
          observer = new ResizeObserver(resize);
          observer.observe(host);
        }
        resize();
      } catch {
        observer?.disconnect();
        viewer?.destroy();
        viewer = null;
        host.hidden = true;
        controls.hidden = true;
        setStatus("此浏览器暂时无法显示三维结构。二维结构仍可查看。");
        return;
      }
      controls.hidden = false;
      setStatus(`三维构象来自 ${conformer.source}。`);
    }

    async function show() {
      active = true;
      if (conformer === undefined) {
        setStatus("正在加载三维结构…");
        pending ??= fetchConformer(cid)
          .then((result) => { conformer = result; })
          .finally(() => { pending = null; });
        try {
          await pending;
        } catch (error) {
          if (active) setStatus(error instanceof TypeError ? "暂时无法连接三维结构服务，请稍后重试。" : error.message);
          return;
        }
      }
      if (!active) return;
      if (conformer) display();
      else setStatus("暂未找到该分子的三维构象。");
    }

    function hide() {
      active = false;
      host.hidden = true;
      controls.hidden = true;
      status.hidden = true;
    }

    return { show, hide };
  }

  window.MoleculeDetail3D = { mount };
})();
