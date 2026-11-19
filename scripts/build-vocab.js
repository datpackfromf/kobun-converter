// data/vocab/*.json（分野別）を data/vocab.json にまとめ、要確認の一覧 docs/review.md を作る。
// 使い方: node scripts/build-vocab.js

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = new URL('../data/vocab/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const all = [];
const counts = [];
for (const f of files) {
  const list = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const category = f.replace(/\.json$/, '');
  for (const e of list) all.push({ ...e, category });
  counts.push({ category, total: list.length, review: list.filter((e) => e.status === 'review').length });
}
writeFileSync(new URL('../data/vocab.json', import.meta.url), JSON.stringify(all, null, 1) + '\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\n/g, ' ');
const review = all.filter((e) => e.status === 'review');
const confirmed = all.length - review.length;
const lines = [
  '# 人が確認する語の一覧（要確認）',
  '',
  '`node scripts/build-vocab.js` が `data/vocab/*.json` から自動で作る。手で直さない。',
  '確認したら、分野のファイルの `status` を `confirmed` にし、`basis` に根拠（古語辞典名・用例）を書いて、もう一度スクリプトを実行する。',
  '',
  `合計 ${all.length} 語（確認済み ${confirmed}、要確認 ${review.length}）`,
  '',
  '| 分野 | 語数 | 要確認 |',
  '|---|---|---|',
  ...counts.map((c) => `| ${c.category} | ${c.total} | ${c.review} |`),
  '',
  '| 現代語 | 古語 | 読み | 分野 | 根拠 | 注意 |',
  '|---|---|---|---|---|---|',
  ...review.map((e) => `| ${esc(e.modern)} | ${esc(e.kobun)} | ${esc(e.kobunReading)} | ${e.category} | ${esc(e.basis)} | ${esc(e.note)} |`),
  '',
];
writeFileSync(new URL('../docs/review.md', import.meta.url), lines.join('\n'));
console.log(`vocab.json: ${all.length}語（確認済み ${confirmed}、要確認 ${review.length}）`);
