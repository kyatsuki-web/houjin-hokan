var STATUS = {
  OK: '🟢確定',
  REVIEW: '🟡要確認',
  NONE: '🔴該当なし',
  ERROR: '⚠エラー'
};
var CONFIRM_SCORE = 80;
var CONFIRM_GAP = 15;
var MIN_CANDIDATE_SCORE = 30;
var MAX_STORED_CANDIDATES = 20;
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
