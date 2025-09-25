from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Sequence

from sqlalchemy.orm import Session

from . import auth, models, schemas


def create_user(db: Session, user_in: schemas.UserCreate) -> models.User:
    hashed_password = auth.get_password_hash(user_in.password)
    user = models.User(email=user_in.email, hashed_password=hashed_password, full_name=user_in.full_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == email).first()


def create_goal(db: Session, user: models.User, goal_in: schemas.GoalCreate) -> models.Goal:
    goal = models.Goal(
        title=goal_in.title,
        description=goal_in.description,
        deadline=goal_in.deadline,
        user=user,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def list_goals(db: Session, user: models.User) -> List[models.Goal]:
    return (
        db.query(models.Goal)
        .filter(models.Goal.user_id == user.id)
        .order_by(models.Goal.created_at.desc())
        .all()
    )


def get_goal(db: Session, user: models.User, goal_id: int) -> models.Goal | None:
    return (
        db.query(models.Goal)
        .filter(models.Goal.user_id == user.id, models.Goal.id == goal_id)
        .first()
    )


def upsert_books(db: Session, books: Sequence[schemas.BookCreate]) -> List[models.Book]:
    stored: List[models.Book] = []
    for item in books:
        book = db.query(models.Book).filter(models.Book.isbn == item.isbn).first()
        if not book:
            book = models.Book(**item.model_dump())
            db.add(book)
            db.flush()
        stored.append(book)
    db.commit()
    for book in stored:
        db.refresh(book)
    return stored


def replace_goal_books(
    db: Session,
    goal: models.Goal,
    assignments: Iterable[tuple[models.Book, str, int, str | None]],
) -> List[models.GoalBook]:
    db.query(models.GoalBook).filter(models.GoalBook.goal_id == goal.id).delete()
    created: List[models.GoalBook] = []
    for book, shelf, order, reason in assignments:
        goal_book = models.GoalBook(
            goal_id=goal.id,
            book_id=book.id,
            shelf=shelf,
            recommendation_order=order,
            reason=reason,
        )
        db.add(goal_book)
        created.append(goal_book)
    db.commit()
    for gb in created:
        db.refresh(gb)
    return created


def update_goal_book_status(
    db: Session, goal_book: models.GoalBook, status: schemas.GoalBookStatusUpdate
) -> models.GoalBook:
    goal_book.status = status.status
    goal_book.completion_date = status.completion_date
    goal_book.goal.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(goal_book)
    return goal_book


def get_goal_book(db: Session, goal: models.Goal, goal_book_id: int) -> models.GoalBook | None:
    return (
        db.query(models.GoalBook)
        .filter(models.GoalBook.goal_id == goal.id, models.GoalBook.id == goal_book_id)
        .first()
    )


def upsert_library_systems(db: Session, systems: Sequence[dict]) -> List[models.LibrarySystem]:
    stored: List[models.LibrarySystem] = []
    for item in systems:
        system = (
            db.query(models.LibrarySystem)
            .filter(models.LibrarySystem.system_id == item["system_id"])
            .first()
        )
        if not system:
            system = models.LibrarySystem(**item)
            db.add(system)
            db.flush()
        else:
            for key, value in item.items():
                setattr(system, key, value)
        stored.append(system)
    db.commit()
    for system in stored:
        db.refresh(system)
    return stored


def upsert_availability(
    db: Session,
    book: models.Book,
    records: Sequence[tuple[models.LibrarySystem, models.AvailabilityStatus, int | None]],
) -> List[models.AvailabilitySnapshot]:
    snapshots: List[models.AvailabilitySnapshot] = []
    for library, status, wait_days in records:
        snapshot = (
            db.query(models.AvailabilitySnapshot)
            .filter(
                models.AvailabilitySnapshot.book_id == book.id,
                models.AvailabilitySnapshot.library_system_id == library.id,
            )
            .first()
        )
        if not snapshot:
            snapshot = models.AvailabilitySnapshot(
                book_id=book.id,
                library_system_id=library.id,
                status=status,
                estimated_wait_days=wait_days,
            )
            db.add(snapshot)
        else:
            snapshot.status = status
            snapshot.estimated_wait_days = wait_days
            snapshot.fetched_at = datetime.now(timezone.utc)
        snapshots.append(snapshot)
    db.commit()
    for snapshot in snapshots:
        db.refresh(snapshot)
    return snapshots


def get_latest_availability(db: Session, book: models.Book) -> List[models.AvailabilitySnapshot]:
    return (
        db.query(models.AvailabilitySnapshot)
        .filter(models.AvailabilitySnapshot.book_id == book.id)
        .all()
    )
