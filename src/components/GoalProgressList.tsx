"use client";

import { useMemo } from "react";
import type { Goal, GoalBook, GoalStatus } from "../lib/types";

type Props = {
  goals: Goal[];
  activeGoalId?: number | null;
  onSelectGoal?: (goal: Goal) => void;
};

const STATUS_LABEL: Record<GoalStatus, string> = {
  unread: "未読",
  reading: "読書中",
  completed: "読了",
};

function summarizeGoal(goal: Goal): Record<GoalStatus, number> {
  return goal.goal_books.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { unread: 0, reading: 0, completed: 0 } as Record<GoalStatus, number>
  );
}

function formatUpdatedAt(goal: Goal): string {
  return new Date(goal.updated_at).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GoalCard({ goal, selected }: { goal: Goal; selected: boolean }) {
  const summary = useMemo(() => summarizeGoal(goal), [goal]);
  return (
    <article
      className={`card flex cursor-pointer flex-col gap-3 border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg ${
        selected ? "ring-2 ring-blue-500" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{goal.title}</h3>
          {goal.description && (
            <p className="mt-1 text-sm text-slate-600">{goal.description}</p>
          )}
        </div>
        <p className="text-xs text-slate-500">更新: {formatUpdatedAt(goal)}</p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {(Object.keys(summary) as GoalStatus[]).map((status) => (
          <div key={status} className="rounded-lg border border-slate-200 bg-white/80 p-2 text-center">
            <dt className="text-slate-500">{STATUS_LABEL[status]}</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{summary[status]}</dd>
          </div>
        ))}
      </dl>
      <div className="text-xs text-slate-500">
        全 {goal.goal_books.length} 冊 / 必読 {countShelf(goal.goal_books, "must_read")} / 準必読
        {" "}
        {countShelf(goal.goal_books, "should_read")} / 発展 {countShelf(goal.goal_books, "explore")}
      </div>
    </article>
  );
}

function countShelf(goalBooks: GoalBook[], shelf: string): number {
  return goalBooks.filter((item) => item.shelf === shelf).length;
}

export function GoalProgressList({ goals, activeGoalId, onSelectGoal }: Props) {
  if (goals.length === 0) {
    return (
      <div className="card space-y-2 p-6 text-sm text-slate-600">
        <p>まだ目的がありません。フォームから目的を登録し、推薦を生成してください。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {goals.map((goal) => (
        <div
          key={goal.id}
          onClick={() => onSelectGoal?.(goal)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectGoal?.(goal);
            }
          }}
          role="button"
          tabIndex={0}
          className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <GoalCard goal={goal} selected={goal.id === activeGoalId} />
        </div>
      ))}
    </div>
  );
}
