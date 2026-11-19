import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, FORMS } from '../src/kobun/conjugate.js';

/** 6つの活用形を歴史的仮名で並べる */
const row = (w, ctx = 'plain') => FORMS.map((f) => conjugate(w, f, ctx).h);
/** 6つの活用形を現代仮名で並べる */
const rowM = (w, ctx = 'plain') => FORMS.map((f) => conjugate(w, f, ctx).m);

test('四段（カ行）書く', () => {
  assert.deepEqual(row({ cls: '四段', stemH: '書', stemM: '書', row: 'か' }), ['書か', '書き', '書く', '書く', '書け', '書け']);
});

test('四段（ハ行）思ふ は現代仮名で 思う の形', () => {
  const w = { cls: '四段', stemH: '思', stemM: '思', row: 'は', rowM: 'わ' };
  assert.deepEqual(row(w), ['思は', '思ひ', '思ふ', '思ふ', '思へ', '思へ']);
  assert.deepEqual(rowM(w), ['思わ', '思い', '思う', '思う', '思え', '思え']);
});

test('上二段 起く', () => {
  assert.deepEqual(row({ cls: '上二段', stemH: '起', stemM: '起', row: 'か' }), ['起き', '起き', '起く', '起くる', '起くれ', '起きよ']);
});

test('下二段 受く・覚ゆ（ヤ行）', () => {
  assert.deepEqual(row({ cls: '下二段', stemH: '受', stemM: '受', row: 'か' }), ['受け', '受け', '受く', '受くる', '受くれ', '受けよ']);
  assert.deepEqual(row({ cls: '下二段', stemH: '覚', stemM: '覚', row: 'や' }), ['覚え', '覚え', '覚ゆ', '覚ゆる', '覚ゆれ', '覚えよ']);
});

test('上一段 見る（語幹に い段を含む）', () => {
  assert.deepEqual(row({ cls: '上一段', stemH: '見', stemM: '見' }), ['見', '見', '見る', '見る', '見れ', '見よ']);
});

test('下二段で語幹が漢字1字の 寝（ぬ）', () => {
  assert.deepEqual(row({ cls: '下二段', stemH: '寝', stemM: '寝', kanjiStem: true }), ['寝', '寝', '寝', '寝る', '寝れ', '寝よ']);
});

test('サ変 す・勉強す・信ず', () => {
  assert.deepEqual(row({ cls: 'サ変', stemH: '', stemM: '' }), ['せ', 'し', 'す', 'する', 'すれ', 'せよ']);
  assert.deepEqual(row({ cls: 'サ変', stemH: '勉強', stemM: '勉強' }), ['勉強せ', '勉強し', '勉強す', '勉強する', '勉強すれ', '勉強せよ']);
  assert.deepEqual(row({ cls: 'サ変', stemH: '信', stemM: '信', row: 'ざ' }), ['信ぜ', '信じ', '信ず', '信ずる', '信ずれ', '信ぜよ']);
});

test('カ変 来（漢字）と く（かな）', () => {
  assert.deepEqual(row({ cls: 'カ変', stemH: '来', stemM: '来' }), ['来', '来', '来', '来る', '来れ', '来よ']);
  assert.deepEqual(row({ cls: 'カ変', stemH: '', stemM: '' }), ['こ', 'き', 'く', 'くる', 'くれ', 'こよ']);
});

test('ナ変 死ぬ・ラ変 あり・をり', () => {
  assert.deepEqual(row({ cls: 'ナ変', stemH: '死', stemM: '死' }), ['死な', '死に', '死ぬ', '死ぬる', '死ぬれ', '死ね']);
  assert.deepEqual(row({ cls: 'ラ変', stemH: 'あ', stemM: 'あ' }), ['あら', 'あり', 'あり', 'ある', 'あれ', 'あれ']);
  assert.deepEqual(rowM({ cls: 'ラ変', stemH: 'を', stemM: 'お' }), ['おら', 'おり', 'おり', 'おる', 'おれ', 'おれ']);
});

test('形容詞ク 寒し: 本活用と補助活用', () => {
  const w = { cls: 'ク', stemH: '寒', stemM: '寒' };
  assert.deepEqual(row(w), ['寒く', '寒く', '寒し', '寒き', '寒けれ', '寒かれ']);
  assert.deepEqual(row(w, 'aux'), ['寒から', '寒かり', '寒し', '寒かる', '寒けれ', '寒かれ']);
});

test('形容詞シク 美し（語幹に し を含む）', () => {
  assert.deepEqual(row({ cls: 'シク', stemH: '美し', stemM: '美し' }), ['美しく', '美しく', '美し', '美しき', '美しけれ', '美しかれ']);
});

test('形容動詞ナリ 静かなり: 連用は ふつう に、助動詞の前は なり', () => {
  const w = { cls: 'ナリ', stemH: '静か', stemM: '静か' };
  assert.deepEqual(row(w), ['静かなら', '静かに', '静かなり', '静かなる', '静かなれ', '静かなれ']);
  assert.equal(conjugate(w, 'renyo', 'aux').h, '静かなり');
});

test('助動詞 ず: 助動詞の前は補助活用', () => {
  const w = { cls: 'ず', stemH: '', stemM: '' };
  assert.deepEqual(row(w), ['ず', 'ず', 'ず', 'ぬ', 'ね', 'ざれ']);
  assert.equal(conjugate(w, 'renyo', 'aux').h, 'ざり');
});

test('助動詞 けり・き・む・じ・らし', () => {
  const kc = (cls, f) => conjugate({ cls, stemH: '', stemM: '' }, f).h;
  assert.equal(kc('けり', 'shushi'), 'けり');
  assert.equal(kc('けり', 'rentai'), 'ける');
  assert.equal(kc('けり', 'izen'), 'けれ');
  assert.equal(kc('き', 'shushi'), 'き');
  assert.equal(kc('き', 'rentai'), 'し');
  assert.equal(kc('き', 'izen'), 'しか');
  assert.equal(kc('む', 'shushi'), 'む');
  assert.equal(kc('む', 'izen'), 'め');
  assert.equal(kc('じ', 'rentai'), 'じ');
  assert.equal(kc('らし', 'shushi'), 'らし');
});

test('使役・受身は下二段型（る・らる・す・さす）', () => {
  assert.deepEqual(row({ cls: '下二段', stemH: '', stemM: '', row: 'ら' }), ['れ', 'れ', 'る', 'るる', 'るれ', 'れよ']);
  assert.deepEqual(row({ cls: '下二段', stemH: 'さ', stemM: 'さ', row: 'さ' }), ['させ', 'させ', 'さす', 'さする', 'さすれ', 'させよ']);
});
