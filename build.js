// Apps Script エディタへ貼り付けるファイル数を2つに減らすため、src/*.js を1本にまとめる
const fs = require('fs');
const path = require('path');

const order = ['Normalize.js', 'Nta.js', 'Website.js', 'Match.js', 'Main.js', 'Review.js'];
const src = path.join(__dirname, 'src');
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });

const code = order
  .map((f) => `// ===== ${f} =====\n${fs.readFileSync(path.join(src, f), 'utf8').trim()}\n`)
  .join('\n');
fs.writeFileSync(path.join(dist, 'Code.gs'), code);
fs.copyFileSync(path.join(src, 'Sidebar.html'), path.join(dist, 'Sidebar.html'));
console.log('dist/Code.gs, dist/Sidebar.html を出力しました');
