# MoreLibre

MoreLibre は市内図書館の在架状況を加味した推薦リストを提示する図書館レコメンドサービスの MVP です。

## 主な機能

- 目的（Goal）の作成と閲覧
- 推薦 API による必読／準必読／発展リストの生成
- カーリル API と連携した館ごとの在架状況付与（API キー未設定時はスタブデータで動作）
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

uvicorn backend.main:app --reload
```

起動後は `http://127.0.0.1:8000/docs` からインタラクティブに API を試せます。

### フロントエンド (Next.js)

```bash
npm install

# .env.local を作成して API エンドポイントを指定
echo "BACKEND_BASE_URL=http://127.0.0.1:8000" >> .env.local
echo "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000" >> .env.local
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
| `BACKEND_BASE_URL` | フロントエンド (サーバー) | `http://127.0.0.1:8000` | Next.js の API プロキシが転送する先の FastAPI URL。Vercel では未設定でも `/api/python` に配置した FastAPI が自動検出されます。 |
| `NEXT_PUBLIC_API_BASE_URL` | フロントエンド | `http://127.0.0.1:8000` | ブラウザから呼び出す API のベース URL。HTTPS で公開されていない場合は未設定でも可。 |
| `NEXT_PUBLIC_SITE_URL` | フロントエンド | なし | サイトマップ・robots.txt の生成に利用する公開 URL。 |
| `CORS_ALLOW_ORIGINS` | バックエンド | なし | カンマ区切りで指定したオリジンのみ許可します。スキームを省略すると `http://` と `https://` が両方登録されます。 |
| `CALIL_APP_KEY` | バックエンド | なし | カーリルのアプリキー。設定すると実際の在架照会 API を使用し、未設定時はスタブデータが返ります。 |
| `CALIL_API_BASE_URL` | バックエンド | `https://api.calil.jp` | （任意）プロキシやサンドボックス経由で利用する際の API ベース URL。 |

フロントエンド用の公開変数は `.env.local` に記述し、Vercel では Project Settings → Environment Variables に `NEXT_PUBLIC_` から始まるキーとして登録します。サーバーサイド専用の `SECRET_KEY` や `DATABASE_URL` は Vercel の Environment Variables に非公開として登録し、FastAPI をホストする環境（Vercel Serverless Functions もしくは別ホスティング）側で参照してください。

Next.js 側の `/api/backend/*` ルートは `BACKEND_BASE_URL` で指定した FastAPI へサーバーサイド経由でフォワードします。フロントエンドが HTTPS で公開されていてもバックエンドが HTTP のまま連携できるため、Vercel 上で「load failed」となる混在コンテンツエラーを避けられます。公開された HTTPS エンドポイントがある場合は `NEXT_PUBLIC_API_BASE_URL` を設定するとブラウザから直接呼び出す構成にも切り替えられます。カーリル API キーを取得済みの場合は FastAPI 側で `CALIL_APP_KEY` を設定すると本番の在架状況と同期します。

## デプロイ（Vercel）

1. GitHub リポジトリを Vercel プロジェクトに接続します。
2. Project Settings → Environment Variables に以下を追加します。
   - `BACKEND_BASE_URL`: FastAPI のエンドポイント URL（HTTP/HTTPS どちらでも可）。FastAPI を同じ Vercel プロジェクトの `/api/python` でホストする場合は未設定でも自動で解決されます。
   - `NEXT_PUBLIC_API_BASE_URL`: 公開したい FastAPI の HTTPS URL（任意。未設定の場合は Next.js のプロキシ `/api/backend/*` を経由）
   - `NEXT_PUBLIC_SITE_URL`: `https://{your-project}.vercel.app`
   - `CORS_ALLOW_ORIGINS`: `your-domain.com` のようにカンマ区切りで指定。プレビュー用サブドメインも忘れずに含めてください。
3. バックエンドを Vercel Serverless Functions で動かす場合は `SECRET_KEY` と `DATABASE_URL` を同じく環境変数として登録します（外部 DB を推奨）。
4. Deploy Hook を利用して main ブランチへ push するたびに自動デプロイが走るよう設定します。
5. デプロイ後に `https://{your-project}.vercel.app/` へアクセスし、ログイン→目的登録→推薦リスト表示まで確認してください。

