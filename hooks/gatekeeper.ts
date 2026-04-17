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

import { execFileSync, spawnSync } from "child_process";
import { appendFileSync, existsSync, readFileSync, realpathSync, renameSync, statSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join } from "path";

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

const LOG_PATH = join(homedir(), ".claude", "gatekeeper-log.jsonl");
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB

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
  cwd?: string;
}

interface Judgment {
  interpretation?: string;
  safe: boolean;
  reason?: string;
}

interface LogEntry {
  timestamp: string;
  session_id: string;
  tool: string;
  input_summary: string;
  interpretation?: string;
  decision: "allow" | "ask" | "error";
  reason?: string;
  latency_ms: number;
}

function inputSummary(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === "Bash") return String(toolInput.command ?? "").slice(0, 200);
  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    return String(toolInput.file_path ?? "");
  }
  return JSON.stringify(toolInput).slice(0, 200);
}

function writeLog(entry: LogEntry): void {
  try {
    if (existsSync(LOG_PATH) && statSync(LOG_PATH).size >= MAX_LOG_BYTES) {
      renameSync(LOG_PATH, LOG_PATH + ".1");
    }
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // ログ失敗はサイレントに無視
  }
}

function currentBranch(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function loadProjectPrompt(cwd?: string): string | null {
  if (!cwd || !isAbsolute(cwd)) return null;
  const target = join(cwd, ".claude", "approval_policy.md");
  if (!existsSync(target)) return null;
  try {
    const resolved = realpathSync(target);
    const base = realpathSync(cwd);
    if (!resolved.startsWith(base + "/") && !resolved.startsWith(base + "\\")) return null;
    return readFileSync(resolved, "utf-8").trim();
  } catch {
    return null;
  }
}

function buildSystemPrompt(cwd?: string): string {
  const projectPrompt = loadProjectPrompt(cwd);
  if (!projectPrompt) return SYSTEM_PROMPT;
  return (
    SYSTEM_PROMPT +
    "\n\n## プロジェクト固有のルール\n" +
    "以下のルールはグローバルのルールより優先される。矛盾する場合はこちらに従うこと。\n\n" +
    projectPrompt
  );
}

function judge(toolName: string, toolInput: Record<string, unknown>, cwd?: string): Judgment {
  const userMessage = JSON.stringify({ tool: toolName, input: toolInput }, null, 2);
  const systemPrompt = buildSystemPrompt(cwd);

  const result = spawnSync(
    "claude",
    ["-p", "--no-session-persistence", "--system-prompt", systemPrompt, userMessage],
    { encoding: "utf-8", timeout: 30000 }
  );

  if (result.error) throw new Error(`subprocess error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`claude exited with ${result.status}: ${result.stderr}`);

  return JSON.parse(result.stdout.trim()) as Judgment;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const data: HookInput = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  if (READONLY_TOOLS.has(data.tool_name)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "read-only tool",
      },
    }) + "\n");
    process.exit(0);
  }

  const branch = currentBranch();
  if (branch?.startsWith("debug/")) {
    const reason = `debug/* ブランチのため自動承認 (branch: ${branch})`;
    writeLog({
      timestamp: new Date().toISOString().slice(0, 19),
      session_id: data.session_id ?? "",
      tool: data.tool_name,
      input_summary: inputSummary(data.tool_name, data.tool_input ?? {}),
      decision: "allow",
      reason,
      latency_ms: 0,
    });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: reason,
      },
    }) + "\n");
    process.exit(0);
  }

  const start = Date.now();
  const result = judge(data.tool_name, data.tool_input ?? {}, data.cwd);
  const latency_ms = Date.now() - start;

  writeLog({
    timestamp: new Date().toISOString().slice(0, 19),
    session_id: data.session_id ?? "",
    tool: data.tool_name,
    input_summary: inputSummary(data.tool_name, data.tool_input ?? {}),
    interpretation: result.interpretation,
    decision: result.safe ? "allow" : "ask",
    ...(result.reason ? { reason: result.reason } : {}),
    latency_ms,
  });

  if (result.safe) {
    // ② のビルトイン権限チェックをスキップして即実行
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: result.interpretation ?? "gatekeeper approved",
      },
    }) + "\n");
    process.exit(0);
  }

  // safe: false → 理由を stderr に出して Claude Code の ② プロンプトに委ねる
  // Claude がユーザーに yes/no を問い、理由を提示する
  process.stderr.write(`[gatekeeper] ⚠️ ${result.reason ?? "要確認の操作です"}\n`);
  process.exit(0);
}

main().catch((err: Error) => {
  writeLog({
    timestamp: new Date().toISOString().slice(0, 19),
    session_id: "",
    tool: "unknown",
    input_summary: "",
    decision: "error",
    reason: err.message,
    latency_ms: 0,
  });
  process.stderr.write(`[gatekeeper] error: ${err.message}\n`);
  process.exit(0);
});
