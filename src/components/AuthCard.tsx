"use client";

import { useState } from "react";

type AuthMode = "login" | "register";

type Props = {
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: { email: string; password: string; full_name?: string }) => Promise<void>;
  busy?: boolean;
};

const initialState = { email: "", password: "", fullName: "" };

function AuthCard({ onLogin, onRegister, busy }: Props) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    try {
      if (mode === "register") {
        await onRegister({
          email: form.email,
          password: form.password,
          full_name: form.fullName || undefined,
        });
        setMode("login");
        setMessage("登録が完了しました。続けてログインしてください。");
      } else {
        await onLogin({ email: form.email, password: form.password });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "エラーが発生しました");
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setMessage(null);
  };

  return (
    <section className="card p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "login" ? "ログイン" : "新規登録"}
          </h2>
          <p className="text-sm text-slate-600">
            {mode === "login"
              ? "登録済みのアカウントでサインインします。"
              : "メールアドレスとパスワードでアカウントを作成します。"}
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-blue-700 hover:underline"
          onClick={toggleMode}
        >
          {mode === "login" ? "新規登録へ" : "ログインへ"}
        </button>
      </div>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">
            メールアドレス
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
          />
        </div>
        {mode === "register" && (
          <div>
            <label
              htmlFor="auth-full-name"
              className="block text-sm font-medium text-slate-700"
            >
              お名前（任意）
            </label>
            <input
              id="auth-full-name"
              type="text"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
            パスワード
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          disabled={busy}
        >
          {busy ? "送信中…" : mode === "login" ? "ログイン" : "登録"}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
    </section>
  );
}

export default AuthCard;
export { AuthCard };
