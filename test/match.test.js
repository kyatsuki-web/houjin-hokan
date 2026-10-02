const test = require('node:test');
const assert = require('node:assert');
const { loadGas, corpXml } = require('./load');

const g = loadGas();
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
const noHints = () => g.buildHints(null, '');

const yamadaOsaka = { corporateNumber: '1111111111111', name: '山田商事株式会社', prefectureName: '大阪府', cityName: '大阪市北区', postCode: '5300001' };
const yamadaKobe = { corporateNumber: '2222222222222', name: '株式会社山田商事', prefectureName: '兵庫県', cityName: '神戸市中央区', postCode: '6500001' };
const yamadaClosed = { corporateNumber: '3333333333333', name: '山田商事株式会社', prefectureName: '東京都', cityName: '港区', closeDate: '2020-01-01' };

test('parseCorporationsXml reads count and fields', () => {
  const parsed = g.parseCorporationsXml(corpXml([yamadaOsaka, { ...yamadaKobe, name: 'A&amp;B株式会社' }], 5));
  assert.strictEqual(parsed.count, 5);
  assert.strictEqual(parsed.corporations.length, 2);
  assert.strictEqual(parsed.corporations[1].name, 'A&B株式会社');
  assert.strictEqual(parsed.corporations[0].closeDate, '');
});

test('a single exact match nationwide is confirmed', () => {
  const ranked = g.rankCandidates('山田商事', [yamadaOsaka, yamadaClosed], noHints(), 2);
  const v = g.classify(ranked);
  assert.strictEqual(v.status, g.STATUS.OK);
  assert.strictEqual(v.best.corporateNumber, yamadaOsaka.corporateNumber);
});

test('two same-name companies without hints need review', () => {
  const v = g.classify(g.rankCandidates('山田商事', [yamadaOsaka, yamadaKobe], noHints(), 2));
  assert.strictEqual(v.status, g.STATUS.REVIEW);
  assert.strictEqual(v.candidates.length, 2);
});

test('legal form and address hints break a tie', () => {
  const v = g.classify(g.rankCandidates('株式会社山田商事', [yamadaOsaka, yamadaKobe], g.buildHints(null, '兵庫県神戸市'), 2));
  assert.strictEqual(v.status, g.STATUS.OK);
  assert.strictEqual(v.best.corporateNumber, yamadaKobe.corporateNumber);
});

test('website hints (postal code and city) confirm the right company', () => {
  const site = { corporateNumbers: [], postalCodes: ['5300001'], places: [{ pref: '大阪府', city: '大阪市' }], companyNames: [], siteName: '' };
  const v = g.classify(g.rankCandidates('山田商事', [yamadaOsaka, yamadaKobe], g.buildHints(site, ''), 2));
  assert.strictEqual(v.status, g.STATUS.OK);
  assert.strictEqual(v.best.corporateNumber, yamadaOsaka.corporateNumber);
});

test('uniqueness bonus is withheld when results were truncated', () => {
  const v = g.classify(g.rankCandidates('山田商事', [yamadaOsaka], noHints(), 3000));
  assert.strictEqual(v.status, g.STATUS.REVIEW);
});

test('unrelated names yield no match', () => {
  const v = g.classify(g.rankCandidates('鈴木工業', [yamadaOsaka], noHints(), 1));
  assert.strictEqual(v.status, g.STATUS.NONE);
});
