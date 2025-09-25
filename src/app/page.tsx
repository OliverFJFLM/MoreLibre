"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { GoalProgressList } from "@/components/GoalProgressList";
import { RecommendationList } from "@/components/RecommendationList";
import { fetchGoals, login, registerUser, requestRecommendations, updateGoalBookStatus } from "@/lib/api";
import type { Goal, GoalStatus, RecommendationItem, RecommendationResponse } from "@/lib/types";

type RecommendationFormState = {
  goal_title: string;
  goal_description: string;
  intent: string;
  deadline_days: string;
  preferred_media: string;
  city_system_ids: string;
};

const initialFormState: RecommendationFormState = {
  goal_title: "",
  goal_description: "",
  intent: "",
  deadline_days: "",
  preferred_media: "",
  city_system_ids: "tokyo-central,tokyo-west",
};

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeGoalId, setActiveGoalId] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recommendationMeta, setRecommendationMeta] = useState<RecommendationResponse | null>(null);
  const [form, setForm] = useState(initialFormState);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadGoals = useCallback(
    async (authToken: string) => {
      const items = await fetchGoals(authToken);
      setGoals(items);
      if (items.length && !activeGoalId) {
        setActiveGoalId(items[0].id);
      }
    },
    [activeGoalId]
  );

  useEffect(() => {
    const storedToken = window.localStorage.getItem("morelibre-token");
    if (storedToken) {
      setToken(storedToken);
      loadGoals(storedToken).catch((error) => setErrorMessage(error.message));
    }
  }, [loadGoals]);

  const handleLogin = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      setAuthBusy(true);
      setErrorMessage(null);
      try {
        const accessToken = await login({ email, password });
        window.localStorage.setItem("morelibre-token", accessToken);
        setToken(accessToken);
        await loadGoals(accessToken);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "ログインに失敗しました");
      } finally {
        setAuthBusy(false);
      }
    },
    [loadGoals]
  );

  const handleRegister = useCallback(async (payload: { email: string; password: string; full_name?: string }) => {
    setAuthBusy(true);
    setErrorMessage(null);
    try {
      await registerUser(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登録に失敗しました");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem("morelibre-token");
    setToken(null);
    setGoals([]);
    setRecommendations([]);
    setRecommendationMeta(null);
    setActiveGoalId(null);
  };

  const handleFormChange = (field: keyof RecommendationFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecommendationSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      const payload = {
        goal_title: form.goal_title,
        goal_description: form.goal_description || undefined,
        intent: form.intent || undefined,
        deadline_days: form.deadline_days ? Number(form.deadline_days) : undefined,
        preferred_media: form.preferred_media || undefined,
        city_system_ids: form.city_system_ids
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const response = await requestRecommendations(payload, token ?? undefined);
      setRecommendationMeta(response);
      setRecommendations(response.recommendations);
      setActiveGoalId(response.goal_id);
      if (token) {
        await loadGoals(token);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "推薦の生成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (goalId: number, goalBookId: number, status: GoalStatus) => {
    if (!token) {
      return;
    }
    setBusy(true);
    try {
      const result = await updateGoalBookStatus(token, goalId, goalBookId, status);
      const refreshed = await fetchGoals(token);
      setGoals(refreshed);
      setRecommendations((prev) =>
        prev.map((item) =>
          item.goal_book_id === goalBookId
            ? {
                ...item,
                status: result.status,
                book: result.book,
              }
            : item
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "進捗の更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {!token ? (
        <AuthCard onLogin={handleLogin} onRegister={handleRegister} busy={authBusy} />
      ) : (
        <section className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1 space-y-4">
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">目的から推薦を生成</h2>
                  <p className="text-sm text-slate-600">
                    達成したい目的と補足条件を入力すると、3層構造の推薦リストが生成されます。
                  </p>
                </div>
                <button
                  className="text-sm text-blue-700 hover:underline"
                  type="button"
                  onClick={handleLogout}
                >
                  ログアウト
                </button>
              </div>
              <form className="mt-6 grid gap-4" onSubmit={handleRecommendationSubmit}>
                <label className="flex flex-col gap-2 text-sm text-slate-700">
                  目的（必須）
                  <input
                    required
                    value={form.goal_title}
                    onChange={(event) => handleFormChange("goal_title", event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                    placeholder="例：TOEIC 800 を 3 か月で取得したい"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-slate-700">
                  補足説明
                  <textarea
                    value={form.goal_description}
                    onChange={(event) => handleFormChange("goal_description", event.target.value)}
                    className="min-h-[96px] rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                    placeholder="達成したい背景や重視したいポイントを入力してください"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    意図・ジャンル
                    <input
                      value={form.intent}
                      onChange={(event) => handleFormChange("intent", event.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                      placeholder="資格学習 / 地域史 / 子育てなど"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    期限（目安日数）
                    <input
                      type="number"
                      min={0}
                      value={form.deadline_days}
                      onChange={(event) => handleFormChange("deadline_days", event.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                      placeholder="90"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    希望媒体
                    <input
                      value={form.preferred_media}
                      onChange={(event) => handleFormChange("preferred_media", event.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                      placeholder="紙 / 電子 / 図書館 / 児童書 など"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    在架照会する館（カンマ区切り）
                    <input
                      value={form.city_system_ids}
                      onChange={(event) => handleFormChange("city_system_ids", event.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                      placeholder="tokyo-central,tokyo-west"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="submit"
                    className="rounded-md bg-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    disabled={busy || !form.goal_title}
                  >
                    {busy ? "生成中…" : "推薦リストを作成"}
                  </button>
                  {recommendationMeta && (
                    <p className="text-xs text-slate-500">
                      有効期限: {new Date(recommendationMeta.expires_at).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
              </form>
            </div>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">目的の進捗</h2>
              <GoalProgressList
                goals={goals}
                activeGoalId={activeGoalId}
                onSelectGoal={(goal) => setActiveGoalId(goal.id)}
              />
            </div>
          </div>
          <aside className="lg:w-[40%]">
            <div className="sticky top-8 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">推薦結果</h2>
              {recommendations.length === 0 ? (
                <div className="card space-y-2 p-6 text-sm text-slate-600">
                  <p>推薦結果はまだありません。目的を入力して「推薦リストを作成」を実行してください。</p>
                </div>
              ) : (
                <RecommendationList
                  goalId={recommendationMeta?.goal_id ?? activeGoalId ?? 0}
                  recommendations={recommendations}
                  onStatusChange={handleStatusChange}
                  busy={busy}
                />
              )}
            </div>
          </aside>
        </section>
      )}
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
