from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import httpx

from ..models import AvailabilityStatus


@dataclass
class AvailabilityResult:
    isbn: str
    system_id: str
    status: AvailabilityStatus
    estimated_wait_days: int | None = None


CALIL_STATUS_KEYWORDS: Dict[str, AvailabilityStatus] = {
    "貸出可": AvailabilityStatus.available,
    "蔵書あり": AvailabilityStatus.available,
    "館内のみ": AvailabilityStatus.available,
    "利用可": AvailabilityStatus.available,
    "貸出中": AvailabilityStatus.checked_out,
    "準備中": AvailabilityStatus.checked_out,
    "返却待ち": AvailabilityStatus.checked_out,
    "予約可": AvailabilityStatus.reservable,
    "予約受付中": AvailabilityStatus.reservable,
    "受付中": AvailabilityStatus.reservable,
    "取寄せ可": AvailabilityStatus.reservable,
    "蔵書なし": AvailabilityStatus.unknown,
    "休館中": AvailabilityStatus.unknown,
    "未所蔵": AvailabilityStatus.unknown,
}


class CarilClient:
    """Client for the Calil (カーリル) library availability API.

    If an API key is configured via ``CALIL_APP_KEY`` (or ``CARIL_API_KEY`` for backwards
    compatibility) the client will poll the public Calil endpoint. Otherwise it
    falls back to a deterministic in-memory dataset so the rest of the stack can
    run in local development and CI without external dependencies.
    """

    def __init__(
        self,
        availability_map: Dict[str, Dict[str, Tuple[AvailabilityStatus, int | None]]] | None = None,
        *,
        app_key: str | None = None,
        base_url: str | None = None,
        poll_interval: float = 1.0,
        max_polls: int = 4,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.availability_map = availability_map or DEFAULT_AVAILABILITY_MAP
        self.app_key = app_key or os.getenv("CALIL_APP_KEY") or os.getenv("CARIL_API_KEY")
        self.base_url = (base_url or os.getenv("CALIL_API_BASE_URL") or "https://api.calil.jp").rstrip("/")
        self.poll_interval = poll_interval
        self.max_polls = max(1, max_polls)
        self._http_client = http_client

    def check_availability(self, isbns: Iterable[str], system_ids: Iterable[str]) -> List[AvailabilityResult]:
        isbn_list = [isbn for isbn in isbns if isbn]
        system_list = [system_id for system_id in system_ids if system_id]
        if not isbn_list or not system_list:
            return []

        if not self.app_key:
            return self._check_availability_stub(isbn_list, system_list)

        return self._check_availability_remote(isbn_list, system_list)

    # ------------------------------------------------------------------
    # Stubbed fallback
    # ------------------------------------------------------------------
    def _check_availability_stub(
        self, isbn_list: List[str], system_list: List[str]
    ) -> List[AvailabilityResult]:
        results: List[AvailabilityResult] = []
        for isbn in isbn_list:
            for system_id in system_list:
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

    # ------------------------------------------------------------------
    # Real API integration
    # ------------------------------------------------------------------
    def _check_availability_remote(
        self, isbn_list: List[str], system_list: List[str]
    ) -> List[AvailabilityResult]:
        params = {
            "appkey": self.app_key,
            "isbn": ",".join(isbn_list),
            "systemid": ",".join(system_list),
            "format": "json",
            "callback": "",
        }
        session_id: str | None = None
        aggregated: Dict[Tuple[str, str], AvailabilityResult] = {}

        client = self._http_client or httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0))
        close_client = self._http_client is None
        try:
            for attempt in range(self.max_polls):
                poll_params = dict(params)
                if session_id:
                    poll_params["session"] = session_id
                response = client.get(f"{self.base_url}/check", params=poll_params)
                response.raise_for_status()
                payload = response.json()
                session_id = payload.get("session", session_id)
                books = payload.get("books") or {}
                for isbn, systems in books.items():
                    if not isinstance(systems, dict):
                        continue
                    for system_id in system_list:
                        system_payload = systems.get(system_id)
                        aggregated[(isbn, system_id)] = AvailabilityResult(
                            isbn=isbn,
                            system_id=system_id,
                            status=self._parse_system_status(system_payload),
                            estimated_wait_days=None,
                        )

                if not payload.get("continue"):
                    break
                if attempt < self.max_polls - 1:
                    time.sleep(self.poll_interval)
        finally:
            if close_client:
                client.close()

        # Ensure we return results for every combination so downstream code can rely on deterministic length
        results: List[AvailabilityResult] = []
        for isbn in isbn_list:
            for system_id in system_list:
                results.append(
                    aggregated.get((isbn, system_id))
                    or AvailabilityResult(
                        isbn=isbn,
                        system_id=system_id,
                        status=AvailabilityStatus.unknown,
                        estimated_wait_days=None,
                    )
                )
        return results

    def _parse_system_status(self, payload: object) -> AvailabilityStatus:
        if not isinstance(payload, dict):
            return AvailabilityStatus.unknown

        libkey = payload.get("libkey")
        if isinstance(libkey, dict) and libkey:
            statuses = [self._map_branch_status(str(status)) for status in libkey.values()]
            if AvailabilityStatus.available in statuses:
                return AvailabilityStatus.available
            if AvailabilityStatus.reservable in statuses:
                return AvailabilityStatus.reservable
            if AvailabilityStatus.checked_out in statuses:
                return AvailabilityStatus.checked_out
            return AvailabilityStatus.unknown

        status_text = payload.get("status")
        if isinstance(status_text, str):
            return self._map_branch_status(status_text)

        return AvailabilityStatus.unknown

    def _map_branch_status(self, status_text: str) -> AvailabilityStatus:
        for keyword, mapped_status in CALIL_STATUS_KEYWORDS.items():
            if keyword in status_text:
                return mapped_status
        normalized = status_text.strip().lower()
        if normalized in {"available", "ok", "in"}:
            return AvailabilityStatus.available
        if normalized in {"checkout", "out", "loan"}:
            return AvailabilityStatus.checked_out
        if normalized in {"reserve", "reservable", "hold"}:
            return AvailabilityStatus.reservable
        return AvailabilityStatus.unknown


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
