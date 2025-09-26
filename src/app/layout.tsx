import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoreLibre",
  description: "市内図書館の在架状況を踏まえた読書ルートを提案するサービス",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-sand text-slate-900">
        <div className="min-h-screen bg-white/80">
          <header className="border-b border-slate-200 bg-white/90 shadow-sm">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">MoreLibre</p>
                <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                  図書館レコメンドサービス
                </h1>
              </div>
              <p className="text-sm text-slate-600">
                目的に沿った必読／準必読／発展の読書ルートと予約導線をまとめて提供します。
              </p>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
          <footer className="border-t border-slate-200 bg-white/90">
            <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-slate-500">
              © {new Date().getFullYear()} MoreLibre. デモ用途のためのサンプル実装です。
            </div>
          </footer>
          <Analytics />
        </div>
      </body>
    </html>
  );
}
