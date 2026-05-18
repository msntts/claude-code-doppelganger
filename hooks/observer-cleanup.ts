#!/usr/bin/env tsx
/**
 * Stop hook — pending_skill が消費済みの状態ファイルのみ削除する
 *
 * Stop はターン終了ごとに発火する。未消費の pending_skill がある場合は
 * 次の UserPromptSubmit で post_ai 判定に使うため削除しない。
 */

import { existsSync, readFileSync, unlinkSync } from "fs";
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
    if (!existsSync(stateFile)) {
      process.exit(0);
    }

    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    if (state.pending_skill === null || state.pending_skill === undefined) {
      unlinkSync(stateFile);
    }
    // pending_skill が残っている場合は削除しない（次のユーザーターンで消費される）
  } catch {
    // fail-open
  }

  process.exit(0);
}

main();
