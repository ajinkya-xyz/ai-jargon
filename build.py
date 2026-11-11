"""Build the static AI Jargon site from data/terms.json into dist/.

Usage:  python build.py
Then preview with:  python -m http.server 8000 -d dist
"""

import datetime as dt
import html
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "terms.json"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

SITE_URL = "https://aijargon.wtf"
SITE_NAME = "AI Jargon"
TAGLINE = "AI agent jargon, decoded."
NEW_DAYS = 14  # terms first seen within this many days get a NEW badge

RELATION_LABELS = {
    "builds_on": "Builds on",
    "part_of": "Part of",
    "alternative_to": "Alternative to",
    "related": "Related",
}
STATUSES = {"emerging", "mainstream", "fading", "renamed"}
RARITIES = ["rare", "uncommon", "common"]  # most to least obscure
REQUIRED = ["slug", "term", "category", "one_liner", "tldr", "technical", "status", "rarity"]

esc = html.escape


def asset(name):
    """URL for a file in assets/, with a content hash so browsers never serve a stale copy."""
    import hashlib
    digest = hashlib.md5((ASSETS / name).read_bytes()).hexdigest()[:8]
    return f"/assets/{name}?v={digest}"


# ---------- data ----------

def load():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    categories, terms = data["categories"], data["terms"]
    errors = []
    slugs = set()
    for t in terms:
        for field in REQUIRED:
            if not t.get(field):
                errors.append(f"{t.get('slug', '?')}: missing '{field}'")
        if t["slug"] in slugs:
            errors.append(f"{t['slug']}: duplicate slug")
        slugs.add(t["slug"])
        if t["category"] not in categories:
            errors.append(f"{t['slug']}: unknown category '{t['category']}'")
        if t["status"] not in STATUSES:
            errors.append(f"{t['slug']}: unknown status '{t['status']}'")
        if t.get("rarity") not in RARITIES:
            errors.append(f"{t['slug']}: unknown rarity '{t.get('rarity')}'")
    for t in terms:
        for r in t.get("related", []):
            if r["slug"] not in slugs:
                errors.append(f"{t['slug']}: related term '{r['slug']}' does not exist")
            if r["type"] not in RELATION_LABELS:
                errors.append(f"{t['slug']}: unknown relation type '{r['type']}'")
    if errors:
        sys.exit("terms.json has problems:\n  " + "\n  ".join(errors))
    for t in terms:
        t["term"] = title_case(t["term"])
    terms.sort(key=lambda t: t["term"].lower())
    return categories, terms


def title_case(name):
    """Capitalise the first letter of every word, leaving the rest as written (MCP, ReAct, LLM-as-a-judge)."""
    return " ".join(w[:1].upper() + w[1:] for w in name.split(" "))


def fmt_date(value):
    """Format YYYY, YYYY-MM or YYYY-MM-DD for display."""
    if not value:
        return ""
    parts = value.split("-")
    try:
        if len(parts) == 3:
            return dt.date(*map(int, parts)).strftime("%d %b %Y").lstrip("0")
        if len(parts) == 2:
            return dt.date(int(parts[0]), int(parts[1]), 1).strftime("%b %Y")
    except ValueError:
        pass
    return value


def is_new(term, today):
    try:
        seen = dt.date.fromisoformat(term.get("first_seen", ""))
    except ValueError:
        return False  # partial dates (YYYY or YYYY-MM) are never "new"
    return (today - seen).days <= NEW_DAYS


def cat_slug(category):
    return "".join(c if c.isalnum() else "-" for c in category.lower()).strip("-").replace("--", "-")


# ---------- templates ----------

def page(title, description, path, body, extra_head="", scripts=""):
    url = SITE_URL + path
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
<link rel="stylesheet" href="{asset('style.css')}">
{extra_head}
</head>
<body>
<header class="site-header">
  <a class="logo" href="/">ai<span>jargon</span>.wtf</a>
  <nav>
    <a href="/#all">All Jargons</a>
    <a href="/graph/">Graph</a>
  </nav>
