# 公開手順（GitHub＋Cloudflare Pages）

> README 6章の「判断」は、提供元に確認を取ったものではありません。問題の指摘があった場合は、該当する値を差し替え、CHANGELOG.md に記録してください。

所要時間の目安：30〜45分（アカウント作成を除く）

## 0. 準備

1. `itsukaeru-v0.1.zip` を展開する。中に `repo` というフォルダができる
2. `repo` フォルダの中に、次がそろっていることを確かめる
   - `index.html`、`build.js`、`README.md`、`LICENSE`、`CHANGELOG.md`
   - `src`、`test`、`docs`、`.github` の4つのフォルダ
3. `.github` は名前が「.」で始まるため、通常は見えない
   - Mac：Finderで `command`＋`shift`＋`.`（ピリオド）を押すと表示される
   - Windows：エクスプローラーの「表示」→「隠しファイル」にチェック
4. アカウントを用意する
   - GitHub（https://github.com）
   - Cloudflare（https://dash.cloudflare.com）

## 1. GitHubにリポジトリを作る

1. GitHubにログインし、右上の「＋」→「New repository」
2. 次のように入力する
   - Repository name：`itsukaeru`（英数字とハイフンのみ）
   - Description：`イツカエル？ 〜震災帰宅大作戦〜 データを元にした防災ゲーム（試作版 v0.1）`
   - 公開範囲：Public（レビューしてもらうため）
   - 「Add a README file」「Add .gitignore」「Choose a license」は、**すべてチェックしない**（一式に入っているため）
3. 「Create repository」を押す

## 2. ファイルをアップロードする

1. 作ったリポジトリの画面で、「uploading an existing file」のリンクを押す
2. `repo` フォルダを開き、**中身をすべて選んで**、ブラウザの枠内にドラッグする
   - `repo` フォルダそのものをドラッグすると、1段深い場所に入ってしまうので注意
   - フォルダごとのドラッグは、ChromeかEdgeを使う
3. 一覧に `.github/ISSUE_TEMPLATE/...`、`src/...`、`test/...`、`docs/...` が並んでいることを確かめる
   - `.github` が入っていない場合は、準備の3で隠しファイルを表示してから、やり直す
4. 下の「Commit changes」欄に `試作版 v0.1` と入力し、「Commit changes」を押す
5. リポジトリの最初の画面に、`index.html` や `src` などが並び、下にREADMEの内容が表示されれば完了

## 3. Cloudflare Pagesで公開する

1. Cloudflareのダッシュボードにログインし、左のメニューの「Workers & Pages」を開く
2. 「作成」（Create）を押し、「Pages」のタブを選ぶ
3. 「Gitに接続」（Connect to Git、または Import an existing Git repository）を押す
4. 初めての場合は、GitHubとの連携を求められる
   - 「Only select repositories」を選び、`itsukaeru` だけを許可する（他のリポジトリを見せないため）
5. リポジトリの一覧から `itsukaeru` を選び、「セットアップの開始」（Begin setup）
6. ビルドの設定
   - プロジェクト名：`itsukaeru`（公開URLの一部になる）
   - 本番ブランチ：`main`
   - フレームワーク プリセット：`なし`（None）
   - ビルド コマンド：**空欄のまま**（`index.html` は組み立て済みのため）
   - ビルド出力ディレクトリ：`/`
7. 「保存してデプロイする」（Save and Deploy）を押す
8. 1分ほどで完了し、`https://itsukaeru.pages.dev` のようなURLが表示される。押して、ゲームの最初の画面が出れば成功

**画面の表記について**：Cloudflareの画面は更新されることがあり、ボタンの名前が上と少し違う場合があります。その場合は「Pages」「Git」「GitHub」の語を目印に進めてください。

**GitHubとつなぎたくない場合（簡易版）**：3の手順で「Gitに接続」の代わりに「アセットをアップロード」（Upload assets）を選び、`index.html` 1つだけをドラッグしても公開できます。ただし、GitHubを更新しても自動では反映されません。

## 4. 独自ドメインを付ける（任意）

例：`game.mikami-takashi.net`

1. Cloudflareのプロジェクト画面で「カスタムドメイン」（Custom domains）→「カスタムドメインを設定」
2. `game.mikami-takashi.net` と入力して進む
3. その後はドメインの管理場所で分かれる
   - `mikami-takashi.net` のDNSをCloudflareで管理している場合：画面の案内に従うだけで、DNSの設定は自動で入る
   - 別の会社（お名前.comなど）で管理している場合：表示された値で、そちらのDNS設定にCNAMEレコードを追加する（名前：`game`、値：`itsukaeru.pages.dev`）
4. 反映まで数分〜数時間。`https://game.mikami-takashi.net` で開ければ完了

## 5. READMEとリポジトリの仕上げ

1. GitHubで `README.md` を開き、右上の鉛筆のアイコン（Edit）を押す
2. 「▶ 遊ぶ：（CloudflareのURL）」の部分を、公開したURLに書き換える
3. 「Commit changes」を押す。Cloudflareは自動で作り直す（1分ほど）
4. リポジトリの最初の画面の右側「About」の歯車を押し、Websiteに公開URLを入れる
5. 「Issues」のタブ→「New issue」で、「操作」「ゲーム性」「実装・不具合」の3つのひな形が出ることを確かめる（確認だけで、作成はしない）

## 6. 公開後の動作確認

iPhoneとAndroidの両方で、次を確かめる。

- [ ] 最初の画面に「試作版 v0.1」と表示される
- [ ] 「練習1」が始まり、駅に触れて上へすべらせると選択肢が出る
- [ ] 練習1を最後まで進め、結果画面が出る
- [ ] 結果画面の「地図で見る」「自分の通勤・通学に置き換えると」「くわしい結果」が開く
- [ ] 本番（東日本大震災）を開始し、⏭（次の出来事まで）で進められる

## 7. 変更するとき

1. `src/` のファイルを直す
2. パソコンで `repo` フォルダを開き、ターミナル（コマンドプロンプト）で次を実行する（Node.js 18以降が必要）
   ```
   node build.js
   node test/test.js
   ```
3. テストが「すべて合格」になったら、直したファイルと `index.html` をGitHubにアップロードする（2の手順と同じ。同じ名前のファイルは上書きされる）
4. 計算を変えた場合は、`CHANGELOG.md` に記録し、画面とREADMEのバージョン（v0.1）を上げる

## 8. うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| CloudflareのURLで「404」になる | ビルド出力ディレクトリが `/` 以外になっている。プロジェクトの「設定」→「ビルド」で `/` に直し、「デプロイ」をやり直す。または、ファイルが `repo` フォルダごと1段深い場所に入っている（2の手順の注意） |
| 古い画面のまま変わらない | ブラウザの再読み込み（スマホは一度タブを閉じる）。Cloudflareの「デプロイ」一覧で、最新が「成功」になっているか確かめる |
| Issueのひな形が出ない | `.github` フォルダがアップロードされていない。隠しファイルを表示して、`.github` フォルダだけを追加でアップロードする |
| `node` が見つからないと言われる | Node.js（https://nodejs.org）をインストールする。ゲームの公開には不要で、7の作業だけに必要 |
