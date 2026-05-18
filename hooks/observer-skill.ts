#!/usr/bin/env tsx
/**
 * PreToolUse hook (matcher: Skill) — Skill 呼び出しをセッション状態ファイルに記録する
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

interface ObserverState {
  session_id: string;
  pending_skill: string | null;
  pending_skill_ts: string | null;
  pending_skill_args: string | null;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    if (data.tool_name !== "Skill") {
      process.exit(0);
    }

    const sessionId: string = data.session_id ?? "";
    const skill: string = data.tool_input?.skill ?? "";
    const args: string = String(data.tool_input?.args ?? "").slice(0, 100);

    const state: ObserverState = {
      session_id: sessionId,
      pending_skill: skill || null,
      pending_skill_ts: new Date().toISOString(),
      pending_skill_args: args || null,
    };

    const stateFile = join(tmpdir(), `claude_observer_${sessionId}.json`);
    writeFileSync(stateFile, JSON.stringify(state), "utf-8");
  } catch {
    // fail-open
  }

  process.exit(0);
}

main();
