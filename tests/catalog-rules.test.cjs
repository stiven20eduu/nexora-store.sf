const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Precios e identificadores de los cinco juegos coinciden con el catálogo', () => {
  const html = read('juego.html');
  const source = read('catalogo-oficial.js');
  const match = source.match(/Object\.freeze\((\[[\s\S]*?\])\s*\)/);
  assert.ok(match, 'No se encontró el catálogo');
  const catalog = JSON.parse(match[1]);
  const games = ['free-fire', 'blood-strike', 'mobile-legends', 'roblox', 'fc-mobile'];
  let count = 0;

  for (let i = 0; i < games.length; i++) {
    const key = games[i];
    const start = html.indexOf('"' + key + '": {');
    const end = i < games.length - 1
      ? html.indexOf('"' + games[i + 1] + '": {', start)
      : html.indexOf('\n};', start);
    assert.ok(start >= 0 && end > start, 'Falta el juego: ' + key);
    const visible = [...html.slice(start, end).matchAll(/\[\s*"([^"]+)"\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)]
      .map(m => ({ name: m[1], cents: Math.round(Number(m[2]) * 100) }));
    const official = catalog.filter(item => item.gameKey === key);
    assert.ok(visible.length > 0, 'Sin productos para ' + key);
    assert.equal(visible.length, official.length, 'Diferente cantidad para ' + key);
    for (const item of visible) {
      const product = official.find(p => p.product === item.name);
      assert.ok(product, 'Producto ausente: ' + key + ' / ' + item.name);
      assert.equal(product.priceCents, item.cents, 'Precio distinto: ' + item.name);
      assert.equal(product.id, encodeURIComponent(key + '::' + item.name), 'ID incorrecto: ' + item.name);
      count++;
    }
  }
  assert.equal(count, catalog.length, 'Hay productos extra en catálogo');
});

test('Reglas Firestore sin duplicados y con validación completa de Roblox', () => {
  const rules = read('firestore.rules');
  const count = str => rules.split(str).length - 1;
  assert.equal(count('function isWalletAdmin()'), 1);
  assert.equal(count('match /yapeTopups/{topupId}'), 1);
  assert.equal(count('match /catalogPrices/{productId}'), 1);
  assert.ok(rules.includes("redemptionCode.matches('^[A-Za-z0-9][A-Za-z0-9-]{7,79}$')"));
  assert.ok(rules.includes('request.resource.data.redemptionAddedAt == request.time'));
  assert.ok(rules.trimEnd().endsWith('}'));
});
