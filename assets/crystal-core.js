// CIF parsing, symmetry expansion and crystal geometry.
(function () {
  "use strict";
  function tokenizeCif(text) {
    const source = String(text).replace(/\r/g, "");
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const character = source[index];
      if (/\s/.test(character)) {
        index += 1;
        continue;
      }
      if (character === "#") {
        const lineEnd = source.indexOf("\n", index);
        index = lineEnd < 0 ? source.length : lineEnd + 1;
        continue;
      }
      if (character === ";" && (index === 0 || source[index - 1] === "\n")) {
        const closing = source.indexOf("\n;", index + 1);
        if (closing < 0) {
          throw new Error("CIF 文件包含未结束的多行字段。");
        }
        let value = source.slice(index + 1, closing);
        value = value.replace(/^\n/, "");
        tokens.push({ value, quoted: true });
        const nextLine = source.indexOf("\n", closing + 2);
        index = nextLine < 0 ? source.length : nextLine + 1;
        continue;
      }
      if (character === "'" || character === '"') {
        const quote = character;
        let end = index + 1;
        while (end < source.length) {
          if (source[end] === quote && (end + 1 === source.length || /\s/.test(source[end + 1]))) {
            break;
          }
          end += 1;
        }
        if (end >= source.length) {
          throw new Error("CIF 文件包含未结束的引号字段。");
        }
        tokens.push({ value: source.slice(index + 1, end), quoted: true });
        index = end + 1;
        continue;
      }
      const start = index;
      while (index < source.length && !/\s/.test(source[index])) {
        if (source[index] === "#") break;
        index += 1;
      }
      if (index > start) {
        tokens.push({ value: source.slice(start, index), quoted: false });
      }
      if (source[index] === "#") {
        const lineEnd = source.indexOf("\n", index);
        index = lineEnd < 0 ? source.length : lineEnd + 1;
      }
    }
    return tokens;
  }

  function normalizeCifTag(tag) {
    return tag.toLowerCase().replace(/\./g, "_");
  }

  function parseCifTables(text) {
    const tokens = tokenizeCif(text);
    const scalars = {};
    const loops = [];
    let index = 0;
    const isControl = (token) => {
      if (!token || token.quoted) return false;
      const value = token.value.toLowerCase();
      return value === "loop_" || value === "stop_" || value.startsWith("data_") || value.startsWith("save_") || value.startsWith("_");
    };

    while (index < tokens.length) {
      const token = tokens[index];
      const value = token.value.toLowerCase();
      if (!token.quoted && value === "loop_") {
        index += 1;
        const tags = [];
        while (index < tokens.length && !tokens[index].quoted && tokens[index].value.startsWith("_")) {
          tags.push(normalizeCifTag(tokens[index].value));
          index += 1;
        }
        if (!tags.length) continue;
        const values = [];
        while (index < tokens.length && !isControl(tokens[index])) {
          values.push(tokens[index].value);
          index += 1;
        }
        const rows = [];
        for (let offset = 0; offset + tags.length <= values.length; offset += tags.length) {
          const row = {};
          tags.forEach((tag, column) => { row[tag] = values[offset + column]; });
          rows.push(row);
        }
        loops.push({ tags, rows });
        if (index < tokens.length && !tokens[index].quoted && tokens[index].value.toLowerCase() === "stop_") index += 1;
        continue;
      }
      if (!token.quoted && value.startsWith("_") && index + 1 < tokens.length) {
        scalars[normalizeCifTag(token.value)] = tokens[index + 1].value;
        index += 2;
        continue;
      }
      index += 1;
    }
    return { scalars, loops };
  }

  function parseCifNumber(value) {
    if (value === undefined || value === null || value === "." || value === "?") return null;
    const parsed = Number.parseFloat(String(value).replace(/\([0-9]+\)$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseCifFraction(value) {
    const text = String(value).trim();
    if (text.includes("/")) {
      const [numerator, denominator] = text.split("/").map(Number);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) return numerator / denominator;
    }
    return Number(text);
  }

  function evaluateSymmetryCoordinate(expression, fractional) {
    const compact = String(expression).replace(/\s+/g, "").toLowerCase();
    const terms = compact.match(/[+-]?[^+-]+/g) || [];
    let result = 0;
    for (const term of terms) {
      const variableMatch = term.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?(?:\/\d+(?:\.\d*)?)?)([xyz])$/);
      if (variableMatch) {
        const coefficientText = variableMatch[1];
        const coefficient = coefficientText === "" || coefficientText === "+" ? 1
          : coefficientText === "-" ? -1 : parseCifFraction(coefficientText);
        result += coefficient * fractional[variableMatch[2]];
      } else {
        const constant = parseCifFraction(term);
        if (!Number.isFinite(constant)) throw new Error("无法解析 CIF 对称操作：" + expression);
        result += constant;
      }
    }
    return result;
  }

  function normalizeFractional(value) {
    const wrapped = ((value % 1) + 1) % 1;
    return Math.abs(wrapped - 1) < 1e-7 ? 0 : wrapped;
  }

  function parseCif(text, { resolveOccupancy = true } = {}) {
    const { scalars, loops } = parseCifTables(text);
    const cell = {
      a: parseCifNumber(scalars._cell_length_a),
      b: parseCifNumber(scalars._cell_length_b),
      c: parseCifNumber(scalars._cell_length_c),
      alpha: parseCifNumber(scalars._cell_angle_alpha) || 90,
      beta: parseCifNumber(scalars._cell_angle_beta) || 90,
      gamma: parseCifNumber(scalars._cell_angle_gamma) || 90,
    };
    if (![cell.a, cell.b, cell.c].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error("CIF 缺少有效的晶胞边长 _cell_length_a/b/c。");
    }
    const alpha = cell.alpha * Math.PI / 180;
    const beta = cell.beta * Math.PI / 180;
    const gamma = cell.gamma * Math.PI / 180;
    const cosAlpha = Math.cos(alpha);
    const cosBeta = Math.cos(beta);
    const cosGamma = Math.cos(gamma);
    const sinGamma = Math.sin(gamma);
    if (Math.abs(sinGamma) < 1e-5) throw new Error("CIF 的晶胞角度无效，无法建立三维晶胞。");
    const cellVectors = {
      a: { x: cell.a, y: 0, z: 0 },
      b: { x: cell.b * cosGamma, y: cell.b * sinGamma, z: 0 },
      c: {
        x: cell.c * cosBeta,
        y: cell.c * (cosAlpha - cosBeta * cosGamma) / sinGamma,
        z: 0,
      },
    };
    const czSquared = cell.c * cell.c - cellVectors.c.x ** 2 - cellVectors.c.y ** 2;
    if (czSquared < -1e-4) throw new Error("CIF 的晶胞参数不构成有效的三维晶胞。");
    cellVectors.c.z = Math.sqrt(Math.max(czSquared, 0));

    const atomRows = [];
    let fractionalCoordinates = false;
    for (const loop of loops) {
      const hasFractional = loop.tags.includes("_atom_site_fract_x") && loop.tags.includes("_atom_site_fract_y") && loop.tags.includes("_atom_site_fract_z");
      const hasCartesian = loop.tags.includes("_atom_site_cartn_x") && loop.tags.includes("_atom_site_cartn_y") && loop.tags.includes("_atom_site_cartn_z");
      if (!hasFractional && !hasCartesian) continue;
      fractionalCoordinates = hasFractional;
      for (const row of loop.rows) {
        const coordinates = hasFractional
          ? { x: parseCifNumber(row._atom_site_fract_x), y: parseCifNumber(row._atom_site_fract_y), z: parseCifNumber(row._atom_site_fract_z) }
          : { x: parseCifNumber(row._atom_site_cartn_x), y: parseCifNumber(row._atom_site_cartn_y), z: parseCifNumber(row._atom_site_cartn_z) };
        const rawElement = row._atom_site_type_symbol || row._atom_site_label || "C";
        const match = String(rawElement).match(/[A-Za-z]{1,2}/);
        if (Object.values(coordinates).every(Number.isFinite) && match) {
          const element = match[0][0].toUpperCase() + match[0].slice(1).toLowerCase();
          if (resolveOccupancy) {
            const occupancy = parseCifNumber(row._atom_site_occupancy);
            if (occupancy === null || occupancy > 0) {
              atomRows.push({ element, occupancy: occupancy === null ? 1 : occupancy, ...coordinates });
            }
          } else {
            atomRows.push({ element, ...coordinates });
          }
        }
      }
      if (atomRows.length) break;
    }
    if (!atomRows.length) throw new Error("CIF 中未找到可解析的原子坐标（fract 或 Cartn）。");

    const symmetryOperations = [];
    const operationTags = ["_space_group_symop_operation_xyz", "_symmetry_equiv_pos_as_xyz"];
    for (const loop of loops) {
      const operationTag = loop.tags.find((tag) => operationTags.includes(tag));
      if (operationTag) loop.rows.forEach((row) => symmetryOperations.push(row[operationTag]));
    }
    for (const tag of operationTags) {
      if (scalars[tag]) symmetryOperations.push(scalars[tag]);
    }
    const operations = [...new Set(symmetryOperations.filter((value) => value && value !== "." && value !== "?"))];
    if (!operations.length || !fractionalCoordinates) operations.splice(0, operations.length, "x,y,z");
    const expanded = [];
    const sites = new Map();
    if (fractionalCoordinates) {
      for (const atom of atomRows) {
        for (const operation of operations) {
          const coordinates = operation.split(",");
          if (coordinates.length !== 3) continue;
          const transformed = {
            x: normalizeFractional(evaluateSymmetryCoordinate(coordinates[0], atom)),
            y: normalizeFractional(evaluateSymmetryCoordinate(coordinates[1], atom)),
            z: normalizeFractional(evaluateSymmetryCoordinate(coordinates[2], atom)),
          };
          const position = `${transformed.x.toFixed(5)}:${transformed.y.toFixed(5)}:${transformed.z.toFixed(5)}`;
          const key = resolveOccupancy ? position : `${atom.element}:${position}`;
          const previous = sites.get(key);
          // A mixed Al/Si site is one crystallographic position, not two overlapping spheres.
          // Show its most occupied species as a visual representative of the average site.
          if (!previous || atom.occupancy > previous.occupancy) {
            sites.set(key, { ...atom, ...transformed });
          }
        }
      }
      expanded.push(...sites.values());
    } else {
      atomRows.forEach((atom) => expanded.push(atom));
    }
    return { cell, cellVectors, fractionalCoordinates, atoms: expanded };
  }

  function expandCrystal(model, repeat, { extendedRadii = true } = {}) {
    const totalCount = model.atoms.length * repeat ** 3;
    if (totalCount > 6000) {
      throw new Error(`该晶胞按 ${repeat} × ${repeat} × ${repeat} 重复会显示 ${totalCount} 个原子，请调低晶胞重复范围。`);
    }
    const positions = [];
    const { a, b, c } = model.cellVectors;
    const addCellPosition = (atom, tx, ty, tz) => {
      if (model.fractionalCoordinates) {
        const fx = atom.x + tx;
        const fy = atom.y + ty;
        const fz = atom.z + tz;
        return {
          element: atom.element,
          x: a.x * fx + b.x * fy + c.x * fz,
          y: a.y * fx + b.y * fy + c.y * fz,
          z: a.z * fx + b.z * fy + c.z * fz,
        };
      }
      return {
        element: atom.element,
        x: atom.x + a.x * tx + b.x * ty + c.x * tz,
        y: atom.y + a.y * tx + b.y * ty + c.y * tz,
        z: atom.z + a.z * tx + b.z * ty + c.z * tz,
      };
    };
    const offset = (repeat - 1) / 2;
    for (let tx = 0; tx < repeat; tx += 1) {
      for (let ty = 0; ty < repeat; ty += 1) {
        for (let tz = 0; tz < repeat; tz += 1) {
          model.atoms.forEach((atom) => {
            positions.push(addCellPosition(atom, tx - offset, ty - offset, tz - offset));
          });
        }
      }
    }
    const molecule = inferCrystalBonds(positions, extendedRadii ? GALLERY_RADII : COVALENT_RADII);
    const center = get3dCenter(positions);
    const latticePoint = (tx, ty, tz) => {
      const fx = tx - offset;
      const fy = ty - offset;
      const fz = tz - offset;
      const point = { x: a.x * fx + b.x * fy + c.x * fz, y: a.y * fx + b.y * fy + c.y * fz, z: a.z * fx + b.z * fy + c.z * fz };
      return { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
    };
    const cellEdges = [];
    const cellEdgeMeta = [];
    const addEdge = (first, second, axis, fixed1, fixed2) => {
      cellEdges.push(first.x, first.y, first.z, second.x, second.y, second.z);
      cellEdgeMeta.push({ axis, fixed1, fixed2 });
    };
    for (let iy = 0; iy <= repeat; iy += 1) {
      for (let iz = 0; iz <= repeat; iz += 1) {
        for (let ix = 0; ix < repeat; ix += 1) addEdge(latticePoint(ix, iy, iz), latticePoint(ix + 1, iy, iz), "x", iy, iz);
      }
    }
    for (let ix = 0; ix <= repeat; ix += 1) {
      for (let iz = 0; iz <= repeat; iz += 1) {
        for (let iy = 0; iy < repeat; iy += 1) addEdge(latticePoint(ix, iy, iz), latticePoint(ix, iy + 1, iz), "y", ix, iz);
      }
    }
    for (let ix = 0; ix <= repeat; ix += 1) {
      for (let iy = 0; iy <= repeat; iy += 1) {
        for (let iz = 0; iz < repeat; iz += 1) addEdge(latticePoint(ix, iy, iz), latticePoint(ix, iy, iz + 1), "z", ix, iy);
      }
    }
    molecule.cellEdges = cellEdges;
    molecule.cellEdgeMeta = cellEdgeMeta;
    molecule.cellCorners = [];
    for (const ix of [0, repeat]) {
      for (const iy of [0, repeat]) {
        for (const iz of [0, repeat]) {
          molecule.cellCorners.push({ ix, iy, iz, point: latticePoint(ix, iy, iz) });
        }
      }
    }
    return molecule;
  }

  const COVALENT_RADII = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Cl: 1.02, Br: 1.20, I: 1.39, P: 1.07, S: 1.05, B: 0.85, Si: 1.11, Na: 1.66, Mg: 1.41, K: 2.03, Ca: 1.76, Fe: 1.24, Zn: 1.22, Cu: 1.32 };
  const GALLERY_RADII = {
    ...COVALENT_RADII,
    Ti: 1.36, Mn: 1.39, Al: 1.21, Cd: 1.44, Co: 1.26, Se: 1.20, As: 1.19,
    Re: 1.51, Cs: 2.44, La: 2.07, Ni: 1.24, Ba: 1.98, Y: 1.90, Po: 1.40, Ga: 1.22,
  };

  function inferCrystalBonds(atoms, radii) {
    const cellSize = 2.4;
    const buckets = new Map();
    const bonds = [];
    const bucketKey = (x, y, z) => `${x},${y},${z}`;
    const atomBuckets = atoms.map((atom) => ({ x: Math.floor(atom.x / cellSize), y: Math.floor(atom.y / cellSize), z: Math.floor(atom.z / cellSize) }));
    atoms.forEach((atom, index) => {
      const bucket = atomBuckets[index];
      const firstRadius = radii[atom.element] || 0.82;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            const candidates = buckets.get(bucketKey(bucket.x + dx, bucket.y + dy, bucket.z + dz)) || [];
            candidates.forEach((otherIndex) => {
              const other = atoms[otherIndex];
              const secondRadius = radii[other.element] || 0.82;
              const distance = Math.hypot(atom.x - other.x, atom.y - other.y, atom.z - other.z);
              const maximum = (firstRadius + secondRadius) * 1.18;
              if (distance > 0.42 && distance < maximum) bonds.push([otherIndex, index]);
            });
          }
        }
      }
      const key = bucketKey(bucket.x, bucket.y, bucket.z);
      const items = buckets.get(key) || [];
      items.push(index);
      buckets.set(key, items);
    });
    return { atoms, bonds };
  }

  function get3dCenter(atoms) {
    const bounds = atoms.reduce(
      (result, atom) => ({
        minX: Math.min(result.minX, atom.x),
        maxX: Math.max(result.maxX, atom.x),
        minY: Math.min(result.minY, atom.y),
        maxY: Math.max(result.maxY, atom.y),
        minZ: Math.min(result.minZ, atom.z),
        maxZ: Math.max(result.maxZ, atom.z),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY,
        },
    );
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
  }

  function get3dRadius(atoms) {
    return atoms.reduce(
      (maximum, atom) =>
        Math.max(maximum, Math.hypot(atom.x, atom.y, atom.z)),
      0,
    ) + 1;
  }

  const api = Object.freeze({ parseCif, expandCrystal, get3dCenter, get3dRadius });
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.CrystalCore = api;
})();
