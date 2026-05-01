---
name: filetree
description: tmux の右ペインで broot ファイルツリーを開く・閉じる
user-invocable: true
---

# /filetree

引数: `$ARGUMENTS`（`open` または `close`。省略時は `open` として扱う）

## 実行フロー

### 0. 引数バリデーション

`$ARGUMENTS` が `open`・`close`・空文字以外の場合は「引数が不正です。`/filetree open` または `/filetree close` で実行してください。」と伝えて即座に終了する。

### 1. 環境チェック

以下を順に確認する：

```bash
command -v tmux
```

tmux が見つからない場合は「tmux がインストールされていません。macOS では `brew install tmux` でインストールできます。」と伝えて終了する。

```bash
echo $TMUX
```

出力が空の場合は「tmux セッション外では使えません。ターミナルで `tmux` を実行してから Claude Code を起動してください。」と伝えて終了する。

### 2. open（または引数なし）の場合

broot がインストールされているか確認する：

```bash
command -v broot
```

broot が見つからない場合は「broot がインストールされていません。`brew install broot` でインストールできます。」と伝えて終了する。

broot ペインがすでに存在するか確認する：

```bash
tmux list-panes -F "#{pane_index} #{pane_current_command}" | grep -i broot
```

broot が見つかった場合は「すでに開いています。`Ctrl+b l` で移動できます。」と伝えて終了する。

見つからない場合は以下を実行してペインを開く：

```bash
tmux split-window -h -c "#{pane_current_path}" "broot ."
```

成功したら「右ペインに broot を開きました。`Ctrl+b l` で移動できます。」と伝える。

### 3. close の場合

broot が動いているペインのインデックスを取得する：

```bash
tmux list-panes -F "#{pane_index} #{pane_current_command}" | grep -i broot | awk '{print $1}'
```

インデックスが取得できた場合は以下を実行：

```bash
tmux kill-pane -t <取得したインデックス>
```

成功したら「broot ペインを閉じました。」と伝える。
インデックスが取得できなかった場合は「broot ペインが見つかりません。」と伝えて終了する。
