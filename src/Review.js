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
    var entry = store.entries[storeKey(sheet.getName(), row)];
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
  delete store.entries[storeKey(sheet.getName(), row)];
  saveCandidateStore(store);
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
