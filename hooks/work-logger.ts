#!/usr/bin/env tsx
/**
 * PostToolUse hook — ファイル変更・Bash 実行を work-log.jsonl に記録する
 */

import { appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Bash"]);

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  const toolName: string = data.tool_name ?? "";

  if (!LOG_TOOLS.has(toolName)) {
    process.exit(0);
  }

  const entry: Record<string, string> = {
    timestamp: new Date().toISOString().slice(0, 19),
    tool: toolName,
    session_id: data.session_id ?? "",
    cwd: process.cwd(),
  };

  if (toolName === "Bash") {
    entry.command = String(data.tool_input?.command ?? "").slice(0, 300);
  } else {
    entry.file = data.tool_input?.file_path ?? "";
  }

  const logPath = join(homedir(), ".claude", "work-log.jsonl");
  try {
    appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // ロギング失敗はサイレントに無視
  }

  process.exit(0);
}

main();
