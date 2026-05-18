#!/usr/bin/env tsx
/**
 * Stop hook — セッション終了時に observer 状態ファイルを削除する
 */

import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    const sessionId: string = data.session_id ?? "";
    const stateFile = join(tmpdir(), `claude_observer_${sessionId}.json`);
    if (existsSync(stateFile)) {
      unlinkSync(stateFile);
    }
  } catch {
    // fail-open
  }

  process.exit(0);
}

main();
