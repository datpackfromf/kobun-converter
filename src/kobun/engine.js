// 古文変換の本体: 解析 → 古文形態素（unit）の列 → 活用形の決定 → 文節ごとの出力。
// 入力文はどこにも送らない（解析器も辞書もローカル）。

import { createDict } from '../kyukana/dict.js';
import { createConverter } from '../kyukana/convert.js';
import { smallToLarge } from '../kyukana/kana.js';
import { stemLength } from '../kyukana/rules.js';
import { conjugate } from './conjugate.js';
import { createVocab, wordFromLemma } from './vocab.js';

/** @typedef {import('./conjugate.js').Word} Word */
/** @typedef {import('./conjugate.js').Form} Form */
/** @typedef {import('./vocab.js').VocabEntry} VocabEntry */
/** @typedef {import('../analyzer.js').Token} Token */

/**
 * @typedef {object} Unit 古文の形態素1つ
 * @property {'conj'|'fixed'|'end'|'drop'} kind
 * @property {string} src 元の入力の該当部分
 * @property {boolean} head 文節の先頭か
 * @property {Word} [word] 活用語（kind=conj）
 * @property {'ta'} [pending] 文末かどうかで決まる「た」
 * @property {Form|null} [modernForm] 現代語の活用形から推した形（次の語が要求しないときに使う）
 * @property {Form} [force] 命令など、強制する形
 * @property {string} [h] 固定語の歴史的仮名（kind=fixed）
 * @property {string} [m] 固定語の現代仮名
 * @property {Form|'tomo'|'auto'|null} [need] 直前の活用語に求める形
 * @property {boolean} [isAux] 助動詞（直前の形容詞・ず などは補助活用）
 * @property {boolean} [content] 体言（直前の活用語は連体形）
 * @property {boolean} [particle] 助詞
 * @property {boolean} [te] 接続助詞「て」
 * @property {'unknown'|'review'} [flag]
 * @property {boolean} [kanaUnverified] 旧かなを確かめられなかった
 * @property {string} [note]
 */

/**
 * @typedef {object} Options
 * @property {'story'|'diary'} [style] 語り口（文末の過去 けり／き）
 * @property {'drop'|'haberi'} [polite] 丁寧語
 * @property {boolean} [historical] 歴史的仮名遣いにする
 * @property {boolean} [smallToLarge] 小書きを大書きに
 */

/** @typedef {{ text: string, source: string, flag?: 'unknown'|'review', note?: string }} Segment */

const END_MARK = /^[。．.！!？?]+$|\n/;
const HIRAGANA = /[ぁ-ゟ]/;
const KANJI = /[㐀-鿿豈-﫿々]/;
const KATAKANA_CHAR = /[ァ-ヺー]/;
const KATAKANA_ONLY = /^[ァ-ヺー]+$/;

/** 五段の終止形の最後の仮名 → 行（う は歴史的仮名でハ行） */
const GODAN_ROW = { う: 'は', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' };
/** い段・え段の仮名 → 行 */
const I_ROW = { き: 'か', ぎ: 'が', し: 'さ', じ: 'だ', ち: 'た', ぢ: 'だ', に: 'な', ひ: 'は', び: 'ば', み: 'ま', い: 'や', ゐ: 'わ', り: 'ら' };
const E_ROW = { け: 'か', げ: 'が', せ: 'さ', ぜ: 'ざ', て: 'た', で: 'だ', ね: 'な', へ: 'は', べ: 'ば', め: 'ま', え: 'や', ゑ: 'わ', れ: 'ら' };
const I_KATA = 'キギシジチヂニヒビミイリピ';
const E_KATA = 'ケゲセゼテデネヘベメエレペ';

/** 変える助詞（表層形 → 古文） */
const PARTICLES = {
  ので: { h: 'ば', need: 'izen' }, から: { h: 'ば', need: 'izen', pos1: '接続助詞' },
  けれど: { h: 'ど', need: 'izen' }, けれども: { h: 'ど', need: 'izen' }, けど: { h: 'ど', need: 'izen' },
  が: { h: 'ど', need: 'izen', pos1: '接続助詞' }, ば: { h: 'ば', need: 'mizen' },
  ても: { h: 'とも', need: 'tomo' }, でも: { h: 'とも', need: 'tomo', pos1: '接続助詞' },
  だけ: { h: 'のみ', need: 'rentai' }, なあ: { h: 'かな', need: 'rentai' }, なぁ: { h: 'かな', need: 'rentai' },
  と: { h: 'と', need: 'shushi', pos2: '引用' },
};
/**
 * 文末のネットスラング「草」（笑える・おもしろい）。後ろの w と、文末（句読点・空白・閉じかっこ・絵文字・入力の終わり）が続くものだけ。
 * 漢字・片仮名の直後（雑草・牧草）は語の一部なので除く。
 */
const SLANG = /(?<![㐀-鿿豈-﫿々ァ-ヺ])(大草原|草不可避|草生えた|草生える|草生え|草|くさ|クサ|ｸｻ)[wWｗＷ]*(?=[\s。．.！!？?、♪…）)」』]|$|\p{Extended_Pictographic})/gu;
/** ひらがなの くさ をスラングとみなす直前の字（終止形の語尾・助詞）。めんどくさ・じじくさ は くさい の語幹なので除く */
const SLANG_AFTER = /[たいうくすつぬふむゆるぐぶずだわはもなよねかぞぜさてでし]$/;
const SLANG_NOTE = '「草」をネットスラング（笑える・おもしろい）と読んで「をかし」にした。植物の草なら元の語のまま読んでください';

