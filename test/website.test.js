const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./load');

const g = loadGas();
const eq = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

test('normalizeUrl and domainOf', () => {
  assert.strictEqual(g.normalizeUrl('example.co.jp'), 'https://example.co.jp');
  assert.strictEqual(g.domainOf('https://www.Example.co.jp/about/'), 'example.co.jp');
  assert.strictEqual(g.domainOf(''), '');
});

test('findCompanyPageLinks keeps same-domain company pages only', () => {
  const html = '<a href="/company/">会社概要</a><a href="https://other.com/about">外部</a>' +
    '<a href="news.html">お知らせ</a><a href="corp/profile.html">企業情報</a><a href="mailto:a@b">mail</a>';
  eq(g.findCompanyPageLinks(html, "https://example.co.jp/"),
    ['https://example.co.jp/company/', 'https://example.co.jp/corp/profile.html']);
});

test('extractSiteInfo reads og:site_name and strips scripts', () => {
  const html = '<html><head><meta property="og:site_name" content="山田商事"><title>トップ | 山田商事</title>' +
    '<script>var x="東京都千代田区";</script></head><body>本社 〒530-0001 大阪府大阪市北区梅田1-1</body></html>';
  const info = g.extractSiteInfo([html]);
  assert.strictEqual(info.siteName, '山田商事');
  eq(info.postalCodes, ['5300001']);
  eq(info.places.map((p) => p.pref), ['大阪府']);
});
