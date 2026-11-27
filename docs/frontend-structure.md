# Frontend structure

How the React app in `frontend/` is organized, how data moves through it, and what it expects from the backend. Read this alongside [schema.md](schema.md) (the JSON shapes) and [api-contract.md](api-contract.md) (the routes).

The stack is React 19, TypeScript and Vite. There is no UI kit, router library or state library: each of those is one small file in `src/`, so the whole app can be read top to bottom.

## Run it

```bash
cd frontend
npm ci          # first time, or after package-lock.json changes
npm run dev     # http://localhost:5173
npm test        # 41 unit tests
```

Settings live in `.env.local`, which overrides `.env`:

```bash
VITE_API_MODE=mock                    # mock = fake backend in the browser, http = FastAPI
VITE_API_URL=http://localhost:8000    # used when VITE_API_MODE=http
VITE_PUBLIC_SUPABASE_URL=             # leave both blank to skip the login screen
VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

In mock mode, data is kept in the browser (localStorage for records, IndexedDB for uploaded files) and a demo project with six sample images is created. The dashboard's "Reset demo data" button wipes it.

## The big picture

```
 pages/ ── one screen per URL
   │
   │  every server call goes through one object
   ▼
 api/index.ts ── exports `api`, picked by VITE_API_MODE
   ├── mockApi.ts ── fake backend inside the browser (today)
   └── httpApi.ts ── real client ──► FastAPI (docs/api-contract.md)

 store/       shared state for the labeling screen (annotations, undo, zoom)
 components/  UI pieces; canvas/ draws the image and the shapes
 lib/         pure functions (coordinates, geometry, masks, exporters), unit-tested
 types/       annotation.ts, the TypeScript copy of docs/schema.md
