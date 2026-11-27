# Annotation schema (team contract)

This is the one JSON shape all three parts of LabelAI agree on. The frontend
copy lives in `frontend/src/types/annotation.ts`; the backend's Pydantic
models and the ML output converter must match it field for field.

**Change it only through a PR that all three members review.**

## Rules

- **Coordinates are original-image pixels.** Origin at the top-left corner,
  x to the right, y down. Never screen coordinates, never normalized 0–1.
  Exporters convert to normalized values when a format needs them.
- **IDs are strings** (UUIDs). Timestamps are ISO 8601 strings in UTC.
- **AI output is `source: "ai"`, `status: "pending"`** until a person accepts
  it. Exports include `accepted` annotations only.

## Annotation

```json
{
  "id": "0b7c…",
  "image_id": "4f1e…",
  "class_id": "a93d…",
  "geometry": { "type": "polygon", "points": [[120.5, 80.0], [160.0, 82.5], [150.0, 130.0]] },
  "source": "ai",
  "confidence": 0.87,
  "status": "pending",
  "created_at": "2026-11-08T03:12:44.120Z",
  "updated_at": "2026-11-08T03:12:44.120Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `source` | `"human"` \| `"ai"` | AI annotations render dashed until accepted |
| `confidence` | number 0–1 or `null` | `null` for human annotations |
| `status` | `"pending"` \| `"accepted"` | Human annotations are always `accepted` |

## Geometry types

**Box**: `x, y` is the top-left corner.

```json
{ "type": "bbox", "x": 60, "y": 150, "width": 80, "height": 50 }
```

**Polygon**: closed ring; the last point connects back to the first, so do
not repeat it. At least 3 points.

```json
{ "type": "polygon", "points": [[0, 0], [20, 0], [20, 10]] }
```

**Mask**: uncompressed COCO RLE, exactly what `pycocotools` produces.
`size` is `[height, width]`. `counts` alternate background/foreground run
lengths, start with background (which may be `0`), and run in
**column-major** order.

```json
{ "type": "mask", "rle": { "size": [576, 768], "counts": [1203, 14, 562, 18, …] } }
```

For ML: prefer returning polygons (simplified mask outlines). They are
editable vertex by vertex in the UI. Use masks only where polygons cannot
represent the shape (holes, very fragmented regions).

## Other records

```jsonc
// Project
{ "id": "…", "name": "Retinal vessels", "description": "…", "created_at": "…" }

// LabelClass (belongs to a project)
{ "id": "…", "project_id": "…", "name": "Nucleus", "color": "#F2C14E" }

// Dataset (belongs to a project)
{ "id": "…", "project_id": "…", "name": "Batch 1", "created_at": "…" }

// Image (belongs to a dataset)
{
  "id": "…", "dataset_id": "…", "file_name": "case_001.png",
  "width": 768, "height": 576,
  "url": "https://…signed-url…",          // browser loads this directly
  "status": "unlabeled",                   // "unlabeled" | "in_progress" | "reviewed"
  "annotation_count": 12,                  // accepted annotations only
  "created_at": "…"
}
```
