from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
import models 
from database import Base, engine
from routers import projects
from fastapi.middleware.cors import CORSMiddleware
from config import FRONTEND_ORIGIN
Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(projects.router)

@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status" : "ok",
             "database": "connected"}
