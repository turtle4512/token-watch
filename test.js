import assert from 'node:assert/strict';
import { esc, formatTx } from './helpers.js';

// tests for esc
assert.equal(esc('_'), '\\_');
assert.equal(esc('a_b'), 'a\\_b');
assert.equal(esc('['), '\\[');
assert.equal(esc(']'), '\\]');
assert.equal(esc('('), '\\(');
assert.equal(esc(')'), '\\)');

// test formatTx helper
const tx = {
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  value: 1n * 10n ** 18n,
  hash: '0xabc'
};

const msg = formatTx(tx);
assert(msg.includes(tx.from));
assert(msg.includes(tx.to));
assert(msg.includes('1'));
assert(msg.includes(tx.hash));

console.log('All tests passed!');
