from __future__ import annotations

import os
import sys

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend import models
from backend.auth import get_db
from backend.main import app

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


def _register_and_login(email: str = "reader@example.com", password: str = "StrongPass1!") -> str:
    response = client.post(
        "/users",
        json={"email": email, "password": password, "full_name": "Reader"},
    )
    assert response.status_code in (200, 201)
    token_response = client.post(
        "/token",
        data={"username": email, "password": password},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert token_response.status_code == 200
    return token_response.json()["access_token"]


def test_recommendation_flow_creates_goal_and_goal_books():
    reset_database()
    token = _register_and_login()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "goal_title": "TOEIC 800",
        "goal_description": "Score 800 in TOEIC within 3 months",
        "intent": "資格学習",
        "deadline_days": 90,
        "city_system_ids": ["tokyo-central", "tokyo-west"],
    }
    response = client.post("/recommendations", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["recommendations"], "should return recommendation items"
    first_item = data["recommendations"][0]
    assert first_item["shelf"] == "must_read"
    assert first_item["goal_book_id"] > 0
    assert first_item["status"] == "unread"
    assert first_item["availability"], "availability should be attached"
    availability_entry = first_item["availability"][0]
    assert availability_entry["library_system"]
    assert availability_entry["library_name"]
    assert availability_entry["opac_url"].startswith("https://example.org/"), availability_entry["opac_url"]

    goals_response = client.get("/goals", headers=headers)
    assert goals_response.status_code == 200
    goals = goals_response.json()
    assert goals, "user should have a goal created by recommendation flow"
    goal = next(goal for goal in goals if goal["id"] == data["goal_id"])
    assert goal["goal_books"], "goal should include goal_books"
    assert len(goal["goal_books"]) == len(data["recommendations"])


def test_update_goal_book_status_and_reflect_goal_detail():
    reset_database()
    token = _register_and_login("status@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "goal_title": "System Thinking",
        "goal_description": "Understand systems thinking in depth",
    }
    recommendation = client.post("/recommendations", json=payload, headers=headers)
    assert recommendation.status_code == 200
    data = recommendation.json()
    goal_id = data["goal_id"]
    goal_book_id = data["recommendations"][0]["goal_book_id"]

    update_payload = {"status": "completed"}
    update_response = client.post(
        f"/goals/{goal_id}/books/{goal_book_id}/status",
        json=update_payload,
        headers=headers,
    )
    assert update_response.status_code == 200
    updated_body = update_response.json()
    assert updated_body["status"] == "completed"
    assert updated_body["book"]["title"]

    goal_detail = client.get(f"/goals/{goal_id}", headers=headers)
    assert goal_detail.status_code == 200
    book_entry = next(
        gb for gb in goal_detail.json()["goal_books"] if gb["id"] == goal_book_id
    )
    assert book_entry["status"] == "completed"
