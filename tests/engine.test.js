import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getNodeAnalyzer } from './helpers/analyzer-node.js';
import { createKobun } from '../src/kobun/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
let kobun;
async function k(text, opts) {
  kobun ??= createKobun({ analyzer: await getNodeAnalyzer(), kyukanaDict: read('../data/kyukana-dict.json'), vocab: read('./fixtures/vocab.json') });
  return kobun.convert(text, opts);
}
const out = async (text, opts) => (await k(text, opts)).output;

const REQUIRED = [
  ['よろしい', 'よろし'],
  ['と思う', 'と思ふ'],
  ['とても美しい花だ', 'いと美しき花なり'],
  ['明日は早く起きよう', '明日はとく起きむ'],
  ['本当に面白い', 'まことにをかし'],
  ['すごくかわいい', 'いみじくうつくし'],
  ['行きたい', '行きたし'],
  ['行かない', '行かず'],
  ['行くだろう', '行かむ'],
  ['静かな夜だった', '静かなる夜なりけり'],
  ['寒いので家にいる', '寒ければ家にをり'],
  ['見たけれど知らなかった', '見たれど知らざりけり'],
  ['早く寝なさい', 'とく寝よ'],
  ['これは本です', 'これは本なり'],
  ['どうしよう', 'いかがせむ'],
];
for (const [input, expected] of REQUIRED) {
  test(`必須: ${input} → ${expected}`, async () => assert.equal(await out(input), expected));
}

test('日記風: 文末の過去は き', async () => {
  assert.equal(await out('静かな夜だった', { style: 'diary' }), '静かなる夜なりき');
});

test('丁寧語を 侍り にする', async () => {
  assert.equal(await out('行きます', { polite: 'haberi' }), '行き侍り');
  assert.equal(await out('行きます'), '行く');
});

test('旧かなOFF: 現代仮名で出す', async () => {
  assert.equal(await out('と思う', { historical: false }), 'と思う');
  assert.equal(await out('本当に面白い', { historical: false }), 'まことにおかし');
});

test('小書きOFF/ON', async () => {
  assert.equal(await out('行った', { smallToLarge: true }), '行きけり');
  assert.equal(await out('ちょっと', { smallToLarge: false }), 'ちょっと');
  assert.equal(await out('ちょっと', { smallToLarge: true }), 'ちよつと');
});

test('edge inputs: 空・空白・記号・絵文字・URL', async () => {
  assert.equal(await out(''), '');
  assert.equal(await out('   '), '   ');
  assert.equal(await out('！？'), '！？');
  assert.equal(await out('花だ🌸'), '花なり🌸');
  assert.equal(await out('https://example.com/a'), 'https://example.com/a');
});

test('multi-sentence: 文ごとに文末を判定する', async () => {
  assert.equal(await out('雨が降った。家にいた。'), '雨が降りけり。家にをりけり。');
  assert.equal(await out('雨が降った\n寒かった'), '雨が降りけり\n寒かりけり');
});

test('unknown flagged: 片仮名語＋形容詞らしい語は点線で原文のまま', async () => {
  const r = await k('マジでヤバい');
  assert.ok(r.segments.some((s) => s.flag === 'unknown'));
});

test('要確認の語は flag=review で、元の語と根拠を持つ', async () => {
  const r = await k('残念だ');
  assert.equal(r.output, '口惜し');
  const seg = r.segments.find((s) => s.flag === 'review');
  assert.ok(seg);
  assert.equal(seg.source, '残念だ');
  assert.ok(seg.note);
});

test('語彙の上一段の例外と ヤ行下二段・ザ変', async () => {
  assert.equal(await out('月を見る'), '月を見る');
  assert.equal(await out('名前を覚えた'), '名前を覚えけり');
  assert.equal(await out('友を信じる'), '友を信ず');
});

test('音便は使わず活用表どおり: 行って帰る', async () => {
  assert.equal(await out('行って帰る'), '行きて帰る');
});

test('ている → たり、連体修飾の た → たる', async () => {
  assert.equal(await out('花が咲いている'), '花が咲きたり');
  assert.equal(await out('昨日見た夢'), '昨日見たる夢');
});

test('終助詞は落とし、なあ は かな', async () => {
  assert.equal(await out('きれいだね'), 'きれいなり');
  assert.equal(await out('美しいなあ'), '美しきかな');
});

test('接続語の語彙と、たら・ても・だけ', async () => {
  assert.equal(await out('だから行く'), 'されば行く');
  assert.equal(await out('雨が降ったら帰る'), '雨が降らば帰る');
  assert.equal(await out('雨が降っても行く'), '雨が降るとも行く');
  assert.equal(await out('花だけ見る'), '花のみ見る');
});

test('文節: segments の source を連結すると入力になる', async () => {
  const text = '寒いので家にいる。';
  const r = await k(text);
  assert.equal(r.segments.map((s) => s.source).join(''), text);
  assert.equal(r.segments.map((s) => s.text).join(''), r.output);
});
