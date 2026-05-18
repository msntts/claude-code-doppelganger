#!/usr/bin/env tsx
/**
 * PostToolUse hook (matcher: Agent) — Agent 完了を observer-log.jsonl に記録する
 *
 * ログローテーション: 500KB 超で .jsonl.1 → .jsonl.2 にシフト（2世代保持）
 */

import { appendFileSync, existsSync, renameSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_PATH = join(homedir(), ".claude", "observer-log.jsonl");
const LOG_MAX_BYTES = 500 * 1024;
const LOG_BACKUPS = 2;

interface ObserverEntry {
  timestamp: string;
  session_id: string;
  event_type: "agent_invoked";
  agent_description: string;
  cwd: string;
}

function rotateLog(): void {
  if (!existsSync(LOG_PATH) || statSync(LOG_PATH).size < LOG_MAX_BYTES) return;
  for (let i = LOG_BACKUPS; i >= 1; i--) {
    const src = i === 1 ? LOG_PATH : `${LOG_PATH}.${i - 1}`;
    const dst = `${LOG_PATH}.${i}`;
    if (existsSync(src)) renameSync(src, dst);
  }
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    if (data.tool_name !== "Agent") {
      process.exit(0);
    }

    const entry: ObserverEntry = {
      timestamp: new Date().toISOString().slice(0, 19),
      session_id: data.session_id ?? "",
      event_type: "agent_invoked",
      agent_description: String(data.tool_input?.description ?? "").slice(0, 100),
      cwd: process.cwd(),
    };

    rotateLog();
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // fail-open
  }

  process.exit(0);
}

main();
