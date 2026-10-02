// ===== Normalize.js =====
var LEGAL_FORMS = [
  '特定非営利活動法人', '一般社団法人', '一般財団法人', '公益社団法人', '公益財団法人',
  '社会医療法人', '医療法人社団', '医療法人財団', '医療法人', '社会福祉法人', '学校法人',
  '宗教法人', '国立大学法人', '独立行政法人', '地方独立行政法人', '農事組合法人', '協同組合',
  '株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '相互会社', 'NPO法人',
  '(株)', '(有)', '(同)', '(資)', '(名)', '(一社)', '(一財)', '(公社)', '(公財)',
  '(医)', '(学)', '(福)', '(特非)', '(宗)'
];

var ABBREVIATED_FORMS = {
  '(株)': '株式会社', '(有)': '有限会社', '(同)': '合同会社', '(資)': '合資会社', '(名)': '合名会社',
  '(一社)': '一般社団法人', '(一財)': '一般財団法人', '(公社)': '公益社団法人', '(公財)': '公益財団法人',
  '(医)': '医療法人', '(学)': '学校法人', '(福)': '社会福祉法人', '(特非)': '特定非営利活動法人',
  '(宗)': '宗教法人', 'NPO法人': '特定非営利活動法人'
};

var ENGLISH_FORM_PATTERN = /[\s,]*(co\.?\s*,?\s*ltd\.?|inc\.?|ltd\.?|corporation|corp\.?|k\.\s*k\.?|llc|g\.\s*k\.?)$/i;

// 登録簿は旧字体・異体字で載っていることがあり、入力側の新字体と突き合わせるため寄せる
var KANJI_VARIANTS = {
  '髙': '高', '﨑': '崎', '嵜': '崎', '濵': '浜', '濱': '浜', '邊': '辺', '邉': '辺',
  '齋': '斎', '齊': '斉', '澤': '沢', '櫻': '桜', '廣': '広', '國': '国', '會': '会',
  '藝': '芸', '圓': '円', '眞': '真', '德': '徳', '惠': '恵', '龍': '竜', 'ヶ': 'ケ', 'ヵ': 'カ', 'ゝ': ''
};

var PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

function toNfkc(s) {
  return String(s == null ? '' : s).normalize('NFKC').replace(/[‐‑‒–—―−]/g, '-').trim();
}

function stripLegalForm(name) {
  var s = toNfkc(name).replace(/\s+/g, ' ');
  var form = '';
  var position = '';
  var english = s.match(ENGLISH_FORM_PATTERN);
  if (english && english.index > 0) {
    s = s.slice(0, english.index).trim();
    form = '株式会社';
    position = 'suffix';
  }
  for (var i = 0; i < LEGAL_FORMS.length && !position; i++) {
    var f = LEGAL_FORMS[i];
    if (s.indexOf(f) === 0 && s.length > f.length) {
      s = s.slice(f.length).trim();
      form = ABBREVIATED_FORMS[f] || f;
      position = 'prefix';
    } else if (s.length > f.length && s.lastIndexOf(f) === s.length - f.length) {
      s = s.slice(0, s.length - f.length).trim();
      form = ABBREVIATED_FORMS[f] || f;
      position = 'suffix';
    }
  }
  return { core: s, form: form, position: position };
}

function nameKey(name) {
  var core = stripLegalForm(name).core.toLowerCase();
  var out = '';
  for (var i = 0; i < core.length; i++) {
    var c = core.charAt(i);
    out += KANJI_VARIANTS.hasOwnProperty(c) ? KANJI_VARIANTS[c] : c;
  }
  return out.replace(/[\s・･.,'"’‘`「」『』()\[\]{}\-_\/!?:;|]/g, '');
}

function bigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  var grams = function (s) {
    var list = [];
    if (s.length === 1) return [s];
    for (var i = 0; i < s.length - 1; i++) list.push(s.substr(i, 2));
    return list;
  };
  var ga = grams(a);
  var gb = grams(b);
  var pool = gb.slice();
  var hit = 0;
  for (var i = 0; i < ga.length; i++) {
    var j = pool.indexOf(ga[i]);
    if (j >= 0) {
      hit++;
      pool.splice(j, 1);
    }
  }
  return (2 * hit) / (ga.length + gb.length);
}

function toFullWidth(s) {
  return String(s).replace(/[!-~]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 0xfee0);
  }).replace(/ /g, '　');
}

function extractPlaces(text) {
  var s = toNfkc(text);
  var places = [];
  var seen = {};
  var re = new RegExp('(' + PREFECTURES.join('|') + ')\\s*([^\\s、,。()]{1,12})', 'g');
  var m;
  while ((m = re.exec(s)) !== null) {
    var city = cityPart(m[2]);
    var key = m[1] + '|' + city;
    if (!seen[key]) {
      seen[key] = true;
      places.push({ pref: m[1], city: city });
    }
  }
  return places;
}

function cityPart(rest) {
  var m = rest.match(/^(.{1,6}?郡.{1,5}?[町村]|.{1,6}?市|.{1,4}?区|.{1,6}?[町村])/);
  return m ? m[1] : '';
}

function extractPostalCodes(text) {
  var s = toNfkc(text);
  var codes = [];
  var re = /〒\s*(\d{3})\s*-?\s*(\d{4})|(\d{3})-(\d{4})(?=\s*(?:北海道|東京都|京都府|大阪府|.{2,3}県))/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    var code = m[1] ? m[1] + m[2] : m[3] + m[4];
    if (codes.indexOf(code) < 0) codes.push(code);
  }
  return codes;
}

function isValidCorporateNumber(num) {
  var s = String(num);
  if (!/^\d{13}$/.test(s)) return false;
  var base = s.slice(1);
  var sum = 0;
  for (var n = 1; n <= 12; n++) {
    sum += Number(base.charAt(12 - n)) * (n % 2 === 1 ? 1 : 2);
  }
  return Number(s.charAt(0)) === 9 - (sum % 9);
}

function extractCorporateNumbers(text) {
  var s = toNfkc(text);
  var nums = [];
  var re = /法人番号[^0-9]{0,10}(\d{13})/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    if (isValidCorporateNumber(m[1]) && nums.indexOf(m[1]) < 0) nums.push(m[1]);
  }
  return nums;
}

