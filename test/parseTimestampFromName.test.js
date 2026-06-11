// Tests for parseTimestampFromName in code.ts.
//
// Run with: npm test
//
// code.ts compiles to a plain (non-module) script because Figma's plugin
// sandbox doesn't support modules, so there is nothing to import. Instead
// this loads the compiled code.js with a stubbed `figma` global and grabs
// the function out of the eval scope. Requires `npm run build` first
// (npm test does this automatically).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codePath = path.join(__dirname, '..', 'code.js');
assert.ok(fs.existsSync(codePath), 'code.js not found — run `npm run build` first');
const src = fs.readFileSync(codePath, 'utf8');

global.figma = {
  showUI() {},
  on() {},
  ui: { postMessage() {}, set onmessage(_v) {} },
  currentPage: { selection: [] },
  notify() {},
  closePlugin() {},
};
global.__html__ = '';
eval(src + '\nglobal.__parse = parseTimestampFromName;');
const parse = global.__parse;

// Narrow no-break space — modern macOS puts this before AM/PM
const NNBSP = ' ';

// Expected values built the same way the parser builds them (local time)
function localTime(year, month, day, hour, minute, second) {
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

test('macOS 24h', () => {
  assert.equal(
    parse('Screenshot 2026-06-11 at 14.30.15'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
});

test('macOS 12h with narrow no-break space before AM/PM', () => {
  assert.equal(
    parse(`Screenshot 2026-06-11 at 10.15.30${NNBSP}AM`),
    localTime(2026, 6, 11, 10, 15, 30)
  );
  assert.equal(
    parse(`Screenshot 2026-06-11 at 1.05.30${NNBSP}PM`),
    localTime(2026, 6, 11, 13, 5, 30)
  );
});

test('macOS 12h with regular space before AM/PM', () => {
  assert.equal(
    parse('Screenshot 2026-06-11 at 10.15.30 PM'),
    localTime(2026, 6, 11, 22, 15, 30)
  );
});

test('12 AM is midnight, 12 PM is noon', () => {
  assert.equal(
    parse(`Screenshot 2026-06-11 at 12.00.01${NNBSP}AM`),
    localTime(2026, 6, 11, 0, 0, 1)
  );
  assert.equal(
    parse(`Screenshot 2026-06-11 at 12.00.01${NNBSP}PM`),
    localTime(2026, 6, 11, 12, 0, 1)
  );
});

test('PM sorts after AM from the same day (the original Tier 1 bug)', () => {
  const am = parse(`Screenshot 2026-06-11 at 10.15.30${NNBSP}AM`);
  const pm = parse(`Screenshot 2026-06-11 at 1.05.30${NNBSP}PM`);
  assert.ok(pm > am);
});

test('CleanShot X (matches the unanchored macOS pattern)', () => {
  assert.equal(
    parse('CleanShot 2026-06-11 at 14.30.15@2x'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
});

test('Android', () => {
  assert.equal(
    parse('Screenshot_20260611-143015'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
  assert.equal(
    parse('Screenshot_20260611_143015'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
});

test('ISO-like', () => {
  assert.equal(
    parse('2026-06-11-14-30-15'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
});

test('Windows Snipping Tool', () => {
  assert.equal(
    parse('Screenshot 2026-06-11 143015'),
    localTime(2026, 6, 11, 14, 30, 15)
  );
});

test('Shottr parses as midnight of the capture date', () => {
  assert.equal(parse('SCR-20260611-9482'), localTime(2026, 6, 11, 0, 0, 0));
});

test('names without a timestamp return null', () => {
  assert.equal(parse('IMG_1234'), null);
  assert.equal(parse('hero-banner-final'), null);
  assert.equal(parse('Rectangle 42'), null);
});

test('known false positive: any 8-digits + separator + 6-digits run parses (TODO Tier 3)', () => {
  // Documents current behavior, not desired behavior. If this starts
  // failing because the Android pattern got stricter, that's the Tier 3
  // fix landing — update this test to expect null.
  assert.equal(
    parse('invoice_20240203-101530_final'),
    localTime(2024, 2, 3, 10, 15, 30)
  );
});
