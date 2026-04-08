#!/usr/bin/env tsx
/**
 * PreToolUse hook — 危険な Bash コマンドを検査してブロックする
 */

const DANGER_PATTERNS: Array<[RegExp, string]> = [
  [/rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+\/(?!\S)/im, "rm -rf / — ルートディレクトリの削除"],
  [/rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+~\s*$/im,    "rm -rf ~ — ホームディレクトリの削除"],
  // --force-with-lease は安全なので除外
  [/git\s+push\b(?!.*--force-with-lease).*(?:--force\b|-f\b)/im, "git push --force — 強制プッシュ"],
  [/git\s+reset\s+--hard/im,                   "git reset --hard — ローカル変更の消失"],
  [/git\s+commit.*--no-verify/im,              "git commit --no-verify — コミットフックのスキップ"],
  [/git\s+push.*--no-verify/im,                "git push --no-verify — プッシュフックのスキップ"],
  [/\bDROP\s+TABLE\b/im,                       "DROP TABLE — テーブル削除"],
  [/\bDROP\s+DATABASE\b/im,                    "DROP DATABASE — データベース削除"],
  [/\bTRUNCATE\s+TABLE\b/im,                   "TRUNCATE TABLE — テーブル全件削除"],
];

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  if (data.tool_name !== "Bash") {
    process.exit(0);
  }

  const command: string = data.tool_input?.command ?? "";
  const blocks: string[] = DANGER_PATTERNS
    .filter(([pattern]) => pattern.test(command))
    .map(([, label]) => label);

  if (blocks.length > 0) {
    const reason =
      "⚠️ 危険な操作を検出しました:\n" +
      blocks.map((b) => `  - ${b}`).join("\n") +
      "\n\nユーザーの明示的な許可なしに実行できません。";
    process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
    process.exit(1);
  }

  process.exit(0);
}

main();
