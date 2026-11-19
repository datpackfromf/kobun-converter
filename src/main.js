import './style.css';
import wasmUrl from 'lindera-wasm-web-ipadic/lindera_wasm_bg.wasm?url';
import kyukanaDict from '../data/kyukana-dict.json';
import vocab from '../data/vocab.json';
import { createAnalyzer } from './analyzer.js';
import { createKobun } from './kobun/engine.js';
import { countX, X_LIMIT } from './kyukana/count.js';

const $ = (id) => document.getElementById(id);
const input = $('input');
const output = $('output');
const status = $('status');
const count = $('count');
const copyBtn = $('copy');
const post = $('post');
const copyLive = $('copy-live');
const note = $('note');
const noteText = $('note-text');
const historical = $('historical');
const small = $('small');
const STORE_KEY = 'kobun:options';
const EMPTY = 'ここに古文が出ます';

let kobun = null;
let result = '';
let timer = 0;
let copyTimer = 0;
/** @type {HTMLButtonElement|null} */
let openFlag = null;

// ---- オプション（入力文は保存しない。設定だけ端末に保存） ----
function readOptions() {
  return {
    style: document.querySelector('input[name="style"]:checked').value,
    polite: document.querySelector('input[name="polite"]:checked').value,
    historical: historical.checked,
    smallToLarge: small.checked,
  };
}

function restoreOptions() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!o) return;
    const pick = (name, value) => {
      const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
      if (el) el.checked = true;
    };
    pick('style', o.style);
    pick('polite', o.polite);
    if (typeof o.historical === 'boolean') historical.checked = o.historical;
    if (typeof o.smallToLarge === 'boolean') small.checked = o.smallToLarge;
  } catch {
    // 保存できない環境でも動く
  }
}

function saveOptions() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(readOptions()));
  } catch {
    // 保存できない環境でも動く
  }
}

// ---- 表示 ----
function showMessage(text) {
  status.textContent = text;
  status.hidden = false;
  output.replaceChildren();
  output.hidden = true;
}

function closeNote(returnFocus = false) {
  note.hidden = true;
  if (openFlag) {
    openFlag.setAttribute('aria-expanded', 'false');
    if (returnFocus) openFlag.focus();
  }
  openFlag = null;
}

function toggleNote(btn, text) {
  if (openFlag === btn) {
    closeNote();
    return;
  }
  closeNote();
  openFlag = btn;
  btn.setAttribute('aria-expanded', 'true');
  noteText.textContent = text;
  note.hidden = false;
}

function renderResult(r) {
  const frag = document.createDocumentFragment();
  for (const seg of r.segments) {
    if (!seg.flag) {
      frag.append(document.createTextNode(seg.text));
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flag';
    btn.textContent = seg.text;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'note');
    const kind = seg.flag === 'review' ? '辞書で要確認の語' : '確かめきれなかった所';
    btn.title = kind;
    btn.setAttribute('aria-label', `${seg.text}（${kind}。触ると元の語と根拠を表示）`);
    btn.addEventListener('click', () => toggleNote(btn, seg.note ?? `元の語「${seg.source}」`));
    frag.append(btn);
  }
  output.replaceChildren(frag);
  output.hidden = false;
  status.hidden = true;
}

function finish(out) {
  result = out;
  const n = countX(out);
  count.textContent = `${n} / ${X_LIMIT}${n > X_LIMIT ? '（超過）' : ''}`;
  const over = n > X_LIMIT;
  if (over !== count.classList.contains('over')) copyLive.textContent = over ? 'Xの文字数の上限を超えました' : '';
  count.classList.toggle('over', over);
  copyBtn.disabled = out === '';
  if (out === '') {
    post.removeAttribute('href');
    post.setAttribute('aria-disabled', 'true');
  } else {
    // X の Web Intent（docs.x.com、2026-11-19 確認）。本文は UTF-8 を URL エンコードして text に入れる
    post.href = 'https://x.com/intent/tweet?text=' + encodeURIComponent(out);
    post.setAttribute('aria-disabled', 'false');
  }
}

function render() {
  if (!kobun) return;
  closeNote();
  const text = input.value;
  if (text.trim() === '') {
    showMessage(EMPTY);
    finish('');
    return;
  }
  try {
    const r = kobun.convert(text, readOptions());
    renderResult(r);
    finish(r.output);
  } catch (e) {
    console.error(e);
    showMessage('この文は変換できませんでした。文を短く区切ると変換できることがあります。');
    finish('');
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(render, 80);
}

// ---- コピー ----
function flashCopy(label) {
  copyBtn.textContent = label;
  copyLive.textContent = label;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyBtn.textContent = 'コピー';
    copyLive.textContent = '';
  }, 1500);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function copy() {
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result);
    flashCopy('コピーしました');
  } catch {
    flashCopy(fallbackCopy(result) ? 'コピーしました' : 'コピーできませんでした');
  }
}

// ---- 起動 ----
restoreOptions();
input.addEventListener('input', schedule);
document.querySelectorAll('.options input').forEach((el) =>
  el.addEventListener('change', () => {
    saveOptions();
    render();
  }),
);
copyBtn.addEventListener('click', copy);
$('note-close').addEventListener('click', () => closeNote(true));
finish('');

createAnalyzer(wasmUrl)
  .then((analyzer) => {
    kobun = createKobun({ analyzer, kyukanaDict, vocab });
    render();
  })
  .catch((e) => {
    console.error(e);
    showMessage('辞書を読み込めませんでした。ページを再読み込みしてください。');
  });
