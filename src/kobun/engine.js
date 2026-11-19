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

/** 五段の終止形の最後の仮名 → 行（う は歴史的仮名でハ行） */
const GODAN_ROW = { う: 'は', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' };
/** い段・え段の仮名 → 行 */
const I_ROW = { き: 'か', ぎ: 'が', し: 'さ', じ: 'ざ', ち: 'た', ぢ: 'だ', に: 'な', ひ: 'は', び: 'ば', み: 'ま', い: 'や', ゐ: 'わ', り: 'ら' };
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
  return null;
}

/** @param {Token} t 文節の先頭になる語か */
function isHeadToken(t) {
  if (['名詞'].includes(t.pos)) return !['非自立', '接尾'].includes(t.pos1);
  if (['動詞', '形容詞'].includes(t.pos)) return t.pos1 === '自立';
  return !['助詞', '助動詞'].includes(t.pos);
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
    let rowM = row;
    if (lastM !== lastH) rowM = { は: 'わ', だ: 'ざ', わ: 'わ' }[row] ?? row;
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
  function build(tokens, hist, opts) {
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
    const push = (u, head) => {
      u.head = head;
      units.push(u);
      return u;
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
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
      if (t.pos === '名詞' && t.pos1 === '形容動詞語幹' && next && ((next.pos === '助動詞' && next.base === 'だ') || (next.pos === '助詞' && next.surface === 'に' && next.pos1 === '副詞化'))) {
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
          push(conj(src, w, { modernForm: mf, ...extra }), true);
          i += skip;
          continue;
        }
      }

      // 動詞・形容詞
      if (t.pos === '動詞' || t.pos === '形容詞') {
        // て＋いる → たり
        if (t.pos === '動詞' && (t.base === 'いる' || t.base === 'てる') && (tokens[i - 1]?.surface === 'て' || tokens[i - 1]?.surface === 'で' || t.base === 'てる')) {
          const p = prevUnit();
          if (p && p.te) {
            // 「て」の unit を「たり」に置き換える（元の語は て＋いる）
            units.splice(units.indexOf(p), 1);
            push(conj(p.src + t.surface, { cls: 'ラ変', stemH: 'た', stemM: 'た' }, { need: 'renyo', isAux: true, modernForm: formOf(t.cForm) }), false);
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
        let e = voc.byLemma(t.base, (x) => x.pos === (t.pos === '動詞' ? 'verb' : 'adjective'));
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
          push(conj(t.surface, { cls: 'ず', stemH: '', stemM: '' }, { need: 'mizen', isAux: true, modernForm: mf }), false);
          continue;
        }
        if (b === 'た') {
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
          if (opts.polite === 'haberi') {
            push(conj(t.surface, { cls: 'ラ変', stemH: '侍', stemM: '侍' }, { need: 'renyo', modernForm: mf }), false);
          } else {
            const c = prevConj();
            if (c && mf && mf !== 'renyo') c.modernForm = mf;
            if (c && mf === 'base') c.modernForm = 'base';
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
            push(fixed(t.surface, 'にて', 'にて', { need: 'rentai' }), false);
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
      if (t.pos === '名詞' && t.pos2 === '助動詞語幹' && t.surface === 'よう' && next?.base === 'だ') {
        const ga = prevConj() ? 'が' : '';
        push(conj(t.surface + next.surface, { cls: 'ク', stemH: ga + 'ごと', stemM: ga + 'ごと' }, { need: 'rentai', isAux: true, modernForm: formOf(next.cForm) }), false);
        i++;
        continue;
      }

      // 助詞
      if (t.pos === '助詞') {
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
      if ((!n || n.kind === 'end') && p?.kind === 'conj') {
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
      if (!n || n.kind === 'end') u.word = { cls: opts.style === 'diary' ? 'き' : 'けり', stemH: '', stemM: '' };
    });
    return units.map((u, k) => {
      if (u.kind === 'drop') return '';
      if (u.kind === 'end') return u.src;
      const prev = units.slice(0, k).reverse().find((x) => x.kind !== 'drop');
      if (u.kind === 'fixed') {
        if (u.te && prev?.kind === 'conj' && prev.word.cls === 'ず') return 'して';
        return hist ? u.h : u.m;
      }
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

  return {
    /**
     * @param {string} text @param {Options} [opts]
     * @returns {{ output: string, segments: Segment[] }}
     */
    convert(text, opts = {}) {
      const tokens = kk.tokenize(text);
      const hist = kk.convertEach(tokens);
      const units = build(tokens, hist, opts);
      const outs = render(units, opts);
      const large = opts.smallToLarge ?? true;
      const historical = opts.historical ?? true;
      /** @type {Segment[]} */
      const segments = [];
      units.forEach((u, k) => {
        let out = outs[k];
        if (large && HIRAGANA.test(out)) out = smallToLarge(out);
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
      for (const s of segments) if (s.flag) s.note = `元の語「${s.source}」\n${s.note}`;
      return { output: segments.map((s) => s.text).join(''), segments };
    },
  };
}
