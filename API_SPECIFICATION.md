# Global Dictionary API 仕様書

## 概要

Global Dictionary APIは、読み上げBOT向けの共有辞書サービスです。単語の登録・検索・一覧表示機能を提供し、AI判定による適切性チェックとページネーション機能を備えています。

## 基本情報

- **ベースURL**: `https://dictapi.libertasmc.xyz`
- **認証方式**: APIキー認証
- **データ形式**: JSON
- **文字エンコーディング**: UTF-8

## 認証

全てのAPIエンドポイントでAPIキー認証が必要です。以下のいずれかの方法でAPIキーを送信してください：

### 方法1: X-API-Keyヘッダー（推奨）

```yaml
X-API-Key: your_api_key_here

```

### 方法2: Authorizationヘッダー

```yaml
Authorization: Bearer your_api_key_here
```

## エンドポイント一覧

| エンドポイント | メソッド | 機能 | レート制限 |
|--------------|---------|------|-----------|
| `/` | GET | ヘルスチェック | なし |
| `/health` | GET | 詳細ヘルスチェック | なし |
| `/stats` | GET | 辞書統計情報 | なし（無効化済み） |
| `/register` | POST | 辞書登録（AI判定付き） | なし（無効化済み） |
| `/search` | POST | 単語検索 | なし（無効化済み） |
| `/list` | GET | 辞書一覧（ページネーション） | なし（無効化済み） |
| `/convert` | POST | 文章自動変換 | なし（無効化済み） |

---

## エンドポイント詳細

### 1. ヘルスチェック

#### `GET /`

基本的なヘルスチェック

**リクエスト例:**

```bash
curl -X GET "https://dictapi.libertasmc.xyz/"
```

**レスポンス例:**

```json
{
  "status": "healthy",
  "database": "healthy - 1234 entries",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

---

### 2. 辞書統計情報

#### `GET /stats`

辞書の統計情報を取得

**リクエスト例:**

```bash
curl -X GET "https://dictapi.libertasmc.xyz/stats" \
  -H "X-API-Key: your_api_key_here"
```

**レスポンス例:**

```json
{
  "total_entries": 1234,
  "recent_entries": 56
}
```

---

### 3. 辞書登録

#### `POST /register`

新しい単語をグローバル辞書に登録（AI判定付き）

**リクエストボディ:**

```json
{
  "word": "変換前の単語",
  "kana": "変換後の読み",
  "reason": "登録理由"
}
```

**フィールド仕様:**

- `word`: 1-100文字、必須
- `kana`: 1-100文字、必須
- `reason`: 1-500文字、必須

**リクエスト例:**

```bash
curl -X POST "https://dictapi.libertasmc.xyz/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "word": "Vocalis",
    "kana": "ぼーかりす",
    "reason": "読み上げBOTの名前です"
  }'
