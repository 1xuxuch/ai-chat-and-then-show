(function () {
  "use strict";

  function parseSdf(text) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    if (lines.length < 4) {
      throw new Error("返回内容不是有效的 SDF 文件。");
    }

    const countsLine = lines[3] || "";
    if (countsLine.includes("V3000")) {
      return parseV3000(lines);
    }

    const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
    const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);
    if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
      throw new Error("无法读取 SDF 的原子和键数量。");
    }

    const atoms = [];
    const bonds = [];
    const atomStart = 4;

    for (let index = 0; index < atomCount; index += 1) {
      const line = lines[atomStart + index] || "";
      const parts = line.trim().split(/\s+/);
      const x = Number.parseFloat(line.slice(0, 10));
      const y = Number.parseFloat(line.slice(10, 20));
      const z = Number.parseFloat(line.slice(20, 30));
      const symbol = (line.slice(31, 34).trim() || parts[3] || "C").trim();

      if (![x, y, z].every(Number.isFinite)) {
        throw new Error(`第 ${index + 1} 个原子的坐标无效。`);
      }

      atoms.push({
        index,
        element: symbol,
        x,
        y,
        z,
      });
    }

    const bondStart = atomStart + atomCount;
    for (let index = 0; index < bondCount; index += 1) {
      const line = lines[bondStart + index] || "";
      const first = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
      const second = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
      const order = Number.parseInt(line.slice(6, 9).trim(), 10);
      const stereo = Number.parseInt(line.slice(9, 12).trim(), 10);

      if (
        Number.isInteger(first) &&
        Number.isInteger(second) &&
        first >= 0 &&
        second >= 0 &&
        first < atoms.length &&
        second < atoms.length
      ) {
        bonds.push({
          first,
          second,
          order: Number.isFinite(order) && order > 0 ? order : 1,
          stereo: Number.isFinite(stereo) ? stereo : 0,
        });
      }
    }

    return { atoms, bonds };
  }

  function parseV3000(lines) {
    const atoms = [];
    const bonds = [];
    let inAtomBlock = false;
    let inBondBlock = false;

    for (const line of lines) {
      if (line.includes("BEGIN ATOM")) {
        inAtomBlock = true;
        continue;
      }
      if (line.includes("END ATOM")) {
        inAtomBlock = false;
        continue;
      }
      if (line.includes("BEGIN BOND")) {
        inBondBlock = true;
        continue;
      }
      if (line.includes("END BOND")) {
        inBondBlock = false;
        continue;
      }

      if (inAtomBlock && line.includes("V30")) {
        const payload = line.slice(line.indexOf("V30") + 3).trim();
        const parts = payload.split(/\s+/);
        const index = Number.parseInt(parts[0], 10) - 1;
        const element = parts[1] || "C";
        const x = Number.parseFloat(parts[2]);
        const y = Number.parseFloat(parts[3]);
        const z = Number.parseFloat(parts[4]);
        if ([index, x, y, z].every(Number.isFinite)) {
          atoms.push({ index, element, x, y, z });
        }
      }

      if (inBondBlock && line.includes("V30")) {
        const payload = line.slice(line.indexOf("V30") + 3).trim();
        const parts = payload.split(/\s+/);
        const order = Number.parseInt(parts[1], 10);
        const first = Number.parseInt(parts[2], 10) - 1;
        const second = Number.parseInt(parts[3], 10) - 1;
        const cfgToken = parts.find((part) => part.startsWith("CFG="));
        const cfg = cfgToken ? Number.parseInt(cfgToken.slice(4), 10) : 0;
        if ([order, first, second].every(Number.isFinite)) {
          bonds.push({
            first,
            second,
            order,
            stereo: cfg === 1 ? 1 : cfg === 2 ? 6 : cfg === 3 ? 4 : 0,
          });
        }
      }
    }

    atoms.sort((a, b) => a.index - b.index);
    atoms.forEach((atom, index) => {
      atom.index = index;
    });
    return { atoms, bonds };
  }

  const api = Object.freeze({ parseSdf });
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.MoleculeCore = api;
})();