</header>
<main>
{body}
</main>
<footer class="site-footer">
  <p>{SITE_NAME}: {esc(TAGLINE)} Concepts only, no product pitches.</p>
  <p>Definitions are generated from cited sources. Spot a mistake? Check the sources on each page.</p>
</footer>
<script>
// Keep .fit text on one line: shrink the font down to data-min px; only if it still can't fit, let it wrap.
(function () {{
  function fit() {{
    document.querySelectorAll(".fit").forEach(function (h) {{
      var min = +h.dataset.min || 18;
      h.style.fontSize = ""; h.style.whiteSpace = "nowrap";
      var size = parseFloat(getComputedStyle(h).fontSize), width = h.parentElement.clientWidth;
      while (size > min && h.scrollWidth > width) {{ size -= 1; h.style.fontSize = size + "px"; }}
      if (h.scrollWidth > width) {{ h.style.whiteSpace = "normal"; h.style.fontSize = ""; }}
    }});
  }}
  fit(); addEventListener("resize", fit); window.fitHeadline = fit;
}})();
</script>
{scripts}
</body>
</html>
"""


def badges(term, today):
    out = f'<span class="badge status-{term["status"]}">{esc(term["status"])}</span>'
    if is_new(term, today):
        out = '<span class="badge new">new</span>' + out
    return out


def card(term, today):
    search = " ".join([term["term"], term.get("full_name", ""), *term.get("aliases", []), term["one_liner"]]).lower()
    return f"""<a class="card" href="/is/{term['slug']}/" data-cat="{cat_slug(term['category'])}" data-rarity="{term['rarity']}" data-search="{esc(search)}">
  <div class="card-top"><span class="cat">{esc(term['category'])}</span>{badges(term, today)}</div>
  <h3>{esc(term['term'])}</h3>
  <p>{esc(term['one_liner'])}</p>
</a>"""


def term_page(term, by_slug, backlinks, today):
    name = term["term"]
    full = f' <span class="full-name">({esc(term["full_name"])})</span>' if term.get("full_name") else ""
    aliases = ""
    if term.get("aliases"):
        aliases = '<p class="aliases">Also called: ' + ", ".join(esc(a) for a in term["aliases"]) + "</p>"

    example = ""
    if term.get("example"):
        ex = term["example"]
        caption = f'<figcaption>{esc(ex.get("caption", "Example"))}</figcaption>' if ex.get("caption") else ""
        example = f"""<section>
  <h2>Example</h2>
  <figure class="example">{caption}<pre><code class="lang-{esc(ex.get('lang', 'text'))}">{esc(ex['code'])}</code></pre></figure>
</section>"""

    origin = term.get("origin", {})
    origin_rows = []
    if origin.get("by"):
        origin_rows.append(f"<dt>Coined / introduced by</dt><dd>{esc(origin['by'])}</dd>")
    if origin.get("date"):
        origin_rows.append(f"<dt>When</dt><dd>{esc(fmt_date(origin['date']))}</dd>")
    if origin.get("note"):
        origin_rows.append(f"<dt>Story</dt><dd>{esc(origin['note'])}</dd>")
    origin_html = f'<section><h2>Origin</h2><dl class="origin">{"".join(origin_rows)}</dl></section>' if origin_rows else ""

    rel_items = [
        f'<li><span class="rel">{RELATION_LABELS[r["type"]]}</span> <a href="/is/{r["slug"]}/">{esc(by_slug[r["slug"]]["term"])}</a></li>'
        for r in term.get("related", [])
    ]
    known = {r["slug"] for r in term.get("related", [])}
    rel_items += [
        f'<li><span class="rel">Mentioned by</span> <a href="/is/{s}/">{esc(by_slug[s]["term"])}</a></li>'
        for s in backlinks.get(term["slug"], []) if s not in known
    ]
    related = f'<section><h2>Related jargons</h2><ul class="related">{"".join(rel_items)}</ul></section>' if rel_items else ""

    sources = ""
    if term.get("sources"):
        items = "".join(
            f'<li><a href="{esc(s["url"])}" rel="noopener" target="_blank">{esc(s["title"])}</a></li>'
            for s in term["sources"]
        )
        sources = f'<section><h2>Sources</h2><ul class="sources">{items}</ul></section>'

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "DefinedTerm",
        "name": name,
        "alternateName": [term["full_name"]] + term.get("aliases", []) if term.get("full_name") else term.get("aliases", []),
        "description": term["one_liner"],
        "url": f"{SITE_URL}/is/{term['slug']}/",
        "inDefinedTermSet": {"@type": "DefinedTermSet", "name": SITE_NAME, "url": SITE_URL + "/"},
    }).replace("</", "<\\/")

    body = f"""<article class="term">
  <p class="crumbs"><a href="/">Home</a> / <a href="/#cat-{cat_slug(term['category'])}">{esc(term['category'])}</a></p>
  <h1 class="fit"><span class="wtf">WTF is</span> {esc(name)}?{full}</h1>
  <div class="meta">{badges(term, today)}{f'<span class="seen">First seen {esc(fmt_date(term["first_seen"]))}</span>' if term.get("first_seen") else ""}</div>
  <p class="one-liner">{esc(term['one_liner'])}</p>
  {aliases}
  <section class="tldr"><h2>TL;DR</h2><p>{esc(term['tldr'])}</p></section>
  <section><h2>How it works</h2><p>{esc(term['technical'])}</p></section>
  {example}
  {origin_html}
  {related}
  {sources}
