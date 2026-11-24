(function () {
  "use strict";

  let rdkitReady;

  async function drawStructure(surface, smiles, name, width, height) {
    const note = surface.querySelector(".structure-note");
    try {
      rdkitReady ??= window.initRDKitModule({
        locateFile: (fileName) => `/${fileName}`,
      });
      const rdkit = await rdkitReady;
      const svg = window.MoleculeViewer2D.drawSmiles(rdkit, smiles, { width, height });
      const image = new Image(width, height);
      image.alt = `${name}的二维结构`;
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      note.replaceWith(image);
    } catch {
      note.textContent = "二维结构暂时无法显示";
    }
  }

  window.MoleculeSearchDrawing = { drawStructure };
})();
