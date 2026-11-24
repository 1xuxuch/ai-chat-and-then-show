(function () {
  "use strict";

  const { get3dCenter, get3dRadius } = window.CrystalCore;
  const { createPointerControls } = window.ViewerPointerControls;

  const SYMMETRY_AXIS_LIMIT = 3;
  const SYMMETRY_AXIS_COLORS = new Map([
    ["2", "#b45309"], ["3", "#7c3aed"], ["4", "#0369a1"],
    ["5", "#be185d"], ["6", "#0f766e"], ["7", "#a21caf"],
    ["8", "#475569"], ["9", "#15803d"], ["10", "#b91c1c"],
    ["11", "#4338ca"], ["12", "#854d0e"], ["∞", "#0e7490"],
  ]);

  function symmetryAxisColor(order) {
    return SYMMETRY_AXIS_COLORS.get(String(order)) || "#334155";
  }

  function visibleSymmetryAxes(result) {
    const selected = [];
    const orders = new Set();
    for (const axis of result.axes) {
      if (orders.has(axis.order)) continue;
      selected.push(axis);
      orders.add(axis.order);
      if (selected.length === SYMMETRY_AXIS_LIMIT) return selected;
    }
    for (const axis of result.axes) {
      if (selected.includes(axis)) continue;
      selected.push(axis);
      if (selected.length === SYMMETRY_AXIS_LIMIT) break;
    }
    return selected;
  }

  const ELEMENT_COLORS = {
    H: "#f8fafc",
    C: "#334155",
    N: "#2563eb",
    O: "#dc2626",
    F: "#16a34a",
    Cl: "#16a34a",
    Br: "#a16207",
    I: "#7c3aed",
    P: "#ea580c",
    S: "#ca8a04",
    B: "#a855f7",
    Si: "#64748b",
    Na: "#0ea5e9",
    Mg: "#22c55e",
    K: "#8b5cf6",
    Ca: "#65a30d",
    Fe: "#b45309",
    Zn: "#0284c7",
    Cu: "#b45309",
  };

  const ELEMENT_RADII = {
    H: 0.23,
    C: 0.34,
    N: 0.32,
    O: 0.3,
    F: 0.29,
    Cl: 0.36,
    Br: 0.38,
    I: 0.42,
    P: 0.36,
    S: 0.36,
    B: 0.31,
    Si: 0.38,
    Na: 0.38,
    Mg: 0.38,
    K: 0.42,
    Ca: 0.42,
    Fe: 0.37,
    Zn: 0.37,
    Cu: 0.37,
  };

  function clearGroup(group) {
    group.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    group.clear();
  }

  function createAxisUpdater({ root, lines, labels, points }, THREE = window.THREE) {
    const localAxes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    return function updateAxisGizmo(rotation) {
      if (root.hidden || root.hasAttribute("hidden")) {
        return;
      }

      const origin = 50;
      const axisLength = 34;
      localAxes.forEach((localAxis, index) => {
        const direction = localAxis.clone().applyEuler(rotation);
        const screenX = direction.x;
        const screenY = -direction.y;
        const projectedLength = Math.hypot(screenX, screenY);
        const unitX = projectedLength > 0.001 ? screenX / projectedLength : 0;
        const unitY = projectedLength > 0.001 ? screenY / projectedLength : 0;
        const visibleLength = Math.max(7, axisLength * projectedLength);
        const endX = origin + unitX * visibleLength;
        const endY = origin + unitY * visibleLength;
        const line = lines[index];
        const label = labels[index];
        const point = points[index];

        const pointsTowardCamera = direction.z >= 0;
        const pointsAtCamera = projectedLength < 0.08;
        line.style.display = pointsAtCamera ? "none" : "";
        line.setAttribute("x1", origin);
        line.setAttribute("y1", origin);
        line.setAttribute("x2", endX.toFixed(2));
        line.setAttribute("y2", endY.toFixed(2));
        line.style.opacity = pointsTowardCamera ? "1" : "0.52";
        line.style.strokeDasharray = pointsTowardCamera ? "none" : "3 2";
        point.style.display = pointsAtCamera ? "" : "none";
        point.setAttribute("cx", origin);
        point.setAttribute("cy", origin);
        point.style.fill = pointsTowardCamera ? "" : "var(--canvas-color)";
        label.setAttribute(
          "x",
          pointsAtCamera ? origin : (origin + unitX * (visibleLength + 8)).toFixed(2),
        );
        label.setAttribute(
          "y",
          pointsAtCamera
            ? origin + (pointsTowardCamera ? 13 : -13)
            : (origin + unitY * (visibleLength + 8)).toFixed(2),
        );
        label.style.opacity = pointsTowardCamera ? "1" : "0.65";
      });
    };
  }

  function createViewer(host, { three: THREE = window.THREE, axis } = {}) {
    if (!THREE) {
      throw new Error("Three.js 未加载，暂时无法建立 3D 视图。");
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(getComputedStyle(host.parentElement || host).backgroundColor, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "三维分子结构；拖动旋转，滚轮缩放，单击选择原子，Shift 单击选择化学键",
    );
    Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
    host.replaceChildren(renderer.domElement);
    host.hidden = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xa7b5bb, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(4, 7, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb9e7e3, 1.5);
    fillLight.position.set(-5, 2, -4);
    scene.add(fillLight);

    const group = new THREE.Group();
    group.rotation.order = "YXZ";
    scene.add(group);
    let symmetryOverlay = null;

    function clearSymmetryOverlay() {
      if (!symmetryOverlay) return;
      clearGroup(symmetryOverlay);
      group.remove(symmetryOverlay);
      symmetryOverlay = null;
    }

    const updateAxis = axis ? createAxisUpdater(axis, THREE) : () => {};

    const renderScene = () => {
      renderer.render(scene, camera);
      updateAxis(group.rotation);
    };
    const atomMeshes = new Map();
    const bondMeshes = new Map();
    const selectableMeshes = [];
    const selectedAtoms = new Set();
    const selectedBonds = new Set();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    function registerSelectable(mesh, kind, index) {
      const material = mesh.material;
      mesh.userData.selectableKind = kind;
      mesh.userData.selectableIndex = index;
      mesh.userData.baseScale = mesh.scale.clone();
      mesh.userData.baseColor = material.color.clone();
      mesh.userData.baseEmissive = material.emissive.clone();
      mesh.userData.baseEmissiveIntensity = material.emissiveIntensity;
      selectableMeshes.push(mesh);
      if (kind === "atom") {
        atomMeshes.set(index, mesh);
      } else {
        const items = bondMeshes.get(index) || [];
        items.push(mesh);
        bondMeshes.set(index, items);
      }
    }

    function paintSelection(mesh, selected) {
      const material = mesh.material;
      const isAtom = mesh.userData.selectableKind === "atom";
      mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(
        selected ? (isAtom ? 1.16 : 1.45) : 1,
      );
      material.color.copy(mesh.userData.baseColor);
      material.emissive.copy(mesh.userData.baseEmissive);
      material.emissiveIntensity = mesh.userData.baseEmissiveIntensity;
      if (selected) {
        material.emissive.setHex(0x0c827f);
        material.emissiveIntensity = isAtom ? 0.5 : 0.75;
        if (isAtom && mesh.userData.element === "H") {
          material.color.setHex(0x38aaa5);
        } else if (!isAtom) {
          material.color.setHex(0x0c827f);
        }
      }
    }

    function repaintSelection() {
      atomMeshes.forEach((mesh, index) => paintSelection(mesh, selectedAtoms.has(index)));
      bondMeshes.forEach((meshes, index) => {
        meshes.forEach((mesh) => paintSelection(mesh, selectedBonds.has(index)));
      });
      renderScene();
    }

    function toggleSelection(kind, index) {
      const selected = kind === "atom" ? selectedAtoms : selectedBonds;
      if (selected.has(index)) {
        selected.delete(index);
      } else {
        selected.add(index);
      }
      repaintSelection();
    }

    function clearSelectedObjects() {
      selectedAtoms.clear();
      selectedBonds.clear();
      repaintSelection();
    }

    function pickObject(clientX, clientY, shiftKey) {
      const bounds = renderer.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }
      pointerNdc.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      pointerNdc.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const kind = shiftKey ? "bond" : "atom";
      const hit = raycaster.intersectObjects(selectableMeshes, false)[0];
      if (hit && hit.object.userData.selectableKind === kind) {
        toggleSelection(kind, hit.object.userData.selectableIndex);
      }
    }

    const controls = createPointerControls(
      renderer.domElement,
      group,
      camera,
      renderScene,
      pickObject,
    );

    const viewer = {
      scene,
      camera,
      renderer,
      group,
      controls,
      fitDistance: 10,
      modelCenter: { x: 0, y: 0, z: 0 },
      symmetryRadius: 1,
      resize() {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      },
      clearMolecule() {
        clearSelectedObjects();
        clearSymmetryOverlay();
        clearGroup(group);
        atomMeshes.clear();
        bondMeshes.clear();
        selectableMeshes.length = 0;
        controls.reset();
        if (axis) axis.root.hidden = false;
        host.hidden = true;
        renderScene();
      },
      resetView() {
        controls.reset(viewer.fitDistance);
      },
      clearSelection() {
        clearSelectedObjects();
      },
      setMolecule(molecule) {
        clearSelectedObjects();
        clearSymmetryOverlay();
        clearGroup(group);
        atomMeshes.clear();
        bondMeshes.clear();
        selectableMeshes.length = 0;
        controls.reset();
        if (axis) axis.root.hidden = true;
        host.hidden = false;

        if (!molecule || !molecule.atoms.length) {
          throw new Error("三维结构没有可显示的原子。");
        }

        const center = get3dCenter(molecule.atoms);
        const centeredAtoms = molecule.atoms.map((atom) => ({
          ...atom,
          x: atom.x - center.x,
          y: atom.y - center.y,
          z: atom.z - center.z,
        }));

        centeredAtoms.forEach((atom) => {
          const radius = ELEMENT_RADII[atom.element] || 0.34;
          const material = new THREE.MeshStandardMaterial({
            color: ELEMENT_COLORS[atom.element] || "#64748b",
            roughness: 0.35,
            metalness: 0.02,
          });
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 24, 16),
            material,
          );
          mesh.position.set(atom.x, atom.y, atom.z);
          mesh.userData.element = atom.element;
          group.add(mesh);
          registerSelectable(mesh, "atom", atom.index);
        });

        molecule.bonds.forEach((bond, bondIndex) => {
          const first = centeredAtoms[bond.first];
          const second = centeredAtoms[bond.second];
          if (!first || !second) {
            return;
          }
          addBondMeshes(THREE, group, first, second, bond.order).forEach((mesh) => {
            registerSelectable(mesh, "bond", bondIndex);
          });
        });

        const radius = get3dRadius(centeredAtoms);
        viewer.fitDistance = Math.max(radius * 3.4, 6);
        viewer.symmetryRadius = radius;
        camera.position.set(0, 0, viewer.fitDistance);
        camera.near = Math.max(0.01, viewer.fitDistance / 1000);
        camera.far = Math.max(1000, viewer.fitDistance * 20);
        camera.updateProjectionMatrix();
        controls.setDistanceLimits(viewer.fitDistance * 0.3, viewer.fitDistance * 8);
        if (axis) axis.root.hidden = false;
        controls.setDistance(viewer.fitDistance);
      },
      showSymmetry(result, visible) {
        clearSymmetryOverlay();
        if (!visible || !result) {
          renderScene();
          return;
        }
        symmetryOverlay = new THREE.Group();
        const marks = new THREE.Group();
        marks.position.set(
          result.center[0] - viewer.modelCenter.x,
          result.center[1] - viewer.modelCenter.y,
          result.center[2] - viewer.modelCenter.z,
        );
        symmetryOverlay.add(marks);
        const reach = viewer.symmetryRadius * 1.08;
        result.planes.slice(0, 2).forEach((plane) => {
          const mesh = new THREE.Mesh(
            new THREE.CircleGeometry(reach * 0.72, 64),
            new THREE.MeshBasicMaterial({
              color: 0x5c7bd9, transparent: true, opacity: 0.16,
              depthWrite: false, side: THREE.DoubleSide,
            }),
          );
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(...plane.normal),
          );
          marks.add(mesh);
        });
        visibleSymmetryAxes(result).forEach((axis) => {
          const direction = new THREE.Vector3(...axis.vector).multiplyScalar(reach);
          const geometry = new THREE.BufferGeometry().setFromPoints([
            direction.clone().negate(), direction,
          ]);
          const line = new THREE.Line(
            geometry,
            new THREE.LineDashedMaterial({
              color: symmetryAxisColor(axis.order), dashSize: 0.14, gapSize: 0.08, depthTest: false,
            }),
          );
          line.computeLineDistances();
          marks.add(line);
        });
        if (result.inversion) {
          marks.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0x7c3aed, depthTest: false }),
          ));
        }
        group.add(symmetryOverlay);
        renderScene();
      },
      render() {
        renderScene();
      },
      destroy() {
        controls.destroy();
        if (axis) axis.root.hidden = true;
        clearGroup(group);
        renderer.dispose();
        renderer.domElement.remove();
        host.hidden = true;
      },
    };

    viewer.resize();
    return viewer;
  }

  function addBondMeshes(THREE, group, first, second, order) {
    const meshes = [];
    const start = new THREE.Vector3(first.x, first.y, first.z);
    const end = new THREE.Vector3(second.x, second.y, second.z);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (!length) {
      return meshes;
    }

    direction.normalize();
    const reference =
      Math.abs(direction.y) < 0.88
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const perpendicular = direction.clone().cross(reference).normalize();
    const isAromatic = order === 4;
    const normalizedOrder = isAromatic ? 1 : Math.min(Math.max(order, 1), 3);
    const gap = 0.1;
    const offsets =
      normalizedOrder === 1
        ? [0]
        : normalizedOrder === 2
          ? [-gap, gap]
          : [-gap * 1.35, 0, gap * 1.35];

    offsets.forEach((offset) => {
      const offsetVector = perpendicular.clone().multiplyScalar(offset);
      if (isAromatic) {
        const segmentCount = 3;
        const segmentLength = length * 0.16;
        for (let index = 0; index < segmentCount; index += 1) {
          const ratio = (index + 1) / (segmentCount + 1);
          const midpoint = start
            .clone()
            .add(direction.clone().multiplyScalar(length * ratio))
            .add(offsetVector);
          const geometry = new THREE.CylinderGeometry(0.052, 0.052, segmentLength, 10);
          const material = new THREE.MeshStandardMaterial({
            color: 0x9aa8ad,
            roughness: 0.48,
            metalness: 0.06,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(midpoint);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction,
          );
          group.add(mesh);
          meshes.push(mesh);
        }
        return;
      }

      const midpoint = start.clone().add(end).multiplyScalar(0.5).add(offsetVector);
      const geometry = new THREE.CylinderGeometry(0.075, 0.075, length, 12);
      const material = new THREE.MeshStandardMaterial({
        color: 0x9aa8ad,
        roughness: 0.48,
        metalness: 0.06,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(midpoint);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
      group.add(mesh);
      meshes.push(mesh);
    });
    return meshes;
  }

  window.MoleculeViewer3D = {
    createViewer, createAxisUpdater, visibleSymmetryAxes, symmetryAxisColor,
    symmetryAxisLimit: SYMMETRY_AXIS_LIMIT,
    elementColors: Object.freeze(ELEMENT_COLORS),
    elementRadii: Object.freeze(ELEMENT_RADII),
  };
})();
