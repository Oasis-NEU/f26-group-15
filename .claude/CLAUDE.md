# LabelAI

A prototype labeling tool for medical images. The flow is: upload images, draw boxes and polygons, get model suggestions, accept or reject them, save, and export the dataset.

## Who does what

- **Frontend (React):** built by a teammate and finished. It runs today on an in-browser mock backend. Treat it as stable and change it only to fix a real bug.
- **Backend, YOLO model integration, and the end-to-end pipeline:** one person, the owner of this setup. Claude acts as their mentor; follow the `mentor-mode` skill.

## Architecture

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite, in `frontend/` |
| Backend | Python + FastAPI, in `backend/` |
| Database | Supabase PostgreSQL, through SQLAlchemy. It must also run on SQLite or plain Postgres by changing only `DATABASE_URL` |
| Image files | Supabase Storage |
| Model | Ultralytics YOLO object detection, behind `POST /images/{id}/predict` |
| Auth | A later phase. The frontend already sends `Authorization: Bearer <token>`; the backend ignores it for now |

## Source of truth

- `docs/api-contract.md` lists every route the backend must provide. `frontend/src/api/httpApi.ts` calls exactly these.
- `docs/schema.md` defines every JSON shape. Pydantic schemas must match it field for field.
- `docs/frontend-structure.md` explains how the frontend is organized and what it expects from the backend.
- The 8-week plan PDF on branch `deepanshu_initt` predates the contract. Where they disagree, the contract wins.

## Backend layout (target)

```
backend/
  main.py       creates the app, adds CORS, includes the routers
  config.py     reads .env
  database.py   engine, session, Base, get_db; the only file that knows which database is in use
  models.py     SQLAlchemy tables
  schemas.py    Pydantic request and response shapes
  storage.py    saves and fetches image files
  detector.py   all YOLO code; no other file imports ultralytics
  routers/      one file per resource: projects, classes, datasets, images, annotations
```

## Build order

1. Database connection (SQLite)
2. Projects: model, schema, router; frontend switched to `http`
3. Switch `DATABASE_URL` to Supabase Postgres
4. Classes and datasets
5. Images and Supabase Storage
6. Annotations (load, plus the replace-all save)
7. YOLO predict
8. Export (COCO, YOLO, JSON)
9. Auth

## Current status

- Frontend: done; 41 unit tests pass.
- Backend: only `GET /health` exists.
- Next: Step 1.

Update this section when a step is finished.

## Commands

Frontend, from `frontend/`:
- `npm run dev` serves the app at http://localhost:5173.
- `npm test` runs the unit tests, `npm run typecheck` checks types, and `npm run lint` lints.

Backend, from `backend/`, after `source .venv/bin/activate`:
- `fastapi dev main.py` serves the API at http://localhost:8000, with interactive docs at http://localhost:8000/docs.

## Environment files

- `frontend/.env.local` overrides `frontend/.env`.
  - `VITE_API_MODE=mock` uses the in-browser fake backend.
  - `VITE_API_MODE=http` calls FastAPI at `VITE_API_URL`.
  - Leaving both `VITE_PUBLIC_SUPABASE_*` values blank turns off the login screen.
- `backend/.env` holds `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, and later `DATABASE_URL`.
- Never commit any `.env` file.

## Rules

Follow the `our-conventions` skill for all code in this repo.
