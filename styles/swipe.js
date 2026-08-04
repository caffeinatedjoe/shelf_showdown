(() => {
  const THRESHOLD = 40;
  const ANGLE_RATIO = 1.05;

  /**
   * Swipe left → undo, swipe right → skip.
   * Head to Head maps swipes to Book B / Book A votes instead.
   * Demo feedback only — styles page is not wired to the live app.
   */
  function bindSwipeScreen(screen) {
    const toast = screen.querySelector(".swipe-toast");
    const isHeadToHead = screen.classList.contains("h2h-screen");
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;
    let toastTimer = 0;

    function clearSwipeClass() {
      screen.classList.remove("is-swiping-left", "is-swiping-right");
    }

    function showToast(direction) {
      if (!toast) return;
      window.clearTimeout(toastTimer);
      const isLeft = direction === "left";
      toast.hidden = false;
      if (isHeadToHead) {
        toast.textContent = isLeft ? "Book B" : "Book A";
      } else {
        toast.textContent = isLeft ? "Undo" : "Skip";
      }
      toast.classList.toggle("is-undo", isLeft);
      toast.classList.toggle("is-skip", !isLeft);
      void toast.offsetWidth;
      toast.classList.add("is-visible");
      toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
        toastTimer = window.setTimeout(() => {
          toast.hidden = true;
        }, 220);
      }, 850);
    }

    function updateSwipeClass(dx, dy) {
      clearSwipeClass();
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;
      screen.classList.add(dx < 0 ? "is-swiping-left" : "is-swiping-right");
    }

    function detachDocListeners() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    }

    function finishSwipe() {
      if (!tracking) return;
      tracking = false;
      detachDocListeners();
      const dx = lastX - startX;
      const dy = lastY - startY;
      clearSwipeClass();
      pointerId = null;

      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) {
        return;
      }

      showToast(dx < 0 ? "left" : "right");
    }

    function onPointerMove(event) {
      if (!tracking || (pointerId != null && event.pointerId !== pointerId)) return;
      lastX = event.clientX;
      lastY = event.clientY;
      updateSwipeClass(lastX - startX, lastY - startY);
    }

    function onPointerUp(event) {
      if (!tracking || (pointerId != null && event.pointerId !== pointerId)) return;
      const upDx = Math.abs(event.clientX - startX);
      const lastDx = Math.abs(lastX - startX);
      if (upDx >= lastDx) {
        lastX = event.clientX;
        lastY = event.clientY;
      }
      finishSwipe();
    }

    function onPointerCancel(event) {
      if (pointerId != null && event.pointerId !== pointerId) return;
      finishSwipe();
    }

    function onPointerDown(event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest(".menu-btn, .h2h-vote, .h2h-tab-item")) return;
      tracking = true;
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerCancel);
    }

    screen.addEventListener("pointerdown", onPointerDown);
  }

  document.querySelectorAll("[data-swipe-screen]").forEach(bindSwipeScreen);
})();
