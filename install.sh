#!/usr/bin/env bash
# ~/.claude/ へシンボリックリンクを張るインストールスクリプト
# Windows 11 の場合、事前に「開発者モード」を有効にしてください。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "インストール開始: $SCRIPT_DIR -> $CLAUDE_DIR"

# --- CLAUDE.md ---
if [ -L "$CLAUDE_DIR/CLAUDE.md" ]; then
  rm "$CLAUDE_DIR/CLAUDE.md"
elif [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
  mv "$CLAUDE_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md.bak"
  echo "既存の CLAUDE.md を CLAUDE.md.bak にバックアップしました"
fi
MSYS=winsymlinks:nativestrict ln -s "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
echo "  CLAUDE.md のシンボリックリンクを作成しました"

# --- hooks/ ---
if [ -L "$CLAUDE_DIR/hooks" ]; then
  rm "$CLAUDE_DIR/hooks"
elif [ -d "$CLAUDE_DIR/hooks" ]; then
  mv "$CLAUDE_DIR/hooks" "$CLAUDE_DIR/hooks.bak"
  echo "既存の hooks/ を hooks.bak/ にバックアップしました"
fi
MSYS=winsymlinks:nativestrict ln -s "$SCRIPT_DIR/hooks" "$CLAUDE_DIR/hooks"
echo "  hooks/ のシンボリックリンクを作成しました"

echo "完了。Claude Code を再起動してください。"
