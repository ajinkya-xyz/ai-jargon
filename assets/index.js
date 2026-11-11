// Home page: search with autocomplete, category filter, "surprise me", rotating headline.
(function () {
  const terms = window.TERMS || [];
  const search = document.getElementById("search");
  const suggest = document.getElementById("suggest");
  const cards = Array.from(document.querySelectorAll("#all-grid .card"));
  const chips = Array.from(document.querySelectorAll(".chip"));
  const empty = document.getElementById("empty");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let category = "all";
  let active = -1; // highlighted suggestion index

  // ---------- card filtering ----------
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const ok = (category === "all" || card.dataset.cat === category) && (!q || card.dataset.search.includes(q));
      card.hidden = !ok;
      if (ok) shown++;
    }
    empty.hidden = shown > 0;
  }
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.toggle("active", c === chip));
      category = chip.dataset.filter;
      applyFilter();
    });
  }
  // /#cat-patterns style links from term pages pre-select a category
  const fromHash = location.hash.startsWith("#cat-") && chips.find((c) => c.id === location.hash.slice(1));
  if (fromHash) fromHash.click();

  // ---------- autocomplete ----------
  function matches(q) {
    const starts = [], contains = [];
    for (const t of terms) {
      const names = [t.label, ...t.aliases].map((s) => s.toLowerCase());
      if (names.some((n) => n.startsWith(q))) starts.push(t);
      else if (names.some((n) => n.includes(q)) || t.one_liner.toLowerCase().includes(q)) contains.push(t);
    }
    return [...starts, ...contains].slice(0, 7);
  }
  function highlight(text, q) {
    const i = text.toLowerCase().indexOf(q);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  function renderSuggest() {
    const q = search.value.trim().toLowerCase();
    const hits = q ? matches(q) : [];
    active = -1;
    if (!hits.length) { closeSuggest(); return; }
    suggest.innerHTML = hits.map((t, i) => {
      const alias = t.aliases.find((a) => a.toLowerCase().includes(q) && !t.label.toLowerCase().includes(q));
      return `<li role="option" id="sug-${i}" data-slug="${t.slug}">
        <span class="s-name">${highlight(t.label, q)}${alias ? ` <span class="s-alias">aka ${highlight(alias, q)}</span>` : ""}</span>
        <span class="s-desc">${highlight(t.one_liner, q)}</span></li>`;
    }).join("");
    suggest.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }
  function closeSuggest() {
    suggest.hidden = true;
    suggest.innerHTML = "";
    search.setAttribute("aria-expanded", "false");
    active = -1;
  }
  function setActive(i) {
    const items = suggest.querySelectorAll("li");
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((li, k) => li.classList.toggle("active", k === active));
    search.setAttribute("aria-activedescendant", `sug-${active}`);
  }
  search.addEventListener("input", () => { applyFilter(); renderSuggest(); });
  search.addEventListener("focus", renderSuggest);
  search.addEventListener("keydown", (e) => {
    if (suggest.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      const li = suggest.querySelector("li.active") || suggest.querySelector("li");
      if (li) { e.preventDefault(); location.href = `/is/${li.dataset.slug}/`; }
    } else if (e.key === "Escape") closeSuggest();
  });
  suggest.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (li) { e.preventDefault(); location.href = `/is/${li.dataset.slug}/`; }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) closeSuggest(); });

  // ---------- surprise me ----------
  const surprise = document.getElementById("surprise");
  if (surprise) {
    surprise.addEventListener("click", () => {
      // lean towards terms people are less likely to know
      const pool = terms.filter((t) => t.rarity !== "common");
      const pick = (pool.length ? pool : terms)[Math.floor(Math.random() * (pool.length || terms.length))];
      if (pick) location.href = `/is/${pick.slug}/`;
    });
  }

  // ---------- rotating headline ----------
  const el = document.getElementById("rotating");
  const words = terms.filter((t) => t.rarity !== "common").map((t) => t.label);
  if (el && words.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let i = words.indexOf(el.textContent);
    setInterval(() => {
      el.textContent = words[(i = (i + 1) % words.length)];
      if (window.fitHeadline) window.fitHeadline();
    }, 1800);
  }
})();
