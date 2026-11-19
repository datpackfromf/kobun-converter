# 古文変換

現代語で書いた文を、古文（文語）の言葉と文法に直し、歴史的仮名遣いにして出すWebアプリです。スマホのブラウザで使えます。

公開URL: https://datpackfromf.github.io/kobun-converter/

例: 「とても美しい花だ」→「いと美しき花なり」、「見たけれど知らなかった」→「見たれど知らざりけり」

## 使い方

1. 「現代語」の欄に文を書くと、下の「古文」に縦書きで結果が出ます（書いている間に変わります）。
2. 「コピー」で結果をコピーするか、「Xで投稿」で投稿画面を開きます。文字数はXの数え方（全角は2、上限280）で出ます。
3. 点線の下線は、確かめきれなかった所です（辞書で「要確認」の語、規則がなくそのまま残した語、解析が確かでない語）。触ると元の語と根拠が出ます。
4. 「変換の設定」で次を変えられます（設定だけ端末に保存します）。
   - 語り口: 物語風（文末の過去を けり）／日記風（き）
   - です・ます: 落とす／侍り にする
   - 歴史的仮名遣いにする（ON/OFF）
   - 小さい「っ」「ゃ」などを大きく書く（ON/OFF）

## プライバシー

入力した文は端末の外に送りません。形態素解析（lindera / IPADIC）・文法の規則・辞書は、すべてブラウザの中で動きます。入力した文は保存しません。

## しくみ

1. lindera（WASM）で文を語に分けます（旧かな変換のエンジンの分け方を再利用）。
2. 語を「古文の形態素」に置き換えます。活用する語は語幹と活用の種類、助動詞・助詞は古文の語と「直前の語に求める活用形」を持ちます（例: ので→ば は已然形を求める）。
3. 右隣の語が求める形に合わせて、活用形を決めます（寒い＋ので→寒けれ＋ば）。
4. 歴史的仮名遣い（または現代仮名遣い）で書き出し、文節ごとに点線の印と根拠を付けます。

コードは `src/kobun/`（conjugate.js＝活用表、vocab.js＝語彙の索引、engine.js＝本体）にあります。判断の記録は `docs/decisions.md`、出典は `docs/sources.md` です。

## 辞書に語を足す

語彙は分野ごとのファイル `data/vocab/<分野>.json`（adverb・adjective・noun・conjunction・katakana・verb）にあります。項目の形は `data/vocab/SCHEMA.md` を見てください。例:

```json
{"modern":"面白い","reading":"おもしろい","match":"lemma","kobun":"をかし","kobunModern":"おかし","kobunReading":"をかし","pos":"adjective","class":"シク","basis":"古語「をかし」は趣がある・興味深いの意（枕草子に多用）。","status":"confirmed","note":""}
```

- `match`: 動詞・形容詞・形容動詞は `lemma`（原形で引く）、それ以外は `surface`（文中の文字列で引く）。
- `class`: 古語の側の活用の種類（四段・上二段・下二段・上一段・下一段・カ変・サ変・ナ変・ラ変・ク・シク・ナリ）。活用しない語は `null`。
- `status`: 根拠を書けたら `confirmed`、書けなければ `review`。
- 足したら次を実行します。`data/vocab.json` と、人が確認する一覧 `docs/review.md` が作り直されます。

```
node scripts/build-vocab.js
```

注意: 今の辞書の `basis` は、古語辞典の標準的な語義と有名な用例の知識から書いたもので、外部の辞書とは照合していません。`docs/review.md` の語から順に確かめてください。

## 規則を足す

- 活用表: `src/kobun/conjugate.js` の `TABLE`（と補助活用の `AUX`）。
- 助動詞・助詞の置き換え: `src/kobun/engine.js` の `build()`（助動詞は `t.pos === '助動詞'` の所、助詞は `PARTICLES`）。
- 規則を足すときは、先に `tests/engine.test.js` に失敗するテストを書いてから直します。

## テスト

```
npm install
npm test         # 単体テストと全例のテスト
npm run cases    # tests/cases.json の合格率を出し、docs/failures.md を作る
npm run dev      # 開発サーバー
npm run build    # 公開用のビルド（dist/）
```

`tests/cases.json` は「入力→期待値（とオプション）」の一覧です。不合格の例には `cause`（analysis＝解析の誤り／vocab＝辞書にない／rule＝規則がない）と `why` を書きます。

`main` に push すると、GitHub Actions がテストとビルドを行い、GitHub Pages に公開します。

## 既知の制限

- 可能動詞（会える・読める）は一段動詞として活用します（会えざりけり）。
- 係り結びは作りません。主格の「が」は落としません。
- 解析器の分け方の誤りは、わかる範囲で点線にしてそのまま残します。
- AIで仕上げるモードは未実装です（設計は `docs/ai-mode.md`）。

## ライセンス

- コード: MIT（`LICENSE`）。`src/kyukana/` と `src/analyzer.js` は旧かな変換（MIT）から再利用しています。
- `data/kyukana-dict.json`: CC BY-SA 4.0（Wiktionary で確かめた事実を含むため）。
- lindera（`lindera-wasm-web-ipadic`）: MIT。IPADIC のライセンスとあわせて `public/THIRD_PARTY_LICENSES.txt` に入れ、画面の「ライセンス」から読めます。
