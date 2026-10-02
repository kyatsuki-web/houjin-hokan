const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

test('dist/ is up to date with src/ (run npm run build)', () => {
  const root = path.join(__dirname, '..');
  const before = fs.readFileSync(path.join(root, 'dist', 'Code.gs'), 'utf8');
  execFileSync('node', ['build.js'], { cwd: root });
  assert.strictEqual(fs.readFileSync(path.join(root, 'dist', 'Code.gs'), 'utf8'), before);
});
