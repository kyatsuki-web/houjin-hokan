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
