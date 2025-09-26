"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { GoalProgressList } from "../../components/GoalProgressList";
import { RecommendationList } from "../../components/RecommendationList";
import { fetchGoals, requestRecommendations, updateGoalBookStatus } from "../../lib/api";
import { AUTH_TOKEN_STORAGE_KEY } from "../../lib/auth";
import type { Goal, GoalStatus, RecommendationItem, RecommendationResponse } from "../../lib/types";

const initialForm = {
  title: "",
  description: "",
  intent: "資格学習",
  deadlineDays: "",
  citySystems: "tokyo-central,tokyo-west",
};

type RecommendationFormState = typeof initialForm;

type RecommendationMeta = Pick<RecommendationResponse, "goal_id" | "generated_at" | "expires_at">;

function mapGoalBooks(goal: Goal): RecommendationItem[] {
  return goal.goal_books
    .slice()
    .sort((a, b) => a.recommendation_order - b.recommendation_order)
    .map((item) => ({
      book: item.book,
      goal_book_id: item.id,
      shelf: item.shelf,
      order: item.recommendation_order,
      status: item.status,
      reason: item.reason ?? undefined,
      availability: [],
    }));
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "不明なエラーが発生しました";
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [recommendationItems, setRecommendationItems] = useState<RecommendationItem[]>([]);
  const [recommendationMeta, setRecommendationMeta] = useState<RecommendationMeta | null>(null);
  const [goalForm, setGoalForm] = useState<RecommendationFormState>(initialForm);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
    } else {
      router.replace("/");
    }
  }, [router]);

  const activeGoal = useMemo(() => {
    if (!goals.length) {
      return null;
    }
    if (selectedGoalId) {
      const matched = goals.find((goal) => goal.id === selectedGoalId);
      if (matched) {
        return matched;
      }
    }
    return goals[0];
  }, [goals, selectedGoalId]);

  useEffect(() => {
    if (!activeGoal) {
      setRecommendationItems([]);
      setRecommendationMeta(null);
      return;
    }
    if (!recommendationMeta || recommendationMeta.goal_id !== activeGoal.id) {
      setRecommendationItems(mapGoalBooks(activeGoal));
      setRecommendationMeta({
        goal_id: activeGoal.id,
        generated_at: activeGoal.updated_at,
        expires_at: activeGoal.updated_at,
      });
    }
    if (!selectedGoalId || selectedGoalId !== activeGoal.id) {
      setSelectedGoalId(activeGoal.id);
    }
  }, [activeGoal, recommendationMeta, selectedGoalId]);

  const signOut = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    setToken(null);
    setGoals([]);
    setSelectedGoalId(null);
    setRecommendationItems([]);
    setRecommendationMeta(null);
    setStatusMessage("サインアウトしました。");
    router.push("/");
  }, [router]);

  const refreshGoals = useCallback(async () => {
    if (!token) {
      return;
    }
    setGoalsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchGoals(token);
      setGoals(data);
    } catch (error) {
      const message = formatErrorMessage(error);
      setErrorMessage(message);
      if (message.includes("401")) {
        signOut();
      }
    } finally {
      setGoalsLoading(false);
    }
  }, [token, signOut]);

  useEffect(() => {
    if (token) {
      void refreshGoals();
    }
  }, [token, refreshGoals]);

  const handleRecommendationSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) {
        setErrorMessage("ログイン後に推薦を生成できます。");
        router.replace("/");
        return;
      }
      if (!goalForm.title.trim()) {
        setErrorMessage("目的のタイトルを入力してください。");
        return;
      }
      setRecommendationBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);
      try {
        const citySystems = goalForm.citySystems
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const payload = {
          goal_title: goalForm.title.trim(),
          goal_description: goalForm.description.trim() || undefined,
          intent: goalForm.intent.trim() || undefined,
          deadline_days: goalForm.deadlineDays ? Number(goalForm.deadlineDays) : undefined,
          city_system_ids: citySystems,
        };
        const response = await requestRecommendations(payload, token);
        setRecommendationItems(response.recommendations);
        setRecommendationMeta({
          goal_id: response.goal_id,
          generated_at: response.generated_at,
          expires_at: response.expires_at,
        });
        setSelectedGoalId(response.goal_id);
        setGoalForm((prev) => ({ ...prev, title: "", description: "" }));
        setStatusMessage("推薦リストを生成しました。");
        await refreshGoals();
      } catch (error) {
        const message = formatErrorMessage(error);
        setErrorMessage(message);
        if (message.includes("401")) {
          signOut();
        }
      } finally {
        setRecommendationBusy(false);
      }
    },
    [goalForm, refreshGoals, router, signOut, token]
  );

  const handleStatusChange = useCallback(
    async (goalId: number, goalBookId: number, status: GoalStatus) => {
      if (!token) {
        setErrorMessage("ログインが必要です。");
        router.replace("/");
        return;
      }
      setStatusBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);
      try {
        const updated = await updateGoalBookStatus(token, goalId, goalBookId, status);
        const timestamp = new Date().toISOString();
        setGoals((prev) =>
          prev.map((goal) =>
            goal.id === goalId
              ? {
                  ...goal,
                  updated_at: timestamp,
                  goal_books: goal.goal_books.map((book) =>
                    book.id === goalBookId
                      ? {
                          ...book,
                          status: updated.status,
                          completion_date: updated.completion_date ?? null,
                        }
                      : book
                  ),
                }
              : goal
          )
        );
        setRecommendationItems((prev) =>
          prev.map((item) =>
            item.goal_book_id === goalBookId
              ? {
                  ...item,
                  status: updated.status,
                }
              : item
          )
        );
        setStatusMessage("読書ステータスを更新しました。");
      } catch (error) {
        const message = formatErrorMessage(error);
        setErrorMessage(message);
        if (message.includes("401")) {
          signOut();
        }
      } finally {
        setStatusBusy(false);
      }
    },
    [router, signOut, token]
  );

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="card space-y-3 p-6 text-sm text-slate-600">
          <p>認証情報を確認しています。しばらくお待ちください…</p>
          <p>
            自動的に遷移しない場合は
            {" "}
            <button className="underline" onClick={() => router.replace("/")}>
              こちら
            </button>
            {" "}
            からログイン画面に戻ってください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card space-y-5 p-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">推薦リクエスト</h2>
                <p className="text-sm text-slate-600">
                  目的を入力すると必読／準必読／発展の順に今すぐ読める本を提案します。
                </p>
              </div>
              <button type="button" onClick={signOut} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                サインアウト
              </button>
            </header>
            <form className="space-y-4" onSubmit={handleRecommendationSubmit}>
              <div className="space-y-2">
                <label htmlFor="goal-title" className="block text-sm font-medium text-slate-700">
                  目的（必須）
                </label>
                <input
                  id="goal-title"
                  type="text"
                  required
                  value={goalForm.title}
                  onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })}
                  placeholder="例: TOEIC 800 を 3 ヶ月で達成する"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="goal-description" className="block text-sm font-medium text-slate-700">
                  補足条件（任意）
                </label>
                <textarea
                  id="goal-description"
                  value={goalForm.description}
                  onChange={(event) => setGoalForm({ ...goalForm, description: event.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="goal-intent" className="block text-sm font-medium text-slate-700">
                    意図カテゴリ
                  </label>
                  <select
                    id="goal-intent"
                    value={goalForm.intent}
                    onChange={(event) => setGoalForm({ ...goalForm, intent: event.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                  >
                    <option value="資格学習">資格学習</option>
                    <option value="研究">研究</option>
                    <option value="仕事">仕事</option>
                    <option value="子育て">子育て</option>
                    <option value="趣味">趣味</option>
                    <option value="地域史">地域史</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="goal-deadline" className="block text-sm font-medium text-slate-700">
                    期限（日数）
                  </label>
                  <input
                    id="goal-deadline"
                    type="number"
                    min={1}
                    value={goalForm.deadlineDays}
                    onChange={(event) => setGoalForm({ ...goalForm, deadlineDays: event.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="goal-systems" className="block text-sm font-medium text-slate-700">
                  在架照会する図書館 systemid（カンマ区切り）
                </label>
                <input
                  id="goal-systems"
                  type="text"
                  value={goalForm.citySystems}
                  onChange={(event) => setGoalForm({ ...goalForm, citySystems: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                disabled={recommendationBusy}
              >
                {recommendationBusy ? "生成中…" : "推薦リストを生成"}
              </button>
            </form>
          </section>
          {errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700" role="status">
              {statusMessage}
            </div>
          )}
        </div>
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">目的の進捗</h2>
              {goalsLoading && <span className="text-xs text-slate-500">読み込み中…</span>}
            </div>
            {goalsLoading ? (
              <div className="card p-6 text-sm text-slate-600">目的を取得しています…</div>
            ) : (
              <GoalProgressList
                goals={goals}
                activeGoalId={activeGoal?.id ?? null}
                onSelectGoal={(goal) => {
                  setSelectedGoalId(goal.id);
                  setRecommendationMeta(null);
                }}
              />
            )}
          </section>
          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">推薦リスト</h2>
                {recommendationMeta && (
                  <p className="text-xs text-slate-500">
                    生成日時: {new Date(recommendationMeta.generated_at).toLocaleString("ja-JP")}
                  </p>
                )}
              </div>
              {recommendationMeta && (
                <p className="text-xs text-slate-500">
                  有効期限: {new Date(recommendationMeta.expires_at).toLocaleString("ja-JP")}
                </p>
              )}
            </div>
            {activeGoal ? (
              <RecommendationList
                goalId={activeGoal.id}
                recommendations={recommendationItems}
                onStatusChange={handleStatusChange}
                busy={recommendationBusy || statusBusy}
              />
            ) : (
              <div className="card p-6 text-sm text-slate-600">目的を作成すると推薦リストが表示されます。</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
