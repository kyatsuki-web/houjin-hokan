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
