var NTA_BASE = 'https://api.houjin-bangou.nta.go.jp/4/';
// 国税庁から短時間の大量アクセスを控えるよう求められているため、同時リクエスト数を絞る
var NTA_PARALLEL = 5;

// APIは商号に半角英数字を受け付けない(エラー101)ため、全角に揃えて送る
function buildNameSearchUrl(appId, name) {
  return NTA_BASE + 'name?id=' + encodeURIComponent(appId) +
    '&name=' + encodeURIComponent(toFullWidth(name)) +
    '&type=12&mode=2&target=1&change=0&close=1';
}

function buildNumberUrl(appId, numbers) {
  return NTA_BASE + 'num?id=' + encodeURIComponent(appId) +
    '&number=' + numbers.join(',') + '&type=12&history=0';
}

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .replace(/&amp;/g, '&');
}

function parseCorporationsXml(xml) {
  var countMatch = String(xml).match(/<count>(\d+)<\/count>/);
  var corporations = [];
  var re = /<corporation>([\s\S]*?)<\/corporation>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    var c = {};
    var fieldRe = /<(\w+)>([\s\S]*?)<\/\1>/g;
    var f;
    while ((f = fieldRe.exec(m[1])) !== null) c[f[1]] = decodeXmlEntities(f[2]);
    corporations.push({
      corporateNumber: c.corporateNumber || '',
      name: c.name || '',
      furigana: c.furigana || '',
      kind: c.kind || '',
      prefectureName: c.prefectureName || '',
      cityName: c.cityName || '',
      streetNumber: c.streetNumber || '',
      postCode: c.postCode || '',
      closeDate: c.closeDate || '',
      closeCause: c.closeCause || '',
      successorCorporateNumber: c.successorCorporateNumber || ''
    });
  }
  return { count: countMatch ? Number(countMatch[1]) : corporations.length, corporations: corporations };
}

function fetchNtaUrls(urls) {
  var results = [];
  for (var i = 0; i < urls.length; i += NTA_PARALLEL) {
    var chunk = urls.slice(i, i + NTA_PARALLEL);
    var responses = UrlFetchApp.fetchAll(chunk.map(function (u) {
      return { url: u, muteHttpExceptions: true };
    }));
    responses.forEach(function (res) {
      var code = res.getResponseCode();
      if (code !== 200) {
        results.push({ ok: false, error: ntaErrorMessage(code, res.getContentText('UTF-8')) });
        return;
      }
      var parsed = parseCorporationsXml(res.getContentText('UTF-8'));
      results.push({ ok: true, count: parsed.count, corporations: parsed.corporations });
    });
  }
  return results;
}

function ntaErrorMessage(code, body) {
  if (code === 403) return '法人番号APIのアプリケーションIDが正しくありません';
  if (code === 404) return '法人番号APIが見つかりません(URL変更の可能性)';
  return '法人番号APIエラー(' + code + '): ' + String(body).trim().slice(0, 100);
}

function searchCorporationsByName(appId, names) {
  return fetchNtaUrls(names.map(function (n) { return buildNameSearchUrl(appId, n); }));
}

function lookupCorporationsByNumber(appId, numbers) {
  var byNumber = {};
  var urls = [];
  // APIは1回で10件まで番号をまとめて引ける
  for (var i = 0; i < numbers.length; i += 10) urls.push(buildNumberUrl(appId, numbers.slice(i, i + 10)));
  fetchNtaUrls(urls).forEach(function (r) {
    if (!r.ok) return;
    r.corporations.forEach(function (c) { byNumber[c.corporateNumber] = c; });
  });
  return byNumber;
}

function formatAddress(c) {
  return (c.prefectureName || '') + (c.cityName || '') + (c.streetNumber || '');
}