```

`api/types.ts` defines `LabelAIApi`, the interface both implementations follow. It lists everything the frontend needs from a backend. When the backend implements every route in the contract, switching `VITE_API_MODE` to `http` is the whole frontend integration.

## Folder map

| Path | What it does |
|---|---|
| `main.tsx` | Entry point; mounts `<App />` |
| `App.tsx` | Wraps everything in `AuthGate`, then picks a page from the current route |
| `router.tsx` | Small hash router: `#/projects/abc` style URLs, plus `Link`, `navigate()` and `paths` |
| `auth/AuthGate.tsx` | Shows a Supabase sign-in screen until there is a session; skipped when the Supabase env vars are blank. Also exports the `BrandMark` logo |
| **api/** | |
| `api/types.ts` | `LabelAIApi` interface and `ApiError` |
| `api/index.ts` | Chooses mock or HTTP and exports `api` and `apiMode` |
| `api/httpApi.ts` | `fetch` calls to FastAPI. Adds the Bearer token, sends JSON or multipart, turns `{"detail": ...}` errors into `ApiError` |
| `api/mockApi.ts` | Same interface, backed by localStorage and IndexedDB. Its behavior is a reference for what the backend should do |
| **pages/** | |
| `DashboardPage.tsx` | Project list and the "New project" form |
| `ProjectPage.tsx` | A project's datasets and label classes: create datasets; add, recolor and delete classes; delete the project |
| `DatasetPage.tsx` | Image grid with status, upload, export |
| `LabelPage.tsx` | The labeling workspace (below) |
| **store/** | |
| `createStore.ts` | A tiny Zustand-style store: `getState`, `setState`, `subscribe`, plus a `useStore` hook |
| `labeling.ts` | Annotations for the open image, undo/redo history, selection, active tool, active class, hidden classes |
| `view.ts` | Zoom, pan, cursor position, brightness and contrast |
| **hooks/** | |
| `useAsync.ts` | Loads data for a page (loading, error and retry states) |
| `useAutosave.ts` | Saves annotations about 0.8 s after the last edit; warns before closing the tab with unsaved work |
| **components/** | |
| `AppShell.tsx` | Top bar: logo, breadcrumbs, the "Local demo data" badge in mock mode, sign-out |
| `ui.tsx` | Spinner, page loading/error states, status pill, icon button, keyboard key |
| `Icon.tsx` | Inline SVG icons |
| `canvas/AnnotationCanvas.tsx` | Draws the image and every annotation; handles drawing, selecting, moving, resizing, zoom and pan |
| `canvas/maskImage.ts` | Turns an RLE mask into a tinted image for display |
| `labeling/ToolRail.tsx` | Left toolbar: select, pan, box, polygon, example |
| `labeling/Inspector.tsx` | Right panel: classes, AI prompt box, list of annotations and suggestions |
| `labeling/StatusBar.tsx` | Bottom bar: cursor position, zoom controls, brightness and contrast |
| `labeling/ShortcutsDialog.tsx` | The `?` keyboard shortcut help |
| **lib/** | |
| `coords.ts` | Screen ↔ image pixel conversion, zoom math |
| `geometry.ts` | Bounds, area, hit testing, moving and resizing shapes, polygon simplification, IoU |
| `rle.ts` | COCO run-length mask encode and decode |
| `exporters.ts` | COCO, YOLO and JSON export. The backend's export should produce the same output |
| `mockVision.ts` | Simple blob detector that stands in for the model in mock mode |
| `supabase.ts` | Supabase client, or `null` when the env vars are blank |
| `util.ts` | `newId()`, `nowIso()`, class colors, `debounce`, `downloadBlob` |
| **types/** | |
| `annotation.ts` | `Annotation`, `Geometry` (bbox, polygon, mask), `Project`, `LabelClass`, `Dataset`, `ImageRecord`, `PredictRequest` |

## Screens and the API calls they make

| URL | Page | API calls |
|---|---|---|
| `#/` | Dashboard | `listProjects`, `createProject` |
| `#/projects/:id` | Project | `getProject`, `listDatasets`, `listClasses`, `createDataset`, `deleteProject`, `createClass`, `updateClass`, `deleteClass` |
| `#/datasets/:id` | Dataset | `getDataset`, `getProject`, `listImages`, `listClasses`, `uploadImages`, `exportDataset` |
| `#/label/:imageId` | Label | `getImage`, `getDataset`, `listImages`, `listClasses`, `listAnnotations`, `saveAnnotations` (from autosave), `predict`, `updateImageStatus`, `createClass` |

`deleteDataset` and `deleteImage` are in the contract, but no screen calls them yet.

## The labeling screen

```
┌──────┬──────────────────────────────────┬────────────┐
│ Tool │                                  │ Inspector  │
│ Rail │       AnnotationCanvas           │  classes   │
│      │   (image + shapes, zoom/pan)     │  AI prompt │
│      │                                  │  shape list│
│      ├──────────────────────────────────┤            │
│      │ StatusBar (cursor, zoom, display)│            │
└──────┴──────────────────────────────────┴────────────┘
```

The canvas has three layers that share one zoom and pan:
1. the `<img>`
2. an SVG of the shapes, drawn in image pixels
3. an SVG overlay for handles, labels and in-progress drawings

Every mouse position is converted to image pixels as soon as it arrives (`toImage()` in `lib/coords.ts`), so stored annotations never contain screen coordinates.

### Flow 1: open an image

`LabelPage` loads the image, its dataset, the dataset's image list, the project's classes and the image's annotations. It then calls `labeling.load()`, which resets history for the new image.

### Flow 2: draw a box and save it

```
mouse drag ─► toImage() ─► labeling.add(bbox) ─► revision + 1
          ─► useAutosave waits 0.8 s with no further edits
          ─► api.saveAnnotations(imageId, ALL annotations for the image)
          ─► PUT /images/{id}/annotations
```

A whole drag counts as one undo step: `beginGesture()` runs on mouse down, `replaceLive()` while moving, and `endGesture()` on mouse up.

### Flow 3: AI suggestions

```
pick a class ─► type a prompt and run, or press E and box one example
           ─► api.predict(imageId, { class_id, prompt?, exemplars? })
           ─► POST /images/{id}/predict
           ─► results come back with source "ai", status "pending"
           ─► earlier unreviewed suggestions are removed
           ─► results overlapping an existing shape by more than 50% (IoU) are dropped
           ─► the rest are drawn dashed
           ─► Accept sets status to "accepted"; Reject removes the suggestion
           ─► autosave stores the result, pending suggestions included
```

### Flow 4: mark reviewed

`R`, or the "Mark reviewed" button, refuses while any suggestion is still pending. Otherwise it calls `updateImageStatus(id, "reviewed")` and opens the next image.

## What the backend must do for the frontend

- **Keep the ids it receives.** Annotation ids are created in the browser (`crypto.randomUUID()`). `PUT /images/{id}/annotations` must store them as they are.
- **Treat PUT as replace-all.** The list is the full set for that image; any annotation not in the list was deleted.
- **Store pending suggestions.** They are saved like any other annotation, but exports skip them.
- **Count accepted annotations only.** `annotation_count` on an image counts `accepted` ones.
- **Return image URLs the browser can load.** `image.url` goes straight into an `<img>` tag, so it must be loadable directly (for example a signed storage URL).
- **Use the predict fields as follows.** `prompt` and `exemplars` were designed for a promptable segmentation model. With plain YOLO, `prompt` filters detections by class name and `exemplars` are ignored for now. Coordinates must be in original-image pixels.
- **Send errors the UI can show.** Error responses are `{"detail": "A full sentence."}`, and the UI displays `detail` to the user.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` `H` `B` `P` `E` | Select, pan (or hold Space), box, polygon, find-similar example |
| `1`–`9` | Choose label class |
| `Enter` / `Shift+Enter` | Accept selected suggestion (or close a polygon) / accept all |
| `Delete` | Delete or reject selected |
| `Esc` | Cancel drawing, then deselect |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| Scroll, `F`, `0`, `+` `-` | Zoom at cursor, fit, 100%, zoom in/out |
| `←` `→` | Previous / next image |
| `R` | Mark reviewed and go to next |
| `?` | Show shortcuts |

## Tests

`npm test` runs 41 unit tests with Vitest. They cover the pure logic, not the React components:

| File | Covers |
|---|---|
| `lib/geometry.test.ts` | Bounds, hit testing, resizing, simplification, IoU |
| `lib/coords.test.ts` | Screen ↔ image conversion, zoom |
| `store/labeling.test.ts` | Add, accept, reject, undo/redo, drag gestures |
| `lib/exporters.test.ts` | COCO and YOLO output |
| `lib/mockVision.test.ts` | Mock detector |
| `lib/rle.test.ts` | Mask encode/decode round trip |
