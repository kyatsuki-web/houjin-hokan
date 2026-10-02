const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./load');

const g = loadGas();
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

test('stripLegalForm handles prefix, suffix, abbreviations and English forms', () => {
  eq(g.stripLegalForm('株式会社 山田商事'), { core: '山田商事', form: '株式会社', position: 'prefix' });
  eq(g.stripLegalForm('山田商事株式会社'), { core: '山田商事', form: '株式会社', position: 'suffix' });
  assert.strictEqual(g.stripLegalForm('㈱山田商事').core, '山田商事');
  assert.strictEqual(g.stripLegalForm('（有）山田商事').form, '有限会社');
  assert.strictEqual(g.stripLegalForm('ABC Co., Ltd.').core, 'ABC');
  assert.strictEqual(g.stripLegalForm('Example Inc.').core, 'Example');
  assert.strictEqual(g.stripLegalForm('株式会社').core, '株式会社');
});

test('nameKey absorbs width, spacing, symbols and kanji variants', () => {
  assert.strictEqual(g.nameKey('株式会社ＡＢＣ　ホールディングス'), g.nameKey('ABCホールディングス(株)'));
  assert.strictEqual(g.nameKey('髙橋・建設株式会社'), g.nameKey('高橋建設'));
  assert.strictEqual(g.nameKey('三ヶ森商店'), g.nameKey('三ケ森商店'));
});

test('isValidCorporateNumber verifies the check digit', () => {
  assert.strictEqual(g.isValidCorporateNumber('7000012050002'), true);
  assert.strictEqual(g.isValidCorporateNumber('1000012050002'), false);
  assert.strictEqual(g.isValidCorporateNumber('700001205000'), false);
});

test('extractors pull numbers, postal codes, places and company names from text', () => {
  const text = '会社概要 社名 株式会社山田商事 法人番号：７００００１２０５０００２ 〒530-0001 大阪府大阪市北区梅田1-2-3 TEL 06-0000-0000';
  eq(g.extractCorporateNumbers(text), ['7000012050002']);
  eq(g.extractPostalCodes(text), ['5300001']);
  eq(g.extractPlaces(text), [{ pref: '大阪府', city: '大阪市' }]);
  assert.ok(g.extractCompanyNames(text).includes('株式会社山田商事'));
  eq(g.extractPlaces('東京都港区六本木1-1'), [{ pref: '東京都', city: '港区' }]);
});

test('bigramSimilarity is 1 for identical and lower for different strings', () => {
  assert.strictEqual(g.bigramSimilarity('やまだ', 'やまだ'), 1);
  assert.ok(g.bigramSimilarity('山田商事', '山田商店') < 1);
  assert.ok(g.bigramSimilarity('山田商事', '鈴木工業') === 0);
});