## 本番デプロイ前チェックリスト

以下をすべて確認すると、ログイン後にダッシュボードへ遷移しない・API が叩けないといった事故を防げます。

1. **URL 間違いの防止**
   - `.env.local` やホスティング環境の `NEXT_PUBLIC_API_BASE_URL` / `BACKEND_BASE_URL` が本番 URL（必要なら `/api/python` を含む）になっているか確認します。
   - **本番環境では** `localhost` や `127.0.0.1` のままデプロイしないでください。Next.js 側では `http://` のまま本番に上げると混在コンテンツでブロックされます。
2. **CORS 設定**
   - FastAPI の `CORS_ALLOW_ORIGINS` にフロントエンドの HTTPS URL とプレビュー用サブドメイン（`https://*.vercel.app` など）を登録します。
   - スキームを省略すると自動で `http://` と `https://` の両方が追加されます。
3. **HTTPS / Mixed Content**
   - フロントが HTTPS で公開されている場合は、`NEXT_PUBLIC_API_BASE_URL` にも HTTPS の API エンドポイントを指定するか、変数を消して Next.js の `/api/backend/*` プロキシを利用します。
   - FastAPI を独自ホストする場合は Let’s Encrypt などで TLS を有効化してください。
4. **ポート公開の確認**
   - Render / Railway などで FastAPI をデプロイする場合は、アプリが `$PORT` で起動しているか確認します。ローカルの `8000` 固定起動は本番で動作しません。
5. **環境変数の登録ミス**
   - Next.js が参照する変数には `NEXT_PUBLIC_` プレフィックスを付け、Vercel の Environment Variables UI で本番・プレビュー・開発の各環境に設定されているか確認します。
6. **プロキシ / ルーティング衝突**
   - Vercel の Edge Function / API Routes と FastAPI のパスが衝突していないか (`/api/*` を二重で使っていないか) を見直します。
   - 別ホストの FastAPI を呼び出す場合は Next.js の `/api/backend/*` を経由し、ブラウザから直接叩く構成と混在させないようにします。
7. **認証トークンの送信方法**
   - ブラウザは `Authorization: Bearer <token>` ヘッダーを送っているか、バックエンドは Cookie を期待していないか確認します。
   - Cookie を使う場合は `SameSite=None` + `Secure` を忘れないでください。
8. **ネットワーク制限**
   - バックエンドがプライベートネットワーク内にあり、フロントエンドから直接アクセスできない構成になっていないかを確認します。
   - Docker Compose で運用する際は、フロントエンドから見た `localhost` が別コンテナを指す点に注意してください。

## 既知の制約 / 今後の追加予定

- カーリル API は API キー未設定時にスタブへフォールバックします。実運用では `CALIL_APP_KEY` を設定した上でレスポンス差異（館別在架ステータスなど）をモニタリングしてください。
- 推薦ロジックはデモ向けの決め打ちルールです。実サービスでは主題分類やユーザー属性に基づくスコアリングを導入します。
- 認証はメール + パスワードの簡易方式です。MFA や図書館カード連携などは将来の拡張対象です。
- エラーモニタリングは Vercel Analytics を有効化済みですが、必要に応じて Sentry 等の導入を検討してください。
- アクセシビリティ検証は最低限のキーボード操作・読み上げを想定しています。正式な JIS X 8341-3:2016 AA 達成に向けて専門家レビューが必要です。


## デモ用アカウント

推薦 API を実行すると自動的に `demo@morelibre.example` / `ChangeMe123!` というユーザーが作成されます。テストや動作確認に利用できます。

## ディレクトリ構成

- `backend/`: FastAPI ベースのバックエンド実装
- `src/`: Next.js (App Router) フロントエンド。ログイン／目的登録／推薦表示 UI を提供
- `docs/`: 要件定義ドキュメントなど
- `tests/`: Pytest による API テスト