</article>"""

    title = f"WTF is {name}? | {SITE_NAME}"
    head = f'<script type="application/ld+json">{jsonld}</script>'
    return page(title, term["one_liner"], f"/is/{term['slug']}/", body, extra_head=head)


def index_page(categories, terms, today):
    latest = sorted(terms, key=lambda t: t.get("first_seen", ""), reverse=True)
    chips = '<button class="chip active" data-filter="all">All</button>' + "".join(
        f'<button class="chip" data-filter="{cat_slug(c)}" id="cat-{cat_slug(c)}">{esc(c)}</button>' for c in categories
    )
    body = f"""<section class="hero">
  <h1 class="fit">WTF is <span id="rotating">{esc(latest[0]["term"])}</span>?</h1>
  <p class="sub fit" data-min="13">{esc(TAGLINE)} Plain-English and technical explanations of the concepts behind AI agents, with sources.</p>
  <div class="search-row">
    <div class="search-wrap">
      <input id="search" type="search" placeholder="Search Jargons, e.g. &quot;memory&quot;" autocomplete="off" aria-label="Search Jargons" aria-controls="suggest" aria-expanded="false" role="combobox">
      <ul id="suggest" role="listbox" hidden></ul>
    </div>
    <button id="surprise" type="button" title="Open a random jargon you probably haven't met">🎲 Surprise me</button>
  </div>
</section>

<section class="home-graph bleed" aria-label="Concept graph">
  {graph_markup(compact=True)}
</section>

<section id="all">
  <h2>All Jargons <span class="h2-note">newest first</span></h2>
  <div class="chips">{chips}</div>
  <div class="grid" id="all-grid">{"".join(card(t, today) for t in latest)}</div>
  <p id="empty" hidden>No jargons match. If it's new, the pipeline will probably pick it up soon.</p>
