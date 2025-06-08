import assert from 'node:assert/strict';

// Same escaping function as in monitor.js
const esc = (s) => s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

assert.equal(esc('_'), '\\_');
assert.equal(esc('a_b'), 'a\\_b');
assert.equal(esc('['), '\\[');
assert.equal(esc(']'), '\\]');
assert.equal(esc('('), '\\(');
assert.equal(esc(')'), '\\)');

console.log('All tests passed!');
