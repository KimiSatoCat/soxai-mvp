# SOXAI Health Intelligence — MVP Stage 6 (API-aligned)

このMVPは**仕様確認用ツール**です。完成版ではありません。
SOXAI APIとの接続確認、データ構造の把握、純正スコア候補の検出、失敗箇所の特定を目的とします。
取得が失敗しても、それがコード不具合なのか仕様未確定なのかを切り分けるための実装です。

## API仕様の確認状況

| 項目 | 確認状況 | 根拠 |
|------|----------|------|
| API Documentation URL | **確認済み** | https://soxai-firebase.df.r.appspot.com/docs#/ |
| ReDoc URL | **確認済み** | https://soxai-firebase.df.r.appspot.com/redoc#/ |
| API Base URL | **確認済み** | `https://soxai-firebase.df.r.appspot.com` |
| ログインエンドポイント | **確認済み** | `POST {SOXAI_API_BASE}/api/login` (既存実コードから確認) |
| ログインPOSTボディ | **確認済み** | `{ email, password, returnSecureToken: true }` |
| DailyDetailData エンドポイント | **確認済み** | `/api/DailyDetailData/{localId}` |
| DailyInfoData エンドポイント | **推定** | `/api/DailyInfoData/{localId}` (既存実コードとの整合) |
| DailyDetailData time | **確認済み** | UTC |
| DailyInfoData time | **確認済み** | ローカル時間 |
| クエリパラメータ | **推定** | `page=0&start_time=...&stop_time=...` |
| FIREBASE_API_KEY | **不要** | 現在の実装では使用しない（下記参照） |
| 純正スコアのAPI取得可否 | **未確定** | このMVPで確認する |
| レスポンスJSON構造 | **未確定** | このMVPで確認する |
| 列仕様（フィールド名・型） | **未確定** | このMVPで確認する |

## ログイン方式について

本実装では、ログインを `{SOXAI_API_BASE}/api/login` へ直接POSTする方式を採用しています。

以前の実装では Firebase identitytoolkit (`identitytoolkit.googleapis.com`) を直接叩く方式でしたが、以下の理由で変更しました。

- この会話内で確認済みの既存実コードでは `{SOXAI_API_BASE}/api/login` が使われていた
- FIREBASE_API_KEY はAPI文書から確認できておらず、未確定要素だった
- SOXAI側の `/api/login` が内部でFirebase認証を処理していると考えられ、プロキシから直接Firebaseを叩く必要がない

この変更により、必要な環境変数が `SOXAI_API_BASE` / `ENDPOINT_DAILY_INFO` / `ENDPOINT_DAILY_DETAIL` の3つに減り、FIREBASE_API_KEYという未確定要素が排除されています。

## ファイル構成

```
soxai-mvp/
├── proxy/
│   ├── package.json       # dotenv 含む
│   ├── server.js          # dotenv 読み込み済み
│   └── .env.example       # 環境変数テンプレート
├── frontend/
│   └── App.jsx            # React SPA（Claude Artifact用）
└── README.md
```

## 環境変数

| 変数名 | 必須 | 説明 | 確認状況 |
|--------|------|------|----------|
| `SOXAI_API_BASE` | ✅ | APIベースURL（ログインにも使用） | **確認済み**: `https://soxai-firebase.df.r.appspot.com` |
| `ENDPOINT_DAILY_INFO` | ✅ | DailyInfoDataパス | **推定**: `/api/DailyInfoData` |
| `ENDPOINT_DAILY_DETAIL` | ✅ | DailyDetailDataパス | **確認済み**: `/api/DailyDetailData` |
| `PROXY_PORT` | — | ポート（デフォルト3001） | — |
| `FIREBASE_API_KEY` | **不要** | 現在の実装では使用しない | — |

## 起動手順

```bash
cd proxy
cp .env.example .env
# .env のデフォルト値でそのまま動作可能
# 必要に応じて SOXAI_API_BASE 等を変更

npm install
npm start
```

`.env` は dotenv により server.js 起動時に自動読み込みされます。

フロントエンドは `frontend/App.jsx` を Claude Artifact（React）として実行。
プロキシは `http://localhost:3001` を前提とします。

## 確認手順

### Step 1: プロキシ疎通

`http://localhost:3001/api/health` にアクセス。

- `status: "ok"` → 全変数設定済み
- `loginUrl` フィールドで実際のログイン先URLが確認可能

### Step 2: ログイン

フロントエンドのログインタブで認証実行。
診断タブで `requestUrl` として `{SOXAI_API_BASE}/api/login` が表示されます。

### Step 3: データ取得

「データ取得実行」を押下。診断タブで結果を確認。

### Step 4: 構造確認

診断タブでフィールド一覧、純正スコア候補、時刻候補を確認。

## 時刻フィールドの扱い

| データ種別 | time フィールドの基準 | 確認状況 |
|-----------|---------------------|----------|
| DailyDetailData | UTC | 確認済み |
| DailyInfoData | ローカル時間 | 確認済み |

## 接続失敗時の確認ポイント

| エラーコード | 意味 | 確認すべきこと |
|-------------|------|---------------|
| `CONFIG_MISSING` | 環境変数未設定 | `.env` に `SOXAI_API_BASE` が入っているか |
| `ENDPOINT_NOT_CONFIGURED` | エンドポイントパス未設定 | `ENDPOINT_DAILY_INFO` / `ENDPOINT_DAILY_DETAIL` が空でないか |
| `AUTH_FAILED` | 認証失敗 | メールアドレス/パスワードが正しいか |
| `NETWORK_ERROR` | ネットワーク到達不可 | `SOXAI_API_BASE` のURL、ネットワーク接続 |
| `HTTP_ERROR` | 非2xxレスポンス | エンドポイントパス、認証トークン |
| `EMPTY_RESPONSE` | 空レスポンス | エンドポイントパス、期間指定 |
| `NON_JSON_RESPONSE` | 非JSON | エンドポイントがHTMLエラーページ等を返していないか |
| `JSON_PARSE_ERROR` | JSONパース失敗 | Content-Typeはjsonだがボディが壊れている可能性 |
| `UNEXPECTED_STRUCTURE` | JSON取得済みだが想定外構造 | APIレスポンス形式の確認 |

## この段階でできること

- SOXAI /api/login によるログイン認証の成否確認
- DailyInfoData / DailyDetailData 取得の成否確認（個別）
- 実際のリクエストURLの確認
- JSONレスポンスの構造自動分析
- 非JSONレスポンスの診断表示
- 純正スコア候補フィールドの自動検出（候補表示のみ）
- 時刻フィールド候補の検出
- 最小正規化
- パイプライン全10工程の状態一覧

## この段階で未実装のもの

| 項目 | 状態 |
|------|------|
| 長期分析 | プレースホルダ |
| 超長期分析 | プレースホルダ |
| 周期性解析 | 未実装 |
| 独自推定スコア | 未実装 |
| キャラクター育成 | プレースホルダ |
| 環境アニメーション | 未実装 |
| 高度な助言生成 | プレースホルダ |
| 臨床グレード分析 | プレースホルダ |
