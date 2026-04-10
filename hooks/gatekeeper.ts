#!/usr/bin/env tsx
/**
 * PreToolUse hook — Claude Code サブプロセスによる危険度判定と承認フロー
 *
 * 判定結果:
 *   safe: true  → exit 0（そのまま実行）
 *   safe: false → decision: block（Claude が理由を提示しユーザーに確認）
 *
 * エラー時はフック自体の障害でユーザー操作を止めないよう exit 0 にフォールバックする。
 */

import { spawnSync } from "child_process";

// 読み取り専用ツールは判定不要で即通過
const READONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "LS",
  "TodoRead",
  "TaskGet",
  "TaskList",
]);

const SYSTEM_PROMPT = `\
あなたは Claude Code のツール呼び出しの安全性を判定するゲートキーパーです。
ツール名と入力内容を受け取り、実行を許可するかどうかを判定します。

## 原則
「やり直せない」操作のみをブロックする。
git 管理下のファイルは削除しても復元可能なため、ファイル削除それ自体は危険ではない。
判断基準は「この操作の後に元に戻せるか」であり、「壊れているように見えるか」ではない。
対象が git 管理下かどうか不明な場合は、安全のため確認を求める。

## 危険とみなすカテゴリ

### 不可逆なファイル操作
- git 管理外のファイル・ディレクトリの削除（バックアップなし）
- git 管理下であっても未コミットの変更を含むファイルの削除（変更分が消える）

### git の履歴破壊
- git push --force / -f（--force-with-lease は OK）
- git reset --hard
- git commit --amend（公開済みコミットへの適用）

### 検証のバイパス
- git commit --no-verify
- git push --no-verify

### データベース破壊
- DROP TABLE, DROP DATABASE, TRUNCATE TABLE
- 特に prod / production を示す接続先への実行

### 本番システムへの直接操作
- 本番環境への直接デプロイ（CI/CD 経由でない操作）
- 本番 DB への破壊的クエリ

## 安全とみなすカテゴリ（例）
- あらゆる読み取り・検索・閲覧操作
- ビルド・コンパイル・テスト実行
- npm / pip / brew によるパッケージ管理
- git status, diff, log, fetch, pull, checkout, commit（--no-verify なし）
- 開発サーバーの起動・停止
- git 管理下のファイル・ディレクトリの削除（コミット済みであれば復元可能）
- node_modules / dist などビルド成果物の削除

## 判定手順
必ず以下の順序で思考してから出力すること。

1. **操作の解釈**: このツール呼び出しが実際に何をするのかを平易な日本語で述べる
2. **不可逆性の評価**: その操作は元に戻せるか。git 管理下か、対象範囲はどこか等を考慮する
3. **判定**: safe か否かを決定する

## 出力形式
必ず以下の JSON のみを返すこと。説明文・前置き・コードブロックは不要。

{"interpretation": "操作の意味を一文で（日本語）", "safe": true}

{"interpretation": "操作の意味を一文で（日本語）", "safe": false, "reason": "何が危険か、あるいは何を確認すべきかを簡潔に説明する（日本語）"}\
`;

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  session_id?: string;
}

interface Judgment {
  interpretation?: string;
  safe: boolean;
  reason?: string;
}

function judge(toolName: string, toolInput: Record<string, unknown>): Judgment {
  const userMessage = JSON.stringify({ tool: toolName, input: toolInput }, null, 2);

  const result = spawnSync(
    "claude",
    ["-p", "--no-session-persistence", "--system-prompt", SYSTEM_PROMPT, userMessage],
    { encoding: "utf-8", timeout: 30000 }
  );

  if (result.error) {
    throw new Error(`subprocess error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`claude exited with ${result.status}: ${result.stderr}`);
  }

  const text = result.stdout.trim();
  return JSON.parse(text) as Judgment;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const data: HookInput = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  // 読み取り専用ツールは即通過
  if (READONLY_TOOLS.has(data.tool_name)) {
    process.exit(0);
  }

  const result = judge(data.tool_name, data.tool_input ?? {});

  if (result.safe) {
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({ decision: "block", reason: result.reason }) + "\n"
  );
  process.exit(1);
}

main().catch((err: Error) => {
  // フック自体の障害はサイレントに通過させる
  process.stderr.write(`[gatekeeper] error: ${err.message}\n`);
  process.exit(0);
});
