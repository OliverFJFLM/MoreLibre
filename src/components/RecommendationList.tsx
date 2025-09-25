"use client";

import { useMemo, useState } from "react";
import type { GoalStatus, RecommendationItem } from "@/lib/types";

type Props = {
  goalId: number;
  recommendations: RecommendationItem[];
  onStatusChange: (
    goalId: number,
    goalBookId: number,
    status: GoalStatus
  ) => Promise<void>;
  busy?: boolean;
};

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: "unread", label: "未読" },
  { value: "reading", label: "読書中" },
  { value: "completed", label: "読了" },
];

const SHELF_LABEL: Record<string, string> = {
  must_read: "必読",
  should_read: "準必読",
  explore: "発展",
};

export function RecommendationList({ goalId, recommendations, onStatusChange, busy }: Props) {
  const [selectedShelf, setSelectedShelf] = useState<string>("must_read");
  const shelves = useMemo(() => {
    const unique = new Set(recommendations.map((item) => item.shelf));
    return Array.from(unique);
  }, [recommendations]);

  const filtered = recommendations.filter((item) => item.shelf === selectedShelf);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="tablist" role="tablist" aria-label="推薦カテゴリ">
          {shelves.map((shelf) => (
            <button
              key={shelf}
              role="tab"
              aria-selected={selectedShelf === shelf}
              className="tab-button"
              onClick={() => setSelectedShelf(shelf)}
            >
              {SHELF_LABEL[shelf] ?? shelf}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-600">
          {SHELF_LABEL[selectedShelf] ?? selectedShelf} セクションの候補 {filtered.length} 冊を表示中
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.goal_book_id} className="card flex h-full flex-col gap-4 p-5">
            <header className="space-y-1">
              <span className={`status-pill ${item.order === 1 ? "unread" : "reading"}`}>
                {SHELF_LABEL[item.shelf] ?? item.shelf} #{item.order}
              </span>
              <h3 className="text-lg font-semibold text-slate-900">{item.book.title}</h3>
              <p className="text-sm text-slate-600">
                {item.book.author} / {item.book.publisher}
              </p>
              {item.reason && <p className="text-sm text-slate-500">推奨理由: {item.reason}</p>}
            </header>
            <section className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">読書ステータス</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                  value={item.status}
                  onChange={(event) =>
                    onStatusChange(goalId, item.goal_book_id, event.target.value as GoalStatus)
                  }
                  disabled={busy}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {item.book.description && (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                  {item.book.description}
                </p>
              )}
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-700">所蔵状況</p>
                {item.availability.length === 0 && (
                  <p className="text-slate-500">所蔵情報を取得できませんでした。</p>
                )}
                {item.availability.map((status) => (
                  <div
                    key={`${status.library_system}-${status.status}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white/70 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{status.library_name}</p>
                      <p className="text-xs text-slate-500">システムID: {status.library_system}</p>
                    </div>
                    <div className={`availability-badge ${status.status}`}>
                      {status.status === "available"
                        ? "在架"
                        : status.status === "checked_out"
                        ? "貸出中"
                        : status.status === "reservable"
                        ? "予約可"
                        : "照会中"}
                      {typeof status.estimated_wait_days === "number" && (
                        <span className="ml-1 text-[11px] text-slate-600">
                          目安 {status.estimated_wait_days} 日
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <footer className="mt-auto flex items-center justify-between text-sm text-blue-700">
              {item.availability.map((status) => (
                status.opac_url && (
                  <a
                    key={status.opac_url}
                    href={status.opac_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold hover:underline"
                  >
                    {status.library_name}で予約
                  </a>
                )
              ))}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
