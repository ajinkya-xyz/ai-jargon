# aijargon.wtf

AI agent terms, decoded. A static site that explains the concepts behind AI agents (MCP, RAG, ReAct, context engineering, ...) in plain English and in technical depth, with sources.

## How it works

- `data/terms.json`: every term, its category, explanations, origin, sources and related terms. This is the only file you edit (and later, the pipeline writes to it).
- `build.py`: turns the JSON into plain HTML, with one page per term at `/is/<slug>/`, a home page with search, a concept graph, a sitemap and robots.txt. It uses only the Python standard library.
- `assets/`: CSS and the two small scripts (home page search, graph).
- `.github/workflows/deploy.yml`: builds and publishes to GitHub Pages on every push to `main`.

## Run locally

```sh
python build.py
python -m http.server 8000 -d dist
# open http://localhost:8000
```

## Add a term

Add an object to `terms` in `data/terms.json`. Required fields are `slug`, `term`, `category`, `one_liner`, `tldr`, `technical` and `status` (`emerging` | `mainstream` | `fading` | `renamed`). Optional fields are `full_name`, `aliases`, `example`, `origin`, `first_seen` and `sources`, plus `related`, a list of `{slug, type}` where type is one of `builds_on`, `part_of`, `alternative_to` or `related`. The build fails with a clear message if a related slug or category doesn't exist.

Scope: concepts, patterns, protocols and practices only. No products, companies, models or frameworks.

## Deploy

1. Push this folder to a GitHub repo.
2. In the repo, go to Settings → Pages → Source: **GitHub Actions**.
3. Settings → Pages → Custom domain: `aijargon.wtf` (the build also writes a `CNAME` file).
4. At your domain registrar, point DNS at GitHub Pages: four `A` records to 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, plus `CNAME www` to `<username>.github.io`.
