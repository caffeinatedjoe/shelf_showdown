(() => {
  const THRESHOLD = 56;
  const ANGLE_RATIO = 1.15;

  /**
   * Swipe left → undo, swipe right → skip.
   * Demo feedback only — styles page is not wired to the live app.
   */
  function bindSwipeScreen(screen) {
    const toast = screen.querySelector(".swipe-toast");
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pointerId = null;
    let toastTimer = 0;

    function clearSwipeClass() {
      screen.classList.remove("is-swiping-left", "is-swiping-right");
    }

    function showToast(action) {
      if (!toast) return;
      window.clearTimeout(toastTimer);
      toast.hidden = false;
      toast.textContent = action === "undo" ? "Undo" : "Skip";
      toast.classList.toggle("is-undo", action === "undo");
      toast.classList.toggle("is-skip", action === "skip");
      toast.classList.add("is-visible");
      toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
        toastTimer = window.setTimeout(() => {
          toast.hidden = true;
        }, 200);
      }, 700);
    }

    function onPointerDown(event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest(".menu-btn")) return;
      tracking = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      try {
        screen.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }

    function onPointerMove(event) {
      if (!tracking || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      clearSwipeClass();
      if (Math.abs(dx) < 18 || Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;
      screen.classList.add(dx < 0 ? "is-swiping-left" : "is-swiping-right");
    }

    function onPointerUp(event) {
      if (!tracking || event.pointerId !== pointerId) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      clearSwipeClass();
      try {
        screen.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      pointerId = null;

      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) {
        return;
      }

      // Left swipe → undo; right swipe → skip
      showToast(dx < 0 ? "undo" : "skip");
    }

    function onPointerCancel(event) {
      if (event.pointerId !== pointerId) return;
      tracking = false;
      pointerId = null;
      clearSwipeClass();
    }

    screen.addEventListener("pointerdown", onPointerDown);
    screen.addEventListener("pointermove", onPointerMove);
    screen.addEventListener("pointerup", onPointerUp);
    screen.addEventListener("pointercancel", onPointerCancel);
  }

  document.querySelectorAll("[data-swipe-screen]").forEach(bindSwipeScreen);
})();
