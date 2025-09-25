from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import List, Sequence

from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..integrations.carl_api import CarilClient, DEFAULT_AVAILABILITY_MAP


@dataclass
class RecommendationRule:
    shelf: str
    reason_template: str


DEFAULT_RULES = [
    RecommendationRule(shelf="must_read", reason_template="最適マッチ: {ndc} / {intent}"),
    RecommendationRule(shelf="should_read", reason_template="補足読書: {ndc}"),
    RecommendationRule(shelf="explore", reason_template="発展読書: {ndc}"),
]


class RecommendationEngine:
    """Generates deterministic recommendations for demonstration purposes."""

    def __init__(self, client: CarilClient | None = None, rules: Sequence[RecommendationRule] | None = None):
        self.client = client or CarilClient(DEFAULT_AVAILABILITY_MAP)
        self.rules = list(rules or DEFAULT_RULES)

    def recommend(
        self,
        db: Session,
        request: schemas.RecommendationRequest,
    ) -> schemas.RecommendationResponse:
        # Basic heuristic: pick books matching simple keyword / ndc mapping
        candidate_books = self._select_books(db, request)
        if not candidate_books:
            raise ValueError("No candidate books available for recommendation")

        # ensure library systems exist
        systems = crud.upsert_library_systems(
            db,
            [
                {
                    "system_id": "tokyo-central",
                    "name": "Tokyo Central Library",
                    "opac_base_url": "https://example.org/tokyo-central",
                    "isbn_query_param": "isbn",
                },
                {
                    "system_id": "tokyo-west",
                    "name": "Tokyo West Library",
                    "opac_base_url": "https://example.org/tokyo-west",
                    "isbn_query_param": "isbn",
                },
            ],
        )
        system_map = {system.system_id: system for system in systems}

        assignments = []
        order_counter = defaultdict(int)
        for idx, book in enumerate(candidate_books):
            rule = self.rules[min(idx, len(self.rules) - 1)]
            order_counter[rule.shelf] += 1
            reason = rule.reason_template.format(
                ndc=book.ndc or "N/A",
                intent=request.intent or "一般",
            )
            assignments.append((book, rule.shelf, order_counter[rule.shelf], reason))

        goal = crud.create_goal(
            db,
            user=self._ensure_user(db),
            goal_in=schemas.GoalCreate(title=request.goal_title, description=request.goal_description),
        )
        goal_books = crud.replace_goal_books(db, goal, assignments)

        availability_results = self.client.check_availability(
            [book.isbn for book in candidate_books],
            request.city_system_ids or list(system_map.keys()),
        )

        availability_by_isbn: dict[str, list] = defaultdict(list)
        for result in availability_results:
            library = system_map.get(result.system_id)
            if not library:
                continue
            availability_by_isbn[result.isbn].append((library, result.status, result.estimated_wait_days))

        for book in candidate_books:
            records = availability_by_isbn.get(book.isbn, [])
            if records:
                crud.upsert_availability(db, book, records)

        recommendation_items: List[schemas.RecommendationItem] = []
        for gb in goal_books:
            book_availability = crud.get_latest_availability(db, gb.book)
            recommendation_items.append(
                schemas.RecommendationItem(
                    book=schemas.Book.model_validate(gb.book),
                    shelf=gb.shelf,
                    order=gb.recommendation_order,
                    reason=gb.reason,
                    availability=[
                        schemas.AvailabilitySnapshot(
                            library_system=snapshot.library_system.system_id,
                            status=snapshot.status,
                            estimated_wait_days=snapshot.estimated_wait_days,
                        )
                        for snapshot in book_availability
                    ],
                )
            )
        return schemas.RecommendationResponse.from_goal(goal_id=goal.id, recommendations=recommendation_items)

    def _select_books(self, db: Session, request: schemas.RecommendationRequest) -> List[models.Book]:
        books = db.query(models.Book).limit(request.limit).all()
        if books:
            return books
        demo_books = [
            schemas.BookCreate(
                isbn="9784101010014",
                title="吾輩は猫である",
                author="夏目漱石",
                publisher="新潮社",
                published_year="1905",
                ndc="913.6",
                description="夏目漱石の代表的なユーモア小説",
            ),
            schemas.BookCreate(
                isbn="9784004301541",
                title="失われた時を求めて",
                author="マルセル・プルースト",
                publisher="岩波文庫",
                published_year="1913",
                ndc="953",
                description="記憶と時間を巡る長編小説の第一部",
            ),
            schemas.BookCreate(
                isbn="9784480683117",
                title="システム思考入門",
                author="ジョン・D・ステルマン",
                publisher="ダイヤモンド社",
                published_year="2000",
                ndc="336",
                description="複雑な課題の構造を把握するための実践ガイド",
            ),
        ]
        return crud.upsert_books(db, demo_books)

    def _ensure_user(self, db: Session) -> models.User:
        user = crud.get_user_by_email(db, "demo@morelibre.example")
        if user:
            return user
        return crud.create_user(
            db,
            schemas.UserCreate(
                email="demo@morelibre.example",
                password="ChangeMe123!",
                full_name="Demo User",
            ),
        )
