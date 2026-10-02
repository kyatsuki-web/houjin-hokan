const test = require('node:test');
const assert = require('node:assert');
const { loadGas, response, corpXml } = require('./load');

function setup(routes) {
  const calls = [];
  const UrlFetchApp = {
    fetchAll(reqs) {
      return reqs.map((r) => {
        calls.push(r.url);
        for (const [pattern, handler] of routes) {
          if (pattern.test(r.url)) return handler(r.url);
        }
        return response(404, '');
      });
    }
  };
  return { g: loadGas({ UrlFetchApp }), calls };
}

const osaka = { corporateNumber: '7000012050002', name: '山田商事株式会社', prefectureName: '大阪府', cityName: '大阪市北区', postCode: '5300001' };
const kobe = { corporateNumber: '2222222222222', name: '株式会社山田商事', prefectureName: '兵庫県', cityName: '神戸市中央区', postCode: '6500001' };

test('resolveBatch uses the website to pick among same-name companies', () => {
  const { g, calls } = setup([
    [/name\?.*name=%E5%B1%B1%E7%94%B0/, () => response(200, corpXml([osaka, kobe]))],
    [/yamada\.example\/company/, () => response(200, '<p>〒530-0001 大阪府大阪市北区梅田1-1</p>')],
    [/yamada\.example/, () => response(200, '<a href="/company/">会社概要</a>')]
  ]);
  const res = g.resolveBatch('APPID', [{ row: 2, name: '山田商事', url: 'yamada.example', address: '' }], {});
  assert.strictEqual(res[0].status, g.STATUS.OK);
  assert.strictEqual(res[0].corporateNumber, osaka.corporateNumber);
  assert.ok(calls.some((u) => u === 'https://yamada.example/company/'));
});

test('resolveBatch returns review with candidates when undecidable', () => {
  const { g } = setup([[/name\?/, () => response(200, corpXml([osaka, kobe]))]]);
  const res = g.resolveBatch('APPID', [{ row: 2, name: '山田商事', url: '', address: '' }], {});
  assert.strictEqual(res[0].status, g.STATUS.REVIEW);
  assert.strictEqual(res[0].candidates.length, 2);
  assert.strictEqual(res[0].corporateNumber, '');
});

test('resolveBatch adds the corporate number printed on the website', () => {
  const { g } = setup([
    [/name\?/, () => response(200, corpXml([]))],
    [/num\?.*number=7000012050002/, () => response(200, corpXml([osaka]))],
    [/brand\.example/, () => response(200, '<title>ブランド</title>運営会社 山田商事株式会社 法人番号 7000012050002')]
  ]);
  const res = g.resolveBatch('APPID', [{ row: 2, name: 'ヤマダブランド', url: 'https://brand.example', address: '' }], {});
  assert.strictEqual(res[0].corporateNumber, osaka.corporateNumber);
  assert.strictEqual(res[0].status, g.STATUS.OK);
});

test('resolveBatch sends alphanumeric names as full-width characters', () => {
  const { g, calls } = setup([
    [/name=%EF%BC%A1%EF%BC%A2%EF%BC%A3/, () => response(200, corpXml([{ corporateNumber: '4444444444444', name: '株式会社ＡＢＣ', prefectureName: '東京都', cityName: '港区' }]))],
    [/name\?/, () => response(400, '101,商号又は名称には全角文字をUTF-8でエンコードして設定してください。\n')]
  ]);
  const res = g.resolveBatch('APPID', [{ row: 2, name: 'ABC株式会社', url: '', address: '' }], {});
  assert.strictEqual(res[0].status, g.STATUS.OK);
  assert.strictEqual(calls.filter((u) => u.includes('/name?')).length, 1);
});

test('full-width input and spaces are sent as full-width', () => {
  const { g } = setup([]);
  assert.match(g.buildNameSearchUrl('ID', 'Sales Marker'), /name=%EF%BC%B3%EF%BD%81%EF%BD%8C%EF%BD%85%EF%BD%93%E3%80%80/);
  assert.strictEqual(g.buildNameSearchUrl('ID', g.stripLegalForm('ＷＨＥＲＥ').core), g.buildNameSearchUrl('ID', 'WHERE'));
});

test('resolveBatch answers from the dictionary without calling the API', () => {
  const { g, calls } = setup([]);
  const dict = { 'ドメイン:yamada.example': { corporateNumber: osaka.corporateNumber, name: osaka.name, address: '大阪府' } };
  const res = g.resolveBatch('APPID', [{ row: 2, name: '山田', url: 'https://www.yamada.example/', address: '' }], dict);
  assert.strictEqual(res[0].status, g.STATUS.OK);
  assert.strictEqual(calls.length, 0);
});

test('resolveBatch reports API errors per row', () => {
  const { g } = setup([[/name\?/, () => response(403, 'forbidden')]]);
  const res = g.resolveBatch('BAD', [{ row: 2, name: '山田商事', url: '', address: '' }], {});
  assert.strictEqual(res[0].status, g.STATUS.ERROR);
  assert.match(res[0].reasons[0], /アプリケーションID/);
});

test('all same-name candidates are kept for the picker', () => {
  const many = Array.from({ length: 54 }, (_, i) => ({ corporateNumber: String(1000000000000 + i), name: '株式会社メロウ', prefectureName: '東京都', cityName: '港区' }));
  const { g } = setup([[/name\?/, () => response(200, corpXml(many))]]);
  const res = g.resolveBatch('APPID', [{ row: 2, name: 'メロウ', url: '', address: '' }], {});
  assert.strictEqual(res[0].status, g.STATUS.REVIEW);
  assert.strictEqual(res[0].candidates.length, 54);
  assert.ok(JSON.stringify(res[0].candidates).length < 50000);
});
