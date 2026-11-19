import { readFileSync } from 'node:fs';
import { getNodeAnalyzer } from './analyzer-node.js';
import { createKobun } from '../../src/kobun/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

/** テスト・レポート用: 本物の辞書で古文変換器を作る */
export async function createNodeKobun() {
  return createKobun({
    analyzer: await getNodeAnalyzer(),
    kyukanaDict: read('../../data/kyukana-dict.json'),
    vocab: read('../../data/vocab.json'),
  });
}

/** @returns {{ input: string, expected: string, opts?: object, src: string, cause?: string, why?: string }[]} */
export function loadCases() {
  return read('../cases.json');
}
