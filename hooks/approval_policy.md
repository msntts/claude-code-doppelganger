# 自動承認ポリシー（参照ドキュメント）

> **注記**: このファイルはコードから直接読み込まれない。
> 正式なポリシー定義は `gatekeeper.ts` の `SYSTEM_PROMPT` にある。
> プロジェクト固有のポリシー上書きは `.claude/approval_policy.md`（プロジェクトルート配下）に記述する。
> このファイルはその人間向け説明版であり、`SYSTEM_PROMPT` と内容を同期させること。

このポリシーは、Claude Code が操作を実行する際に自動承認してよいかを判断するための基準です。

---

## 判断の2軸

操作を評価するときは、以下の2軸で考える。

### 軸1: 副作用の有無（read-only か否か）
- **read-only**: ファイルやシステムの状態を変えない操作
  - 例: ファイル読み取り、コマンド出力の確認、git log / diff / status
- **write / destructive**: 状態を変える操作
  - 例: ファイル編集・削除、git commit、パッケージインストール、API呼び出し

### 軸2: 回復可能性（git管理下か否か）
- **回復可能**: git で管理されているプロジェクト配下のファイルへの操作
  - **「git管理下」の定義**: git リポジトリのルート配下にあるファイルを指す。untracked（`git add` 前）であっても、`.git/` が存在するディレクトリ内のファイルはすべて git管理下とみなす
  - 理由: 変更は取り消せるため、破壊的に見えても許容できる
- **回復困難**: git 管理外（`~/.ssh/`、`~/.aws/`、`/etc/` 等）
  - 理由: 消したら戻らない

---

## 自動承認してよい操作

### read-only 操作（常に承認）
- ファイルの読み取り（cat / head / tail / grep / find 等）
- git 読み取りコマンド（status / log / diff / show / branch 等）
- コマンド出力の確認（ls / ps / env / which / df / du 等）
- Web の取得（fetch / curl の GET 等）
- **解析目的の `claude -p` / `claude --print` 呼び出し**（stdin/引数で対象を渡し、stdout で結果を受け取るだけの形）
  - 該当例: `git diff | claude -p --no-session-persistence --system-prompt "..."` のように diff やコード断片を渡して解析結果を得るパターン
  - 判断の根拠: ファイル・システム状態への書き込みがない。送信内容は Claude Code セッション本体が既に Anthropic API に流しているコード断片と同等で、新規の漏洩経路にはならない
  - **自動承認の必須要件（すべて満たすこと）**:
    1. 会話履歴を残さない形（`--no-session-persistence` 等）であること。デフォルトで履歴が残る形は ask
    2. 送信内容（コマンド文字列やリダイレクト先）に機密ファイル参照が含まれないこと。`~/.ssh/`、`.env`、`*.pem`、`id_rsa`、`id_ed25519`、`credentials`、`*kube/config`、`*aws/credentials`、`.netrc`、`service_account*.json` 等のパターンが見えたら ask（`gatekeeper.ts` 側で `forceAskForLLMCli` が hard guard として強制 ask に倒す）。**ただしブラックリスト方式のため網羅性は保証されない**: 任意の `secrets.txt`・`*.token`・`*.key.json` のような未登録の機密ファイル名は hard guard を素通りする。最終的にユーザーが送信内容を確認する責任を負う前提で運用する
    3. 結果や送信内容をリモートに永続化する操作（POST 系）を伴わないこと
  - **他ベンダー CLI は対象外**: `gemini`、`ollama`、その他サードパーティの LLM CLI は新規送信先（別ベンダーの API・ローカルサーバー先）になり「Claude Code セッション本体と同等」の前提が崩れるため、自動承認に含めない（ask で都度判断）

### write 操作 × 回復可能（承認寄り）
- git 管理下プロジェクト配下のファイル編集・作成・削除
- `git add` / `git commit`（ローカルコミット）/ `git push`（force なし）
- `~/.claude/` 配下の編集（settings.json を除く）
- テスト実行・ビルドコマンド
- **影響範囲がプロジェクト内に閉じるインストール・環境構築**
  - 理由: 変更がプロジェクトディレクトリ内（`node_modules/`・仮想環境等）に留まり、依存関係ファイル（`package.json`・`lock`・`requirements.txt` 等）が git で追跡されるため回復可能
  - 判断の目安: 「このコマンドが失敗・誤っても、プロジェクト外の環境は汚染されないか？」→ Yes なら承認
  - 要確認に倒す例: グローバルフラグ（`-g` / `--global` / `--system`）付き、`sudo` 経由のインストール、システム全体のランタイム変更（`nvm use` のグローバル切り替え等）

---

## 要確認（自動承認しない）操作

- **git push --force / --force-with-lease**: 履歴の強制書き換えは回復困難（通常の `git push` は承認）
- **プロジェクト外へのファイル書き込み**: `~/.ssh/`・`~/.aws/`・`/etc/` 等
- **`~/.claude/settings.json` の編集**: 権限・フック変更はユーザーが判断すべき
- **グローバル・システムへのパッケージインストール**: `-g` / `--global` / `--system` フラグ付き、`sudo` 経由、`brew install`（システム全体に影響）等
  - プロジェクト内に閉じるインストール（`pnpm install`・`npm install`・`pip install -r requirements.txt` 等、グローバルフラグなし）は「承認寄り」で扱う
- **外部サービスへの書き込み** (API の POST / PUT / DELETE 等)
  - 例外: read-only な GET、および「解析目的の `claude -p` 呼び出し」（上記の必須要件をすべて満たすもの）は自動承認側で扱う
- **プロセス管理** (`kill` / `pkill` 等)
- **cron の登録・削除**
- **環境変数の永続化** (`.env` 書き込み等)

---

## 判断基準のまとめ

| 副作用 | 回復可能性 | 判断 |
|--------|-----------|------|
| read-only | — | 承認（readonly_confidence: certain） |
| write | git管理下 | 承認寄り（readonly_confidence: probable） |
| write | git管理外 | 要確認（ask） |
| 不可逆・破壊的 | — | ブロック（block） |

迷ったら `ask`。明らかに危険な操作のみ `block`。
