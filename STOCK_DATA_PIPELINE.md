# 株価データパイプライン仕様書

## 概要
本システムは、J-Quants APIから日本株式データを自動取得し、Supabaseデータベースに保存、さらに週足・月足データを自動生成するパイプラインです。

## システム構成

### 使用技術
- **データソース**: J-Quants API（東証プライム銘柄）
- **データベース**: Supabase (PostgreSQL)
- **自動化**: GitHub Actions
- **言語**: Node.js (JavaScript)

### 対象銘柄
- 東証プライム市場の全銘柄（約1,616銘柄）
- 5桁コードで末尾が0の通常株式のみ
- 特殊証券（ETF、REIT等）は除外

## データベース構造

### テーブル: stock_prices
```sql
- ticker: string (4桁銘柄コード)
- date: date (基準日)
- timeframe: string ('1D', '1W', '1M')
- open: number (始値)
- high: number (高値)
- low: number (安値)
- close: number (終値)
- volume: number (出来高)
- PRIMARY KEY: (ticker, date, timeframe)
```

### テーブル: ticker_master
```sql
- symbol: string (4桁銘柄コード)
- name: string (会社名)
- market: string (市場 = 'TSE')
- sector: string (セクター名)
- PRIMARY KEY: symbol
```

## GitHub Actions 自動実行

### 実行タイミング
```yaml
schedule:
  - cron: '0 21 * * *'  # UTC 21:00 = JST 6:00（毎日午前6時）
```

### 処理フロー
1. **毎日 JST 午前6時に自動実行**
2. 前日の株価データを取得
3. 週足・月足データを更新
4. 土曜日は前週の週足を確定
5. 月初日は前月の月足を確定

## 手動実行方法

### GitHub Actions での手動実行

1. **GitHub リポジトリページを開く**
2. **Actions タブをクリック**
3. **"Daily Stock Data Fetch" ワークフローを選択**
4. **"Run workflow" ボタンをクリック**
5. **オプション設定**:
   - `Target date`: 取得したい日付を `YYYY-MM-DD` 形式で入力
   - 空欄の場合は前日のデータを取得

### ローカル環境での手動実行

#### 環境設定
```bash
# .envファイルに以下を設定
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
JQUANTS_EMAIL=your_email
JQUANTS_PASSWORD=your_password
```

#### 1. 日次データ取得
```bash
# 昨日のデータを取得
node scripts/fetch-jquants-daily.js

# 特定日のデータを取得
TARGET_DATE=2025-09-05 node scripts/fetch-jquants-daily.js
```

#### 2. 週足・月足更新
```bash
# 昨日のデータから週足・月足を作成
node scripts/update-timeframes-daily.js

# 特定日のデータから週足・月足を作成
TARGET_DATE=2025-09-05 node scripts/update-timeframes-daily.js
```

#### 3. ticker_master更新
```bash
# 東証プライム銘柄リストを更新
node scripts/update-ticker-master.js
```

## 処理ロジック詳細

### 1. 日次データ取得 (fetch-jquants-daily.js)

#### 処理内容
1. J-Quants APIにログイン（リフレッシュトークン取得）
2. アクセストークン取得
3. ticker_masterを最新化（銘柄の追加/削除を反映）
4. 全銘柄の指定日データを取得
5. Supabaseに保存（500件ずつバッチ処理）
6. 週足・月足更新処理を自動実行

#### データ形式
```javascript
{
  ticker: "86970",     // 5桁コード（API用）
  date: "2025-09-05",
  timeframe: "1D",
  open: 1033.0,
  high: 1037.0,
  low: 1027.0,
  close: 1036.0,
  volume: 142500
}
```

### 2. 週足・月足更新 (update-timeframes-daily.js)

#### 週足計算ロジック
- **基準日**: 週の開始日（日曜日）
- **期間**: 日曜日〜土曜日の7日間
- **計算方法**:
  ```javascript
  {
    open: 期間内最初の日の始値,
    high: 期間内の最高値,
    low: 期間内の最安値,
    close: 期間内最後の日の終値,
    volume: 期間内の出来高合計
  }
  ```

