(() => {
  /** @type {{ id: string, title: string, author: string, isbn: string }[][]} */
  const HANDFULS = [
    [
      { id: "lhd", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn: "0441478123" },
      { id: "neu", title: "Neuromancer", author: "William Gibson", isbn: "9780441569595" },
      { id: "cir", title: "Circe", author: "Madeline Miller", isbn: "9780316556347" },
      { id: "phm", title: "Project Hail Mary", author: "Andy Weir", isbn: "9780593135204" },
      { id: "kla", title: "Klara and the Sun", author: "Kazuo Ishiguro", isbn: "9780593318171" },
    ],
    [
      { id: "pir", title: "Piranesi", author: "Susanna Clarke", isbn: "9781635577808" },
      { id: "dne", title: "Dune", author: "Frank Herbert", isbn: "9780441172719" },
      { id: "nlg", title: "Never Let Me Go", author: "Kazuo Ishiguro", isbn: "9781400078776" },
      { id: "mar", title: "The Martian", author: "Andy Weir", isbn: "9780553418026" },
      { id: "nam", title: "The Name of the Wind", author: "Patrick Rothfuss", isbn: "9780756404741" },
    ],
    [
      { id: "gats", title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565" },
      { id: "1984", title: "1984", author: "George Orwell", isbn: "9780451524935" },
      { id: "hob", title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227" },
      { id: "fnn", title: "Fahrenheit 451", author: "Ray Bradbury", isbn: "9781451673319" },
      { id: "brave", title: "Brave New World", author: "Aldous Huxley", isbn: "9780060850524" },
    ],
  ];

  const list = document.getElementById("handful-list");
  const submitBtn = document.getElementById("handful-submit");
  const statusEl = document.getElementById("handful-status");
  const roundEl = document.getElementById("handful-round");
  const screen = document.getElementById("handful-screen");

  if (!list || !submitBtn || !statusEl || !roundEl || !screen) return;

  let roundIndex = 0;
  /** @type {{ id: string, title: string, author: string, isbn: string }[]} */
  let books = [];
  let statusTimer = 0;

  /** @type {{
   *   item: HTMLElement,
   *   placeholder: HTMLElement,
   *   pointerId: number,
   *   grabOffsetY: number,
   *   height: number,
   *   width: number,
   * } | null} */
  let drag = null;

  function coverUrl(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }

  function setStatus(message) {
    window.clearTimeout(statusTimer);
    statusEl.textContent = message;
    if (!message) return;
    statusTimer = window.setTimeout(() => {
      statusEl.textContent = "";
    }, 2200);
  }

  function syncBooksFromDom() {
    const byId = new Map(books.map((b) => [b.id, b]));
    books = [...list.querySelectorAll(".handful-item")]
      .map((node) => byId.get(node.dataset.id ?? ""))
      .filter(Boolean);
  }

  function updateRanks() {
    const items = [...list.querySelectorAll(".handful-item")];
    items.forEach((item, index) => {
      const rank = item.querySelector(".handful-rank");
      if (rank) {
        const next = String(index + 1);
        if (rank.textContent !== next) {
          rank.textContent = next;
          rank.classList.add("is-ticking");
          window.setTimeout(() => rank.classList.remove("is-ticking"), 180);
        }
      }
      item.classList.toggle("is-first", index === 0);
      item.classList.toggle("is-last", index === items.length - 1);
    });
  }

  function renderList() {
    list.replaceChildren();
    books.forEach((book, index) => {
      const li = document.createElement("li");
      li.className = "handful-item";
      li.dataset.id = book.id;
      li.style.setProperty("--i", String(index));

      li.innerHTML = `
        <button type="button" class="handful-handle" aria-label="Drag to reorder ${book.title}">
          <span class="handful-rank">${index + 1}</span>
          <span class="handful-grip" aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
        </button>
        <span class="handful-cover">
          <img draggable="false" src="${coverUrl(book.isbn)}" alt="" width="56" height="84" loading="lazy" />
        </span>
        <span class="handful-meta">
          <span class="handful-title">${book.title}</span>
          <span class="handful-author">${book.author}</span>
        </span>
      `;

      list.append(li);
    });
    updateRanks();
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function loadRound(index) {
    roundIndex = ((index % HANDFULS.length) + HANDFULS.length) % HANDFULS.length;
    books = shuffle(HANDFULS[roundIndex].map((b) => ({ ...b })));
    roundEl.textContent = `${roundIndex + 1}/${HANDFULS.length}`;
    screen.classList.remove("is-submitted");
    submitBtn.disabled = false;
    renderList();
  }

  function movePlaceholderTo(clientY) {
    if (!drag) return;
    const slots = [...list.children].filter(
      (el) => el !== drag.item && el !== drag.placeholder
    );

    let insertAt = slots.length;
    for (let i = 0; i < slots.length; i++) {
      const rect = slots[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        insertAt = i;
        break;
      }
    }

    const reference = slots[insertAt] ?? null;
    if (reference) {
      list.insertBefore(drag.placeholder, reference);
    } else {
      list.append(drag.placeholder);
    }
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const listRect = list.getBoundingClientRect();
    const y = event.clientY - listRect.top - drag.grabOffsetY;
    const maxY = Math.max(0, listRect.height - drag.height);
    drag.item.style.top = `${Math.max(0, Math.min(maxY, y))}px`;

    movePlaceholderTo(event.clientY);
    updateRanksLive();
  }

  function updateRanksLive() {
    if (!drag) return;
    const order = [...list.children].filter((el) => el !== drag.item);
    let visualRank = 1;
    for (const el of order) {
      if (el === drag.placeholder) {
        const rank = drag.item.querySelector(".handful-rank");
        if (rank) rank.textContent = String(visualRank);
        drag.item.classList.toggle("is-first", visualRank === 1);
        visualRank += 1;
        continue;
      }
      const rank = el.querySelector(".handful-rank");
      if (rank) rank.textContent = String(visualRank);
      el.classList.toggle("is-first", visualRank === 1);
      visualRank += 1;
    }
  }

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;

    const { item, placeholder, pointerId } = drag;
    list.insertBefore(item, placeholder);
    placeholder.remove();

    item.classList.remove("is-dragging");
    item.style.top = "";
    item.style.left = "";
    item.style.width = "";
    item.style.height = "";
    item.releasePointerCapture?.(pointerId);

    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);

    list.classList.remove("is-reordering");
    drag = null;
    syncBooksFromDom();
    updateRanks();
  }

  function startDrag(event, item) {
    if (event.button != null && event.button !== 0) return;
    if (screen.classList.contains("is-submitted")) return;
    event.preventDefault();

    const rect = item.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();

    const placeholder = document.createElement("li");
    placeholder.className = "handful-placeholder";
    placeholder.style.height = `${rect.height}px`;
    placeholder.setAttribute("aria-hidden", "true");

    list.insertBefore(placeholder, item.nextSibling);

    drag = {
      item,
      placeholder,
      pointerId: event.pointerId,
      grabOffsetY: event.clientY - rect.top,
      height: rect.height,
      width: rect.width,
    };

    item.style.width = `${rect.width}px`;
    item.style.height = `${rect.height}px`;
    item.style.left = `${rect.left - listRect.left}px`;
    item.style.top = `${rect.top - listRect.top}px`;
    item.classList.add("is-dragging");
    list.classList.add("is-reordering");

    item.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
  }

  list.addEventListener("pointerdown", (event) => {
    const item = event.target.closest(".handful-item");
    if (!item || !list.contains(item)) return;
    startDrag(event, item);
  });

  submitBtn.addEventListener("click", () => {
    if (submitBtn.disabled) return;
    screen.classList.add("is-submitted");
    submitBtn.disabled = true;

    const top = books[0]?.title?.split(":")[0] ?? "Top pick";
    setStatus(`Locked · ${top} on top`);

    window.setTimeout(() => {
      screen.classList.add("is-dealing");
      window.setTimeout(() => {
        loadRound(roundIndex + 1);
        screen.classList.remove("is-dealing");
        setStatus("Next handful dealt");
      }, 300);
    }, 700);
  });

  loadRound(0);
})();
