const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['Normalize.js', 'Nta.js', 'Website.js', 'Match.js', 'Main.js', 'Review.js'];

function loadGas(globals = {}) {
  const ctx = vm.createContext({ ...globals });
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function response(code, body, headers = {}) {
  return {
    getResponseCode: () => code,
    getContentText: () => body,
    getHeaders: () => headers,
    getBlob: () => ({ getDataAsString: () => body })
  };
}

function corpXml(corps, count) {
  const items = corps
    .map((c) => `<corporation><corporateNumber>${c.corporateNumber}</corporateNumber><name>${c.name}</name>` +
      `<prefectureName>${c.prefectureName || ''}</prefectureName><cityName>${c.cityName || ''}</cityName>` +
      `<streetNumber>${c.streetNumber || ''}</streetNumber><postCode>${c.postCode || ''}</postCode>` +
      (c.closeDate ? `<closeDate>${c.closeDate}</closeDate>` : '<closeDate/>') + '</corporation>')
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><corporations><lastUpdateDate>2026-10-01</lastUpdateDate>` +
    `<count>${count == null ? corps.length : count}</count><divideNumber>1</divideNumber><divideSize>1</divideSize>${items}</corporations>`;
}

module.exports = { loadGas, response, corpXml };