function extractCompanyNames(text) {
  var s = toNfkc(text);
  var names = [];
  var forms = '株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人社団|医療法人|社会福祉法人|学校法人|特定非営利活動法人';
  var re = new RegExp('(?:' + forms + ')\\s?[^\\s、,。:|()<>「」]{1,25}|[^\\s、,。:|()<>「」]{1,25}(?:' + forms + ')', 'g');
  var m;
  while ((m = re.exec(s)) !== null && names.length < 10) {
    var n = m[0].trim();
    if (names.indexOf(n) < 0) names.push(n);
  }
  return names;
}

function prefectureOf(address) {
  var s = toNfkc(address);
  for (var i = 0; i < PREFECTURES.length; i++) {
    if (s.indexOf(PREFECTURES[i]) >= 0) return PREFECTURES[i];
  }
  return '';
}

// ===== Nta.js =====
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

// ===== Website.js =====
var COMPANY_PAGE_PATTERN = /会社概要|会社情報|企業情報|企業概要|会社案内|運営会社|運営者情報|特定商取引|company|about|corporate|profile|outline|overview|gaiyou|gaiyo/i;
var MAX_COMPANY_PAGES = 2;

function normalizeUrl(url) {
  var s = toNfkc(url);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  return s;
}

function domainOf(url) {
  var m = normalizeUrl(url).match(/^https?:\/\/([^\/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

function originOf(url) {
  var m = url.match(/^(https?:\/\/[^\/?#]+)/i);
  return m ? m[1] : '';
}

function resolveUrl(base, href) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return base.split(':')[0] + ':' + href;
  if (href.charAt(0) === '/') return originOf(base) + href;
  var dir = base.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/');
  if (!/\/$/.test(dir)) dir += '/';
  return dir + href.replace(/^\.\//, '');
}

function findCompanyPageLinks(html, pageUrl) {
  var links = [];
  var domain = domainOf(pageUrl);
  var re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html)) !== null && links.length < MAX_COMPANY_PAGES) {
    var href = m[1].trim();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    var text = m[2].replace(/<[^>]+>/g, ' ');
    if (!COMPANY_PAGE_PATTERN.test(href) && !COMPANY_PAGE_PATTERN.test(text)) continue;
    var abs = resolveUrl(pageUrl, href);
    if (domainOf(abs) !== domain || abs === pageUrl || links.indexOf(abs) >= 0) continue;
    links.push(abs);
  }
  return links;
}

function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .replace(/[ \t]+/g, ' ');
}

function siteNameOf(html) {
  var og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (og) return og[1];
  var title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? title[1].split(/[|｜\-–—:：]/)[0].trim() : '';
}

function extractSiteInfo(pages) {
  var info = { corporateNumbers: [], postalCodes: [], places: [], companyNames: [], siteName: '' };
  pages.forEach(function (html, i) {
    if (!html) return;
    if (i === 0) info.siteName = siteNameOf(html);
    var text = htmlToText(html);
    mergeUnique(info.corporateNumbers, extractCorporateNumbers(text));
    mergeUnique(info.postalCodes, extractPostalCodes(text));
    mergeUnique(info.companyNames, extractCompanyNames(text));
    extractPlaces(text).forEach(function (p) {
      var dup = info.places.some(function (q) { return q.pref === p.pref && q.city === p.city; });
      if (!dup) info.places.push(p);
    });
  });
  return info;
}

function mergeUnique(target, items) {
  items.forEach(function (x) { if (target.indexOf(x) < 0) target.push(x); });
}

function decodeHtmlResponse(res) {
  var blob = res.getBlob();
  var headers = res.getHeaders();
  var contentType = headers['Content-Type'] || headers['content-type'] || '';
  var charset = (contentType.match(/charset=([\w-]+)/i) || [])[1];
  if (!charset) {
    var head = blob.getDataAsString('ISO-8859-1').slice(0, 3000);
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  charset = (charset || 'UTF-8').toLowerCase();
  if (/shift_jis|sjis|x-sjis|windows-31j|ms932|cp932/.test(charset)) charset = 'windows-31j';
  else if (/euc-jp/.test(charset)) charset = 'EUC-JP';
  else charset = 'UTF-8';
  return blob.getDataAsString(charset);
}

function fetchHtmlPages(urls) {
  if (!urls.length) return [];
  var responses = UrlFetchApp.fetchAll(urls.map(function (u) {
    return { url: u, muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (houjin-hokan)' } };
  }));
  return responses.map(function (res) {
    return res.getResponseCode() === 200 ? decodeHtmlResponse(res) : '';
  });
}

// 1サイト不調でも fetchAll 全体が例外になるため、失敗時は1件ずつ取り直す
function fetchHtmlPagesSafely(urls) {
  try {
    return fetchHtmlPages(urls);
  } catch (e) {
    return urls.map(function (u) {
      try {
        return fetchHtmlPages([u])[0];
      } catch (e2) {
        return '';
      }
    });
  }
}

function collectSiteInfos(urls) {
  var targets = urls.map(normalizeUrl);
  var active = targets.filter(function (u, i) { return u && targets.indexOf(u) === i; });
  var tops = fetchHtmlPagesSafely(active);
  var topByUrl = {};
  active.forEach(function (u, i) { topByUrl[u] = tops[i]; });

  var subUrls = [];
  var subOwners = [];
  active.forEach(function (u) {
    var links = topByUrl[u] ? findCompanyPageLinks(topByUrl[u], u) : [];
    links.forEach(function (l) {
      subUrls.push(l);
      subOwners.push(u);
    });
  });
  var subs = fetchHtmlPagesSafely(subUrls);
  var pagesByUrl = {};
  active.forEach(function (u) { pagesByUrl[u] = [topByUrl[u]]; });
  subs.forEach(function (html, i) { pagesByUrl[subOwners[i]].push(html); });

  return targets.map(function (u) {
    if (!u) return null;
    var info = extractSiteInfo(pagesByUrl[u]);
    info.reachable = !!topByUrl[u];
    return info;
  });
}

// ===== Match.js =====
var STATUS = {
  OK: '🟢確定',
  REVIEW: '🟡要確認',
  NONE: '🔴該当なし',
  ERROR: '⚠エラー'
};
var CONFIRM_SCORE = 80;
var CONFIRM_GAP = 15;
var MIN_CANDIDATE_SCORE = 30;
// 候補はすべて選べるようにする。上限はセル1つに保存できる文字数(5万字)から逆算
var MAX_STORED_CANDIDATES = 150;
var EXACT_NAME_SCORE = 70;

function buildHints(siteInfo, addressText) {
  var hints = { corporateNumbers: [], postalCodes: [], places: [], companyNameKeys: [] };
  if (siteInfo) {
    hints.corporateNumbers = siteInfo.corporateNumbers.slice();
    hints.postalCodes = siteInfo.postalCodes.slice();
    hints.places = siteInfo.places.slice();
    hints.companyNameKeys = siteInfo.companyNames.map(nameKey);
    if (siteInfo.siteName) hints.companyNameKeys.push(nameKey(siteInfo.siteName));
  }
  if (addressText) {
    var places = extractPlaces(addressText);
    if (!places.length && prefectureOf(addressText)) places = [{ pref: prefectureOf(addressText), city: '' }];
    hints.places = places.concat(hints.places);
    mergeUnique(hints.postalCodes, extractPostalCodes(addressText));
  }
  return hints;
}

function citiesMatch(a, b) {
  if (!a || !b) return false;
  return a.indexOf(b) === 0 || b.indexOf(a) === 0;
}

function scoreCandidate(input, cand, hints) {
  var reasons = [];
  var score = 0;
  var ck = nameKey(cand.name);
  var ik = input.key;
  var exact = false;

  if (ck && ck === ik) {
    score += EXACT_NAME_SCORE;
    exact = true;
    reasons.push('社名が一致');
  } else if (ck && ik && (ck.indexOf(ik) >= 0 || ik.indexOf(ck) >= 0)) {
    var ratio = Math.min(ck.length, ik.length) / Math.max(ck.length, ik.length);
    score += 30 + Math.round(30 * ratio);
    reasons.push('社名が部分一致');
  } else {
    var sim = bigramSimilarity(ck, ik);
    score += Math.round(50 * sim);
    if (sim >= 0.5) reasons.push('社名が類似');
  }

  var candForm = stripLegalForm(cand.name).form;
  if (input.form && candForm) {
    if (input.form === candForm) {
      score += 5;
      reasons.push('法人格が一致');
    } else {
      score -= 10;
      reasons.push('法人格が異なる');
    }
  }

  if (hints.corporateNumbers.indexOf(cand.corporateNumber) >= 0) {
    // 番号が1つだけ載っているならほぼ運営会社と断定できるが、取引先一覧などで複数載る場合は弱める
    score += hints.corporateNumbers.length === 1 ? 70 : 40;
    reasons.push('HPに法人番号の記載あり');
  }
  if (!exact && ck && hints.companyNameKeys.indexOf(ck) >= 0) {
    score += 15;
    reasons.push('HP記載の社名と一致');
  }
  if (cand.postCode && hints.postalCodes.indexOf(cand.postCode) >= 0) {
    score += 15;
    reasons.push('郵便番号が一致');
  }
  if (hints.places.length) {
    var samePref = hints.places.filter(function (p) { return p.pref === cand.prefectureName; });
    if (samePref.length) {
      score += 15;
      var sameCity = samePref.some(function (p) { return citiesMatch(p.city, cand.cityName); });
      if (sameCity) {
        score += 10;
        reasons.push('市区町村まで一致');
      } else {
        reasons.push('都道府県が一致');
      }
    } else {
      score -= 5;
      reasons.push('住所の手がかりと不一致');
    }
  }
  if (cand.closeDate) {
    score -= 30;
    reasons.push('閉鎖済み(' + cand.closeDate + ')');
  }
  return { score: score, reasons: reasons, exact: exact };
}

function rankCandidates(inputName, corporations, hints, totalCount) {
  var stripped = stripLegalForm(inputName);
  var input = { key: nameKey(inputName), form: stripped.form };
  var ranked = corporations.map(function (c) {
    var s = scoreCandidate(input, c, hints);
    return {
      corporateNumber: c.corporateNumber,
      name: c.name,
      address: formatAddress(c),
      postCode: c.postCode,
      closed: !!c.closeDate,
      score: s.score,
      reasons: s.reasons,
      exact: s.exact
    };
  });

  // 全件取得できているときだけ「全国で1社のみ」と言い切れる
  var complete = totalCount == null || totalCount <= corporations.length;
  var activeExact = ranked.filter(function (r) { return r.exact && !r.closed; });
  if (complete && activeExact.length === 1) {
    activeExact[0].score += 15;
    activeExact[0].reasons.push('同名の営業中法人は1社のみ');
  }

  ranked.forEach(function (r) {
    r.score = Math.max(0, Math.min(100, r.score));
    delete r.exact;
  });
  ranked.sort(function (a, b) { return b.score - a.score; });
  return ranked;
}

function classify(ranked) {
  var viable = ranked.filter(function (r) { return r.score >= MIN_CANDIDATE_SCORE; });
  if (!viable.length) return { status: STATUS.NONE, best: null, candidates: [] };
  var top = viable[0];
  var second = viable[1];
  var confident = top.score >= CONFIRM_SCORE && (!second || top.score - second.score >= CONFIRM_GAP);
  return {
    status: confident ? STATUS.OK : STATUS.REVIEW,
    best: top,
    candidates: viable.slice(0, MAX_STORED_CANDIDATES)
  };
}

// ===== Main.js =====
var MENU_TITLE = '🏢 法人補完';
var OUTPUT_HEADERS = ['判定', '一致度', '法人番号(補完)', '正式名称(補完)', '本店所在地(補完)', '判定の根拠', '候補数'];
var NAME_HEADER_PATTERN = /会社名|企業名|社名|法人名|商号|取引先|顧客名/;
var URL_HEADER_PATTERN = /url|hp|ホームページ|ウェブサイト|webサイト|website|サイト/i;
var ADDRESS_HEADER_PATTERN = /住所|所在地|都道府県/;
var STATUS_COLORS = {};
STATUS_COLORS[STATUS.OK] = '#e6f4ea';
STATUS_COLORS[STATUS.REVIEW] = '#fef7e0';
STATUS_COLORS[STATUS.NONE] = '#fce8e6';
STATUS_COLORS[STATUS.ERROR] = '#eeeeee';
var BATCH_SIZE = 10;
// 1回の実行上限は6分。1バッチ(HP取得込み)が長引いても収まるよう余裕を持たせる
var RUN_BUDGET_MS = 4 * 60 * 1000;
var CONTINUE_HANDLER = 'continueRun';
var DICTIONARY_SHEET = '補完辞書';
var CANDIDATE_SHEET = '_候補';

function onOpen() {
  SpreadsheetApp.getUi().createMenu(MENU_TITLE)
    .addItem('▶ 補完を実行(このシート)', 'startRun')
    .addItem('🟡 要確認の候補を選ぶ', 'openReviewSidebar')
    .addSeparator()
    .addItem('↺ 選択した行をやり直す', 'resetSelectedRows')
    .addItem('⏹ 実行中の処理を止める', 'stopRun')
    .addSeparator()
    .addItem('📖 マニュアルを表示', 'showManual')
    .addItem('⚙ 法人番号APIのIDを設定', 'configureAppId')
    .addToUi();
}

function configureAppId() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('法人番号APIの設定', '国税庁から発行されたアプリケーションIDを入力してください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var id = res.getResponseText().trim();
  if (!id) return;
  PropertiesService.getScriptProperties().setProperty('NTA_APP_ID', id);
  ui.alert('保存しました');
}

function getAppId() {
  return PropertiesService.getScriptProperties().getProperty('NTA_APP_ID') || '';
}

function startRun() {
  var ui = SpreadsheetApp.getUi();
  if (!getAppId()) {
    ui.alert('先に「⚙ 法人番号APIのIDを設定」からアプリケーションIDを登録してください');
    return;
  }
  var sheet = SpreadsheetApp.getActiveSheet();
  var cols = detectColumns(sheet);
  if (cols.name < 0) {
    ui.alert('1行目に「会社名」(または企業名・社名・取引先名)の見出しがある列が見つかりません');
    return;
  }
  var state = { spreadsheetId: SpreadsheetApp.getActive().getId(), sheetName: sheet.getName() };
  PropertiesService.getDocumentProperties().setProperty('RUN_STATE', JSON.stringify(state));
  var result = runWithLock(state);
  if (!result) {
    ui.alert('別の補完処理が実行中です。終わるまでお待ちください');
    return;
  }
  SpreadsheetApp.getActive().toast(summaryMessage(result), MENU_TITLE, 10);
}

function continueRun() {
  var raw = PropertiesService.getDocumentProperties().getProperty('RUN_STATE');
  if (!raw) {
    deleteContinueTriggers();
    return;
  }
  runWithLock(JSON.parse(raw));
}

function stopRun() {
  deleteContinueTriggers();
  PropertiesService.getDocumentProperties().deleteProperty('RUN_STATE');
  SpreadsheetApp.getActive().toast('停止しました。もう一度「補完を実行」で続きから再開できます', MENU_TITLE, 8);
}

function runWithLock(state) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return null;
  try {
    deleteContinueTriggers();
    var sheet = SpreadsheetApp.openById(state.spreadsheetId).getSheetByName(state.sheetName);
    if (!sheet) {
      PropertiesService.getDocumentProperties().deleteProperty('RUN_STATE');
      return { processed: 0, remaining: 0, counts: {} };
    }
    var result = processSheet(sheet, Date.now() + RUN_BUDGET_MS);
    if (result.remaining > 0) {
      ScriptApp.newTrigger(CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
    } else {
      PropertiesService.getDocumentProperties().deleteProperty('RUN_STATE');
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

function deleteContinueTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === CONTINUE_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function summaryMessage(result) {
  var c = result.counts;
  var parts = [STATUS.OK, STATUS.REVIEW, STATUS.NONE, STATUS.ERROR]
    .filter(function (s) { return c[s]; })
    .map(function (s) { return s + ' ' + c[s] + '件'; });
  var msg = result.processed + '件を処理しました。' + parts.join(' / ');
  if (result.remaining > 0) msg += '\n残り' + result.remaining + '件は1分後に自動で続きを処理します';
  else if (c[STATUS.REVIEW]) msg += '\nメニューの「🟡 要確認の候補を選ぶ」から確定してください';
  return msg;
}

function detectColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var find = function (pattern) {
    for (var i = 0; i < headers.length; i++) {
      if (OUTPUT_HEADERS.indexOf(headers[i]) < 0 && pattern.test(headers[i])) return i;
    }
    return -1;
  };
  return {
    name: find(NAME_HEADER_PATTERN),
    url: find(URL_HEADER_PATTERN),
    address: find(ADDRESS_HEADER_PATTERN),
    output: headers.indexOf(OUTPUT_HEADERS[0])
  };
}

function ensureOutputColumns(sheet) {
  var cols = detectColumns(sheet);
  if (cols.output >= 0) return cols.output + 1;
  var start = sheet.getLastColumn() + 1;
  sheet.getRange(1, start, 1, OUTPUT_HEADERS.length).setValues([OUTPUT_HEADERS]).setFontWeight('bold');
  // 13桁の番号が指数表記や数値丸めで壊れないよう文字列として扱う
  sheet.getRange(1, start + 2, sheet.getMaxRows(), 1).setNumberFormat('@');
  return start;
}

function processSheet(sheet, deadline) {
  var appId = getAppId();
  var outStart = ensureOutputColumns(sheet);
  var cols = detectColumns(sheet);
  var lastRow = sheet.getLastRow();
  var counts = {};
  if (lastRow < 2) return { processed: 0, remaining: 0, counts: counts };

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var pending = [];
  values.forEach(function (v, i) {
    var name = String(v[cols.name] || '').trim();
    var status = String(v[outStart - 1] || '');
    if (!name || (status && status !== STATUS.ERROR)) return;
    pending.push({
      row: i + 2,
      name: name,
      url: cols.url >= 0 ? String(v[cols.url] || '').trim() : '',
      address: cols.address >= 0 ? String(v[cols.address] || '').trim() : ''
    });
  });

  var dictionary = loadDictionary(sheet.getParent());
  var store = loadCandidateStore(sheet.getParent());
  var processed = 0;
  while (processed < pending.length && Date.now() < deadline) {
    var batch = pending.slice(processed, processed + BATCH_SIZE);
    var results = resolveBatch(appId, batch, dictionary);
    results.forEach(function (r, i) {
      writeResult(sheet, outStart, batch[i].row, r);
      counts[r.status] = (counts[r.status] || 0) + 1;
      var key = storeKey(sheet, batch[i].row);
      if (r.status === STATUS.REVIEW) store.entries[key] = { inputName: batch[i].name, candidates: r.candidates };
      else delete store.entries[key];
    });
    processed += batch.length;
    saveCandidateStore(store);
    SpreadsheetApp.flush();
  }
  return { processed: processed, remaining: pending.length - processed, counts: counts };
}

function resolveBatch(appId, batch, dictionary) {
  var results = new Array(batch.length);
  var todo = [];
  batch.forEach(function (item, i) {
    var hit = lookupDictionary(dictionary, item);
    if (hit) {
      results[i] = {
        status: STATUS.OK, score: 100, corporateNumber: hit.corporateNumber, name: hit.name,
        address: hit.address, reasons: ['補完辞書に登録済み'], candidateCount: 1
      };
    } else {
      todo.push(i);
    }
  });
  if (!todo.length) return results;

  var siteInfos = collectSiteInfos(todo.map(function (i) { return batch[i].url; }));
  var hints = todo.map(function (i, k) { return buildHints(siteInfos[k], batch[i].address); });
  var queries = todo.map(function (i) { return stripLegalForm(batch[i].name).core; });
  var searches = searchCorporationsByName(appId, queries);

  // 0件のときはHPに書かれた正式社名で再検索する(サービス名と社名が違う会社向け)
  var retryIdx = [];
  var retryQueries = [];
  todo.forEach(function (i, k) {
    if (!searches[k].ok || searches[k].corporations.length) return;
    var alt = siteInfos[k] && siteInfos[k].companyNames.length ? stripLegalForm(siteInfos[k].companyNames[0]).core : '';
    if (alt && alt !== queries[k]) {
      retryIdx.push(k);
      retryQueries.push(alt);
    }
  });
  if (retryQueries.length) {
    searchCorporationsByName(appId, retryQueries).forEach(function (r, j) {
      if (r.ok && r.corporations.length) searches[retryIdx[j]] = r;
    });
  }

  var missingNumbers = [];
  todo.forEach(function (i, k) {
    if (!searches[k].ok) return;
    var have = searches[k].corporations.map(function (c) { return c.corporateNumber; });
    hints[k].corporateNumbers.forEach(function (n) {
      if (have.indexOf(n) < 0 && missingNumbers.indexOf(n) < 0) missingNumbers.push(n);
    });
  });
  var extra = missingNumbers.length ? lookupCorporationsByNumber(appId, missingNumbers) : {};

  todo.forEach(function (i, k) {
    var s = searches[k];
    if (!s.ok) {
      results[i] = { status: STATUS.ERROR, score: '', corporateNumber: '', name: '', address: '', reasons: [s.error], candidateCount: '' };
      return;
    }
    var corporations = s.corporations.slice();
    hints[k].corporateNumbers.forEach(function (n) {
      if (extra[n] && !corporations.some(function (c) { return c.corporateNumber === n; })) corporations.push(extra[n]);
    });
    var ranked = rankCandidates(batch[i].name, corporations, hints[k], s.count);
    var verdict = classify(ranked);
    var reasons = verdict.best ? verdict.best.reasons.slice() : [];
    if (batch[i].url && siteInfos[k] && !siteInfos[k].reachable) reasons.push('HPを読み込めず');
    var total = Math.max(s.count, corporations.length);
    if (verdict.status === STATUS.OK) {
      results[i] = {
        status: STATUS.OK, score: verdict.best.score, corporateNumber: verdict.best.corporateNumber,
        name: verdict.best.name, address: verdict.best.address, reasons: reasons, candidateCount: total
      };
    } else if (verdict.status === STATUS.REVIEW) {
      results[i] = {
        status: STATUS.REVIEW, score: verdict.best.score, corporateNumber: '', name: '', address: '',
        reasons: ['候補' + verdict.candidates.length + '件から選択が必要'].concat(reasons),
        candidateCount: total, candidates: verdict.candidates
      };
    } else {
      results[i] = {
        status: STATUS.NONE, score: '', corporateNumber: '', name: '', address: '',
        reasons: total ? ['社名が近い法人が見つからない'] : ['検索結果0件'], candidateCount: total
      };
    }
  });
  return results;
}

function writeResult(sheet, outStart, row, r) {
  var range = sheet.getRange(row, outStart, 1, OUTPUT_HEADERS.length);
  range.setValues([[r.status, r.score, r.corporateNumber, r.name, r.address, r.reasons.join(' / '), r.candidateCount]]);
  sheet.getRange(row, outStart).setBackground(STATUS_COLORS[r.status] || null);
}

function resetSelectedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cols = detectColumns(sheet);
  if (cols.output < 0) return;
  var sel = sheet.getActiveRange();
  var first = Math.max(2, sel.getRow());
  var last = sel.getLastRow();
  if (last < first) return;
  var out = sheet.getRange(first, cols.output + 1, last - first + 1, OUTPUT_HEADERS.length);
  out.clearContent();
  sheet.getRange(first, cols.output + 1, last - first + 1, 1).setBackground(null);
  var store = loadCandidateStore(sheet.getParent());
  for (var r = first; r <= last; r++) delete store.entries[storeKey(sheet, r)];
  saveCandidateStore(store);
  SpreadsheetApp.getActive().toast((last - first + 1) + '行をクリアしました。「補完を実行」で再判定します', MENU_TITLE, 6);
}

// insertSheet は新しいシートをアクティブにしてしまい、作業中のシートが切り替わるのを防ぐ
function insertSheetQuietly(ss, name) {
  var prev = ss.getActiveSheet();
  var sheet = ss.insertSheet(name);
  if (prev) prev.activate();
  return sheet;
}

// ---- 補完辞書: 人が選んだ結果を覚えて次回から自動確定する ----

function dictionaryKeys(item) {
  var keys = [];
  var domain = item.url ? domainOf(item.url) : '';
  if (domain) keys.push('ドメイン:' + domain);
  keys.push('社名:' + nameKey(item.name) + '|' + prefectureOf(item.address || ''));
  return keys;
}

function loadDictionary(ss) {
  var sheet = ss.getSheetByName(DICTIONARY_SHEET);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (v) {
    if (v[0] && v[1]) map[String(v[0])] = { corporateNumber: String(v[1]), name: String(v[2]), address: String(v[3]) };
  });
  return map;
}

function lookupDictionary(dictionary, item) {
  var keys = dictionaryKeys(item);
  for (var i = 0; i < keys.length; i++) {
    if (dictionary[keys[i]]) return dictionary[keys[i]];
  }
  return null;
}

function rememberInDictionary(ss, item, corp) {
  var sheet = ss.getSheetByName(DICTIONARY_SHEET);
  if (!sheet) {
    sheet = insertSheetQuietly(ss, DICTIONARY_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['キー', '法人番号', '正式名称', '本店所在地', '登録日']]).setFontWeight('bold');
    sheet.getRange('B:B').setNumberFormat('@');
  }
  var existing = loadDictionary(ss);
  var rows = dictionaryKeys(item).filter(function (k) { return !existing[k]; }).map(function (k) {
    return [k, corp.corporateNumber, corp.name, corp.address, new Date()];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

// ---- 候補の保存先(非表示シート) ----

// シート名は変えられるので、変わらないシートIDで紐づける
function storeKey(sheet, row) {
  return sheet.getSheetId() + '!' + row;
}

function loadCandidateStore(ss) {
  var sheet = ss.getSheetByName(CANDIDATE_SHEET);
  if (!sheet) {
    sheet = insertSheetQuietly(ss, CANDIDATE_SHEET);
    sheet.hideSheet();
  }
  var entries = {};
  if (sheet.getLastRow() >= 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues().forEach(function (v) {
      if (!v[0]) return;
      try {
        entries[String(v[0])] = { inputName: String(v[1]), candidates: JSON.parse(v[2]) };
      } catch (e) {
        // 手で壊された行は捨てて再判定に任せる
      }
    });
  }
  return { sheet: sheet, entries: entries };
}

function saveCandidateStore(store) {
  var rows = Object.keys(store.entries).map(function (k) {
    var e = store.entries[k];
    return [k, e.inputName, JSON.stringify(e.candidates)];
  });
  store.sheet.clearContents();
  if (rows.length) store.sheet.getRange(1, 1, rows.length, 3).setValues(rows);
}

// ===== Review.js =====
function openReviewSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('要確認の候補を選ぶ');
  SpreadsheetApp.getUi().showSidebar(html);
}

function getReviewItems() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cols = detectColumns(sheet);
  if (cols.output < 0 || sheet.getLastRow() < 2) return { sheetName: sheet.getName(), items: [] };
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var store = loadCandidateStore(sheet.getParent());
  var items = [];
  values.forEach(function (v, i) {
    if (String(v[cols.output]) !== STATUS.REVIEW) return;
    var row = i + 2;
    var entry = store.entries[storeKey(sheet, row)];
    var name = String(v[cols.name] || '');
    items.push({
      row: row,
      inputName: name,
      url: cols.url >= 0 ? String(v[cols.url] || '') : '',
      address: cols.address >= 0 ? String(v[cols.address] || '') : '',
      candidates: entry && entry.inputName === name ? entry.candidates : [],
      stale: !entry || entry.inputName !== name
    });
  });
  return { sheetName: sheet.getName(), items: items };
}

function rowItem(sheet, row, expectedName) {
  var cols = detectColumns(sheet);
  var v = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var name = String(v[cols.name] || '');
  if (name !== expectedName) throw new Error('行の並びが変わっています。サイドバーを開き直してください');
  return {
    cols: cols,
    item: {
      name: name,
      url: cols.url >= 0 ? String(v[cols.url] || '') : '',
      address: cols.address >= 0 ? String(v[cols.address] || '') : ''
    }
  };
}

function reviewSheet(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error('シート「' + sheetName + '」が見つかりません');
  return sheet;
}

function confirmCandidate(sheetName, row, expectedName, candidate, remember) {
  var sheet = reviewSheet(sheetName);
  var ctx = rowItem(sheet, row, expectedName);
  var outStart = ctx.cols.output + 1;
  var count = sheet.getRange(row, outStart + 6).getValue();
  writeResult(sheet, outStart, row, {
    status: STATUS.OK, score: candidate.score === '' ? '' : candidate.score, corporateNumber: candidate.corporateNumber,
    name: candidate.name, address: candidate.address, reasons: ['手動で選択'], candidateCount: count
  });
  if (remember) rememberInDictionary(sheet.getParent(), ctx.item, candidate);
  dropStoredCandidates(sheet, row);
}

function markNoMatch(sheetName, row, expectedName) {
  var sheet = reviewSheet(sheetName);
  var ctx = rowItem(sheet, row, expectedName);
  var outStart = ctx.cols.output + 1;
  var count = sheet.getRange(row, outStart + 6).getValue();
  writeResult(sheet, outStart, row, {
    status: STATUS.NONE, score: '', corporateNumber: '', name: '', address: '',
    reasons: ['手動で該当なしに設定'], candidateCount: count
  });
  dropStoredCandidates(sheet, row);
}

function dropStoredCandidates(sheet, row) {
  var store = loadCandidateStore(sheet.getParent());
  delete store.entries[storeKey(sheet, row)];
  saveCandidateStore(store);
}

function refreshCandidates(sheetName, row, expectedName) {
  var sheet = reviewSheet(sheetName);
  var ctx = rowItem(sheet, row, expectedName);
  var item = { row: row, name: ctx.item.name, url: ctx.item.url, address: ctx.item.address };
  var r = resolveBatch(getAppId(), [item], loadDictionary(sheet.getParent()))[0];
  writeResult(sheet, ctx.cols.output + 1, row, r);
  var store = loadCandidateStore(sheet.getParent());
  var key = storeKey(sheet, row);
  if (r.status === STATUS.REVIEW) store.entries[key] = { inputName: item.name, candidates: r.candidates };
  else delete store.entries[key];
  saveCandidateStore(store);
  return { status: r.status, candidates: r.candidates || [], reviewStatus: STATUS.REVIEW };
}

function lookupNumberForReview(number) {
  var num = toNfkc(number).replace(/\D/g, '');
  if (!isValidCorporateNumber(num)) throw new Error('法人番号の形式が正しくありません(13桁)');
  var found = lookupCorporationsByNumber(getAppId(), [num])[num];
  if (!found) throw new Error('この法人番号は見つかりませんでした');
  return {
    corporateNumber: found.corporateNumber, name: found.name, address: formatAddress(found),
    closed: !!found.closeDate, score: '', reasons: ['法人番号を直接入力']
  };
}

function focusRow(sheetName, row) {
  var sheet = reviewSheet(sheetName);
  sheet.activate();
  sheet.setActiveRange(sheet.getRange(row, 1, 1, sheet.getLastColumn()));
}

// ===== Manual.js =====
var MANUAL_SHEET = '法人補完マニュアル';
var MANUAL_WIDTHS = [240, 360, 340];

// 行の種類: h1 タイトル / h2 章見出し / p 段落 / li 箇条書き / th 表の見出し行 / td 表の行
var MANUAL_ROWS = [
  ['h1', '法人補完ツール 利用マニュアル'],
  ['p', 'Googleスプレッドシートの営業リストに、法人番号・正式名称・本店所在地をボタン1つで書き込むツールです。社名だけでは1社に決まらない場合も、候補を全件並べて画面から選べます。'],

  ['h2', '1. このツールでできること'],
  ['li', 'データは国税庁の法人番号データ(公式)から取得します'],
  ['li', 'URLを入れておくと、ホームページの会社概要を読んで候補を自動で絞り込みます'],
  ['li', '一度選んだ結果は記憶され、次回から同じ会社は自動で確定します'],
  ['th', '判定', '意味', 'あなたがやること'],
  ['td', '🟢確定', '1社に特定できた', '特になし'],
  ['td', '🟡要確認', '候補が複数あり決めきれない', '候補一覧から正しい会社を選ぶ'],
  ['td', '🔴該当なし', '近い社名の法人が見つからない', '社名の表記を見直す'],
  ['td', '⚠エラー', '通信などで失敗した', 'もう一度実行する'],

  ['h2', '2. リストの準備'],
  ['p', '1行目を見出しにして、「会社名」の列を必ず作ります。列の順番は自由で、他の列があっても構いません。'],
  ['th', '見出し', '同じ扱いになる見出し', '入れる内容の例'],
  ['td', '会社名(必須)', '企業名、社名、法人名、取引先名、顧客名', '山田商事、株式会社ABC、(株)メロウ'],
  ['td', 'URL(任意・強く推奨)', 'HP、ホームページ、Webサイト', 'yamada.co.jp、https://www.example.com'],
  ['td', '住所(任意)', '所在地、都道府県', '大阪府大阪市北区…、大阪府 だけでも可'],
  ['li', '「株式会社」「(株)」の有無、全角・半角、スペースの違いは自動で吸収します'],
  ['li', 'サービス名ではなく、できるだけ登記上の社名を入れてください。ブランド名しか分からない場合はURLを入れておくと、HPの運営会社名から探します'],

  ['h2', '3. 補完を実行する'],
  ['p', 'リストのシートを開いた状態で、メニューの「🏢 法人補完」→「▶ 補完を実行(このシート)」を押すだけです。'],
  ['li', 'リストの右端に結果用の7列が自動で追加され、上の行から順に結果が入ります'],
  ['li', '終わると画面右下に「○件を処理しました」と表示されます'],
  ['li', '件数が多くて途中で止まった場合は、1分後に自動で続きが処理されます。何もしなくて大丈夫です'],
  ['li', 'すでに判定が入っている行は飛ばされます。行を追加して再実行すれば、新しい行だけが処理されます(⚠エラーの行は自動でやり直し)'],

  ['h2', '4. 結果の見方'],
  ['p', '法人番号が入るのは🟢確定の行だけです。🟡要確認の行は、人が候補を選ぶまで空欄になります。'],
  ['th', '追加される列', '中身', ''],
  ['td', '判定', '🟢確定 / 🟡要確認 / 🔴該当なし / ⚠エラー', ''],
  ['td', '一致度', '一番可能性が高い候補の点数(0〜100)', ''],
  ['td', '法人番号(補完)', '13桁の法人番号', ''],
  ['td', '正式名称(補完)', '登記上の正式な社名', ''],
  ['td', '本店所在地(補完)', '登記上の本店住所', ''],
  ['td', '判定の根拠', '例: 社名が一致 / 市区町村まで一致', ''],
  ['td', '候補数', '似た社名の法人が全国に何社あったか', ''],
  ['p', '🟢確定になるのは、一致度が80点以上で、かつ2位の候補と15点以上差があるときです。点数は次の手がかりで決まります。'],
  ['th', '手がかり', '点数', ''],
  ['td', '社名が完全一致(株式会社などを除いて比較)', '+70', ''],
  ['td', '社名が部分一致', '+30〜60', ''],
  ['td', '同じ社名で営業中の法人が全国で1社だけ', '+15', ''],
  ['td', 'HPに法人番号が載っている', '+70(複数載っていれば+40)', ''],
  ['td', 'HPや住所列の郵便番号が一致', '+15', ''],
  ['td', '都道府県が一致 / さらに市区町村も一致', '+15 / +10', ''],
  ['td', '法人格(株式会社・有限会社など)が一致 / 不一致', '+5 / −10', ''],
  ['td', '閉鎖済みの法人', '−30', ''],

  ['h2', '5. 要確認の候補を選ぶ'],
  ['p', '🟡要確認の行は、画面右の候補一覧から1件ずつ選んで確定します。候補は全件表示されます。'],
  ['li', '「🏢 法人補完」→「🟡 要確認の候補を選ぶ」を押す'],
  ['li', '画面右に入力した社名と候補の一覧が出る。シート上でもその行が選ばれる'],
  ['li', '候補が多いときは、上の欄で絞り込む(入力欄: 社名・住所・法人番号の一部 / 選択欄: 都道府県)'],
  ['li', '正しい会社をクリックして「確定」を押す。次の🟡の行に自動で進む'],
  ['th', 'ボタン・機能', '使うとき', ''],
  ['td', 'HPを開く / Googleで調べる', 'どの候補か迷ったとき。会社概要の住所と候補の住所を見比べる', ''],
  ['td', '該当なし', 'どの候補も違うとき(🔴該当なしになる)', ''],
  ['td', 'スキップ → / ← 前へ', '後回しにしたいとき、前の行に戻りたいとき', ''],
  ['td', '法人番号を直接入力', '候補にないが法人番号が分かっているとき。13桁を入れて「検索」→「確定」', ''],
  ['td', 'この選択を覚える(チェック)', '標準でオン。次回から同じ会社を自動で🟢確定にする', ''],
  ['p', '「候補を取り直しています…」と出たときは、数秒待つと候補が表示されます。'],

  ['h2', '6. 補完辞書・やり直し・停止'],
  ['p', '補完辞書: 「覚える」にチェックを入れて確定すると、「補完辞書」シートに記録されます。次回からは、同じURL(ドメイン)または同じ社名＋都道府県の行が、検索せずに🟢確定になります。'],
  ['li', '間違えて覚えさせたときは、「補完辞書」シートのその行を削除してください'],
  ['li', '非表示の「_候補」シートはツールが候補を保存する場所です。編集・削除しないでください'],
  ['p', 'やり直し: 判定をやり直したい行を選んで(複数行可)、「↺ 選択した行をやり直す」→「▶ 補完を実行」。URLや住所を後から足した行は、この方法で再判定すると精度が上がります。'],
  ['p', '停止: 「⏹ 実行中の処理を止める」で自動の続き処理を止められます。もう一度「▶ 補完を実行」を押すと続きから再開します。'],

  ['h2', '7. 精度を上げるコツ'],
  ['p', '一番効くのは、URL列にHPのアドレスを入れることです。「WHERE」「メロウ」のような短い社名は同名の法人が全国に50〜90社あり、社名だけでは🟡要確認になります。'],
  ['li', 'URLを入れる: HPの会社概要から郵便番号・住所・法人番号を読み取り、自動で絞り込む'],
  ['li', '住所を入れる: 都道府県だけでも、同名の会社が他の県にある場合は絞り込める'],
  ['li', '登記上の社名を入れる: サービス名・略称よりも正式名称の方が当たりやすい'],
  ['p', 'HPが読み込めなかった場合は「判定の根拠」に「HPを読み込めず」と出ます。画像や動きの多いサイトは読めないことがあるので、住所列で補ってください。'],

  ['h2', '8. 困ったとき'],
  ['th', '症状', '対処', ''],
  ['td', 'メニューに「🏢 法人補完」が出ない', 'スプレッドシートを再読み込みして数秒待つ', ''],
  ['td', '「会社名の見出しがある列が見つかりません」', '1行目の見出しを「会社名」にする', ''],
  ['td', '「先に…IDを登録してください」', '管理者にAPIのID設定を依頼する', ''],
  ['td', '全部の行が⚠エラーで「IDが正しくありません」', '管理者にAPIのIDの確認を依頼する', ''],
  ['td', '一部の行が⚠エラー', 'もう一度「▶ 補完を実行」(エラーの行だけ再実行される)', ''],
  ['td', '候補の画面で赤字のエラーが出る', '画面を閉じて開き直す。直らなければエラー文を管理者に伝える', ''],
  ['td', '「行の並びが変わっています」', '候補の画面を開き直す(並べ替えや行の削除をしたときに出る)', ''],
  ['td', '🟢確定なのに違う会社だった', 'その行を「↺ やり直す」。辞書に記録されていれば「補完辞書」シートの該当行も削除する', ''],

  ['h2', '9. 注意事項'],
  ['li', '判定の実行中に、行の並べ替え・削除をしないでください。結果が別の行に書かれることがあります'],
  ['li', '🟢確定でも100%正しいとは限りません。契約や請求など重要な用途では、正式名称と住所を目で確認してください'],
  ['li', '法人番号を持たない個人事業主は、必ず🔴該当なしになります'],
  ['li', 'このマニュアルはメニューの「📖 マニュアルを表示」でいつでも作り直せます(このシートへの書き込みは上書きされます)'],
  ['p', 'このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない。']
];

function showManual() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(MANUAL_SHEET) || ss.insertSheet(MANUAL_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, sheet.getMaxRows(), MANUAL_WIDTHS.length).breakApart();
  sheet.setHiddenGridlines(true);
  MANUAL_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  var values = MANUAL_ROWS.map(manualCells);
  var all = sheet.getRange(1, 1, values.length, MANUAL_WIDTHS.length);
  all.setValues(values).setWrap(true).setVerticalAlignment('top').setFontSize(10);

  MANUAL_ROWS.forEach(function (r, i) {
    var row = sheet.getRange(i + 1, 1, 1, MANUAL_WIDTHS.length);
    var kind = r[0];
    var spans = kind === 'h1' || kind === 'h2' || kind === 'p' || kind === 'li';
    var lastFilled = r.slice(1).filter(function (c) { return c !== ''; }).length;
    if (spans) {
      row.merge();
    } else if (lastFilled === 2) {
      sheet.getRange(i + 1, 2, 1, 2).merge();
    }
    if (kind === 'h1') row.setFontSize(16).setFontWeight('bold');
    if (kind === 'h2') row.setFontSize(12).setFontWeight('bold').setBackground('#e8f0fe');
    if (kind === 'th') row.setFontWeight('bold').setBackground('#f1f3f4');
    if (kind === 'th' || kind === 'td') row.setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setFrozenRows(1);
  sheet.activate();
  sheet.setActiveRange(sheet.getRange(1, 1));
}

function manualCells(r) {
  var kind = r[0];
  var cells = r.slice(1);
  if (kind === 'li') cells = ['・' + cells[0]];
  while (cells.length < MANUAL_WIDTHS.length) cells.push('');
  return cells;
}
