// 語彙辞書（data/vocab.json）の索引と、古語の原形から活用の情報（Word）を作る処理。

/** @typedef {import('./conjugate.js').Word} Word */

/**
 * @typedef {object} VocabEntry
 * @property {string} modern @property {string} reading @property {'lemma'|'surface'} match
 * @property {string} kobun @property {string} kobunModern @property {string} kobunReading
 * @property {string} pos @property {string|null} class @property {string} basis
 * @property {'confirmed'|'review'} status @property {string} [note]
 */

/** 終止形の最後の仮名（う段）→ 行 */
const U_ROW = {
  う: 'わ', く: 'か', ぐ: 'が', す: 'さ', ず: 'ざ', つ: 'た', づ: 'だ', ぬ: 'な',
  ふ: 'は', ぶ: 'ば', ぷ: 'ぱ', む: 'ま', ゆ: 'や', る: 'ら',
};

const KANJI = /[㐀-鿿豈-﫿々]/;

/**
 * 古語の原形（終止形）と活用の種類から Word を作る。作れなければ null。
 * @param {string} cls @param {string} h 歴史的仮名の原形 @param {string} m 現代仮名の原形
 * @returns {Word|null}
 */
export function wordFromLemma(cls, h, m) {
  const last = (s) => s[s.length - 1];
  const cut = (s, n = 1) => s.slice(0, -n);
  switch (cls) {
    case '四段':
    case '上二段':
    case '下二段': {
      if (h.length === 1 && KANJI.test(h)) return { cls, stemH: h, stemM: m, kanjiStem: true }; // 寝・得・経
      const row = U_ROW[last(h)];
      const rowM = U_ROW[last(m)];
      if (!row || !rowM) return null;
      return { cls, stemH: cut(h), stemM: cut(m), row, rowM };
    }
    case '上一段':
    case '下一段':
      return last(h) === 'る' ? { cls, stemH: cut(h), stemM: cut(m) } : null;
    case 'カ変':
      return { cls, stemH: h === 'く' ? '' : cut(h, h.endsWith('来') ? 0 : 1) || h, stemM: m === 'く' ? '' : (m.endsWith('来') ? m : cut(m)) };
    case 'サ変':
      if (!/[すず]$/.test(h)) return null;
      return { cls, stemH: cut(h), stemM: cut(m), row: last(h) === 'ず' ? 'ざ' : 'さ' };
    case 'ナ変':
      return last(h) === 'ぬ' ? { cls, stemH: cut(h), stemM: cut(m) } : null;
    case 'ラ変':
      return last(h) === 'り' ? { cls, stemH: cut(h), stemM: cut(m) } : null;
    case 'ク':
      return last(h) === 'し' ? { cls, stemH: cut(h), stemM: cut(m) } : null;
    case 'シク':
      return /[しじ]$/.test(h) ? { cls, stemH: h, stemM: m } : null;
    case 'ナリ':
      return h.endsWith('なり') ? { cls, stemH: cut(h, 2), stemM: cut(m, 2) } : { cls, stemH: h, stemM: m };
    default:
      return null;
  }
}

/**
 * @param {VocabEntry[]} entries
 */
export function createVocab(entries) {
  /** @type {Map<string, VocabEntry[]>} 先頭の文字 → 長い順 */
  const surface = new Map();
  /** @type {Map<string, VocabEntry[]>} */
  const lemma = new Map();
  for (const e of entries) {
    if (e.match === 'surface') {
      const list = surface.get(e.modern[0]) ?? [];
      list.push(e);
      surface.set(e.modern[0], list);
    } else {
      // 読みで引けるのは、項目の現代語が仮名だけのときに限る（射る が ひらがなの いる に当たらないように）
      const keys = KANJI.test(e.modern) ? [e.modern] : [e.modern, e.reading];
      for (const key of new Set(keys)) {
        const list = lemma.get(key) ?? [];
        list.push(e);
        lemma.set(key, list);
      }
    }
  }
  for (const list of surface.values()) list.sort((a, b) => b.modern.length - a.modern.length);

  return {
    /**
     * text の i 文字目から始まる表層形の候補（長い順）。
     * @param {string} text @param {number} i @returns {VocabEntry[]}
     */
    surfaceAt(text, i) {
      return (surface.get(text[i]) ?? []).filter((e) => text.startsWith(e.modern, i));
    },
    /**
     * 原形で引く。pos で絞る。
     * @param {string} key @param {(e: VocabEntry) => boolean} pred @returns {VocabEntry|null}
     */
    byLemma(key, pred) {
      return (lemma.get(key) ?? []).find(pred) ?? null;
    },
  };
}
