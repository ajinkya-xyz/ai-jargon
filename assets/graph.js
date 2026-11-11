// Interactive force-directed concept graph. Data comes from window.GRAPH (built by build.py).
(function () {
  const data = window.GRAPH;
  const stage = document.getElementById("graph");
  if (!data || !stage || !window.d3) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = ["#868e96", "#e8590c", "#3b5bdb", "#0ca678", "#ae3ec9", "#e03131", "#f08c00", "#1098ad", "#d6336c", "#5c940d"];
  const color = (cat) => palette[data.categories.indexOf(cat) % palette.length];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- data prep ----------
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const neighbours = new Map(data.nodes.map((n) => [n.id, new Set([n.id])]));
  const degree = {};
  data.links.forEach((l) => {
    degree[l.source] = (degree[l.source] || 0) + 1;
    degree[l.target] = (degree[l.target] || 0) + 1;
    neighbours.get(l.source).add(l.target);
    neighbours.get(l.target).add(l.source);
  });
  const radius = (d) => 7 + Math.sqrt(degree[d.id] || 0) * 3.2;
  const hidden = new Set(); // categories toggled off in the legend

  // ---------- legend ----------
  const legend = d3.select("#legend"); // absent on the home page
  if (!legend.empty()) legend.selectAll("button").data(data.categories).join("button")
    .attr("class", "lg").attr("type", "button")
    .style("--c", (c) => color(c))
    .text((c) => c)
    .on("click", (e, c) => {
      hidden.has(c) ? hidden.delete(c) : hidden.add(c);
      legend.selectAll("button").classed("off", (d) => hidden.has(d));
      refresh();
    });

  // ---------- svg scaffold ----------
  const width = stage.clientWidth, height = stage.clientHeight;
  const svg = d3.select(stage).append("svg").attr("viewBox", [-width / 2, -height / 2, width, height]);
  const defs = svg.append("defs");
  defs.append("marker").attr("id", "arrow").attr("viewBox", "0 -4 8 8").attr("refX", 8).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L8,0L0,4").attr("class", "arrow");
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "b");
  const m = glow.append("feMerge"); m.append("feMergeNode").attr("in", "b"); m.append("feMergeNode").attr("in", "SourceGraphic");

  const root = svg.append("g");
  let userTouched = false; // once the visitor pans/zooms, stop auto-fitting under them
  const zoom = d3.zoom().scaleExtent([0.25, 5]).on("zoom", (e) => {
    if (e.sourceEvent) userTouched = true;
    root.attr("transform", e.transform);
  });
  svg.call(zoom).on("dblclick.zoom", null).on("click", (e) => { if (e.target === svg.node()) select(null); });

  const linkLayer = root.append("g").attr("class", "links");
  const labelLayer = root.append("g").attr("class", "link-labels");
  const particleLayer = root.append("g").attr("class", "particles");
  const nodeLayer = root.append("g").attr("class", "nodes");

  const link = linkLayer.selectAll("line").data(data.links).join("line")
    .attr("class", (d) => `link ${d.type}`)
    .attr("marker-end", (d) => (d.type === "builds_on" ? "url(#arrow)" : null));

  const linkLabel = labelLayer.selectAll("text").data(data.links).join("text")
    .attr("class", "link-label").text((d) => data.relations[d.type]);

  const node = nodeLayer.selectAll("g").data(data.nodes).join("g")
    .attr("class", (d) => `node r-${d.rarity}${d.new ? " is-new" : ""}`)
    .on("mouseenter", (e, d) => { if (!selected) highlight(d); showTip(e, d); })
    .on("mousemove", (e, d) => showTip(e, d))
    .on("mouseleave", () => { if (!selected) highlight(null); hideTip(); })
    .on("click", (e, d) => { e.stopPropagation(); select(d === selected ? null : d); })
    .call(d3.drag()
      .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(idleAlpha); d.fx = null; d.fy = null; }));

  node.filter((d) => d.new).append("circle").attr("class", "ring").attr("r", (d) => radius(d) + 6).attr("stroke", (d) => color(d.cat));
  node.append("circle").attr("class", "halo").attr("r", (d) => radius(d) + 10).attr("fill", (d) => color(d.cat));
  node.append("circle").attr("class", "dot").attr("r", 0).attr("fill", (d) => color(d.cat));
  node.append("text").attr("class", "label").text((d) => d.label).attr("x", (d) => radius(d) + 5).attr("y", 4);

  // ---------- simulation ----------
  // Keep the simulation warm forever so the graph never freezes; the forces hold the shape while wander() adds motion.
  const idleAlpha = reduced ? 0 : 0.03;
  data.nodes.forEach((d) => {
    d.f1 = 0.35 + Math.random() * 0.4; d.f2 = 0.35 + Math.random() * 0.4;   // each node bobs at its own speed
    d.p1 = Math.random() * Math.PI * 2; d.p2 = Math.random() * Math.PI * 2;
  });
  function wander() {
    if (reduced) return;
    const t = performance.now() / 1000;
    for (const d of data.nodes) {
      d.vx += Math.sin(t * d.f1 + d.p1) * 0.07;
      d.vy += Math.cos(t * d.f2 + d.p2) * 0.07;
    }
  }
  const sim = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id((d) => d.id).distance(130).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-720))
    // leave room for the label to the right of each node
    .force("collide", d3.forceCollide().radius((d) => radius(d) + 28 + Math.min(d.label.length, 18) * 1.3).iterations(2))
    .force("x", d3.forceX().strength(0.05))
    .force("y", d3.forceY().strength(0.09))
    .force("wander", wander)
    .alphaDecay(0.018)
    .velocityDecay(0.35)
    .on("tick", draw);

  // Pre-settle a little so the entrance is a graceful unfurl rather than a burst.
  sim.stop();
  data.nodes.forEach((d, i) => { const a = i * 2.4; d.x = Math.cos(a) * 30; d.y = Math.sin(a) * 30; });
  sim.tick(reduced ? 300 : 25);
  draw();
  fit(0);
  if (!reduced) sim.alpha(0.8).alphaTarget(idleAlpha).restart();

  function draw() {
    link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
      .attr("x2", (d) => edgeX(d)).attr("y2", (d) => edgeY(d));
    linkLabel.attr("transform", (d) => {
      const x = (d.source.x + d.target.x) / 2, y = (d.source.y + d.target.y) / 2;
      let a = Math.atan2(d.target.y - d.source.y, d.target.x - d.source.x) * 180 / Math.PI;
      if (a > 90 || a < -90) a += 180;
      return `translate(${x},${y}) rotate(${a})`;
    });
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }
  // shorten builds_on lines so the arrowhead sits on the target's rim
  function edgeX(d) { return d.type === "builds_on" ? trim(d).x : d.target.x; }
  function edgeY(d) { return d.type === "builds_on" ? trim(d).y : d.target.y; }
  function trim(d) {
    const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, len = Math.hypot(dx, dy) || 1;
    const r = radius(d.target) + 3;
    return { x: d.target.x - dx / len * r, y: d.target.y - dy / len * r };
  }

  // ---------- entrance animation ----------
  node.select(".dot").transition().delay((d, i) => (reduced ? 0 : 200 + i * 28)).duration(reduced ? 0 : 500)
    .ease(d3.easeBackOut.overshoot(1.8)).attr("r", radius);
  node.select(".label").style("opacity", 0).transition().delay((d, i) => (reduced ? 0 : 450 + i * 28)).duration(400).style("opacity", 1)
    .on("end", function () { d3.select(this).style("opacity", null); }); // hand control back to CSS (compact mode hides labels)
  link.style("opacity", 0).transition().delay((d, i) => (reduced ? 0 : 600 + i * 12)).duration(reduced ? 0 : 700)
    .style("opacity", 1).on("end", function () { d3.select(this).style("opacity", null); });

  // ---------- fit / focus ----------
  function fit(ms, auto) {
    if (auto && userTouched) return;
    const xs = data.nodes.map((d) => d.x), ys = data.nodes.map((d) => d.y);
    const minX = Math.min(...xs) - 70, maxX = Math.max(...xs) + 180, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 70;
    const k = Math.min(1.5, width / (maxX - minX), height / (maxY - minY));
    const t = d3.zoomIdentity.scale(k).translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    (ms ? svg.transition().duration(ms) : svg).call(zoom.transform, t);
  }
  function focus(d) {
    const panelW = window.innerWidth > 720 ? 160 : 0; // keep the node left of the details panel
    const t = d3.zoomIdentity.translate(-panelW, 0).scale(1.6).translate(-d.x, -d.y);
    svg.transition().duration(reduced ? 0 : 650).ease(d3.easeCubicInOut).call(zoom.transform, t);
  }
  // re-fit as the sim spreads out, then once more when it has calmed down
  if (!reduced) {
    setTimeout(() => fit(1200, true), 900);
    setTimeout(() => fit(1500, true), 3600);
  }

  // ---------- highlight / selection ----------
  let selected = null, hovered = null;
  function highlight(d) {
    hovered = d;
    refresh();
  }
  function refresh() {
    const focusNode = selected || hovered;
    const near = focusNode ? neighbours.get(focusNode.id) : null;
    const visible = (n) => !hidden.has(n.cat);
    node.classed("dim", (n) => !visible(n) || (near && !near.has(n.id)))
      .classed("focus", (n) => focusNode && n.id === focusNode.id)
      .classed("near", (n) => near && near.has(n.id) && n.id !== focusNode.id);
    link.classed("dim", (l) => !visible(l.source) || !visible(l.target) || (focusNode && l.source.id !== focusNode.id && l.target.id !== focusNode.id))
      .classed("lit", (l) => focusNode && (l.source.id === focusNode.id || l.target.id === focusNode.id));
    linkLabel.classed("show", (l) => focusNode && (l.source.id === focusNode.id || l.target.id === focusNode.id));
    particles(focusNode);
  }
  function select(d) {
    selected = d;
    refresh();
    renderPanel(d);
    if (d) focus(d); else fit(reduced ? 0 : 600);
  }

  // ---------- particles flowing along lit links ----------
  let particleTimer = null;
  function particles(focusNode) {
    particleLayer.selectAll("*").interrupt().remove();
    if (particleTimer) { particleTimer.stop(); particleTimer = null; }
    if (!focusNode || reduced) return;
    const lit = data.links.filter((l) => l.source.id === focusNode.id || l.target.id === focusNode.id);
    const dots = particleLayer.selectAll("circle").data(lit.flatMap((l) => [{ l, p: 0 }, { l, p: 0.5 }])).join("circle")
      .attr("r", 2.6).attr("fill", color(focusNode.cat));
    particleTimer = d3.timer((t) => {
      dots.each(function (d) {
        const p = (d.p + (t / 1800)) % 1;                 // 1.8s per traversal
        const from = d.l.source, to = d.l.target;
        d3.select(this).attr("cx", from.x + (to.x - from.x) * p).attr("cy", from.y + (to.y - from.y) * p)
          .attr("opacity", Math.sin(p * Math.PI));         // fade in/out at the ends
      });
    });
  }

  // ---------- ambient pulses: when nothing is focused, light travels along random connections ----------
  const ambientLayer = root.insert("g", ".nodes").attr("class", "ambient");
  function pulse() {
    if (selected || hovered) return;
    const pool = data.links.filter((l) => !hidden.has(l.source.cat) && !hidden.has(l.target.cat));
    if (!pool.length) return;
    const l = pool[Math.floor(Math.random() * pool.length)];
    const forward = Math.random() < 0.5;
    const from = forward ? l.source : l.target, to = forward ? l.target : l.source;
    ambientLayer.append("circle").attr("r", 3.2).attr("fill", color(from.cat)).attr("filter", "url(#glow)")
      .transition().duration(1700).ease(d3.easeSinInOut)
      .tween("move", function () {
        const el = d3.select(this);
        return (p) => el.attr("cx", from.x + (to.x - from.x) * p).attr("cy", from.y + (to.y - from.y) * p)
          .attr("opacity", Math.sin(p * Math.PI) * 0.9);   // positions read live, so pulses follow moving nodes
      })
      .remove();
  }
  let pulseTimer = null;
  function startMotion() {
    if (reduced) return;
    sim.alphaTarget(idleAlpha).restart();
    if (!pulseTimer) pulseTimer = d3.interval(pulse, 550);
  }
  function stopMotion() {
    sim.stop();
    if (pulseTimer) { pulseTimer.stop(); pulseTimer = null; }
  }
  // pause when the graph is scrolled out of view (the home page has lots below it)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => (entries[0].isIntersecting ? startMotion() : stopMotion())).observe(stage);
  } else {
    startMotion();
  }

  // ---------- tooltip & panel ----------
  const tip = document.getElementById("tip");
  function showTip(e, d) {
    if (selected) return;
    tip.innerHTML = `<strong>${esc(d.label)}</strong><span>${esc(d.one_liner)}</span>`;
    tip.hidden = false;
    const r = stage.getBoundingClientRect();
    const x = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8);
    tip.style.transform = `translate(${x}px, ${e.clientY - r.top + 14}px)`;
  }
  function hideTip() { tip.hidden = true; }

  const panel = document.getElementById("panel");
  function renderPanel(d) {
    if (!d) { panel.hidden = true; return; }
    hideTip();
    const rels = data.links.filter((l) => l.source.id === d.id || l.target.id === d.id).map((l) => {
      const other = l.source.id === d.id ? l.target : l.source;
      const verb = l.source.id === d.id ? data.relations[l.type] : (l.type === "related" ? "Related" : "Mentioned by");
      return `<li><button type="button" data-id="${other.id}"><span class="rel">${verb}</span>${esc(other.label)}</button></li>`;
    });
    panel.innerHTML = `
      <button class="close" type="button" aria-label="Close">×</button>
      <span class="cat" style="--c:${color(d.cat)}">${esc(d.cat)}</span>
      <h2>${esc(d.label)}</h2>
      <div class="meta">${d.new ? '<span class="badge new">new</span>' : ""}<span class="badge status-${d.status}">${d.status}</span>${d.first_seen ? `<span class="seen">First seen ${esc(d.first_seen)}</span>` : ""}</div>
      <p>${esc(d.one_liner)}</p>
      ${rels.length ? `<ul class="related">${rels.join("")}</ul>` : ""}
      <a class="open" href="/is/${d.id}/">Read the full entry →</a>`;
    panel.hidden = false;
    panel.querySelector(".close").onclick = () => select(null);
    panel.querySelectorAll("button[data-id]").forEach((b) => (b.onclick = () => select(byId.get(b.dataset.id))));
  }

  // ---------- search ----------
  // the graph page has its own box; on the home page we piggyback on the main search box
  const search = document.getElementById("gsearch") || document.getElementById("search");
  if (!search) return;
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    node.classed("match", (d) => q && d.label.toLowerCase().includes(q));
    nodeLayer.classed("searching", !!q);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || search.id !== "gsearch") return; // on the home page Enter opens the autocomplete pick
    const q = search.value.trim().toLowerCase();
    const hit = data.nodes.find((d) => d.label.toLowerCase().includes(q));
    if (hit) select(hit);
  });

  // keep the layout sane if the window is resized a lot
  let rw = width;
  addEventListener("resize", () => { if (Math.abs(stage.clientWidth - rw) > 200) { rw = stage.clientWidth; fit(300); } });
})();
