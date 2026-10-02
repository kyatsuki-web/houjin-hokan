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