#### 月足計算ロジック
- **基準日**: 月の1日
- **期間**: 1日〜月末日
- **計算方法**: 週足と同じロジック

#### 確定処理
- **土曜日**: 前週の週足を確定（完了した週のデータを最終化）
- **月初日**: 前月の月足を確定（完了した月のデータを最終化）

### 3. ticker_master更新 (update-ticker-master.js)

#### 処理内容
1. J-Quants APIから最新の東証プライム銘柄リストを取得
2. 現在のticker_masterと比較
3. 新規銘柄を追加、上場廃止銘柄を削除
4. 変更がない場合はスキップ（パフォーマンス最適化）

## パフォーマンス最適化

### バッチ処理
- **日次データ保存**: 500件ずつバッチ処理（タイムアウト防止）
- **週足・月足保存**: 全銘柄分をまとめてバッチ保存（DB負荷軽減）

### ページング対応
- Supabaseの1000件制限に対応
- `getUpdatedTickers`: 全1616銘柄を取得可能
- `getPrimeStocks`: 全銘柄をページング取得

### ログ最適化
- 単一レコード保存時はログを簡略化
- 進捗表示は100件ごと

## エラーハンドリング

### タイムアウト対策
- Supabase statement timeout: 500件ずつバッチ処理
- GitHub Actions timeout: 処理を分割

### データ整合性
- upsert使用で重複防止: `onConflict: 'ticker,date,timeframe'`
- トランザクション的な処理でデータ整合性を保証

## トラブルシューティング

### よくある問題と対処法

#### 1. GitHub Actionsでデータが取得できない
```bash
# ログを確認
# Actions → 該当のワークフロー → 実行ログを確認
# "0 records collected"の場合は日付の問題の可能性
```

#### 2. Supabaseタイムアウトエラー
```
Error: canceling statement due to statement timeout
```
→ バッチサイズを調整（現在は500件）

#### 3. 1000件しか取得できない
→ ページング処理が正しく実装されているか確認

#### 4. 週足・月足が作成されない
→ 対象日のデータが存在するか確認
```bash
# データ確認
node -e "
const { SupabaseHelper } = require('./scripts/utils');
async function check() {
  const supabase = new SupabaseHelper();
  const tickers = await supabase.getUpdatedTickers('2025-09-05');
  console.log('Found', tickers.length, 'tickers');
}
check();
"
```

## メンテナンス

### 定期確認項目
- [ ] GitHub Actions の実行ログ（エラーがないか）
- [ ] データベースのレコード数（異常な増減がないか）
- [ ] ticker_master の銘柄数（1600前後が正常）

### アップデート時の注意点
1. 環境変数の設定を確認
2. J-Quants API の仕様変更に注意
3. Supabaseの制限（RLS、接続数等）を確認

## 関連ファイル

### スクリプト
- `scripts/fetch-jquants-daily.js` - 日次データ取得
- `scripts/update-timeframes-daily.js` - 週足・月足更新
- `scripts/update-ticker-master.js` - 銘柄マスター更新
- `scripts/utils.js` - 共通ユーティリティ

### 設定ファイル
- `.github/workflows/fetch-stock-data.yml` - GitHub Actions設定
- `.env` - 環境変数（要作成）

## セキュリティ注意事項

### 環境変数の管理
- `.env`ファイルは絶対にGitにコミットしない
- GitHub Secretsで本番環境の認証情報を管理
- `SUPABASE_SERVICE_KEY`は特に厳重に管理（全権限を持つ）

### APIキーのローテーション
- 定期的にJ-Quantsのパスワードを変更
- Supabaseのサービスキーも必要に応じて再生成

## 更新履歴

### 2025-01-08
- バッチ処理最適化（1616回→4回のDB保存）
- ページング対応（1000件制限の解決）
- TARGET_DATE環境変数サポート追加
- タイムゾーン問題の修正

---
最終更新: 2025-01-08