/** 完了の たり が付く動詞型の活用 */
const VERB_CLASSES = new Set(['四段', '上一段', '上二段', '下二段', '下一段', 'カ変', 'サ変', 'ナ変', 'ラ変']);
/** 落とす終助詞 */
const DROP_FINAL = new Set(['ね', 'よ', 'な', 'わ', 'さ', 'ねえ', 'よね', 'ぜ', 'ってば']);

/** @param {string} cForm @returns {Form|'base'|null} */
function formOf(cForm) {
  if (/^未然/.test(cForm)) return 'mizen';
  if (/^連用/.test(cForm)) return 'renyo';
  if (/^仮定/.test(cForm)) return 'izen';
  if (/^命令/.test(cForm)) return 'meirei';
  if (cForm === '体言接続') return 'rentai';
  if (cForm === '基本形') return 'base';
  if (cForm === 'ガル接続') return 'garu';
  return null;
}

/** @param {Token} t 文節の先頭になる語か */
function isHeadToken(t) {
  if (['名詞'].includes(t.pos)) return !['非自立', '接尾'].includes(t.pos1);
  if (['動詞', '形容詞'].includes(t.pos)) return t.pos1 === '自立';
  return !['助詞', '助動詞'].includes(t.pos);
}

/**
 * 形容詞の項目が、現代語の語幹に し を付けただけの同じ語か（たのしい→たのし、さむい→さむし）。
 * @param {VocabEntry} e
 */
function sameAdjective(e) {
  if (!e.reading.endsWith('い')) return false;
  const stem = e.reading.slice(0, -1);
  const k = modernizeKana(e.kobunReading);
  return k === stem || k === stem + 'し';
}

/**
 * 歴史的仮名を現代の音の仮名に寄せる（比べるためだけの近似: あをし→あおし、くちをし→くちおし）。
 * @param {string} s
 */
function modernizeKana(s) {
  const HA = { は: 'わ', ひ: 'い', ふ: 'う', へ: 'え', ほ: 'お' };
  return [...s.replace(/を/g, 'お').replace(/ゐ/g, 'い').replace(/ゑ/g, 'え')]
    .map((c, i) => (i > 0 && HA[c] ? HA[c] : c))
    .join('');
}

/** 固定語の unit */
function fixed(src, h, m, extra = {}) {
  return /** @type {Unit} */ ({ kind: 'fixed', src, head: false, h, m, need: 'auto', ...extra });
}

/** 活用語の unit */
function conj(src, word, extra = {}) {
  return /** @type {Unit} */ ({ kind: 'conj', src, head: false, word, modernForm: null, ...extra });
}

/** 語彙の項目の注記 @param {VocabEntry} e */
function vocabNote(e) {
  return `「${e.modern}」→「${e.kobun}」（${e.kobunReading}）: ${e.basis}${e.note ? ` 注意: ${e.note}` : ''}`;
}

/**
 * @param {{ analyzer: import('../analyzer.js').Analyzer, kyukanaDict: object, vocab: VocabEntry[] }} deps
 */
