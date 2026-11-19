// tests/cases.json の全件を変換し、合格率と不合格の原因別の件数を出して docs/failures.md を書く。
// 不合格の原因は各ケースの "cause"（analysis＝解析の誤り／vocab＝辞書にない／rule＝規則がない）で分類する。
import { writeFileSync } from 'node:fs';
import { loadCases, createNodeKobun } from '../tests/helpers/kobun-node.js';

const CAUSE = { analysis: '解析の誤り', vocab: '辞書にない', rule: '規則がない' };
const kobun = await createNodeKobun();
const cases = loadCases();
const fails = [];
for (const c of cases) {
  const got = kobun.convert(c.input, c.opts).output;
  if (got !== c.expected) fails.push({ ...c, got });
}
const pass = cases.length - fails.length;
const rate = ((pass / cases.length) * 100).toFixed(1);
const byCause = {};
for (const f of fails) byCause[f.cause ?? 'unclassified'] = (byCause[f.cause ?? 'unclassified'] ?? 0) + 1;
/** Markdown の表を壊さないよう | と改行を置き換える */
const esc = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\n/g, '⏎');
const lines = [
  '# 不合格の例',
  '',
  '`npm run cases` が自動で作る。原因は tests/cases.json の各ケースの `cause` 欄（調べて書く）。',
  '',
  `合格 ${pass} / ${cases.length}（${rate}%）`,
  '',
  '| 原因 | 件数 |',
  '|---|---|',
  ...Object.entries(byCause).map(([k, n]) => `| ${CAUSE[k] ?? '未分類'} | ${n} |`),
  '',
  '| 入力 | オプション | 期待値 | 出力 | 原因 | 説明 |',
  '|---|---|---|---|---|---|',
  ...fails.map((f) => `| ${esc(f.input)} | ${f.opts ? esc(JSON.stringify(f.opts)) : ''} | ${esc(f.expected)} | ${esc(f.got)} | ${CAUSE[f.cause] ?? '未分類'} | ${esc(f.why)} |`),
  '',
];
writeFileSync(new URL('../docs/failures.md', import.meta.url), lines.join('\n'));
console.log(`合格 ${pass} / ${cases.length}（${rate}%）`, byCause);
for (const f of fails) console.log(`✖ ${f.input} ${f.opts ? JSON.stringify(f.opts) : ''} 期待=${f.expected} 出力=${f.got}`);
