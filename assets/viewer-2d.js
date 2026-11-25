(function () {
  "use strict";

  const { parseSdf } = window.MoleculeCore;

  function get2dBondLengthRatio(molecule) {
    try {
      const { atoms, bonds } = parseSdf(molecule.get_molblock());
      const lengths = bonds.map((bond) => {
        const first = atoms[bond.first];
        const second = atoms[bond.second];
        return Math.hypot(first.x - second.x, first.y - second.y);
      }).filter((length) => Number.isFinite(length) && length > 1e-6);
      if (!lengths.length) return 1;
      return Math.max(...lengths) / Math.min(...lengths);
    } catch (_) {
      return 1;
    }
  }

  function setReadable2dCoords(molecule) {
    if (!molecule.set_new_coords()) return false;
    const rdkitRatio = get2dBondLengthRatio(molecule);
    // Try RDKit's CoordGen layout only when the default depiction has markedly
    // uneven bond lengths, as happens with the bridged cubane cage.
    if (rdkitRatio <= 1.8) return true;
    if (molecule.set_new_coords(true)) {
      const coordGenRatio = get2dBondLengthRatio(molecule);
      if (coordGenRatio < rdkitRatio * 0.8) return true;
    }
    return molecule.set_new_coords(false);
  }

  function drawMolecule(rdkit, input, { width, height }) {
    if (!rdkit) {
      throw new Error("RDKit 2D 绘图引擎尚未就绪。");
    }

    const molecule = rdkit.get_mol(input);
    if (!molecule) {
      throw new Error("RDKit 无法解析 PubChem 返回的分子结构。");
    }

    try {
      if (!molecule.is_valid()) {
        throw new Error("RDKit 无法解析 PubChem 返回的分子结构。");
      }
      molecule.remove_hs_in_place();
      if (!molecule.is_valid()) {
        throw new Error("RDKit 无法处理显式氢原子。");
      }
      // Expand hydrogens when a single atom would render as a condensed formula.
      const singleAtom = molecule.get_num_atoms() === 1;
      const methane = singleAtom && molecule.get_smiles() === "C";
      if (singleAtom) molecule.add_hs_in_place();
      const expanded = singleAtom && molecule.get_num_atoms() > 1;
      if (!setReadable2dCoords(molecule)) {
        throw new Error("RDKit 无法为该分子生成二维坐标。");
      }

      const drawingSize = Math.min(width, height);
      const drawOptions = {
        width,
        height,
        // Transparent SVG lets the 2D stage's shared CSS canvas color show through.
        backgroundColour: [0, 0, 0, 0],
        symbolColour: [0.13, 0.15, 0.17, 1],
        bondLineWidth: expanded ? 2 : 1,
        fixedBondLength: expanded ? Math.round(drawingSize * 0.28) : 28,
        fixedFontSize: expanded ? Math.round(drawingSize * 0.115) : 18,
        padding: 0.06,
        clearBackground: true,
        multipleBondOffset: 0.15,
      };
      if (methane) drawOptions.atomLabels = { 0: "C" };
      const svgMarkup = molecule.get_svg_with_highlights(
        JSON.stringify(drawOptions),
      );
      if (!svgMarkup) {
        throw new Error("RDKit 没有生成可显示的二维结构。");
      }

      return svgMarkup;
    } finally {
      molecule.delete();
    }
  }

  function drawSdf(rdkit, sdfText, dimensions) {
    const molBlock = String(sdfText).split("$$$$")[0].trim();
    return drawMolecule(rdkit, molBlock, dimensions);
  }

  function drawSmiles(rdkit, smiles, dimensions) {
    return drawMolecule(rdkit, String(smiles).trim(), dimensions);
  }

  function createViewer(stage, surface) {
    let zoom = { scale: 1, x: 0, y: 0 };

    function applyZoom() {
      const svg = surface.querySelector("svg");
      if (!svg) return;
      svg.style.transformBox = "view-box";
      svg.style.transformOrigin = "0 0";
      svg.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    }

    function onWheel(event) {
      if (!surface.querySelector("svg")) return;
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? bounds.height : 1);
      const scale = Math.min(5.5, Math.max(0.45, zoom.scale * Math.exp(-delta * 0.001)));
      if (scale === zoom.scale) return;
      const ratio = scale / zoom.scale;
      zoom = {
        scale,
        x: cursorX - (cursorX - zoom.x) * ratio,
        y: cursorY - (cursorY - zoom.y) * ratio,
      };
      applyZoom();
    }

    stage.addEventListener("wheel", onWheel, { passive: false });
    return {
      render(rdkit, sdfText) {
        const width = Math.max(320, Math.round(stage.clientWidth || 900));
        const height = Math.max(320, Math.round(stage.clientHeight || 600));
        surface.innerHTML = drawSdf(rdkit, sdfText, { width, height });
        applyZoom();
      },
      reset() {
        zoom = { scale: 1, x: 0, y: 0 };
        applyZoom();
      },
      destroy() {
        stage.removeEventListener("wheel", onWheel);
      },
    };
  }

  window.MoleculeViewer2D = { createViewer, drawSdf, drawSmiles };
})();