export function createKobun({ analyzer, kyukanaDict, vocab }) {
  const kk = createConverter({ analyzer, dict: createDict(kyukanaDict) });
  const voc = createVocab(vocab);

  /**
   * 一段動詞を二段（または上一段のまま）にする。
   * @param {Token} t @param {string} hist 歴史的仮名の表層形
   * @returns {Word|null}
   */
  function ichidanWord(t, hist) {
    const n = stemLength(t.surface, t.base);
    if (n !== t.base.length - 1 || n === 0) return null;
    const stemM = t.surface.slice(0, n);
    const stemH = hist.length === t.surface.length ? hist.slice(0, n) : stemM;
    const lastM = stemM[n - 1];
    const lastH = stemH[n - 1];
    if (KANJI.test(lastM)) {
      // 見る・寝る のように漢字が音を持つ語は読みで段を決める
      const v = t.reading[t.reading.length - 2];
      if (I_KATA.includes(v)) return { cls: '上一段', stemH, stemM };
      if (E_KATA.includes(v)) return { cls: '下二段', stemH, stemM, kanjiStem: true };
      return null;
    }
    const iRow = I_ROW[lastH];
    const eRow = E_ROW[lastH];
    const row = iRow ?? eRow;
    if (!row) return null;
    if (iRow && n === 1) return { cls: '上一段', stemH, stemM }; // みる・きる・にる
    // 現代仮名ではダ行の ぢ・づ を じ・ず と書き、ハ行の語中は ワ行の音で書く
    let rowM = row === 'だ' ? 'ざ' : row;
    if (lastM !== lastH && row === 'は') rowM = 'わ';
    return { cls: iRow ? '上二段' : '下二段', stemH: stemH.slice(0, -1), stemM: stemM.slice(0, -1), row, rowM };
  }

  /**
   * 活用語の規則（語彙にないとき）。
   * @param {Token} t @param {string} hist @returns {Word|null}
   */
  function ruleWord(t, hist) {
    const sameLen = hist.length === t.surface.length;
    const n = stemLength(t.surface, t.base);
    const stemM = t.surface.slice(0, n);
    const stemH = sameLen ? hist.slice(0, n) : stemM;
    if (t.pos === '形容詞') {
      if (!t.base.endsWith('い') || n !== t.base.length - 1) return null;
      if (t.base === 'いい') return { cls: 'ク', stemH: 'よ', stemM: 'よ' };
      return { cls: /[しじ]い$/.test(t.base) ? 'シク' : 'ク', stemH, stemM };
    }
    const ct = t.cType;
    if (t.base === 'ある') return { cls: 'ラ変', stemH: 'あ', stemM: 'あ' };
    if (t.base === 'いる' || t.base === '居る') {
      return t.surface.startsWith('居') ? { cls: 'ラ変', stemH: '居', stemM: '居' } : { cls: 'ラ変', stemH: 'を', stemM: 'お' };
    }
    if (ct.startsWith('サ変・スル')) return { cls: 'サ変', stemH: '', stemM: '' };
    if (ct.startsWith('サ変・－スル')) {
      const s = t.base.slice(0, -2);
      return { cls: 'サ変', stemH: s, stemM: s };
    }
    if (ct.startsWith('サ変・－ズル')) {
      const s = t.base.slice(0, -2);
      return { cls: 'サ変', stemH: s, stemM: s, row: 'ざ' };
    }
    if (ct.startsWith('カ変')) {
      const k = t.surface.startsWith('来') ? '来' : '';
      return { cls: 'カ変', stemH: k, stemM: k };
    }
    if (t.base === '死ぬ' || t.base === 'しぬ') return { cls: 'ナ変', stemH: stemH, stemM };
    if (ct.startsWith('五段')) {
      const row = GODAN_ROW[t.base[t.base.length - 1]];
      if (!row || n !== t.base.length - 1) return null;
      return { cls: '四段', stemH, stemM, row, rowM: row === 'は' ? 'わ' : row };
    }
    if (ct.startsWith('一段')) return ichidanWord(t, hist);
    return null;
  }

  /**
   * 語彙の項目から Word を作る（作れなければ null）。
   * @param {VocabEntry} e @returns {Word|null}
   */
  const vocabWord = (e) => (e.class ? wordFromLemma(e.class, e.kobun, e.kobunModern) : null);

  /**
   * トークン列を unit の列にする。
   * @param {Token[]} tokens @param {{ text: string, status: string }[]} hist @param {Options} opts
   * @returns {Unit[]}
   */
  function build(tokens, hist, opts, beforeSlang = false) {
    /** @type {Unit[]} */
    const units = [];
    const starts = [];
    let off = 0;
    for (const t of tokens) {
      starts.push(off);
      off += t.surface.length;
    }
    const ends = new Set(tokens.map((_, i) => starts[i] + tokens[i].surface.length));
    const text = tokens.map((t) => t.surface).join('');
    /** 直前の drop でない unit */
    const prevUnit = () => {
      for (let k = units.length - 1; k >= 0; k--) if (units[k].kind !== 'drop') return units[k];
      return null;
    };
    const prevConj = () => {
      const p = prevUnit();
      return p && p.kind === 'conj' ? p : null;
    };
    const atSentenceStart = () => {
      const p = prevUnit();
      return !p || p.kind === 'end' || p.src === '、' || p.src === '，';
    };
    /** 直前が「で（格助詞・断定）＋は／も」なら で を に にして true（学生にはあらず・静かにはあらず） */
    const deWaToNiWa = () => {
      const [pa, pb] = units.filter((x) => x.kind !== 'drop').slice(-2).reverse();
      if (!pa?.particle || !/^[はも]$/.test(pa.src) || !pb) return false;
      if (pb.kind === 'fixed' && pb.src === 'で') {
        pb.h = pb.m = 'に';
        return true;
      }
      return pb.kind === 'conj' && pb.word.cls === 'ナリ' && /で$/.test(pb.src);
    };
    const push = (u, head) => {
      u.head = head;
      units.push(u);
      return u;
    };

    for (let i = 0; i < tokens.length; i++) {
      let t = tokens[i];
      const next = tokens[i + 1];
      const h = hist[i].text;
      const head = isHeadToken(t);

      // 文末
      if (END_MARK.test(t.surface) && !/[^\s。．.！!？?]/.test(t.surface)) {
        push({ kind: 'end', src: t.surface, head: true }, true);
        continue;
      }

      // 語彙（表層形の最長一致。トークンの境目で始まり終わるものだけ）
      if (head || t.pos === '形容詞') {
        const hit = voc.surfaceAt(text, starts[i]).find((e) => {
          const end = starts[i] + e.modern.length;
          if (!ends.has(end)) return false;
          if ((e.pos === 'conjunction' || e.pos === 'interjection') && !atSentenceStart()) return false;
          if (e.pos === 'katakana' && KATAKANA_CHAR.test(text[end] ?? '')) return false;
          const j = tokens.findIndex((_, k) => starts[k] === end);
          const after = j >= 0 ? tokens[j] : undefined;
          if (t.pos === '形容詞' && after && (after.pos === '助動詞' || after.pos === '助詞' || after.pos1 === '非自立')) return false;
          return true;
        });
        if (hit) {
          let j = i;
          while (starts[j] + tokens[j].surface.length < starts[i] + hit.modern.length) j++;
          const src = text.slice(starts[i], starts[i] + hit.modern.length);
          const w = vocabWord(hit);
          const extra = { note: vocabNote(hit), ...(hit.status === 'review' ? { flag: 'review' } : {}) };
          if (w) push(conj(src, w, { ...extra, modernForm: 'base' }), true);
          else push(fixed(src, hit.kobun, hit.kobunModern, { ...extra, content: hit.pos === 'noun' || hit.pos === 'katakana', need: null }), true);
          i = j;
          continue;
        }
      }

      // 形容動詞語幹 ＋ だ／な／に／で（ある）
      if (t.pos === '名詞' && t.pos1 === '形容動詞語幹' && next && ((next.pos === '助動詞' && (next.base === 'だ' || next.base === 'です')) || (next.pos === '助詞' && next.surface === 'に' && next.pos1 === '副詞化'))) {
        const e = voc.byLemma(t.surface, (x) => x.pos === 'adjectival_noun');
        const w = e ? vocabWord(e) : { cls: 'ナリ', stemH: h, stemM: t.surface };
        if (w) {
          let src = t.surface + next.surface;
          let mf = next.pos === '助詞' ? 'renyo' : formOf(next.cForm);
          let skip = 1;
          if (next.surface === 'で' && tokens[i + 2]?.base === 'ある') {
            src += tokens[i + 2].surface;
            mf = formOf(tokens[i + 2].cForm);
            skip = 2;
          }
          const extra = e ? { note: vocabNote(e), ...(e.status === 'review' ? { flag: 'review' } : {}) } : {};
          if (next.base === 'です' && opts.polite === 'haberi') {
            // きよらに｜侍り
            push(conj(t.surface, w, { modernForm: 'renyo', ...extra }), true);
            push(conj(next.surface, { cls: 'ラ変', stemH: '侍', stemM: '侍' }, { need: 'renyo', modernForm: mf }), false);
          } else {
            push(conj(src, w, { modernForm: mf, ...extra }), true);
          }
          i += skip;
          continue;
        }
      }

      // 片仮名語・未知語（ヤバ・ググ）に続く ひらがなの活用語・助動詞と、その後の助動詞は書き換えない
      if (HIRAGANA.test(t.surface) && /^[ぁ-ゟー]+$/.test(t.surface) && ['動詞', '形容詞', '助動詞'].includes(t.pos)) {
        const pt = tokens[i - 1];
        const afterForeign = pt && (pt.pos === 'UNK' || pt.pos === '' || (KATAKANA_ONLY.test(pt.surface) && !(pt.pos1 === 'サ変接続' && t.cType.startsWith('サ変'))));
        if (afterForeign || (prevUnit()?.foreign && (t.pos !== '動詞' || t.pos1 !== '自立'))) {
          const u = push(fixed(t.surface, t.surface, t.surface, { flag: 'unknown', note: `「${t.surface}」は前の語が辞書にないため、そのまま残した` }), false);
          u.foreign = true;
          continue;
        }
      }

      // では／でも＋ない（形容詞）→ にはあらず
      if (t.pos === '形容詞' && t.base === 'ない' && deWaToNiWa()) {
        push(conj(t.surface, { cls: 'ず', stemH: 'あら', stemM: 'あら' }, { need: 'mizen', isAux: true, modernForm: formOf(t.cForm) }), false);
        continue;
      }

      // 解析の誤りらしい活用語（縮約形、前に用言のない非自立の動詞 きゃ＝く 等）は書き換えない
      if ((t.pos === '動詞' || t.pos === '形容詞') && /縮約/.test(t.cForm)) {
        push(fixed(t.surface, t.surface, t.surface, { flag: 'unknown', note: `「${t.surface}」は解析が確かでなく、そのまま残した` }), true);
        continue;
      }

      // 動詞・形容詞
      if (t.pos === '動詞' || t.pos === '形容詞') {
        // て＋いる → たり
        if (t.pos === '動詞' && (t.base === 'いる' || t.base === 'てる') && (tokens[i - 1]?.surface === 'て' || tokens[i - 1]?.surface === 'で' || t.base === 'てる')) {
          const p = prevUnit();
          if (p && p.te) {
            // 「て」の unit を「たり」に置き換える（元の語は て＋いる）
            units.splice(units.indexOf(p), 1);
            push(conj(p.src + t.surface, { cls: 'ラ変', stemH: 'た', stemM: 'た' }, { need: 'renyo', isAux: true, teiru: true, modernForm: formOf(t.cForm) }), false);
            continue;
          }
        }
        // て＋いく → 連用形＋ゆく（散りゆく）
        if (t.pos1 === '非自立' && (t.base === 'いく' || t.base === '行く')) {
          const p = prevUnit();
          if (p && p.te) {
            units.splice(units.indexOf(p), 1);
            const stem = 'ゆ';
            push(conj(p.src + t.surface, { cls: '四段', stemH: stem, stemM: stem, row: 'か' }, { need: 'renyo', modernForm: formOf(t.cForm) }), false);
            continue;
          }
        }
        // て＋しまう → 連用形＋ぬ（完了。忘れにけり）
        if (t.pos1 === '非自立' && t.base === 'しまう') {
          const p = prevUnit();
          if (p && p.te) {
            units.splice(units.indexOf(p), 1);
            push(conj(p.src + t.surface, { cls: 'ナ変', stemH: '', stemM: '' }, { need: 'renyo', isAux: true, modernForm: formOf(t.cForm) }), false);
            continue;
          }
        }
        // なさい・ください → 直前の動詞の命令形
        if (t.pos1 === '非自立' && (t.base === 'なさる' || t.base === 'くださる') && /^命令/.test(t.cForm)) {
          const p = prevUnit();
          if (p && p.te) p.kind = 'drop';
          const c = prevConj();
          if (c) {
            c.force = 'meirei';
            push({ kind: 'drop', src: t.surface, head: false }, false);
            continue;
          }
        }
        // 受身・使役（接尾）
        if (t.pos1 === '接尾' && ['れる', 'られる', 'せる', 'させる'].includes(t.base)) {
          const c = prevConj();
          const strong = !c || ['四段', 'ナ変', 'ラ変'].includes(c.word.cls);
          const passive = t.base.endsWith('れる');
          const stem = strong ? '' : passive ? 'ら' : 'さ';
          push(conj(t.surface, { cls: '下二段', stemH: stem, stemM: stem, row: passive ? 'ら' : 'さ' }, { need: 'mizen', isAux: true, modernForm: formOf(t.cForm) }), false);
          continue;
        }
        if (t.base === '行う' && t.surface === '行っ') {
          // 「行った」は解析器が 行う と読むことがあるが、日常の文では 行く が多いので 行く とする
          t = { ...t, base: '行く', cType: '五段・カ行促音便' };
        }
        let e = voc.byLemma(t.base, (x) => x.pos === (t.pos === '動詞' ? 'verb' : 'adjective'));
        // 規則で作るのと同じ語の形容詞（楽しい→たのし）は、漢字を残すため規則に任せる
        if (e && t.pos === '形容詞' && sameAdjective(e)) e = null;
        let w = e ? vocabWord(e) : null;
        if (!w) {
          e = null;
          w = ruleWord(t, h);
        }
        if (w) {
          const extra = e ? { note: vocabNote(e), ...(e.status === 'review' ? { flag: 'review' } : {}) } : {};
          const u = push(conj(t.surface, w, { modernForm: formOf(t.cForm), ...extra }), head);
          if (u.modernForm === 'meirei') u.force = 'meirei';
          if (!e && hist[i].status === 'unverified') u.kanaUnverified = true;
          continue;
        }
        push(fixed(t.surface, t.surface, t.surface, { flag: 'unknown', note: `「${t.surface}」は活用の規則がなく、そのまま残した` }), head);
        continue;
      }

      // 助動詞
      if (t.pos === '助動詞') {
        const b = t.base;
        const mf = formOf(t.cForm);
        if (b === 'ない' || b === 'ぬ' || b === 'ん') {
          // ている＋ない（読んでいない）は たり を外して 未然＋ず（読まず）
          const pc = prevConj();
          if (pc?.teiru) {
            pc.kind = 'drop';
            pc.word = undefined;
          }
          const ara = prevConj() ? '' : 'あら'; // 学生には｜あらず
          if (ara) deWaToNiWa();
          push(conj(t.surface, { cls: 'ず', stemH: ara, stemM: ara }, { need: 'mizen', isAux: true, modernForm: mf }), false);
          continue;
        }
        if (b === 'た' || t.cType === '特殊・タ') {
          if (t.cForm === '仮定形') push(fixed(t.surface, 'ば', 'ば', { need: 'mizen', particle: true }), false);
          else push(conj(t.surface, { cls: 'ラ変', stemH: 'た', stemM: 'た' }, { pending: 'ta', need: 'renyo', isAux: true, modernForm: mf }), false);
          continue;
        }
        if (b === 'う' || b === 'よう') {
          push(conj(t.surface, { cls: 'む', stemH: '', stemM: '' }, { need: 'mizen', isAux: true }), false);
          continue;
        }
        if (b === 'まい') {
          push(conj(t.surface, { cls: 'じ', stemH: '', stemM: '' }, { need: 'mizen', isAux: true }), false);
          continue;
        }
        if (b === 'たい') {
          push(conj(t.surface, { cls: 'ク', stemH: 'た', stemM: 'た' }, { need: 'renyo', isAux: true, modernForm: mf }), false);
          continue;
        }
        if (b === 'らしい') {
          push(conj(t.surface, { cls: 'らし', stemH: '', stemM: '' }, { need: 'shushi', isAux: true }), false);
          continue;
        }
        if (b === 'ます') {
          const c0 = prevConj();
          if (opts.polite === 'haberi' && !(c0?.isAux) && c0?.word.stemH !== '侍') {
            push(conj(t.surface, { cls: 'ラ変', stemH: '侍', stemM: '侍' }, { need: 'renyo', modernForm: mf }), false);
          } else {
            const c = prevConj();
            if (c && mf && mf !== 'renyo') c.modernForm = mf;
            if (c && mf === 'base') c.modernForm = 'base';
            push({ kind: 'drop', src: t.surface, head: false }, false);
          }
          continue;
        }
        if (b === 'です' && prevConj() && !/^でしょ$/.test(t.surface)) {
          // 暑いです・行きませんでした: 丁寧の です は ます と同じに落とす（侍り なら 連用形＋侍り）
          const c1 = prevConj();
          // 侍り・助動詞（ず・た 等）の後の です は落とす（侍らざりけり、侍らず侍り としない）
          if (opts.polite === 'haberi' && !c1.isAux && c1.word.stemH !== '侍') {
            push(conj(t.surface, { cls: 'ラ変', stemH: '侍', stemM: '侍' }, { need: 'renyo', modernForm: mf }), false);
          } else {
            const c = prevConj();
            if (mf) c.modernForm = mf;
            push({ kind: 'drop', src: t.surface, head: false }, false);
          }
          continue;
        }
        if (b === 'だ' || b === 'です') {
          // だろう・でしょう: 活用語の後なら落として む に任せる
          if (/^(だろ|でしょ)$/.test(t.surface) && next?.base === 'う' && prevConj()) {
            push({ kind: 'drop', src: t.surface, head: false }, false);
            continue;
          }
          if (t.surface === 'で' && next?.base !== 'ある') {
            const ni = next?.pos === '助詞' && (next.surface === 'は' || next.surface === 'も') ? 'に' : 'にて';
            push(fixed(t.surface, ni, ni, { need: 'rentai' }), false);
            continue;
          }
          let src = t.surface;
          let form = mf;
          if (t.surface === 'で' && next?.base === 'ある') {
            src += next.surface;
            form = formOf(next.cForm);
            i++;
          }
          const haberi = b === 'です' && opts.polite === 'haberi';
          const w = haberi ? { cls: 'ラ変', stemH: 'に侍', stemM: 'に侍' } : { cls: 'ナリ', stemH: '', stemM: '' };
          push(conj(src, w, { need: 'rentai', isAux: true, modernForm: form }), false);
          continue;
        }
        push(fixed(t.surface, h, t.surface, { flag: 'unknown', note: `助動詞「${t.surface}」の古文の規則がなく、そのまま残した` }), false);
        continue;
      }

      // ようだ → ごとし
      if (t.pos === '名詞' && t.pos2 === '助動詞語幹' && t.surface === 'よう' && (next?.base === 'だ' || (next?.surface === 'に' && next.pos1 === '副詞化'))) {
        const ga = prevConj() ? 'が' : '';
        push(conj(t.surface + next.surface, { cls: 'ク', stemH: ga + 'ごと', stemM: ga + 'ごと' }, { need: 'rentai', isAux: true, modernForm: next.pos === '助詞' ? 'renyo' : formOf(next.cForm) }), false);
        i++;
        continue;
      }

      // 助詞
      if (t.pos === '助詞') {
        // 禁止の な（動詞の終止形＋な）は文語でも同じ形で残す
        if (t.pos1 === '終助詞' && t.surface === 'な' && tokens[i - 1]?.pos === '動詞' && tokens[i - 1]?.cForm === '基本形') {
          push(fixed(t.surface, 'な', 'な', { need: 'shushi', particle: true }), false);
          continue;
        }
        // 文末の問いの の は古文にない言い方なので、点線で残す
        if (t.pos1 === '終助詞' && t.surface === 'の') {
          push(fixed(t.surface, 'の', 'の', { particle: true, flag: 'unknown', note: '文末の「の」（問い・説明）は古文の言い方に直す規則がなく、そのまま残した' }), false);
          continue;
        }
        if (t.pos1 === '終助詞' && DROP_FINAL.has(t.surface)) {
          push({ kind: 'drop', src: t.surface, head: false }, false);
          continue;
        }
        if (t.surface === 'て' || t.surface === 'で') {
          if (t.pos1 === '接続助詞') {
            if (next?.surface === 'も' && next.pos === '助詞') {
              push(fixed(t.surface + next.surface, 'とも', 'とも', { need: 'tomo', particle: true }), false);
              i++;
              continue;
            }
            push(fixed(t.surface, 'て', 'て', { need: 'renyo', particle: true, te: true }), false);
            continue;
          }
        }
        if (t.surface === 'と' && t.pos1 === '接続助詞') {
          push(fixed(t.surface, 'ば', 'ば', { need: 'izen', particle: true }), false);
          continue;
        }
        if (t.surface === 'で' && t.pos1 === '格助詞') {
          push(fixed(t.surface, 'にて', 'にて', { particle: true }), false);
          continue;
        }
        const p = PARTICLES[t.surface];
        if (p && (!p.pos1 || p.pos1 === t.pos1) && (!p.pos2 || p.pos2 === t.pos2)) {
          push(fixed(t.surface, p.h, p.h, { need: p.need, particle: true }), false);
          continue;
        }
        push(fixed(t.surface, h, t.surface, { particle: true }), false);
        continue;
      }

      // その他（名詞・副詞・連体詞・記号 など）
      const content = t.pos === '名詞';
      const u = push(fixed(t.surface, h, t.surface, { content, need: content ? null : 'auto' }), head);
      if (hist[i].status === 'unverified') u.kanaUnverified = true;
      if (t.pos === 'UNK' && /[\p{L}]/u.test(t.surface) && !KATAKANA_CHAR.test(t.surface[0])) {
        u.flag = 'unknown';
        u.note = `「${t.surface}」は辞書にない語で、そのまま残した`;
      }
    }

    // 文末の「て」（依頼）→ 直前の動詞の命令形
    for (let k = 0; k < units.length; k++) {
      const u = units[k];
      if (!u.te || u.kind === 'drop') continue;
      const n = units.slice(k + 1).find((x) => x.kind !== 'drop');
      const p = units.slice(0, k).reverse().find((x) => x.kind !== 'drop');
      // ネットスラングの直前（面白すぎてくさ）の て は文末ではないので命令にしない
      if ((!n || n.kind === 'end') && p?.kind === 'conj' && !(beforeSlang && !n)) {
        u.kind = 'drop';
        p.force = 'meirei';
      }
    }
    return units;
  }

  /**
   * 各活用語の形を決めて文字列にする。
   * @param {Unit[]} units @param {Options} opts @returns {string[]}
   */
  function render(units, opts) {
    const hist = opts.historical ?? true;
    const nextOf = (k) => units.slice(k + 1).find((x) => x.kind !== 'drop') ?? null;
    // 「た」を先に決める（文末なら けり／き、それ以外は たり）
    units.forEach((u, k) => {
      if (u.pending !== 'ta') return;
      const n = nextOf(k);
      const p = units.slice(0, k).reverse().find((x) => x.kind !== 'drop');
      // 文末（閉じかぎの前を含む）は けり／き。文中でも、完了の たり が付けない語（形容詞・ず・なり・たり）の後は けり／き
      const final = !n || n.kind === 'end' || (n.kind === 'fixed' && /^[」』）)]/.test(n.src));
      const afterVerb = p?.kind === 'conj' && VERB_CLASSES.has(p.word.cls) && !(p.isAux && p.word.cls !== '下二段');
      if (final || !afterVerb) u.word = { cls: opts.style === 'diary' ? 'き' : 'けり', stemH: '', stemM: '' };
    });
    return units.map((u, k) => {
      if (u.kind === 'drop') return '';
      if (u.kind === 'end') return u.src;
      const prev = units.slice(0, k).reverse().find((x) => x.kind !== 'drop');
      if (u.kind === 'fixed') {
        if (u.te && prev?.kind === 'conj' && prev.word.cls === 'ず') return 'して';
        // 形容詞・ず の未然形「く」「ず」＋仮定の ば は清音の「は」（寒くは・行かずは）
        if (u.need === 'mizen' && u.h === 'ば' && prev?.kind === 'conj' && ['ク', 'シク', 'ず'].includes(prev.word.cls)) return 'は';
        return hist ? u.h : u.m;
      }
      if (u.modernForm === 'garu' && !u.force) return hist ? u.word.stemH : u.word.stemM; // 高さ・美しさ
      const n = nextOf(k);
      /** @type {Form} */
      let form;
      if (u.force) form = u.force;
      else if (!n || n.kind === 'end') form = u.modernForm === 'meirei' ? 'meirei' : 'shushi';
      else if (n.need === 'tomo') form = ['ク', 'シク', 'ず', 'ナリ'].includes(u.word.cls) ? 'renyo' : 'shushi';
      else if (n.need && n.need !== 'auto') form = n.need;
      else if (n.content) form = 'rentai';
      else {
        const mf = u.modernForm;
        if (!mf || mf === 'base') form = n.particle ? 'rentai' : 'shushi';
        else form = mf;
      }
      const r = conjugate(u.word, form, n?.isAux ? 'aux' : 'plain');
      return hist ? r.h : r.m;
    });
  }

  /**
   * 文末のネットスラング「草・くさ」（笑える・おもしろい）を文字列で見つけて区切る。
   * 解析器は「くさ」を くさい の語幹・たい＋さ・く＋さ などと毎回違うふうに分けるため、語の分け方には頼らない。
   * 本物の草（庭の草・青い草・この草・雑草）は、直前の語で見分けて区切らない。
   * @param {string} text
   * @returns {{ text: string, slang?: boolean, ambiguous?: boolean, beforeSlang?: boolean }[]}
   */
  function splitSlang(text) {
    const parts = [];
    let cut = 0;
    for (const m of text.matchAll(SLANG)) {
      const start = m.index;
      const prefix = text.slice(cut, start);
      const last = kk.tokenize(prefix).filter((t) => t.surface.trim()).pop();
      const kanji = m[1].includes('草') && !/^(大草原|草不可避|草生え)/.test(m[1]);
      // 名詞を修飾する語（の・形容詞・連体詞・接頭詞）の後は本物の草
      if (last && ((last.pos === '助詞' && last.pos1 === '連体化') || last.pos === '形容詞' || last.pos === '連体詞' || last.pos === '接頭詞')) continue;
      // ひらがなの くさ は、終止形の語尾・助詞の後だけ（めんどくさ・じじくさ は くさい の語幹）
      const kana = /^(くさ|クサ|ｸｻ)$/.test(m[1]);
      if (kana && last && /[ぁ-ゟ]$/.test(last.surface) && !SLANG_AFTER.test(last.surface)) continue;
      if (prefix) parts.push({ text: prefix, beforeSlang: true });
      // 漢字の 草 は、文の後（何もない・記号・終助詞の後）以外は植物の草とも読めるので要確認にする
      const clear = !last || last.pos === '記号' || last.pos1 === '終助詞';
      parts.push({ text: m[0], slang: true, ambiguous: kanji && !clear });
      cut = start + m[0].length;
    }
    if (cut < text.length) parts.push({ text: text.slice(cut) });
    return parts;
  }

  /**
   * 1つのまとまりを変換する。
   * @param {string} text @param {Options} opts @param {boolean} [beforeSlang] 直後にネットスラングが続く
   * @returns {{ segments: Segment[], lastKind: string|null }}
   */
  function convertChunk(text, opts, beforeSlang = false) {
    {
      const tokens = kk.tokenize(text);
      const hist = kk.convertEach(tokens);
      const units = build(tokens, hist, opts, beforeSlang);
      const outs = render(units, opts);
      const large = opts.smallToLarge ?? true;
      const historical = opts.historical ?? true;
      /** @type {Segment[]} */
      const segments = [];
      units.forEach((u, k) => {
        let out = outs[k];
        if (large && !u.foreign && HIRAGANA.test(out)) out = smallToLarge(out);
        let flag = u.flag;
        let note = u.note;
        if (!flag && u.kanaUnverified && historical) {
          flag = 'unknown';
          note = `「${u.src}」の歴史的仮名遣いを辞書で確かめられなかった`;
        }
        const last = segments[segments.length - 1];
        if (!last || u.head) {
          segments.push({ text: out, source: u.src, ...(flag ? { flag } : {}), ...(flag ? { note } : {}) });
          return;
        }
        last.text += out;
        last.source += u.src;
        if (flag === 'unknown' || (flag && !last.flag)) last.flag = flag;
        if (flag) last.note = last.note ? `${last.note}\n${note}` : note;
      });
      const lastUnit = units.filter((x) => x.kind !== 'drop' && x.src.trim()).pop();
      const lastKind = lastUnit ? (lastUnit.te ? 'te' : lastUnit.kind) : null;
      return { segments, lastKind };
    }
  }

  return {
    /**
     * @param {string} text @param {Options} [opts]
     * @returns {{ output: string, segments: Segment[] }}
     */
    convert(text, opts = {}) {
      /** @type {Segment[]} */
      const segments = [];
      let lastKind = null;
      for (const part of splitSlang(text)) {
        if (part.slang) {
          // 用言・て で終わる文の後は読点で区切る（負けけり、をかし）
          const joiner = lastKind === 'conj' || lastKind === 'te' ? '、' : '';
          const word = (opts.historical ?? true) ? 'をかし' : 'おかし';
          segments.push({ text: joiner + word, source: part.text, ...(part.ambiguous ? { flag: 'review', note: SLANG_NOTE } : {}) });
          lastKind = 'slang';
          continue;
        }
        const r = convertChunk(part.text, opts, part.beforeSlang);
        segments.push(...r.segments);
        lastKind = r.lastKind;
      }
      for (const seg of segments) if (seg.flag) seg.note = `元の語「${seg.source}」\n${seg.note}`;
      return { output: segments.map((seg) => seg.text).join(''), segments };
    },
  };
}
