# skill-refactor - Implementation Plan

## プロジェクト概要
`/code` スキルを `/execute`・`/investigate` に分割し、フォーマット規約を CLAUDE.md へ移設する。

## 環境
- Windows 11 / bash
- スキル定義: `~/.claude/skills/{name}/SKILL.md`
- グローバル設定: `~/.claude/CLAUDE.md`

## 受け入れ条件
- `/execute` が PLAN.md 生成→タスク実行→コミットまで機能する
- `/investigate` が debug ブランチ作成→調査→収束→`/execute` 引き継ぎまで機能する
- `/code` が存在しない（削除済み）
- advisor が `user-invocable: true`

## 完了条件
- 各タスク完了時: git commit & push

---

## 🔥 Hotfix（最優先）

<!-- 未完了なし -->

---

## Phase 1: 新スキル作成

- [x] 1-1. `/execute/SKILL.md` を作成（`/code` のタスク管理層を移植、フォーマット詳細は CLAUDE.md 参照に）
- [x] 1-2. `/investigate/SKILL.md` を作成（`/code` のデバッグ調査モードを移植、収束後 `/execute` への導線を明記）

## Phase 2: CLAUDE.md へフォーマット規約を移設

- [x] 2-1. `~/.claude/CLAUDE.md` にフォーマッター規約セクションを追加

## Phase 3: 旧スキルの撤去と参照更新 [REVIEW]

- [x] 3-1. `advisor/SKILL.md` の `user-invocable: false` → `true` に変更
- [x] 3-2. `~/.claude/skills/code/` を削除
- [x] 3-3. `advisor`・`review` の SKILL.md 内で `/code` を参照している箇所を `/execute` に更新（参照なし）

---

## メモ・決定事項
- `/execute`: PLAN.md 駆動の実行ループ。advisor/review/investigate を呼ぶオーケストレーター
- `/investigate`: debug ブランチで原因究明。修正は行わず収束後 `/execute` へ戻す
- フォーマット規約は CLAUDE.md（スキル外でコードを触る場合も適用されるべき普遍ルール）
- コミットメッセージ形式は `/execute` に残す（コミット手順と一体）
- タスク管理層の汎用化はしない（YAGNI）

## 完了済みフェーズ