</section>"""
    index_terms = json.dumps([{
        "slug": t["slug"], "label": t["term"], "aliases": t.get("aliases", []),
        "one_liner": t["one_liner"], "rarity": t["rarity"],
    } for t in terms])
    scripts = (
        f"<script>window.TERMS={index_terms};</script><script src=\"{asset('index.js')}\"></script>"
        + graph_scripts(graph_data(categories, terms, today))
    )
    return page(f"{SITE_NAME}: {TAGLINE}", "Plain-English and technical explanations of AI agent concepts such as MCP, RAG, ReAct, context engineering and prompt injection. Updated as new jargon appears.", "/", body, scripts=scripts)


def dedupe_links(links):
    """Collapse A->B and B->A into one edge; a directed type (builds_on, part_of) wins over plain 'related'."""
    directed = {"builds_on", "part_of"}
    best = {}
    for l in links:
        key = frozenset((l["source"], l["target"]))
        cur = best.get(key)
        if cur is None or (l["type"] in directed and cur["type"] not in directed):
            best[key] = l
    return list(best.values())


def graph_data(categories, terms, today):
    return {
        "categories": categories,
        "relations": RELATION_LABELS,
        "nodes": [{
            "id": t["slug"], "label": t["term"], "cat": t["category"],
            "one_liner": t["one_liner"], "rarity": t["rarity"], "status": t["status"],
            "new": is_new(t, today), "first_seen": fmt_date(t.get("first_seen", "")),
        } for t in terms],
        "links": dedupe_links([{"source": t["slug"], "target": r["slug"], "type": r["type"]} for t in terms for r in t.get("related", [])]),
    }


def graph_markup(compact=False):
    """Full page: toolbar (search + category toggles), stage, key. Compact (home): just the stage with corner overlays."""
    if compact:
        return """<div class="graph-stage compact">
    <div id="graph" role="img" aria-label="Network graph of AI agent jargons and their relationships"></div>
    <span class="graph-caption">Concept graph <em>hover or click a jargon</em></span>
    <aside id="panel" hidden></aside>
    <a class="graph-cta" href="/graph/">Full size ↗</a>
    <div id="tip" class="tip" hidden></div>
  </div>"""
    return """<div class="graph-toolbar">
    <input id="gsearch" type="search" placeholder="Find a jargon" autocomplete="off" aria-label="Find a jargon in the graph">
    <div id="legend" aria-label="Categories (click to toggle)"></div>
  </div>
  <div class="graph-stage">
    <div id="graph" role="img" aria-label="Network graph of AI agent jargons and their relationships"></div>
    <aside id="panel" hidden></aside>
    <div id="tip" class="tip" hidden></div>
  </div>
  <p class="graph-key"><span class="k k-builds">→ builds on</span><span class="k k-part">╌ part of</span><span class="k k-alt">┄ alternative to</span><span class="k k-rel">— related</span></p>"""


def graph_scripts(graph):
    return (
        f"<script>window.GRAPH={json.dumps(graph)};</script>"
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>'
        f'<script src="{asset("graph.js")}"></script>'
    )


def graph_page(categories, terms):
    graph = graph_data(categories, terms, dt.date.today())
    body = f"""<section class="graph-wrap">
  <h1>Concept graph</h1>
  <p class="sub">How the jargons connect. Hover to see relationships, click a jargon for details, drag nodes around, scroll to zoom.</p>
  {graph_markup()}
</section>"""
    return page(f"Concept graph | {SITE_NAME}", "An interactive map of how AI agent jargons relate to each other.", "/graph/", body, scripts=graph_scripts(graph))


def not_found_page():
    body = """<section class="hero"><h1>WTF is this page?</h1>
<p class="sub">Nothing here. Maybe this jargon is too new. <a href="/">Search All Jargons</a>.</p></section>"""
    return page(f"Not found | {SITE_NAME}", "Page not found.", "/404.html", body)


def sitemap(terms, today):
    urls = [SITE_URL + "/", SITE_URL + "/graph/"] + [f"{SITE_URL}/is/{t['slug']}/" for t in terms]
    items = "".join(f"<url><loc>{u}</loc><lastmod>{today.isoformat()}</lastmod></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>\n'


# ---------- build ----------

def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main():
    categories, terms = load()
    today = dt.date.today()
    by_slug = {t["slug"]: t for t in terms}
    backlinks = {}
    for t in terms:
        for r in t.get("related", []):
            backlinks.setdefault(r["slug"], []).append(t["slug"])

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(ASSETS, DIST / "assets")

    write(DIST / "index.html", index_page(categories, terms, today))
    write(DIST / "graph" / "index.html", graph_page(categories, terms))
    for t in terms:
        write(DIST / "is" / t["slug"] / "index.html", term_page(t, by_slug, backlinks, today))
    write(DIST / "404.html", not_found_page())
    write(DIST / "sitemap.xml", sitemap(terms, today))
    write(DIST / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
    write(DIST / "CNAME", "aijargon.wtf\n")
    shutil.copy(DATA, DIST / "terms.json")

    print(f"Built {len(terms)} term pages into {DIST}")


if __name__ == "__main__":
    main()
