import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, createNodeKobun } from './helpers/kobun-node.js';

const cases = loadCases();

test('tests/cases.json は80件以上', () => {
  assert.ok(cases.length >= 80, `${cases.length}件`);
});

test('依頼の必須例（src=spec）はすべて合格する', async () => {
  const kobun = await createNodeKobun();
  for (const c of cases.filter((x) => x.src === 'spec')) {
    assert.equal(kobun.convert(c.input, c.opts).output, c.expected, c.input);
  }
});

test('不合格の例はすべて原因（analysis/vocab/rule）が書かれている', async () => {
  const kobun = await createNodeKobun();
  for (const c of cases) {
    if (kobun.convert(c.input, c.opts).output === c.expected) continue;
    assert.ok(['analysis', 'vocab', 'rule'].includes(c.cause), `原因が未記入: ${c.input}`);
  }
});
