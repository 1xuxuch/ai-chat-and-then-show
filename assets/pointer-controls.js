(function () {
  "use strict";

  function createPointerControls(surface, group, camera, render, onClick, homeRotation = { x: 0, y: 0, z: 0 }, options = {}) {
    const pointer = {
      active: false,
      id: null,
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
      moved: false,
      shiftKey: false,
      button: 0,
      distance: 10,
      minDistance: 1.5,
      maxDistance: 80,
    };

    function updateCameraDistance() {
      if (camera.isOrthographicCamera) {
        const aspect = camera.userData.viewportAspect || 1;
        camera.left = -pointer.distance * aspect;
        camera.right = pointer.distance * aspect;
        camera.top = pointer.distance;
        camera.bottom = -pointer.distance;
        camera.updateProjectionMatrix();
      } else {
        camera.position.z = pointer.distance;
      }
    }

    function onPointerDown(event) {
      if (event.button !== 0 && event.button !== 2) {
        return;
      }
      event.preventDefault();
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.startX = event.clientX;
      pointer.startY = event.clientY;
      pointer.moved = false;
      pointer.button = event.button;
      pointer.shiftKey = event.shiftKey;
      surface.style.cursor = "grabbing";
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded preview surfaces reject pointer capture.
      }
    }

    function onPointerMove(event) {
      if (!pointer.active || (pointer.id !== null && event.pointerId !== pointer.id)) {
        return;
      }
      event.preventDefault();
      let dx = event.clientX - pointer.x;
      let dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const totalX = event.clientX - pointer.startX;
      const totalY = event.clientY - pointer.startY;
      if (!pointer.moved && Math.hypot(totalX, totalY) < 5) {
        return;
      }
      if (!pointer.moved) {
        pointer.moved = true;
        dx = totalX;
        dy = totalY;
      }
      const speed = 0.009;

      if (options.panWithRightButton && pointer.button === 2 && camera.isOrthographicCamera) {
        const bounds = surface.getBoundingClientRect();
        group.position.x += dx * (camera.right - camera.left) / Math.max(bounds.width, 1);
        group.position.y -= dy * (camera.top - camera.bottom) / Math.max(bounds.height, 1);
      } else if (event.shiftKey || event.buttons === 2 || pointer.button === 2) {
        // Shift drag rotates around Z; the molecule viewer also supports right drag.
        group.rotation.z -= dy * speed;
      } else {
        group.rotation.y -= dx * speed;
        group.rotation.x -= dy * speed;
      }
      render();
    }

    function onPointerUp(event) {
      if (!pointer.active || event.pointerId !== pointer.id) {
        return;
      }
      const shouldPick = event.type === "pointerup" && !pointer.moved && pointer.button === 0;
      const shouldSelectBond = pointer.shiftKey || event.shiftKey;
      const clientX = event.clientX;
      const clientY = event.clientY;
      event.preventDefault();
      pointer.active = false;
      pointer.id = null;
      pointer.button = 0;
      pointer.shiftKey = false;
      surface.style.cursor = "grab";
      try {
        if (surface.hasPointerCapture(event.pointerId)) {
          surface.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The pointer may already have been released by the browser.
      }
      if (shouldPick) {
        onClick(clientX, clientY, shouldSelectBond);
      }
    }

    function onWheel(event) {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0012);
      pointer.distance = clamp(
        pointer.distance * factor,
        pointer.minDistance,
        pointer.maxDistance,
      );
      updateCameraDistance();
      render();
    }

    function onContextMenu(event) {
      event.preventDefault();
    }

    surface.style.touchAction = "none";
    surface.style.userSelect = "none";
    surface.style.cursor = "grab";
    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerUp);
    surface.addEventListener("wheel", onWheel, { passive: false });
    surface.addEventListener("contextmenu", onContextMenu);

    return {
      getDistance() {
        return pointer.distance;
      },
      reset(distance = 10) {
        group.rotation.set(homeRotation.x, homeRotation.y, homeRotation.z);
        group.position.set(0, 0, 0);
        pointer.distance = clamp(distance, pointer.minDistance, pointer.maxDistance);
        updateCameraDistance();
        pointer.active = false;
        pointer.id = null;
        pointer.button = 0;
        pointer.moved = false;
        pointer.shiftKey = false;
        surface.style.cursor = "grab";
        render();
      },
      setDistanceLimits(minimum, maximum) {
        pointer.minDistance = minimum;
        pointer.maxDistance = maximum;
        pointer.distance = clamp(pointer.distance, minimum, maximum);
        updateCameraDistance();
      },
      setDistance(distance) {
        pointer.distance = clamp(
          distance,
          pointer.minDistance,
          pointer.maxDistance,
        );
        updateCameraDistance();
        render();
      },
      destroy() {
        surface.removeEventListener("pointerdown", onPointerDown);
        surface.removeEventListener("pointermove", onPointerMove);
        surface.removeEventListener("pointerup", onPointerUp);
        surface.removeEventListener("pointercancel", onPointerUp);
        surface.removeEventListener("wheel", onWheel);
        surface.removeEventListener("contextmenu", onContextMenu);
      },
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }


  window.ViewerPointerControls = { createPointerControls };
})();
