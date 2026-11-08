# LabelAI frontend

React + TypeScript + Vite. The annotation workspace for LabelAI: upload
medical images, label them with boxes and polygons, review AI suggestions,
and export a training dataset.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

It runs on an **in-browser mock backend** by default, seeded with a demo
project of six synthetic fluorescence-microscopy images (not patient data).
No backend, Supabase, or GPU is needed to work on the UI.

```bash
npm test           # unit tests (Vitest)
npm run typecheck
npm run build
```

### Settings

Copy `.env.example` to `.env.local`:

| Variable | Effect |
|---|---|
| `VITE_API_MODE` | `mock` (default) or `http` to use the FastAPI backend |
| `VITE_API_URL` | Backend base URL, default `http://localhost:8000` |
| `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Turns on the sign-in screen. Leave empty to skip login. |

## How it fits together

```
src/
  types/annotation.ts      the shared schema (mirror of docs/schema.md)
  api/
    types.ts               LabelAIApi: every call the UI makes
    mockApi.ts             fake backend (localStorage + IndexedDB)
    httpApi.ts             real backend, routes in docs/api-contract.md
    index.ts               picks one based on VITE_API_MODE
  lib/
    coords.ts              screen <-> image pixel math, zoom toward cursor
    geometry.ts            hit testing, resize, bounds, IoU, simplification
    rle.ts                 COCO RLE mask encode/decode
    exporters.ts           COCO / YOLO / JSON export
    mockVision.ts          stand-in "model" (threshold + outline tracing)
  store/
    labeling.ts            annotations, selection, tools, undo/redo
    view.ts                zoom/pan, cursor position, brightness/contrast
  components/canvas/       the annotation canvas
  components/labeling/     tool rail, inspector, status bar, shortcuts
  pages/                   dashboard, project, dataset, labeling
```

**One coordinate rule.** Annotations are stored in original-image pixels.
The canvas converts at the edges: `toImage()` when the pointer goes down,
`toScreen()` (or the SVG transform) when drawing. `coords.test.ts` covers it.

**Undo/redo.** Every change goes through `labeling.*` in `store/labeling.ts`.
Drags call `beginGesture()` / `replaceLive()` / `endGesture()`, so one drag is
one undo step.

**Autosave.** `hooks/useAutosave.ts` sends the image's full annotation list to
`PUT /images/{id}/annotations` about 0.8 s after the last change, and flushes
before switching images.

**Routing** is a small hash router (`router.tsx`), so the built site works on
any static host without rewrite rules.

## Using the workspace

| | |
|---|---|
| `V` `H` `B` `P` `E` | Select, pan, box, polygon, find similar |
| `1`–`9` | Choose class (relabels the selection too) |
| Scroll, `F`, `0` | Zoom toward cursor, fit, 100% |
| Space + drag | Pan from any tool |
| `Enter` / `Shift+Enter` | Accept selected / all AI suggestions |
| `Delete` | Delete or reject selected |
| `Ctrl+Z`, `Ctrl+Shift+Z` | Undo, redo |
| `←` `→`, `R` | Previous/next image, mark reviewed and go on |
| `?` | All shortcuts |

Polygons: click to add points, click the first point or press `Enter` to
close, `Backspace` removes the last point. On a selected polygon, drag a
vertex to move it, double-click an edge to add one, Alt-click to remove one.

## When the other parts land

- **Backend ready:** set `VITE_API_MODE=http`. Nothing else changes, as long
  as routes match `docs/api-contract.md`.
- **ML ready:** `POST /images/{id}/predict` replaces `mockVision.ts`. The mock
  is classical thresholding, good enough for high-contrast demo images only.
- **DICOM:** not supported in the browser. Convert to PNG first (backend or a
  preprocessing script) and use de-identified data only.
