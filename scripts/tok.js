// 開発用: 解析器のトークンを表示する（node scripts/tok.js 文 文 ...）
import { getNodeAnalyzer } from '../tests/helpers/analyzer-node.js';

const a = await getNodeAnalyzer();
for (const s of process.argv.slice(2)) {
  console.log('## ' + s);
  for (const t of a.tokenize(s)) {
    console.log([t.surface, t.pos, t.pos1, t.pos2, t.cType, t.cForm, t.base, t.reading].join('\t'));
  }
}
