# HantaBERT Web

Frontend for [HantaBERT](https://hantabert-api.faizath.com), a research tool that classifies hantavirus nucleotide sequences by species, host, and geographic origin using a fine-tuned DNABERT-2 model.

## Features

- Paste a raw DNA/RNA sequence or upload a FASTA file
- Adjustable top-N predictions (1–23)
- Per-task results with confidence scores:
  - **Species** — 23 classes, ranked with expandable list
  - **Host** — Rodent / Human / Others
  - **Geographic origin** — 7 regions, with an interactive world map
- Handles RNA input (U bases auto-converted to T by the API)
- Surfaces truncation warnings when a sequence exceeds 512 BPE tokens
- Graceful rate-limit and model-loading states

## Stack

Plain HTML, CSS, and JavaScript. The map is rendered with [D3](https://d3js.org/) and [TopoJSON](https://github.com/topojson/topojson), both loaded from CDN at runtime.

## Local development

```bash
cd HantaBERT-Web
python3 -m http.server 8080
# open http://localhost:8080
```

Any static file server works. The app calls `https://hantabert-api.faizath.com` directly from the browser, so no local backend is needed.