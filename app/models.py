from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class GoalStatus(str, enum.Enum):
    unread = "unread"
    reading = "reading"
    completed = "completed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    deadline = Column(DateTime, nullable=True)
    archived = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="goals")
    goal_books = relationship(
        "GoalBook",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalBook.recommendation_order",
    )


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    isbn = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    publisher = Column(String, nullable=True)
    published_year = Column(String, nullable=True)
    ndc = Column(String, nullable=True)
    description = Column(String, nullable=True)

    goal_books = relationship("GoalBook", back_populates="book")
    availability_snapshots = relationship(
        "AvailabilitySnapshot", back_populates="book", cascade="all, delete-orphan"
    )


class GoalBook(Base):
    __tablename__ = "goal_books"
    __table_args__ = (UniqueConstraint("goal_id", "book_id"),)

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    shelf = Column(String, nullable=False)  # must_read / should_read / explore
    recommendation_order = Column(Integer, nullable=False)
    status = Column(Enum(GoalStatus), default=GoalStatus.unread, nullable=False)
    completion_date = Column(DateTime, nullable=True)
    reason = Column(String, nullable=True)

    goal = relationship("Goal", back_populates="goal_books")
    book = relationship("Book", back_populates="goal_books")


class AvailabilityStatus(str, enum.Enum):
    available = "available"
    checked_out = "checked_out"
    reservable = "reservable"
    unknown = "unknown"


class LibrarySystem(Base):
    __tablename__ = "library_systems"

    id = Column(Integer, primary_key=True, index=True)
    system_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    opac_base_url = Column(String, nullable=False)
    isbn_query_param = Column(String, default="isbn")

    availability_snapshots = relationship(
        "AvailabilitySnapshot", back_populates="library_system", cascade="all, delete-orphan"
    )


class AvailabilitySnapshot(Base):
    __tablename__ = "availability_snapshots"
    __table_args__ = (UniqueConstraint("book_id", "library_system_id"),)

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    library_system_id = Column(Integer, ForeignKey("library_systems.id"), nullable=False)
    status = Column(Enum(AvailabilityStatus), default=AvailabilityStatus.unknown, nullable=False)
    estimated_wait_days = Column(Integer, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    book = relationship("Book", back_populates="availability_snapshots")
    library_system = relationship("LibrarySystem", back_populates="availability_snapshots")
