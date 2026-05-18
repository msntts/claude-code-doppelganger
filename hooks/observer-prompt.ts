#!/usr/bin/env tsx
/**
 * UserPromptSubmit hook — ユーザーターンの判断帰属を判定して observer-log.jsonl に記録する
 *
 * ログローテーション: 500KB 超で .jsonl.1 → .jsonl.2 にシフト（2世代保持）
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_PATH = join(homedir(), ".claude", "observer-log.jsonl");
const LOG_MAX_BYTES = 500 * 1024;
const LOG_BACKUPS = 2;
const TTL_MS = 60 * 60 * 1000; // 60分

interface ObserverState {
  session_id: string;
  pending_skill: string | null;
  pending_skill_ts: string | null;
  pending_skill_args: string | null;
}

interface ObserverEntry {
  timestamp: string;
  session_id: string;
  event_type: "user_turn";
  prompt_preview: string;
  prompt_len: number;
  human_attribution: "autonomous" | "post_ai";
  preceding_skill?: string;
  preceding_skill_ts?: string;
  ai_elapsed_sec?: number;
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

function readState(sessionId: string): ObserverState | null {
  const stateFile = join("/tmp", `claude_observer_${sessionId}.json`);
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf-8")) as ObserverState;
  } catch {
    return null;
  }
}

function resetState(sessionId: string, state: ObserverState): void {
  const stateFile = join("/tmp", `claude_observer_${sessionId}.json`);
  try {
    writeFileSync(
      stateFile,
      JSON.stringify({ ...state, pending_skill: null, pending_skill_ts: null, pending_skill_args: null }),
      "utf-8",
    );
  } catch {
    // fail-open
  }
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    const sessionId: string = data.session_id ?? "";
    const prompt: string = data.prompt ?? "";
    const now = new Date();

    const state = readState(sessionId);

    let humanAttribution: "autonomous" | "post_ai" = "autonomous";
    let precedingSkill: string | undefined;
    let precedingSkillTs: string | undefined;
    let aiElapsedSec: number | undefined;

    if (state?.pending_skill && state.pending_skill_ts) {
      const skillTs = new Date(state.pending_skill_ts);
      const elapsed = now.getTime() - skillTs.getTime();

      if (elapsed <= TTL_MS) {
        humanAttribution = "post_ai";
        precedingSkill = state.pending_skill;
        precedingSkillTs = state.pending_skill_ts;
        aiElapsedSec = Math.round(elapsed / 1000);
      }
    }

    const entry: ObserverEntry = {
      timestamp: now.toISOString().slice(0, 19),
      session_id: sessionId,
      event_type: "user_turn",
      prompt_preview: prompt.slice(0, 200),
      prompt_len: prompt.length,
      human_attribution: humanAttribution,
      cwd: process.cwd(),
    };

    if (humanAttribution === "post_ai") {
      entry.preceding_skill = precedingSkill;
      entry.preceding_skill_ts = precedingSkillTs;
      entry.ai_elapsed_sec = aiElapsedSec;
    }

    rotateLog();
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");

    if (state) {
      resetState(sessionId, state);
    }
  } catch {
    // fail-open
  }

  process.exit(0);
}

main();
