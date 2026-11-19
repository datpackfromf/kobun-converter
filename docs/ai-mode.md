# AIで仕上げるモード（設計メモ・未実装）

実装時に環境変数 `ANTHROPIC_API_KEY` がなかったため、依頼に従って実装せず、設計だけを残す（2026-11-19）。

## 仕組み
1. 画面に「AIで仕上げる」スイッチ（初期値 OFF）。ONにすると、スイッチの下に「入力文が外部（Cloudflare と Anthropic）に送信されます」と常に表示する。
2. ON のときだけ、ページは Cloudflare Workers の中継（例: `https://kobun-ai.<アカウント>.workers.dev/polish`）へ POST する。本文は `{ "source": 元の文, "draft": 規則エンジンの出力, "options": 語り口など }`。
3. Workers は Claude API（Messages API）を呼び、「draft の語彙と文法を保ったまま自然な古文に整え、整えた文だけを返す。係り結びを勝手に足さない」と指示する。返事を `{ "text": … }` で返す。
4. ページは AI の結果を規則エンジンの結果と並べて出し、どちらをコピー・投稿するか選べるようにする。失敗したら規則エンジンの結果だけを出す。

## 守ること
- APIキーは Workers のシークレット（`wrangler secret put ANTHROPIC_API_KEY`）に置き、ページ・リポジトリには置かない。
- 1日の回数制限: Workers KV か Durable Objects で、IPアドレスのハッシュごとに1日20回、全体で1日500回まで。超えたら 429 を返し、画面は「今日はAIの回数を使い切りました」と出す。
- CORS は公開ページのオリジン（https://datpackfromf.github.io）だけを許す。
- 入力・出力をログに残さない。
- モデル名・料金・リクエストの書き方は、実装するときに docs.claude.com で確かめてから使う（このメモの時点では確かめていない）。

## 実装するときの作業
- `worker/`（wrangler プロジェクト）を足す。
- 画面にスイッチと注意書きを足し、`src/ai.js` に送信処理を分ける（基本モードのコードからは呼ばない）。
- テスト: Workers はローカル（`wrangler dev`）で、キーなし・回数超過・正常の3通りを確かめる。
