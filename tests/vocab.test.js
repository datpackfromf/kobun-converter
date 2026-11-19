import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vocab = JSON.parse(readFileSync(new URL('../data/vocab.json', import.meta.url), 'utf8'));
const review = readFileSync(new URL('../docs/review.md', import.meta.url), 'utf8');
const CLASSES = new Set(['四段', '上一段', '上二段', '下二段', '下一段', 'カ変', 'サ変', 'ナ変', 'ラ変', 'ク', 'シク', 'ナリ']);
const POS = new Set(['adverb', 'adjective', 'adjectival_noun', 'verb', 'noun', 'conjunction', 'interjection', 'katakana']);

test('合計300語以上', () => {
  assert.ok(vocab.length >= 300, `${vocab.length}語`);
});

test('全項目が必須の欄と正しい値を持つ', () => {
  for (const e of vocab) {
    for (const k of ['modern', 'reading', 'kobun', 'kobunModern', 'kobunReading', 'basis']) {
      assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${e.modern}: ${k}`);
    }
    assert.ok(POS.has(e.pos), `${e.modern}: pos ${e.pos}`);
    assert.ok(['lemma', 'surface'].includes(e.match), `${e.modern}: match`);
    assert.ok(['confirmed', 'review'].includes(e.status), `${e.modern}: status`);
    assert.ok(e.class === null || CLASSES.has(e.class), `${e.modern}: class ${e.class}`);
    if (e.match === 'lemma') assert.ok(e.class, `${e.modern}: lemma の語は class が必要`);
  }
});

test('同じ照合方法・品詞で modern が重複しない', () => {
  const seen = new Set();
  for (const e of vocab) {
    const key = `${e.match}|${e.pos}|${e.modern}`;
    assert.ok(!seen.has(key), `重複: ${key}`);
    seen.add(key);
  }
});

test('docs/review.md に要確認の語がすべて載っている', () => {
  for (const e of vocab.filter((x) => x.status === 'review')) {
    assert.ok(review.includes(`| ${e.modern} | ${e.kobun} |`), `review.md にない: ${e.modern}`);
  }
});
