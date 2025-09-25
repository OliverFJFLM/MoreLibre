from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from ..models import AvailabilityStatus


@dataclass
class AvailabilityResult:
    isbn: str
    system_id: str
    status: AvailabilityStatus
    estimated_wait_days: int | None = None


class CarilClient:
    """A lightweight stand-in for the Calil (カーリル) API client.

    The real API requires API keys and network access. For the MVP we emulate the
    responses using an in-memory mapping so the rest of the stack can be
    exercised deterministically in tests.
    """

    def __init__(self, availability_map: Dict[str, Dict[str, Tuple[AvailabilityStatus, int | None]]]):
        self.availability_map = availability_map

    def check_availability(self, isbns: Iterable[str], system_ids: Iterable[str]) -> List[AvailabilityResult]:
        results: List[AvailabilityResult] = []
        for isbn in isbns:
            for system_id in system_ids:
                status, wait_days = self.availability_map.get(isbn, {}).get(
                    system_id, (AvailabilityStatus.unknown, None)
                )
                results.append(
                    AvailabilityResult(
                        isbn=isbn,
                        system_id=system_id,
                        status=status,
                        estimated_wait_days=wait_days,
                    )
                )
        return results


# Preloaded demo data
DEFAULT_AVAILABILITY_MAP: Dict[str, Dict[str, Tuple[AvailabilityStatus, int | None]]] = {
    "9784101010014": {
        "tokyo-central": (AvailabilityStatus.available, 0),
        "tokyo-west": (AvailabilityStatus.checked_out, 7),
    },
    "9784004301541": {
        "tokyo-central": (AvailabilityStatus.reservable, 3),
        "tokyo-west": (AvailabilityStatus.available, 0),
    },
    "9784480683117": {
        "tokyo-central": (AvailabilityStatus.checked_out, 14),
        "tokyo-west": (AvailabilityStatus.checked_out, 10),
    },
}
