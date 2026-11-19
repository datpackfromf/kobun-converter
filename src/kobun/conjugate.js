// 文語の活用表（純粋関数）。根拠は docs/sources.md の文語文法の活用表。

/** @typedef {'mizen'|'renyo'|'shushi'|'rentai'|'izen'|'meirei'} Form */
/** @typedef {'plain'|'aux'} Ctx 'aux' は助動詞が続くとき（形容詞・ず・ナリの補助活用を使う） */

/**
 * @typedef {object} Word 活用する古文の語
 * @property {string} cls 活用の種類（四段・上一段・上二段・下二段・カ変・サ変・ナ変・ラ変・ク・シク・ナリ・ず・けり・き・む・じ・らし）
 * @property {string} stemH 語幹（歴史的仮名）。上一段・シク は い段・し まで含む
 * @property {string} stemM 語幹（現代仮名）
 * @property {string} [row] 行（四段・二段・サ変の濁り）。か・が・さ・ざ・た・だ・な・は・ば・ぱ・ま・や・ら・わ・あ
 * @property {string} [rowM] 現代仮名で書くときの行（ハ行四段の現代仮名は わ）
 * @property {boolean} [kanjiStem] 語幹の漢字1字が語の音を全部持つ（寝・得・経）
 */

/** @type {Form[]} */
export const FORMS = ['mizen', 'renyo', 'shushi', 'rentai', 'izen', 'meirei'];

/** 行ごとの あ・い・う・え・お 段（歴史的仮名）。現代仮名のワ行は 'わm' */
const ROWS = {
  あ: 'あいうえお', か: 'かきくけこ', が: 'がぎぐげご', さ: 'さしすせそ', ざ: 'ざじずぜぞ',
  た: 'たちつてと', だ: 'だぢづでど', な: 'なにぬねの', は: 'はひふへほ', ば: 'ばびぶべぼ',
  ぱ: 'ぱぴぷぺぽ', ま: 'まみむめも', や: 'やいゆえよ', ら: 'らりるれろ', わ: 'わゐうゑを',
  わm: 'わいうえお',
};

/** 段の記号（a i u e）を含む語尾の表。null はその形がない（近い形で代える） */
const TABLE = {
  四段: ['a', 'i', 'u', 'u', 'e', 'e'],
  上二段: ['i', 'i', 'u', 'uる', 'uれ', 'iよ'],
  下二段: ['e', 'e', 'u', 'uる', 'uれ', 'eよ'],
  上一段: ['', '', 'る', 'る', 'れ', 'よ'],
  下一段: ['', '', 'る', 'る', 'れ', 'よ'],
  サ変: ['e', 'i', 'u', 'uる', 'uれ', 'eよ'],
  ナ変: ['な', 'に', 'ぬ', 'ぬる', 'ぬれ', 'ね'],
  ラ変: ['ら', 'り', 'り', 'る', 'れ', 'れ'],
  ク: ['く', 'く', 'し', 'き', 'けれ', 'かれ'],
  シク: ['く', 'く', '', 'き', 'けれ', 'かれ'],
  ナリ: ['なら', 'に', 'なり', 'なる', 'なれ', 'なれ'],
  ず: ['ず', 'ず', 'ず', 'ぬ', 'ね', 'ざれ'],
  けり: ['けら', null, 'けり', 'ける', 'けれ', null],
  き: ['せ', null, 'き', 'し', 'しか', null],
  む: ['ま', null, 'む', 'む', 'め', null],
  じ: [null, null, 'じ', 'じ', 'じ', null],
  らし: [null, null, 'らし', 'らし', 'らし', null],
};

/** 助動詞が続くときの補助活用（その形だけ上書き） */
const AUX = {
  ク: { mizen: 'から', renyo: 'かり', rentai: 'かる' },
  シク: { mizen: 'から', renyo: 'かり', rentai: 'かる' },
  ナリ: { renyo: 'なり' },
  ず: { mizen: 'ざら', renyo: 'ざり', rentai: 'ざる', izen: 'ざれ' },
};

const VOWEL = { a: 0, i: 1, u: 2, e: 3 };

/** カ変（かなの語幹）の形 */
const KAHEN_KANA = ['こ', 'き', 'く', 'くる', 'くれ', 'こよ'];
/** 語幹の漢字1字が音を全部持つ二段・カ変（寝・得・経・来） */
const KANJI_ONLY = ['', '', '', 'る', 'れ', 'よ'];

/**
 * @param {string} pattern 語尾の型（段の記号を含む） @param {string} rowKey
 * @returns {string}
 */
function fill(pattern, rowKey) {
  const kana = ROWS[rowKey] ?? ROWS.あ;
  return pattern.replace(/[aiue]/g, (v) => kana[VOWEL[v]]);
}

/**
 * @param {Word} w @param {number} i FORMS の位置 @param {Ctx} ctx @param {boolean} modern
 * @returns {string} 語尾
 */
function ending(w, i, ctx, modern) {
  const form = FORMS[i];
  if (ctx === 'aux' && AUX[w.cls]?.[form]) return AUX[w.cls][form];
  if (w.cls === 'カ変') return w.stemH ? KANJI_ONLY[i] : KAHEN_KANA[i];
  if (w.kanjiStem) return KANJI_ONLY[i];
  const table = TABLE[w.cls];
  if (!table) throw new Error(`活用の種類が不明: ${w.cls}`);
  let pattern = table[i];
  if (pattern === null) pattern = table[2] ?? table.find((p) => p !== null); // ない形は終止形で代える
  let rowKey = w.row ?? (w.cls === 'サ変' ? 'さ' : 'あ');
  if (modern) {
    rowKey = w.rowM ?? rowKey;
    if (rowKey === 'わ') rowKey = 'わm'; // 現代仮名のワ行は ゐ・ゑ を使わない
  }
  return fill(pattern, rowKey);
}

/**
 * 古文の語を指定の活用形にする。
 * @param {Word} w @param {Form} form @param {Ctx} [ctx]
 * @returns {{ h: string, m: string }} h=歴史的仮名、m=現代仮名
 */
export function conjugate(w, form, ctx = 'plain') {
  const i = FORMS.indexOf(form);
  if (i < 0) throw new Error(`活用形が不明: ${form}`);
  return { h: w.stemH + ending(w, i, ctx, false), m: w.stemM + ending(w, i, ctx, true) };
}
