# 📊 Multi-Screen Stock Chart - セットアップガイド

## 🏗️ アーキテクチャ概要

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ J-Quants    │    │   GitHub     │    │  Supabase   │
│   API       │─── │   Actions    │─── │   Database  │
└─────────────┘    │ (日次バッチ)    │    │   + Auth    │
                   └──────────────┘    └─────────────┘
                                              │
                   ┌─────────────────────────┼─────────────────────────┐
                   │                         │                         │
               ┌─────────┐              ┌─────────┐              ┌─────────┐
               │Desktop  │              │ Mobile  │              │ Tablet  │
               │Electron │              │  PWA    │              │  PWA    │
               └─────────┘              └─────────┘              └─────────┘
```

## 🚀 セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)でアカウント作成
2. 新しいプロジェクトを作成
3. データベーススキーマを実行:

```sql
-- supabase/schema.sql の内容をSQL Editorで実行
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
JQUANTS_EMAIL=your-email@example.com
JQUANTS_PASSWORD=your-password
```

### 3. GitHub Secretsの設定

GitHub Actions用にシークレットを設定:

- `SUPABASE_URL`: SupabaseのURL
- `SUPABASE_SERVICE_KEY`: Supabaseのサービスロールキー
- `JQUANTS_EMAIL`: J-QuantsAPIのメール
- `JQUANTS_PASSWORD`: J-QuantsAPIのパスワード

### 4. 依存関係のインストール

```bash
npm install
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

## 🔧 デプロイ設定

### Vercel/Netlifyデプロイ

1. GitHubリポジトリをVercel/Netlifyに連携
2. 環境変数を設定:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. ビルドコマンド: `npm run build`
4. 出力ディレクトリ: `dist`

### Electronデスクトップアプリ

```bash
# デスクトップアプリをビルド
npm run build:electron

# インストーラー作成
npm run dist
```

## 🎛️ 機能説明

### 認証システム
- Supabase Auth使用
- メール/パスワード認証
- Google OAuth (設定時)
- ユーザープロファイル管理

### データ同期
- GitHub Actionsで日次自動更新
- リアルタイム同期 (Supabase Realtime)
- オフライン対応 (PWA)

### マルチデバイス対応
- レスポンシブデザイン
- PWAインストール
- デバイス間設定同期

### チャート機能
- 複数時間足表示 (1D, 1W, 1M)
- ズーム・パン操作
- テクニカル描画ツール
- メモ機能

## 📱 PWA機能

### インストール
- ブラウザで「アプリをインストール」バナー表示
- ホーム画面に追加
- オフライン対応

### プッシュ通知
```javascript
// 通知権限を要求
await pwaService.requestNotificationPermission()

// 通知を送信
pwaService.showNotification('価格アラート', {
  body: 'トヨタ自動車が目標価格に到達しました'
})
```

## 🔄 データフロー

### 1. データ取得フロー
```
J-Quants API → GitHub Actions → データ処理 → Supabase DB → 全クライアント同期
```

### 2. ユーザー操作フロー
```
ユーザー操作 → Supabase DB → Realtime → 他デバイス同期
```

## 🛠️ 開発ツール

### 使用可能コマンド

```bash
# 開発
npm run dev                 # 開発サーバー起動
npm run dev:electron       # Electron開発モード

# ビルド
npm run build              # プロダクションビルド
npm run build:electron     # Electron用ビルド

# テスト・チェック
npm run typecheck          # TypeScript型チェック
npm run lint              # ESLintチェック

# データ管理
npm run fetch-all-tickers  # 銘柄データ手動取得
```

### デバッグ

```bash
# Supabase ローカル開発
npx supabase start

# Electronデバッグ
npm run dev:electron
# 開発者ツールが自動で開きます
```

## 📊 パフォーマンス最適化

### バンドルサイズ最適化
- 動的インポート使用
- Chart.js を lightweight-charts に変更
- 不要な依存関係削除

### データ効率化
- ページング実装
- データキャッシュ
- インクリメンタル更新

## 🔐 セキュリティ

### Row Level Security (RLS)
```sql
-- ユーザーデータの保護
CREATE POLICY "users_own_data" ON watchlists
  FOR ALL USING (auth.uid() = user_id);
```

### API セキュリティ
- 環境変数で機密情報管理
- HTTPS通信必須
- JWT認証

## 🎯 本番運用

### モニタリング
- Supabaseダッシュボードで監視
- GitHub Actions実行ログ確認
- エラーログ収集

### バックアップ
- Supabaseの自動バックアップ
- GitHubでのソースコード管理

### スケーリング
- Supabase Proプランへアップグレード
- CDN配信 (Vercel/Netlify)
- ロードバランシング

## 💡 トラブルシューティング

### よくある問題

1. **認証エラー**
   - 環境変数の確認
   - Supabase URLとキーの確認

2. **データが表示されない**
   - GitHub Actionsのログ確認
   - RLSポリシーの確認

3. **PWAインストールできない**
   - HTTPS環境での実行確認
   - Service Worker登録確認

### ログ確認
```bash
# 開発ツールのコンソール
console.log('[App] Debug info:', data)

# Service Workerログ
# Application > Service Workers
```

## 🔄 アップデート手順

1. 依存関係更新: `npm update`
2. スキーマ変更: `supabase/schema.sql` 実行
3. 環境変数追加: `.env` 更新
4. デプロイ: `git push`

---

**🎉 セットアップ完了！**

マルチデバイス対応株価分析アプリが使用可能になりました。

問題がある場合は GitHub Issues で報告してください。