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

## セットアップ

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## テスト

```bash
pytest
```

## アプリの起動

```bash
uvicorn app.main:app --reload
```

起動後は `http://127.0.0.1:8000/docs` からインタラクティブに API を試せます。

## デモ用アカウント

推薦 API を実行すると自動的に `demo@morelibre.example` / `ChangeMe123!` というユーザーが作成されます。テストや動作確認に利用できます。
