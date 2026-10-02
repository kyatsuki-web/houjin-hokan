const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./load');

const g = loadGas();

test('every manual row has a known kind and fits the column count', () => {
  for (const r of g.MANUAL_ROWS) {
    assert.ok(['h1', 'h2', 'p', 'li', 'th', 'td'].includes(r[0]), r[0]);
    assert.ok(r.length - 1 <= g.MANUAL_WIDTHS.length, r[1]);
    assert.strictEqual(g.manualCells(r).length, g.MANUAL_WIDTHS.length);
  }
});
