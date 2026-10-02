const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./load');

const g = loadGas();

test('buildCsv writes a header and quotes fields that need it', () => {
  const csv = g.buildCsv([
    ['4011001142149', '株式会社Ｓａｌｅｓ　Ｍａｒｋｅｒ', '東京都渋谷区恵比寿1-1'],
    ['7000012050002', 'A,B "C"', '大阪府']
  ]);
  assert.strictEqual(csv,
    '法人番号,企業名,住所\r\n' +
    '4011001142149,株式会社Ｓａｌｅｓ　Ｍａｒｋｅｒ,東京都渋谷区恵比寿1-1\r\n' +
    '7000012050002,"A,B ""C""",大阪府\r\n');
});

test('the dialog script keeps tags out of its string literals', () => {
  const html = g.CSV_DIALOG_HTML;
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.ok(!/["'][^"'\n]*</.test(js));
  new Function(js);
});
