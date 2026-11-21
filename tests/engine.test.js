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
  assert.equal(await out('きれいだね'), 'きよらなり');
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

test('撥音便の後の だ（特殊・タ）は た と同じ', async () => {
  assert.equal(await out('本を読んだ'), '本を読みけり');
  assert.equal(await out('犬が死んだ'), '犬が死にけり');
});

test('読みが同じでも漢字の項目（射る）は ひらがなの いる に当てない', async () => {
  assert.equal(await out('家にいる'), '家にをり');
});

test('規則と同じ語の項目（楽しい→たのし）は漢字を残す', async () => {
  assert.equal(await out('楽しかった'), '楽しかりけり');
});

test('形容詞の仮定 寒けれ＋ば → 寒くは', async () => {
  assert.equal(await out('寒ければ帰る'), '寒くは帰る');
});

test('格助詞 で → にて', async () => {
  assert.equal(await out('ここで待ってください'), 'ここにて待て');
});

test('解析の誤り（きゃ＝く の仮定縮約）は書き換えず点線にする', async () => {
  const r = await k('きゃべつを買った');
  assert.equal(r.output, 'きやべつを買ひけり');
  assert.equal(r.segments[0].flag, 'unknown');
});

test('レビュー#2: 用言以外（たり・形容詞・ず）の後の文中の た は けり（日記風は き）', async () => {
  assert.equal(await out('雨が降っていたので帰った'), '雨が降りたりければ帰りけり');
  assert.equal(await out('美しかった花'), '美しかりける花');
  assert.equal(await out('美しかった花', { style: 'diary' }), '美しかりし花');
  assert.equal(await out('行かなかったので'), '行かざりければ');
  assert.equal(await out('本を読んだ人'), '本を読みたる人');
});

test('レビュー#3: 活用語の後の です は ます と同じ扱い', async () => {
  assert.equal(await out('今日は暑いですね'), '今日は暑し');
  assert.equal(await out('とても楽しかったです'), 'いと楽しかりけり');
  assert.equal(await out('行きませんでした'), '行かざりけり');
  assert.equal(await out('暑いです', { polite: 'haberi' }), '暑く侍り');
});

test('レビュー#4: 助詞の後の ない は あらず、では は には', async () => {
  assert.equal(await out('学生ではない。'), '学生にはあらず。');
  assert.equal(await out('静かではない'), '静かにはあらず');
});

test('レビュー#5: 片仮名語・未知語に続く活用語は書き換えず点線', async () => {
  const r = await k('マジでヤバい');
  assert.ok(r.output.endsWith('ヤバい'));
  assert.equal(await out('ググった'), 'ググった');
});

test('レビュー#7: ように → ごとく', async () => {
  assert.equal(await out('雪のように白い'), '雪のごとく白し');
});

test('レビュー#8: 接続助詞 と → 已然形＋ば', async () => {
  assert.equal(await out('朝起きると雨だった'), '朝起くれば雨なりけり');
});

test('レビュー#10: 閉じかぎの前の た は文末として けり', async () => {
  assert.equal(await out('「花が咲いた」と言った'), '「花が咲きけり」と言ひけり');
});

test('レビュー#13: じ の上二段はダ行（閉づ）', async () => {
  assert.equal(await out('戸を閉じる'), '戸を閉づ');
});

test('レビュー2-#1: 禁止の な は残す（終止形＋な）', async () => {
  assert.equal(await out('泣くな'), '泣くな');
  assert.equal(await out('忘れるなよ'), '忘るな');
  assert.equal(await out('「行くな」と言った'), '「行くな」と言ひけり');
});

test('レビュー2-#2: 形容詞のガル接続は語幹だけ（高さ・美しさ）', async () => {
  assert.equal(await out('山の高さ'), '山の高さ');
  assert.equal(await out('美しさを知る'), '美しさを知る');
});

test('レビュー2-#3: 侍り は二重にしない', async () => {
  assert.equal(await out('行きませんでした', { polite: 'haberi' }), '行き侍らざりけり');
  assert.equal(await out('行かなかったです', { polite: 'haberi' }), '行かざりけり');
});

test('レビュー2-#4: ている＋ない は 未然＋ず', async () => {
  assert.equal(await out('本を読んでいない'), '本を読まず');
  assert.equal(await out('雨は降っていませんでした'), '雨は降らざりけり');
});

test('レビュー2-#5: てしまう → 連用＋ぬ', async () => {
  assert.equal(await out('宿題を忘れてしまった'), '宿題を忘れにけり');
});

test('レビュー2-#6: 行っ（行う）は 行く として扱う', async () => {
  assert.equal(await out('私は行った'), '私は行きけり');
});

test('レビュー2-#7: 形容動詞＋です も語彙を引く', async () => {
  assert.equal(await out('月がきれいです'), '月がきよらなり');
  assert.equal(await out('月がきれいです', { polite: 'haberi' }), '月がきよらに侍り');
});

test('レビュー2: 文末の の（問い）は点線で残す', async () => {
  const r = await k('どこへ行くの？');
  assert.ok(r.segments.some((s) => s.flag === 'unknown' && s.source.includes('の')));
});

test('規則と同じ語の項目は、歴史的仮名の違いだけなら漢字を残す（青い→あをし）', async () => {
  assert.equal(await out('空が青い'), '空が青し');
});

test('ていく → 連用形＋ゆく', async () => {
  assert.equal(await out('桜が散っていく'), '桜が散りゆく');
});

test('ネットスラング: 文末の くさ・草 は をかし', async () => {
  assert.equal(await out('これはくさ'), 'これはをかし');
  assert.equal(await out('負けたくさ'), '負けけり、をかし');
  assert.equal(await out('面白すぎてくさ'), 'をかしすぎて、をかし');
  assert.equal(await out('草'), 'をかし');
  assert.equal(await out('草生える'), 'をかし');
  assert.equal(await out('大草原ｗｗｗ'), 'をかし');
  assert.equal(await out('負けたくさ。次は勝つ'), '負けけり、をかし。次は勝つ');
  assert.equal(await out('これはくさ', { historical: false }), 'これはおかし');
});

test('ネットスラング: どちらとも読める 草 は をかし にして要確認の点線', async () => {
  const r = await k('それは草');
  assert.equal(r.output, 'それはをかし');
  assert.ok(r.segments.some((s) => s.flag === 'review' && s.source === '草' && /スラング/.test(s.note)));
  assert.equal(r.segments.map((s) => s.source).join(''), 'それは草');
});

test('ネットスラング: 本物の草・くさい・たくさん・めんどくさ は変えない', async () => {
  assert.equal(await out('庭の草を抜いた'), '庭の草を抜きけり');
  assert.equal(await out('庭の草'), '庭の草');
  assert.equal(await out('青い草'), '青き草');
  assert.equal(await out('雑草'), '雑草');
  assert.equal(await out('くさい'), 'くさし');
  assert.ok(!(await out('たくさん食べた')).includes('をかし'));
  assert.ok(!(await out('めんどくさ')).includes('をかし'));
});

test('ネットスラング: 草生えた は前が副詞でも をかし', async () => {
  assert.equal(await out('ちょっと草生えた'), 'ちよつとをかし');
});
