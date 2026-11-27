---
name: our-conventions
description: LabelAI coding conventions. Use whenever writing, reviewing, or changing code in this repo, backend (FastAPI, SQLAlchemy, YOLO) or frontend.
---

# Our conventions

## Keep code simple

- Prefer plain `for` loops and `if` statements to clever one-liners. No nested comprehensions, no chained `map`/`filter`/`reduce`, and no long method chains.
- One function does one job. If a function needs a comment to explain *what* it does, split it or rename it.
- Use clear names over short ones: `image_record`, not `ir`.
- Comments explain *why*, not *what*.
- Don't add a new library unless it removes real work, and ask first.

## Backend layers

Each layer has one job. Don't mix them.

| Layer | File | Job | Never |
|---|---|---|---|
| Router | `routers/*.py` | Receive the request, use the DB session, return a schema | Raw SQL, YOLO code |
| Schema | `schemas.py` | Pydantic shapes matching `docs/schema.md` exactly | Database logic |
| Model | `models.py` | SQLAlchemy tables | Returned to the frontend directly; responses always go through an `...Out` schema |
| Detector | `detector.py` | The only file that imports `ultralytics`. Takes an image, returns plain dicts in the annotation shape | Database or HTTP code |
| Storage | `storage.py` | The only file that talks to Supabase Storage | Database logic |

Schema naming:
- `ProjectCreate` is a request body.
- `ProjectUpdate` is a PATCH body, with every field optional.
- `ProjectOut` is a response.

## Keep the database swappable

The same code must run on Supabase Postgres, plain Postgres, and SQLite.

- Only `database.py` may contain database-specific code, such as SQLite's `check_same_thread` setting.
- IDs are `String(36)` columns holding `str(uuid4())`, not a Postgres `UUID` type.
- Geometry and other nested data go in an SQLAlchemy `JSON` column, not `JSONB` or `ARRAY`.
- Timestamps are timezone-aware UTC: `datetime.now(timezone.utc)`.
- Use the SQLAlchemy ORM, not raw SQL.
- No Supabase-only features (RLS policies, triggers, RPC) until the auth phase.

## Match the contract

- Paths, methods and status codes come from `docs/api-contract.md`. Don't invent routes. If one is missing, update the contract first.
- Field names come from `docs/schema.md`, in snake_case. The frontend reads them as they are.
- For errors, raise `HTTPException(status_code=..., detail="A full sentence.")`. The UI shows `detail` to the user.
- `DELETE` returns `204` with no body.
- Coordinates are always original-image pixels, with the origin at the top-left. YOLO output is converted to this before it leaves `detector.py`.
- AI suggestions carry `source: "ai"` and `status: "pending"`.

## Routes

- Use plain `def`, not `async def`, for routes that use the database session, because the session is synchronous.
- Get the session with `db: Session = Depends(get_db)`.
- Put "look up by id, or raise 404" in one small helper per resource instead of repeating it in every route.

## Frontend

- Every server call goes through the `api` object from `frontend/src/api`. Pages never call `fetch` directly.
- A new backend capability the UI needs goes into `LabelAIApi` in `api/types.ts` first, then into both `mockApi.ts` and `httpApi.ts`.
- `frontend/src/types/annotation.ts` must stay identical in meaning to `docs/schema.md`.

## Secrets and git

- Never commit `.env` files, `*.db` files, model weights (`*.pt`), or uploaded images.
- Work on a `feature/...` branch, not on `main`.
