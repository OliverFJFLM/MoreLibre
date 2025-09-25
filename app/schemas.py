from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import AvailabilityStatus, GoalStatus


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: EmailStr | None = None
    exp: datetime | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class User(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class GoalBase(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: Optional[datetime] = None


class GoalCreate(GoalBase):
    pass


class GoalBook(BaseModel):
    id: int
    shelf: str
    recommendation_order: int
    status: GoalStatus
    completion_date: Optional[datetime] = None
    reason: Optional[str] = None
    book: Book

    model_config = ConfigDict(from_attributes=True)


class Goal(GoalBase):
    id: int
    archived: bool
    created_at: datetime
    updated_at: datetime
    goal_books: List[GoalBook] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class GoalBookStatusUpdate(BaseModel):
    status: GoalStatus
    completion_date: Optional[datetime] = None


class AvailabilitySnapshot(BaseModel):
    library_system: str
    library_name: str
    status: AvailabilityStatus
    estimated_wait_days: Optional[int]
    opac_url: Optional[str] = None


class BookBase(BaseModel):
    isbn: str
    title: str
    author: Optional[str] = None
    publisher: Optional[str] = None
    published_year: Optional[str] = None
    ndc: Optional[str] = None
    description: Optional[str] = None


class BookCreate(BookBase):
    pass


class Book(BookBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class RecommendationItem(BaseModel):
    book: Book
    goal_book_id: int
    shelf: str
    order: int
    reason: Optional[str]
    status: GoalStatus
    availability: List[AvailabilitySnapshot]


class RecommendationRequest(BaseModel):
    goal_title: str
    goal_description: Optional[str] = None
    intent: Optional[str] = None
    deadline_days: Optional[int] = None
    preferred_media: Optional[str] = None
    city_system_ids: List[str] = Field(default_factory=list)
    limit: int = 9


class RecommendationResponse(BaseModel):
    goal_id: int
    recommendations: List[RecommendationItem]
    generated_at: datetime
    expires_at: datetime

    @classmethod
    def from_goal(
        cls,
        goal_id: int,
        recommendations: List[RecommendationItem],
        ttl_minutes: int = 10,
    ) -> "RecommendationResponse":
        now = datetime.utcnow()
        return cls(
            goal_id=goal_id,
            recommendations=recommendations,
            generated_at=now,
            expires_at=now + timedelta(minutes=ttl_minutes),
        )
