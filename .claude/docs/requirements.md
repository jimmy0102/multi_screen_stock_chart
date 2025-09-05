## マルチスクリーン株価チャート — **Electron + React デスクトップ版**

（データはローカルに完結・高速描画）

---

### 1. 目的

* **東証プライム全銘柄（動的取得：JPX月次一覧/J-Quants API）** を対象に、

  * 60 分足・日足・週足・月足の **4 Pane 同期表示**
  * **↑/↓** で銘柄を高速切替、**Enter** でメモ欄へフォーカス
* リアルタイム株価表示対応（J-Quants API Premium / 証券会社API）
* オフライン環境では前営業日データまで閲覧可（Stooq / J-Quants からバッチ取得）
* “ながら操作”を支える **キーボード優先 UX**

### 2. 機能要件

| 区分         | 要件         | 詳細                                                                           |
| ---------- | ---------- | ---------------------------------------------------------------------------- |
| **チャート表示** | 4 分割／同期表示  | 60 min・1D・1W・1M を同一銘柄・同一色テーマで同期スクロール                                         |
| **銘柄ナビ**   | 連番インクリメント  | `↑`＝index−1, `↓`＝index＋1（ラップ）<br>`Shift+↑/↓`＝±10, `PgUp/PgDn`＝±100           |
| **メモ機能**   | ティッカー単位の付箋 | `Enter` で textarea → `Ctrl+Enter` 保存、SQLite( notes.db ) に `ticker, ts, text` |
| **お気に入り**  | Space でトグル | メモ一覧 & フィルタ表示                                                                |
| **データ更新**  | リアルタイム+バッチ | リアルタイム：J-Quants Premium/証券API、バッチ：Stooq CSV→SQLite `maxAge=1 day` |

### 3. 非機能要件

* **性能**: 30 fps 以上、銘柄切替 150 ms 以内
* **オフライン**: データ取得フェーズ以外はネット不要
* **保守性**: TypeScript + ESLint + Prettier／依存バージョン固定
* **セキュリティ**: Electron `contextIsolation`, `sandbox`, CSP

### 4. システム構成

```
┌──────── Desktop App (Electron) ───────┐
│ Main Process │ Renderer (React)        │
│─────────────┼────────────────────────│
│ menubar.ts   │ Home.tsx                │
│ ipcMain      │ ChartPane.tsx ×4        │
│ autoUpdater  │ useTicker / useHotkey   │
└─────────────┴─────────▲──────────────┘
                         │ IPC
               ┌─────────┴─────────┐
               │ local.db (SQLite) │← cron_fetch.sh
               └───────────────────┘
```

* **チャート描画**: lightweight-charts（Apache-2.0、4Pane同期はカスタム実装）
* **パッケージング**: electron-builder → MSI / dmg / AppImage
* **自動更新**: GitHub Releases + electron-updater

### 5. データフロー

1. **起動**: SQLite からティッカー配列 & キャッシュ読込
2. **キー入力** → `currentIndex` 更新 → 4 ChartPane に `symbol` prop 渡す
3. **ChartPane**: `useEffect` で `widget.setSymbol()` ↔ 再描画
4. **メモ保存**: Indexed DB バックアップ → 非同期で SQLite 書込

### 6. キーボードマッピング

| キー        | 意味      | 片手操作可 |
| --------- | ------- | ----- |
| ↑ / ↓     | 前 / 次銘柄 | ✔     |
| Shift+↑/↓ | ±10 銘柄  | ✔     |
| PgUp/PgDn | ±100    | ✔     |
| Space     | お気に入り切替 | ✔     |
| Enter     | メモ欄へ    | ✔     |
| Esc       | チャートへ戻る | ✔     |

### 7. ビルド & デプロイ手順（概要）

1. `npm run build:renderer`（Vite）
2. `npm run build:electron`（webpack）
3. `electron-builder --win --mac --linux`
4. GitHub Actions で nightly build／auto-publish

### 8. 想定リスク & 対策

| リスク                 | 対策                                    |
| ------------------- | ------------------------------------- |
| API 制限・停止           | 複数データソース対応：Stooq→J-Quants→手動import |
| lightweight-charts 4Pane同期 | カスタム TimeScale 同期実装・コミュニティ実装参考 |
| リアルタイムAPI コスト      | 段階的導入：無料版→有料版、設定で切替可能         |

---

## ロードマップ（Electron デスクトップ版）

| 週 | 実装内容                     | 成果物                                    |
| - | ------------------------ | -------------------------------------- |
| 1 | プロジェクト雛形 / SQLite schema | Electron + React 環境構築、DB スキーマ設計        |
| 2 | lightweight-charts 組込 / 4Pane | チャート描画エンジン統合、4分割同期レイアウト実装          |
| 3 | キー入力・ティッカー遷移             | キーボードナビゲーション実装、動的銘柄取得・切替ロジック       |
| 4 | メモ DB & UI               | メモ機能実装、SQLite 保存処理                    |
| 5 | リアルタイム+バッチ DL           | J-Quants/Stooq データ取得、electron-updater |
| 6 | QA & β版                  | パフォーマンステスト、バグ修正、β版リリース               |
| 7 | リリース準備                   | インストーラー作成、署名、GitHub Releases 配布準備    |
| 8 | Docs & チュートリアル動画         | ユーザードキュメント作成、操作説明動画録画               |

---

### 開発指針

Electron デスクトップ版として、オフライン環境での高速動作とキーボード優先の UX を重視した実装を進める。
技術選択やアーキテクチャの詳細については実装過程で適宜調整し、パフォーマンス要件（30fps以上、銘柄切替150ms以内）を満たすことを最優先とする。
