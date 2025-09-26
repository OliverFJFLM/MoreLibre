import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 py-24 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">ページが見つかりません</h1>
      <p className="text-sm text-slate-600">
        お探しのページは移動したか、URL が正しくない可能性があります。
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
      >
        トップページに戻る
      </Link>
    </main>
  );
}
