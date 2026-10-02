var CSV_HEADERS = ['法人番号', '企業名', '住所'];

function csvField(v) {
  var s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(rows) {
  return [CSV_HEADERS].concat(rows).map(function (r) { return r.map(csvField).join(','); }).join('\r\n') + '\r\n';
}

function confirmedRows(sheet) {
  var cols = detectColumns(sheet);
  if (cols.output < 0 || sheet.getLastRow() < 2) return [];
  var out = sheet.getRange(2, cols.output + 1, sheet.getLastRow() - 1, OUTPUT_HEADERS.length).getValues();
  return out.filter(function (v) { return v[0] === STATUS.OK && v[2]; })
    .map(function (v) { return [String(v[2]), String(v[3]), String(v[4])]; });
}

function exportCsv() {
  var ui = SpreadsheetApp.getUi();
  var rows = confirmedRows(SpreadsheetApp.getActiveSheet());
  if (!rows.length) {
    ui.alert('このシートに' + STATUS.OK + 'の行がありません。先に「補完を実行」してください');
    return;
  }
  ui.showModalDialog(HtmlService.createHtmlOutput(CSV_DIALOG_HTML).setWidth(360).setHeight(160), 'CSVを出力');
}

function getCsvExport() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var rows = confirmedRows(sheet);
  var date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  // 日本語のファイル名はブラウザによって「download」に置き換えられるため英数字にする
  return { filename: 'houjin_bangou_' + date + '.csv', csv: buildCsv(rows), count: rows.length };
}

// HtmlService は script 内の文字列にあるタグを HTML として解釈して壊すため、画面部品は DOM で組み立てる
var CSV_DIALOG_HTML = [
  '<div id="msg" style="font:13px sans-serif;margin-bottom:12px">準備中…</div>',
  '<button id="dl" style="display:none;padding:8px 16px;font-size:13px">もう一度ダウンロード</button>',
  '<script>',
  'var data;',
  'function save() {',
  '  var blob = new Blob(["\\ufeff" + data.csv], { type: "text/csv;charset=utf-8" });',
  '  var a = document.createElement("a");',
  '  a.href = URL.createObjectURL(blob);',
  '  a.download = data.filename;',
  '  document.body.appendChild(a);',
  '  a.click();',
  '  a.remove();',
  '}',
  'google.script.run.withSuccessHandler(function (d) {',
  '  data = d;',
  '  document.getElementById("msg").textContent = d.count + "件を「" + d.filename + "」として保存しました。保存されない場合は下のボタンを押してください。";',
  '  var b = document.getElementById("dl");',
  '  b.style.display = "inline-block";',
  '  b.onclick = save;',
  '  save();',
  '}).withFailureHandler(function (e) {',
  '  document.getElementById("msg").textContent = "エラー: " + (e.message || e);',
  '}).getCsvExport();',
  '</script>'
].join('\n');
