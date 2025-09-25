# MoreLibre

MoreLibre は市内図書館の在架状況を加味した推薦リストを提示する図書館レコメンドサービスの MVP です。

## 主な機能

- 目的（Goal）の作成と閲覧
- 推薦 API による必読／準必読／発展リストの生成
- カーリル API のスタブを用いた館ごとの在架状況付与
- OPAC 予約導線用 URL を保持する図書館マスタ
- ユーザー登録・ログイン（JWT ベース）と進捗管理（未読／読中／読了）

## 動作環境

- Python 3.11 以上
- Node.js 18 以上

## ローカル開発のセットアップ

### バックエンド (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 必要に応じて環境変数を設定
export SECRET_KEY="change-me-in-production"
export DATABASE_URL="sqlite:///./library.db"

uvicorn app.main:app --reload
```

起動後は `http://127.0.0.1:8000/docs` からインタラクティブに API を試せます。

### フロントエンド (Next.js)

```bash
npm install

# .env.local を作成して API エンドポイントを指定
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" >> .env.local
echo "NEXT_PUBLIC_SITE_URL=http://localhost:3000" >> .env.local

npm run dev
```

`http://localhost:3000` にアクセスするとログイン → 目的登録 → 推薦表示の一連のフローを試せます。

## テスト

```bash
pytest
```

フロントエンドのビルド検証

```bash
npm run lint
npm run typecheck
npm run build
```

## 環境変数

| 変数名 | 用途 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `SECRET_KEY` | バックエンド | `insecure-development-secret` | JWT 署名に使用。必ず本番では十分に長いランダム値を設定してください。 |
| `DATABASE_URL` | バックエンド | `sqlite:///./library.db` | SQLAlchemy の接続先。PostgreSQL 等に差し替える場合はこちらを変更します。 |
| `NEXT_PUBLIC_API_BASE_URL` | フロントエンド | `http://localhost:8000` | ブラウザから呼び出す API のベース URL。Vercel では公開 API の URL を設定。 |
| `NEXT_PUBLIC_SITE_URL` | フロントエンド | なし | サイトマップ・robots.txt の生成に利用する公開 URL。 |

フロントエンド用の公開変数は `.env.local` に記述し、Vercel では Project Settings → Environment Variables に `NEXT_PUBLIC_` から始まるキーとして登録します。サーバーサイド専用の `SECRET_KEY` や `DATABASE_URL` は Vercel の Environment Variables に非公開として登録し、FastAPI をホストする環境（Vercel Serverless Functions もしくは別ホスティング）側で参照してください。

## デプロイ（Vercel）

1. GitHub リポジトリを Vercel プロジェクトに接続します。
2. Project Settings → Environment Variables に以下を追加します。
   - `NEXT_PUBLIC_API_BASE_URL`: デプロイ済み FastAPI の HTTPS URL
   - `NEXT_PUBLIC_SITE_URL`: `https://{your-project}.vercel.app`
3. バックエンドを Vercel Serverless Functions で動かす場合は `SECRET_KEY` と `DATABASE_URL` を同じく環境変数として登録します（外部 DB を推奨）。
4. Deploy Hook を利用して main ブランチへ push するたびに自動デプロイが走るよう設定します。
5. デプロイ後に `https://{your-project}.vercel.app/` へアクセスし、ログイン→目的登録→推薦リスト表示まで確認してください。

## 既知の制約 / 今後の追加予定

- カーリル API はスタブ実装のため、実際の在架照会を行うには API キー連携とレスポンス差異への対応が必要です。
- 推薦ロジックはデモ向けの決め打ちルールです。実サービスでは主題分類やユーザー属性に基づくスコアリングを導入します。
- 認証はメール + パスワードの簡易方式です。MFA や図書館カード連携などは将来の拡張対象です。
- エラーモニタリングは Vercel Analytics を有効化済みですが、必要に応じて Sentry 等の導入を検討してください。
- アクセシビリティ検証は最低限のキーボード操作・読み上げを想定しています。正式な JIS X 8341-3:2016 AA 達成に向けて専門家レビューが必要です。


## デモ用アカウント

推薦 API を実行すると自動的に `demo@morelibre.example` / `ChangeMe123!` というユーザーが作成されます。テストや動作確認に利用できます。

## ディレクトリ構成

- `app/`: FastAPI ベースのバックエンド実装
- `src/`: Next.js (App Router) フロントエンド。ログイン／目的登録／推薦表示 UI を提供
- `docs/`: 要件定義ドキュメントなど
- `tests/`: Pytest による API テスト
