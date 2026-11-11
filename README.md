# EA-Widget: Virtual Office (`@techies/ea-widget-virtual-office`)

`EmployeeAgent-Core (EA-Core)` に動的プラグイン接続できる独立型 **Virtual Office & AI 秘書ダイレクトメッセージ** ウィジェットプロジェクトです。

## 主な特徴

1. **EA-Core 本体と完全分離されたライフサイクル**
   - フロントエンド UI（`VirtualOfficeView` / `DmChatView`）およびバックエンド API・専用 SQLite DB（`virtual_office.sqlite`）を本リポジトリ内に完結。
   - ウィジェット側の UI・ロジック改修時は `npm run build:signed` のみで即時反映され、`EA-Core` 本体の再ビルドは一切不要です。
2. **耐量子ハイブリッドコード署名（NIST FIPS 204 `ML-DSA-65` + `Ed25519`）**
   - `widget.manifest.json` および `dist/` 全アセットの SHA-256 ハッシュツリーに対し、古典暗号 `Ed25519` と耐量子暗号 `ML-DSA-65` の二重署名を付与。
   - `EA-Core` 側の Gatekeeper が署名を検証し、1バイトでも改ざんされたプラグインはインストール・起動前に遮断されます。
3. **ゼロトラスト（ZTA）4段階 RBAC & Host API 連携**
   - `EA-Core` から RFC 8693 Token Exchange で発行される短命 `agent_token`（JWT）により認証し、サイレントリフレッシュに対応。
   - ユーザー一覧・Google カレンダー空き枠計算・Gemma 4 通訳・就業規則コンプライアンス審査・監査ログ記録はすべて `EA-Core` の `/api/core/host/*` を経由して安全に呼び出します。

## 開発・起動手順

```bash
# 依存パッケージのインストール
npm install

# フロントエンドのビルド & PQC ハイブリッド署名付与
npm run build:signed

# ウィジェット専用サーバー起動 (デフォルト Port: 8091)
npm start
```
