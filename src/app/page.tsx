"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AuthCard from "../components/AuthCard";
import { login, registerUser } from "../lib/api";
import { AUTH_TOKEN_STORAGE_KEY } from "../lib/auth";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "不明なエラーが発生しました";
}

export default function LandingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (storedToken) {
      router.replace("/dashboard");
    } else {
      void router.prefetch("/dashboard");
    }
  }, [router]);

  const handleLogin = useCallback(
    async (payload: { email: string; password: string }) => {
      setBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);
      try {
        const accessToken = await login(payload);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken);
        }
        setStatusMessage("ログインしました。ダッシュボードに移動します…");
        router.push("/dashboard");
      } catch (error) {
        const message = formatErrorMessage(error);
        setErrorMessage(message);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const handleRegister = useCallback(async (payload: { email: string; password: string; full_name?: string }) => {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await registerUser(payload);
    } catch (error) {
      const message = formatErrorMessage(error);
      setErrorMessage(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-4 text-center">
        <h2 className="text-2xl font-semibold text-slate-900">目的からはじまる読書計画</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          市内全館の蔵書を横断して、今すぐ借りられる本だけを必読・準必読・発展の順で提案します。アカウントを
          作成してログインすると、目的の進捗や推薦履歴をダッシュボードで管理できます。
        </p>
      </section>
      <div className="space-y-4">
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
        <AuthCard onLogin={handleLogin} onRegister={handleRegister} busy={busy} />
      </div>
    </div>
  );
}
