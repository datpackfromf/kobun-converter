# 出典

## 文語文法の活用表（src/kobun/conjugate.js）
活用表は高等学校の古典文法で標準とされる表（四段・上一段・上二段・下一段・下二段・カ変・サ変・ナ変・ラ変、形容詞ク・シク活用、形容動詞ナリ活用、助動詞 ず・けり・き・たり・なり・む・じ・たし・らし・ごとし・る・らる・す・さす）に従う。

照合先（いずれも **未照合**: 実装はモデルの知識による。表の各行は tests/conjugate.test.js にそのまま書いてあるので、下の資料と1行ずつ突き合わせられる）:
- Wikipedia 日本語版「文語」「活用」「助動詞 (国文法)」
- Wiktionary 英語版 Appendix:Japanese verbs（Classical conjugation の節）

表記の慣用として採ったもの（docs/decisions.md 参照）: 形容詞・ず の未然形＋仮定の ば は「は」（寒くは・行かずは）。

## 歴史的仮名遣い（src/kyukana/、data/kyukana-dict.json）
旧かな変換（https://github.com/datpackfromf/kyukana-converter）から再利用。出典は文化庁「現代仮名遣い」付表と Wiktionary 英語版（CC BY-SA 4.0）。詳細はそのリポジトリの docs/sources.md。

## 語彙辞書（data/vocab/*.json）
各項目の `basis` に、古語の意味と用例・根拠を書いた。根拠はサブエージェントが古語辞典の標準的な語義と有名な古典の用例の知識から書いたもので、外部の辞書との照合はしていない（**未照合**）。人が確かめる語は docs/review.md。

## 文字数の数え方
twitter-text config v3: https://raw.githubusercontent.com/twitter/twitter-text/master/config/v3.json （旧かな変換で確認、2026-11-18）

## X 投稿インテント
X Developer Platform「Web Intent」: https://docs.x.com/x-for-websites/post-button/guides/web-intent （2026-11-19 検索で確認）
