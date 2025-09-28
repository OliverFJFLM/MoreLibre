from __future__ import annotations

import os
from datetime import timedelta
from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from . import auth, crud, models, schemas
from .auth import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_current_user, get_db
from .database import engine
from .services.recommendation import RecommendationEngine

models.Base.metadata.create_all(bind=engine)


def build_cors_origins() -> List[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS")
    if not raw:
        return ["*"]

    origins: List[str] = []
    seen: set[str] = set()

    for part in raw.split(","):
        value = part.strip()
        if not value:
            continue

        if value.startswith("http://") or value.startswith("https://"):
            candidate = value.rstrip("/")
        else:
            http_candidate = f"http://{value}".rstrip("/")
            https_candidate = f"https://{value}".rstrip("/")
            for candidate in (http_candidate, https_candidate):
                if candidate not in seen:
                    seen.add(candidate)
                    origins.append(candidate)
            continue

        if candidate not in seen:
            seen.add(candidate)
            origins.append(candidate)

    return origins or ["*"]


app = FastAPI(title="MoreLibre", description="City library recommendation MVP")
cors_allow_origins = build_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

recommendation_engine = RecommendationEngine()


@app.post("/users", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    if crud.get_user_by_email(db, user_in.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = crud.create_user(db, user_in)
    return schemas.User.model_validate(user)


@app.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect credentials")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=access_token_expires)
    return schemas.Token(access_token=access_token)


@app.get("/goals", response_model=List[schemas.Goal])
def read_goals(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    goals = crud.list_goals(db, current_user)
    return [schemas.Goal.model_validate(goal) for goal in goals]


@app.post("/goals", response_model=schemas.Goal, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_in: schemas.GoalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = crud.create_goal(db, current_user, goal_in)
    return schemas.Goal.model_validate(goal)


@app.get("/goals/{goal_id}", response_model=schemas.Goal)
def read_goal(
    goal_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    goal = crud.get_goal(db, current_user, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return schemas.Goal.model_validate(goal)


@app.post("/goals/{goal_id}/books/{goal_book_id}/status", response_model=schemas.GoalBook)
def update_goal_book_status(
    goal_id: int,
    goal_book_id: int,
    payload: schemas.GoalBookStatusUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = crud.get_goal(db, current_user, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal_book = crud.get_goal_book(db, goal, goal_book_id)
    if not goal_book:
        raise HTTPException(status_code=404, detail="Goal book not found")
    updated = crud.update_goal_book_status(db, goal_book, payload)
    return schemas.GoalBook.model_validate(updated)


@app.post("/recommendations", response_model=schemas.RecommendationResponse)
def generate_recommendations(
    request: schemas.RecommendationRequest,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(auth.get_optional_user),
):
    try:
        response = recommendation_engine.recommend(db, request, user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return response
