# API contract (frontend ↔ FastAPI)

What the frontend calls. Shapes are defined in [schema.md](schema.md).
The frontend implementation is `frontend/src/api/httpApi.ts`; until these
routes exist, the frontend runs on an in-browser mock with the same interface
(`frontend/src/api/mockApi.ts`).

## Conventions

- JSON in and out, except image upload (`multipart/form-data`) and export (file download).
- Auth: `Authorization: Bearer <Supabase access token>` on every request.
  The backend verifies it and scopes rows to the user (Supabase RLS).
- Errors: FastAPI's default `{"detail": "Human-readable message"}` with a
  fitting status code (`400`, `401`, `404`, `409`, `415`, `422`). The UI shows
  `detail` to the user, so write it as a sentence.
- `DELETE` returns `204 No Content`.

## Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/projects` | | `Project[]`, newest first |
| POST | `/projects` | `{ name, description }` | `Project` |
| GET | `/projects/{id}` | | `Project` |
| DELETE | `/projects/{id}` | | cascades to classes, datasets, images, annotations |
| GET | `/projects/{id}/classes` | | `LabelClass[]` |
| POST | `/projects/{id}/classes` | `{ name, color }` | `LabelClass` |
| PATCH | `/classes/{id}` | `{ name?, color? }` | `LabelClass` |
| DELETE | `/classes/{id}` | | `409` if annotations still use it |
| GET | `/projects/{id}/datasets` | | `Dataset[]` |
| POST | `/projects/{id}/datasets` | `{ name }` | `Dataset` |
| GET | `/datasets/{id}` | | `Dataset` |
| DELETE | `/datasets/{id}` | | cascades to images and annotations |
| GET | `/datasets/{id}/images` | | `Image[]` with fresh signed `url`s |
| POST | `/datasets/{id}/images` | multipart, field `files` (repeatable) | `Image[]` (created) |
| GET | `/images/{id}` | | `Image` |
| PATCH | `/images/{id}` | `{ status }` | `Image` |
| DELETE | `/images/{id}` | | |
| GET | `/images/{id}/annotations` | | `Annotation[]` |
| PUT | `/images/{id}/annotations` | `{ annotations: Annotation[] }` | `Annotation[]` (saved) |
| POST | `/images/{id}/predict` | `PredictRequest` | `Annotation[]` (not saved) |
| GET | `/datasets/{id}/export?format=coco\|yolo\|json` | | file download |

### Saving annotations

`PUT /images/{id}/annotations` **replaces the full set** for that image.
The frontend autosaves the whole list about a second after each edit, which
keeps undo/redo simple. The backend should, in one transaction, delete
annotations for the image whose ids are not in the list and upsert the rest.
It should also move the image from `unlabeled` to `in_progress` when the list
is non-empty.

### Predict

```json
// request
{ "class_id": "a93d…", "prompt": "nucleus", "exemplars": [{ "type": "bbox", "x": 100, "y": 100, "width": 50, "height": 50 }] }
```

- `prompt` (optional): text concept for SAM 3.
- `exemplars` (optional): boxes the user drew around good examples ("find more like this").
- Returns suggestions with `source: "ai"`, `status: "pending"`, `class_id` set
  to the request's, coordinates in original image pixels. Not stored: the
  frontend saves them (as pending) with the next autosave.

### Export

Pending suggestions are never exported. The reference implementation of each
format is `frontend/src/lib/exporters.ts`, with tests in `exporters.test.ts`:

- `coco`: COCO JSON. Category ids are 1-based in class order; `bbox` is `[x, y, w, h]`.
- `yolo`: one `labels/<image stem>.txt` per image plus `classes.txt`.
  Boxes are `class cx cy w h`, polygons are YOLO-seg `class x1 y1 x2 y2 …`,
  all normalized 0–1, class index 0-based. Zip these on the backend.
- `json`: the schema as-is, grouped by image.
