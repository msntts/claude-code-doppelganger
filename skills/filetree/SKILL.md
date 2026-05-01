---
name: filetree
description: 右ペインで broot ファイルツリーを開く・閉じる（Mac: tmux、Windows: Windows Terminal）。ファイルパスを渡すとそのファイルにフォーカスした状態で開く
user-invocable: true
---

# /filetree

引数: `$ARGUMENTS`（`open`・`close`・ファイル/ディレクトリのパス。省略時は `open` として扱う）

## 実行フロー

### 0. 引数の分類

`$ARGUMENTS` を以下のように分類する：

- 空文字 → **open** として扱う
- `open` → **open**
- `close` → **close**
- それ以外 → **ファイルパス** として扱う

### 1. OS の判定

以下を実行して OS を特定する：

```bash
uname -s 2>/dev/null || echo "Windows"
```

- `Darwin` → **Mac フロー**（tmux を使う）
- `Windows` または `uname` が存在しない → **Windows フロー**（Windows Terminal を使う）

以降のステップは Mac フローと Windows フローに分かれる。

---

## Mac フロー（tmux）

### Mac-1. 環境チェック

```bash
command -v tmux
```

tmux が見つからない場合は「tmux がインストールされていません。`brew install tmux` でインストールできます。」と伝えて終了する。

```bash
echo $TMUX
```

出力が空の場合は「tmux セッション外では使えません。ターミナルで `tmux` を実行してから Claude Code を起動してください。」と伝えて終了する。

broot がインストールされているか確認する：

```bash
command -v broot
```

broot が見つからない場合は「broot がインストールされていません。`brew install broot` でインストールできます。」と伝えて終了する。

### Mac-2. open の場合

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

### Mac-3. close の場合

```bash
tmux list-panes -F "#{pane_index} #{pane_current_command}" | grep -i broot | awk '{print $1}'
```

インデックスが取得できた場合は閉じる：

```bash
tmux kill-pane -t <取得したインデックス>
```

成功したら「broot ペインを閉じました。」と伝える。
インデックスが取得できなかった場合は「broot ペインが見つかりません。」と伝えて終了する。

### Mac-4. ファイルパスの場合

**4-0. `@` プレフィックスの解決**

`$ARGUMENTS` が `@` で始まる場合（Claude Code のファイル参照記法）、`@` を取り除いて残りをファイル名として扱う。
絶対パスでなければ `pwd` と結合して絶対パスにする。

**4-1. パスの存在確認**

```bash
test -e "<解決済みパス>" && echo "exists" || echo "not found"
```

存在しない場合は「`<パス>` が見つかりません。」と伝えて終了する。

**4-2. ファイル or ディレクトリの判定**

- ディレクトリ: `target_dir = <パス>`、検索クエリなし
- ファイル: `target_dir = dirname(<パス>)`、`search_query = basename(<パス>)`

**4-3. 既存の broot ペインを閉じる**

```bash
tmux list-panes -F "#{pane_index} #{pane_current_command}" | grep -i broot | awk '{print $1}'
```

インデックスが取得できた場合は `tmux kill-pane -t <インデックス>` で閉じる。

**4-4. broot を開く**

ディレクトリの場合：

```bash
tmux split-window -h -c "#{pane_current_path}" "broot <target_dir>"
```

ファイルの場合：

```bash
tmux split-window -h -c "#{pane_current_path}" "broot <target_dir> --cmd '<search_query>'"
```

成功したら「右ペインに broot を開き、`<元の引数>` にフォーカスしました。`Ctrl+b l` で移動できます。」と伝える。

---

## Windows フロー（Windows Terminal + PowerShell）

### Win-1. 環境チェック

broot がインストールされているか確認する（PowerShell）：

```powershell
Get-Command broot -ErrorAction SilentlyContinue
```

見つからない場合は「broot がインストールされていません。`winget install dystroy.broot` でインストールできます。」と伝えて終了する。

### Win-2. open の場合

broot がすでに起動しているか確認する：

```powershell
Get-Process broot -ErrorAction SilentlyContinue
```

プロセスが見つかった場合は「すでに開いています。Windows Terminal のペインを切り替えてください。」と伝えて終了する。

見つからない場合は以下を実行してペインを開く：

```powershell
wt --window current split-pane -V -d "." broot .
```

成功したら「右ペインに broot を開きました。」と伝える。

### Win-3. close の場合

```powershell
Stop-Process -Name broot -ErrorAction SilentlyContinue
```

成功したら「broot を閉じました。」と伝える。
プロセスが見つからなかった場合は「broot が起動していません。」と伝えて終了する。

### Win-4. ファイルパスの場合

**4-0. `@` プレフィックスの解決**

`$ARGUMENTS` が `@` で始まる場合、`@` を取り除いてファイル名として扱う。
絶対パスでなければ現在のディレクトリと結合する（PowerShell: `Join-Path (Get-Location) "<ファイル名>"`）。

**4-1. パスの存在確認**

```powershell
Test-Path "<解決済みパス>"
```

`False` の場合は「`<パス>` が見つかりません。」と伝えて終了する。

**4-2. ファイル or ディレクトリの判定**

- ディレクトリ: `target_dir = <パス>`、検索クエリなし
- ファイル: `target_dir = Split-Path -Parent <パス>`、`search_query = Split-Path -Leaf <パス>`

**4-3. 既存の broot を閉じる**

```powershell
Stop-Process -Name broot -ErrorAction SilentlyContinue
```

**4-4. broot を開く**

ディレクトリの場合：

```powershell
wt --window current split-pane -V -d "<target_dir>" broot .
```

ファイルの場合：

```powershell
wt --window current split-pane -V -d "<target_dir>" broot . --cmd "<search_query>"
```

成功したら「右ペインに broot を開き、`<元の引数>` にフォーカスしました。」と伝える。
