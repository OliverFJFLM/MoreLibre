"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 py-24 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">エラーが発生しました</h1>
      <p className="text-sm text-slate-600">
        一時的な問題が発生した可能性があります。ページを再読み込みして再度お試しください。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center justify-center rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
      >
        再読み込み
      </button>
    </main>
  );
}
