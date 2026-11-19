import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getNodeAnalyzer } from './helpers/analyzer-node.js';
import { createDict } from '../src/kyukana/dict.js';
import { createConverter } from '../src/kyukana/convert.js';

const dict = createDict(JSON.parse(readFileSync(new URL('../data/kyukana-dict.json', import.meta.url), 'utf8')));

test('tokenize と convertEach: 1トークンに1つの結果（小書きはそのまま）', async () => {
  const kk = createConverter({ analyzer: await getNodeAnalyzer(), dict });
  const tokens = kk.tokenize('考えて言った');
  const out = kk.convertEach(tokens);
  assert.equal(out.length, tokens.length);
  assert.equal(out.map((s) => s.text).join(''), '考へて言った');
});
