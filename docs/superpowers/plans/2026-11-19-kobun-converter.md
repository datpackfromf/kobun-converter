# 古文変換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現代語→古文（文語＋歴史的仮名遣い）変換のスマホ向け静的ページを作り、GitHub Pages で公開する。

**Architecture:** lindera（WASM）でトークン化 → 旧かなエンジンでトークンごとの歴史的仮名を得る → 古文形態素列に置換 → 右から活用形を決定 → 文節ごとのセグメントで出力。辞書は分野別JSONをまとめた `data/vocab.json`。

**Tech Stack:** 素の JavaScript（ESM, JSDoc）、Vite 7、node:test、lindera-wasm-web-ipadic 2.0.0、Playwright（画面確認）。

**Spec:** `docs/superpowers/specs/2026-11-19-kobun-converter-design.md`

## Global Constraints
- 基本モードは入力テキストを外部に送信しない。
- オプション初期値: 語り口=物語風（けり）、丁寧語=落とす、歴史的仮名遣い=ON、小書き→大書き=ON。
- 文字数: X の数え方（全角2、上限280）。
- 漢字はそのまま、活用語尾は変える。
- 判断は `docs/decisions.md` に1行ずつ。

## Review Focus
- 空文字・空白だけ・記号だけの入力 → 例外を出さず空/そのまま。（Task 2 のテスト `edge inputs`）
- 複数文・改行を含む入力 → 文ごとに文末判定（た→けり）を行う。（Task 2 `multi-sentence`）
- 辞書にも規則にもない活用語（例: 片仮名語＋する、未知の助動詞列）→ 原文のまま点線。（Task 2 `unknown flagged`）
- 旧かなOFF → ワ行四段は現代仮名（思う）、語彙は kobunModern。（Task 4 cases）
- 絵文字・URLを含む入力 → そのまま残る。（Task 2 `edge inputs`）

---

### Task 1: 旧かなエンジンのトークン単位API
**Files:** Modify `src/kyukana/convert.js`; Test `tests/kyukana.test.js`
**Produces:** `createConverter({analyzer, dict})` に `tokenize(text): WorkToken[]` と `convertEach(tokens): {text,status}[]`（1トークン1要素、小書き変換なし）を追加。
- [ ] テスト: `convertEach(tokenize('思う'))[0].text === '思ふ'`、`tokenize('考える')` の結果で `考へる`。
- [ ] 失敗を確認 → 実装 → 合格 → コミット。

### Task 2: 活用表と古文形態素（文法エンジン、TDD）
**Files:** Create `src/kobun/conjugate.js`, `src/kobun/morph.js`, `src/kobun/engine.js`; Tests `tests/conjugate.test.js`, `tests/engine.test.js`
**Produces:**
- `conjugate(word: {cls, stemH, stemM, row?}, form: Form, ctx: 'aux'|'plain'): {h, m}`（Form = 'mizen'|'renyo'|'shushi'|'rentai'|'izen'|'meirei'）
- `createKobun({analyzer, kyukanaDict, vocab}).convert(text, opts): {output, segments: {text, source, flag?: 'unknown'|'review', note?}[]}`
- [ ] テスト（conjugate）: 書く/四段 各形、思ふ（ハ行、m=思う）、起く/上二段、受く/下二段、見る/上一段、す/サ変、来/カ変、死ぬ/ナ変、あり/ラ変、寒し/ク（補助活用 から・かり）、美し/シク、静かなり/ナリ、ず・けり・き・たり・む・たし・る・らる・す・さす・じ・らし・ごとし。
- [ ] テスト（engine）: 依頼の15例、`edge inputs`、`multi-sentence`、`unknown flagged`。
- [ ] 実装 → 全テスト合格 → コミット。

### Task 3: 語彙辞書（分野別に並行）
**Files:** Create `data/vocab/{adverb,adjective,noun,conjunction,katakana,verb}.json`, `scripts/build-vocab.js`, `data/vocab.json`, `docs/review.md`; Test `tests/vocab.test.js`
- [ ] 各分野をサブエージェントに割り振る（スキーマは設計書）。合計300語以上。
- [ ] テスト: 全項目が必須フィールドを持つ、status は confirmed|review、modern の重複なし（同じ pos 内）、`docs/review.md` が review の全項目を含む。
- [ ] `node scripts/build-vocab.js` でまとめと review.md 生成 → コミット。

### Task 4: テスト例 80件以上と合格率レポート
**Files:** Create `tests/cases.json`, `tests/cases.test.js`, `scripts/cases-report.js`, `docs/failures.md`
- [ ] `{input, expected, opts?}` を80件以上（日記風・侍り・旧かなOFF・小書きOFFを含む）。
- [ ] `npm run cases` が合格数と不合格の分類（analysis|vocab|rule）を出力し `docs/failures.md` を書く。

### Task 5: 画面
**Files:** Create `index.html`, `src/main.js`, `src/style.css`, `vite.config.js`
- [ ] 入力・結果（点線の文節をタップで根拠）・コピー・Xで投稿・文字数・オプション4つ。
- [ ] Playwright 390×844 でスクリーンショット確認。

### Task 6: 公開
**Files:** `.github/workflows/pages.yml`, `README.md`
- [ ] テスト→ビルド→Pages。公開URLを Playwright で確認。

### Task 7: AIモード
- [ ] `ANTHROPIC_API_KEY` がなければ `docs/ai-mode.md` に設計を残す。
