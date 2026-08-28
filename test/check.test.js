import { expect, test } from 'vitest';
import { createMatcher } from '../src/lib/matcher.js';
import * as rules from '../src/lib/tracking-rules.js';

const real = createMatcher(rules);

// ---- the KB's own negation example --------------------------------------
// $removeparam=/^(gclid|yclid|fbclid)=/
// @@||example.com^$removeparam=/^(gclid|yclid|fbclid)=/
// ||example.com^$removeparam=/^(yclid|fbclid)=/
const S = (n = [], r = []) => ({ n: new Set(n), r });
const B = (n = [], r = []) => ({ n, r });
const re = (k) => ({
  k,
  p: new RegExp(k.replace(/^~/, '').slice(1, -1)),
  ...(k.startsWith('~') ? { inv: true } : {}),
});
const nm = (k) => ({
  k,
  p: new RegExp(`^${k.replace(/^~/, '')}=[^&#]*$`),
  ...(k.startsWith('~') ? { inv: true } : {}),
});
const doc = createMatcher({
  block: {
    any: S([], [re('/^(gclid|yclid|fbclid)=/')]),
    hosts: { 'example.com': B([], [re('/^(yclid|fbclid)=/')]) },
  },
  allow: {
    any: S(),
    hosts: { 'example.com': B([], [re('/^(gclid|yclid|fbclid)=/')]) },
  },
});

test('click ids stripped everywhere else', () => {
  expect(doc.clean('https://other.test/p?gclid=1&yclid=2&fbclid=3&a=4')).toBe(
    'https://other.test/p?a=4',
  );
});

test('KB: on example.com only gclid survives', () => {
  expect(doc.clean('https://example.com/p?gclid=1&yclid=2&fbclid=3&a=4')).toBe(
    'https://example.com/p?gclid=1&a=4',
  );
});

// KB: "$removeparam=/^utm_source=campaign$/ removes utm_source with the value
// equal to campaign. It does not touch other utm_source parameters."
const valued = createMatcher({
  block: { any: S([], [re('/^utm_source=campaign$/')]), hosts: {} },
  allow: { any: S(), hosts: {} },
});

test('KB: regexp matches name=value', () => {
  expect(valued.clean('https://x.test/p?utm_source=campaign')).toBe(
    'https://x.test/p',
  );
});

test('KB: other value untouched', () => {
  expect(valued.clean('https://x.test/p?utm_source=other')).toBe(
    'https://x.test/p?utm_source=other',
  );
});

// KB: "$removeparam=~param removes all query parameters with the name
// different from param."
const inverted = createMatcher({
  block: { any: S(), hosts: { 'go.test': B([], [nm('~r')]) } },
  allow: { any: S(), hosts: {} },
});

test('KB: name different from param', () => {
  expect(inverted.clean('https://go.test/p?r=1&a=2&b=3')).toBe(
    'https://go.test/p?r=1',
  );
});

// KB: regexps are matched against `name=value`, so a valueless parameter is
// normalized to `name=` first.
const valueless = createMatcher({
  block: { any: S([], [re('/^ref=/')]), hosts: {} },
  allow: { any: S(), hosts: {} },
});

test('valueless param normalized to name=', () => {
  expect(valueless.clean('https://x.test/p?ref&a=1')).toBe(
    'https://x.test/p?a=1',
  );
});

// Percent-encoded parameter name still matches a plain-text rule.
const encoded = createMatcher({
  block: { any: S(['utm_source']), hosts: {} },
  allow: { any: S(), hosts: {} },
});

test('encoded param name matches plain rule', () => {
  expect(encoded.clean('https://x.test/p?utm%5Fsource=a&b=2')).toBe(
    'https://x.test/p?b=2',
  );
});

test('malformed escape does not throw', () => {
  expect(encoded.clean('https://x.test/p?%zz=1&utm_source=a')).toBe(
    'https://x.test/p?%zz=1',
  );
});

test('global utm_source stripped', () => {
  expect(real.clean('https://foo.example/page?utm_source=x&keep=1')).toBe(
    'https://foo.example/page?keep=1',
  );
});

test('subdomain inherits ||bandsintown.com^ rule', () => {
  expect(real.clean('https://www.bandsintown.com/e/1?actor_id=9&ok=2')).toBe(
    'https://www.bandsintown.com/e/1?ok=2',
  );
});

test('unrelated host untouched by bandsintown rule', () => {
  expect(real.clean('https://notbandsintown.com/e/1?actor_id=9')).toBe(
    'https://notbandsintown.com/e/1?actor_id=9',
  );
});

test('all params gone -> no ?', () => {
  expect(real.clean('https://foo.example/page?utm_source=x')).toBe(
    'https://foo.example/page',
  );
});

test('hash preserved', () => {
  expect(real.clean('https://foo.example/p?utm_source=x&a=1#frag')).toBe(
    'https://foo.example/p?a=1#frag',
  );
});

test('hash preserved when query empties', () => {
  expect(real.clean('https://foo.example/p?utm_source=x#frag')).toBe(
    'https://foo.example/p#frag',
  );
});

test('encoding untouched', () => {
  expect(real.clean('https://foo.example/p?q=a%20b+c&utm_source=x')).toBe(
    'https://foo.example/p?q=a%20b+c',
  );
});

test('no query -> unchanged', () => {
  expect(real.clean('https://foo.example/p')).toBe('https://foo.example/p');
});

test('non-url -> unchanged', () => {
  expect(real.clean('not a url')).toBe('not a url');
});

test('allowlist: @@||metabase.com^$removeparam=utm_term keeps utm_term only', () => {
  expect(real.clean('https://metabase.com/p?utm_term=a&utm_source=b')).toBe(
    'https://metabase.com/p?utm_term=a',
  );
});

test('allowlist: naked @@...$removeparam exempts whole URL', () => {
  expect(real.clean('https://dashboard.wedare.pl/p?utm_source=a&gclid=b')).toBe(
    'https://dashboard.wedare.pl/p?utm_source=a&gclid=b',
  );
});

test('domain= exception applies on that page', () => {
  expect(
    real.clean('https://shop.example/p?utm_medium=a', 'other.example'),
  ).toBe('https://shop.example/p');
});