```

**成功レスポンス例:**

```json
{
  "success": true,
  "message": "グローバル辞書に登録されました",
  "ai_reason": "固有名詞として適切な登録です",
  "registered_entry": {
    "before": "vocalis",
    "after": "ぼーかりす",
    "created_at": "2024-01-01T12:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

**AI判定により却下された場合:**

```json
{
  "success": false,
  "message": "申請が却下されました",
  "ai_reason": "不適切な内容が含まれているため登録できません",
  "error_code": "AI_VALIDATION_REJECTED"
}
```

---

### 4. 単語検索

#### `POST /search`

辞書から単語を検索し、変換結果を即座に取得

**リクエストボディ:**

```json
{
  "word": "検索する単語"
}
```

**リクエスト例:**

```bash
curl -X POST "https://dictapi.libertasmc.xyz/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "word": "ボカリス"
  }'
```

**成功レスポンス例（見つかった場合）:**

```json
{
  "found": true,
  "word": "vocalis",
  "kana": "ぼーかりす",
  "created_at": "2024-01-01T12:00:00.000Z",
  "updated_at": "2024-01-01T12:00:00.000Z"
}
```

**レスポンス例（見つからなかった場合）:**

```json
{
  "found": false,
  "word": "存在しない単語",
  "message": "単語 '存在しない単語' は辞書に登録されていません",
  "suggestions": [
    {
      "before": "類似単語1",
      "after": "るいじたんご1",
      "created_at": "2024-01-01T12:00:00.000Z",
      "updated_at": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

---

### 5. 辞書一覧表示

#### `GET /list`

辞書の一覧をページネーション付きで取得

**ヘッダーパラメータ:**

- `X-Page`: ページ番号（1から開始、デフォルト: 1）

**クエリパラメータ:**

- `per_page`: 1ページあたりのエントリ数（1-50、デフォルト: 20）

**リクエスト例:**

```bash
# 1ページ目（デフォルト20件）
curl -X GET "https://dictapi.libertasmc.xyz/list" \
  -H "X-API-Key: your_api_key_here" \
  -H "X-Page: 1"

# 2ページ目、1ページあたり30件
curl -X GET "https://dictapi.libertasmc.xyz/list?per_page=30" \
  -H "X-API-Key: your_api_key_here" \
  -H "X-Page: 2"
```

**レスポンス例:**

```json
{
  "entries": [
    {
      "before": "機動力",
      "after": "きどうりょく",
      "created_at": "2024-01-01T12:00:00.000Z",
      "updated_at": "2024-01-01T12:00:00.000Z"
    },
    {
      "before": "vocalis",
      "after": "ぼーかりす",
      "created_at": "2024-01-01T12:01:00.000Z",
      "updated_at": "2024-01-01T12:01:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 25,
    "per_page": 20,
    "total_entries": 500,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### 6. 文章変換

#### `POST /convert`

文章を辞書に基づいて自動変換し、変換詳細と共に返す

**リクエストボディ:**

```json
{
  "text": "変換したい文章"
}
```

**フィールド仕様:**

- `text`: 1文字以上、必須（文字数制限なし）

**リクエスト例:**

```bash
curl -X POST "https://dictapi.libertasmc.xyz/convert" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "text": "こんにちはVocalis！今日は機動力のテストをします。"
  }'
```

**成功レスポンス例:**

```json
{
  "original_text": "こんにちはVocalis！今日は機動力のテストをします。",
  "converted_text": "こんにちはぼーかりす！今日はきどうりょくのテストをします。",
  "conversions": [
    {
      "original": "vocalis",
      "converted": "ぼーかりす",
      "position": 5
    },
    {
      "original": "機動力",
      "converted": "きどうりょく",
      "position": 12
    }
  ],
  "conversion_count": 2
}
```

**変換が0件の場合:**

```json
{
  "original_text": "普通の文章です。",
  "converted_text": "普通の文章です。",
  "conversions": [],
  "conversion_count": 0
}
```

---

## エラーレスポンス

全てのエラーは以下の統一フォーマットで返されます：

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "詳細なエラーメッセージ",
  "details": {
    "追加の詳細情報": "値"
  },
  "user_friendly_message": "ユーザー向けの分かりやすいメッセージ"
}
```

### エラーコード一覧

| エラーコード | HTTPステータス | 説明 | ユーザー向けメッセージ |
|-------------|---------------|------|---------------------|
| `DATABASE_CONNECTION_ERROR` | 503 | データベース接続エラー | サーバーのデータベースに接続できません。しばらく時間をおいて再度お試しください。 |
| `DATABASE_OPERATION_ERROR` | 500 | データベース操作エラー | データベースの処理中にエラーが発生しました。管理者にお問い合わせください。 |
| `VALIDATION_ERROR` | 400 | リクエスト形式エラー | 入力内容に不備があります。入力内容を確認してください。 |
| `AUTHENTICATION_ERROR` | 401 | 認証エラー | APIキーが無効です。正しいAPIキーを設定してください。 |
| `AI_SERVICE_ERROR` | 503 | AI判定サービスエラー | AI判定サービスが一時的に利用できません。しばらく時間をおいて再度お試しください。 |
| `RATE_LIMIT_ERROR` | 429 | レート制限エラー | リクエスト数が制限に達しました。しばらく時間をおいて再度お試しください。 |
| `NOT_FOUND_ERROR` | 404 | リソースが見つからない | 指定されたリソースが見つかりませんでした。 |
| `CONFLICT_ERROR` | 409 | 競合エラー | 既に同じリソースが存在します。 |
| `AI_VALIDATION_REJECTED` | 200 | AI判定により却下 | *(登録エンドポイント専用)* |

### エラーレスポンス例

**認証エラー:**

```json
{
  "success": false,
  "error": "AUTHENTICATION_ERROR",
  "message": "APIキーが提供されていません。X-API-KeyヘッダーまたはAuthorizationヘッダー（Bearer）でAPIキーを送信してください。",
  "details": {},
  "user_friendly_message": "APIキーが無効です。正しいAPIキーを設定してください。"
}
```

**バリデーションエラー:**

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "単語が長すぎます（100文字以内）",
  "details": {
    "field": "word"
  },
  "user_friendly_message": "入力内容に不備があります。入力内容を確認してください。"
}
```

**レート制限エラー:**

```json
{
  "success": false,
  "error": "RATE_LIMIT_ERROR",
  "message": "1 per 1 minute",
  "details": {},
  "user_friendly_message": "リクエスト数が制限に達しました。しばらく時間をおいて再度お試しください。"
}
```

---

## 実際の使用例

### Python (requests)

```python
import requests

# APIキーを設定
API_KEY = "your_api_key_here"
BASE_URL = "https://dictapi.libertasmc.xyz"
headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# 1. 単語を登録
register_data = {
    "word": "テストワード",
    "kana": "てすとわーど",
    "reason": "テスト用の単語です"
}
response = requests.post(f"{BASE_URL}/register", json=register_data, headers=headers)
print("登録結果:", response.json())

# 2. 単語を検索
search_data = {"word": "テストワード"}
response = requests.post(f"{BASE_URL}/search", json=search_data, headers=headers)
print("検索結果:", response.json())

# 3. 辞書一覧を取得（1ページ目、10件ずつ）
list_headers = {**headers, "X-Page": "1"}
response = requests.get(f"{BASE_URL}/list?per_page=10", headers=list_headers)
print("一覧結果:", response.json())

# 4. 文章を変換
convert_data = {"text": "こんにちはVocalis！今日は機動力のテストをします。"}
response = requests.post(f"{BASE_URL}/convert", json=convert_data, headers=headers)
print("変換結果:", response.json())
```

### JavaScript (fetch)

```javascript
const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://dictapi.libertasmc.xyz';

const headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
};

// 単語を検索
async function searchWord(word) {
    const response = await fetch(`${BASE_URL}/search`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ word: word })
    });
    
    const result = await response.json();
    
    if (result.found) {
        console.log(`${word} → ${result.kana}`);
    } else {
        console.log(`${word} は見つかりませんでした`);
        if (result.suggestions.length > 0) {
            console.log('候補:', result.suggestions);
        }
    }
    
    return result;
}

// 文章変換の例
async function convertText(text) {
    const response = await fetch(`${BASE_URL}/convert`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ text: text })
    });
    
    const result = await response.json();
    console.log(`変換結果: ${result.original_text} → ${result.converted_text}`);
    console.log(`変換数: ${result.conversion_count}件`);
    
    return result;
}

// 使用例
searchWord('vocalis');
convertText('こんにちはVocalis！今日は機動力のテストをします。');
```

---

## テスト用cURLコマンド集

### 基本的な動作確認

```bash
# ヘルスチェック
curl -X GET "https://dictapi.libertasmc.xyz/"

# 統計情報取得
curl -X GET "https://dictapi.libertasmc.xyz/stats" \
  -H "X-API-Key: test_api_key_1"

# 単語登録
curl -X POST "https://dictapi.libertasmc.xyz/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{
    "word": "テスト",
    "kana": "てすと",
    "reason": "動作確認用の単語です"
  }'

# 単語検索（存在する場合）
curl -X POST "https://dictapi.libertasmc.xyz/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{"word": "テスト"}'

# 単語検索（存在しない場合）
curl -X POST "https://dictapi.libertasmc.xyz/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{"word": "存在しない単語"}'

# 辞書一覧取得
curl -X GET "https://dictapi.libertasmc.xyz/list" \
  -H "X-API-Key: test_api_key_1" \
  -H "X-Page: 1"

# ページネーション（2ページ目、5件ずつ）
curl -X GET "https://dictapi.libertasmc.xyz/list?per_page=5" \
  -H "X-API-Key: test_api_key_1" \
  -H "X-Page: 2"

# 文章変換
curl -X POST "https://dictapi.libertasmc.xyz/convert" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{"text": "こんにちはVocalis！今日は機動力のテストをします。}'
```

### エラーケースのテスト

```bash
# 認証エラー（APIキーなし）
curl -X GET "https://dictapi.libertasmc.xyz/stats"

# 認証エラー（無効なAPIキー）
curl -X GET "https://dictapi.libertasmc.xyz/stats" \
  -H "X-API-Key: invalid_key"

# バリデーションエラー（空の単語）
curl -X POST "https://dictapi.libertasmc.xyz/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{
    "word": "",
    "kana": "てすと",
    "reason": "空の単語テスト"
  }'

# バリデーションエラー（長すぎる単語）
curl -X POST "https://dictapi.libertasmc.xyz/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_1" \
  -d '{
    "word": "'$(python -c 'print("a" * 101)')'",
    "kana": "てすと",
    "reason": "長すぎる単語のテスト"
  }'

# ページネーションエラー（存在しないページ）
curl -X GET "https://dictapi.libertasmc.xyz/list" \
  -H "X-API-Key: test_api_key_1" \
  -H "X-Page: 9999"
```

---

## レート制限

**現在、全てのエンドポイントでレート制限は無効化されています。**

| エンドポイント | 制限 |
|--------------|------|
| 全てのエンドポイント | なし（無効化済み） |

## その他の注意事項

1. **文字エンコーディング**: 全てのリクエスト・レスポンスはUTF-8エンコーディングを使用
2. **大文字小文字**: 単語の検索・登録時は自動的に小文字に変換されます
3. **タイムアウト**: APIリクエストのタイムアウトは30秒です

---

## サポート

API使用中に問題が発生した場合は、エラーレスポンスの内容を確認し、適切な対処を行ってください。技術的な問題については、Vocalisにお問い合わせください。
