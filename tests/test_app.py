from __future__ import annotations

import os
import sys

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import models
from app.auth import get_db
from app.main import app

SQLALCHEMY_DATABASE_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
models.Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def reset_database():
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_user_registration_and_login():
    reset_database()
    response = client.post(
        "/users",
        json={"email": "test@example.com", "password": "StrongPass1!", "full_name": "Tester"},
    )
    assert response.status_code == 201
    token_response = client.post(
        "/token",
        data={"username": "test@example.com", "password": "StrongPass1!"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert token_response.status_code == 200
    data = token_response.json()
    assert "access_token" in data


def test_recommendation_flow_creates_goal_and_goal_books():
    reset_database()
    payload = {
        "goal_title": "TOEIC 800",
        "goal_description": "Score 800 in TOEIC within 3 months",
        "intent": "資格学習",
        "deadline_days": 90,
        "city_system_ids": ["tokyo-central", "tokyo-west"],
    }
    response = client.post("/recommendations", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["recommendations"], "should return recommendation items"
    first_item = data["recommendations"][0]
    assert first_item["shelf"] == "must_read"
    assert first_item["availability"], "availability should be attached"

    token_response = client.post(
        "/token",
        data={"username": "demo@morelibre.example", "password": "ChangeMe123!"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    token = token_response.json()["access_token"]
    goals_response = client.get("/goals", headers={"Authorization": f"Bearer {token}"})
    assert goals_response.status_code == 200
    goals = goals_response.json()
    assert goals, "demo user should have a goal created by recommendation flow"
