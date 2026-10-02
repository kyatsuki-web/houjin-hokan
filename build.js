// Apps Script エディタへ貼り付けるファイル数を2つに減らすため、src/*.js を1本にまとめる
const fs = require('fs');
const path = require('path');

const order = ['Normalize.js', 'Nta.js', 'Website.js', 'Match.js', 'Main.js', 'Review.js', 'Manual.js', 'Export.js'];
const src = path.join(__dirname, 'src');
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });

const code = order
  .map((f) => `// ===== ${f} =====\n${fs.readFileSync(path.join(src, f), 'utf8').trim()}\n`)
  .join('\n');
fs.writeFileSync(path.join(dist, 'Code.gs'), code);
// HtmlService は script 内の文字列にあるタグや文字参照を HTML として解釈して壊すため、
// 文字列リテラル中の < と & を同じ意味のエスケープ表記に置き換えて渡す
const sidebar = fs.readFileSync(path.join(src, 'Sidebar.html'), 'utf8').replace(
  /<script>([\s\S]*?)<\/script>/,
  (_, js) => '<script>' + js.replace(/'(?:[^'\\\n]|\\.)*'/g, (lit) => lit.replace(/</g, '\\x3c').replace(/&/g, '\\x26')) + '</script>'
);
fs.writeFileSync(path.join(dist, 'Sidebar.html'), sidebar);
console.log('dist/Code.gs, dist/Sidebar.html を出力しました');
