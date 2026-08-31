import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DomainListParser, RuleParser } from '@adguard/agtree/parser';
import { PIPE_MODIFIER_SEPARATOR, RegExpUtils } from '@adguard/agtree/utils';
import { stringify } from 'javascript-stringify';

const SECTIONS = ['general_url.txt', 'specific.txt', 'allowlist.txt'];
const RULES_DIR = 'rules';
const UPSTREAM =
  'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/TrackParamFilter/sections';
const OUTPUT = 'src/lib/tracking-rules.js';

const SUPPORTED = new Set(['removeparam', 'domain', 'denyallow', 'document']);

const rules = {
  version: 1,
  block: { any: bucket(), hosts: {} },
  allow: { any: bucket(), hosts: {} },
};

function bucket() {
  return { n: [], r: [] };
}

const stats = { lines: 0, kept: 0, unsupported: new Map(), failed: [] };

for (const section of SECTIONS) {
  const source = `${RULES_DIR}/${section}`;
  const content = await readRuleset(section, source);

  for (const line of content.split(/\r?\n/)) {
    parseLine(line.trim(), source);
  }
}

async function readRuleset(section, source) {
  try {
    return await readFile(source, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const url = `${UPSTREAM}/${section}`;
  console.log(`Downloading ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  await mkdir(RULES_DIR, { recursive: true });
  await writeFile(source, content);

  return content;
}

function parseLine(line, source) {
  if (!line || line.startsWith('!') || line.startsWith('#')) {
    return;
  }

  stats.lines++;

  let ast;
  try {
    ast = RuleParser.parse(line);
  } catch (error) {
    stats.failed.push(`${source}: ${line} (${error.message})`);
    return;
  }

  const modifiers = ast.modifiers?.children ?? [];
  const removeparam = modifiers.find((m) => m.name.value === 'removeparam');

  if (!removeparam) {
    return;
  }

  for (const modifier of modifiers) {
    const name = modifier.name.value;
    if (!SUPPORTED.has(name)) {
      stats.unsupported.set(name, (stats.unsupported.get(name) ?? 0) + 1);
      return;
    }
  }

  // The raw `$removeparam` value, kept verbatim: it doubles as the identity an
  // exception rule negates. '' - meaning every parameter.
  const entry = { k: removeparam.value?.value ?? '' };

  if (!validParamRegex(entry.k)) {
    stats.failed.push(`${source}: ${line} (bad removeparam regexp)`);
    return;
  }

  const domain = modifierValue(modifiers, 'domain');
  if (domain) {
    const { include, exclude } = splitDomains(domain);
    if (include.length) entry.d = include;
    if (exclude.length) entry.nd = exclude;
  }

  const denyallow = modifierValue(modifiers, 'denyallow');
  if (denyallow) {
    entry.da = splitDomains(denyallow).include;
  }

  const pattern = ast.pattern?.value ?? '';
  const { host, rest } = splitHostAnchor(pattern);

  // A bare `||host^` needs no URL regex: the host index already answers it.
  if (pattern && !(host && (rest === '' || rest === '^'))) {
    entry.u = RegExpUtils.patternToRegexp(pattern);

    if (!compiles(entry.u)) {
      stats.failed.push(`${source}: ${line} (bad pattern regexp)`);
      return;
    }
  }

  const index = ast.exception ? rules.allow : rules.block;
  const target = host ? (index.hosts[host] ??= bucket()) : index.any;

  if (isPlainName(entry)) {
    target.n.push(entry.k);
  } else {
    entry.p = paramRegex(entry.k);
    if (entry.k.startsWith('~')) entry.inv = true;
    target.r.push(entry);
  }

  stats.kept++;
}

// The regexp a rule tests each `name=value` pair against. `null` = `$removeparam`,
// which takes every parameter. A plain name is normalized the
// way AdGuard normalizes it, so one runtime path covers both forms.
function paramRegex(k) {
  const value = k.startsWith('~') ? k.slice(1) : k;

  if (value === '') {
    return null;
  }

  return RegExpUtils.isRegexPattern(value)
    ? value.slice(1, -1)
    : `^${escapeRegex(value)}=[^&#]*$`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// True when the rule drops one named parameter with nothing else to check.
function isPlainName(entry) {
  return (
    entry.k !== '' &&
    !entry.k.startsWith('~') &&
    !RegExpUtils.isRegexPattern(entry.k) &&
    !entry.u &&
    !entry.d &&
    !entry.nd &&
    !entry.da
  );
}

function modifierValue(modifiers, name) {
  return modifiers.find((m) => m.name.value === name)?.value?.value ?? null;
}

// Reject upstream regexps the runtime could not compile, so a single bad rule
// cannot take the whole matcher down.
function validParamRegex(value) {
  const body = value.startsWith('~') ? value.slice(1) : value;

  return RegExpUtils.isRegexPattern(body) ? compiles(body.slice(1, -1)) : true;
}

function compiles(source) {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

function splitDomains(value) {
  const include = [];
  const exclude = [];
  const list = DomainListParser.parse(
    value,
    undefined,
    0,
    PIPE_MODIFIER_SEPARATOR,
  );

  for (const domain of list.children) {
    (domain.exception ? exclude : include).push(domain.value.toLowerCase());
  }

  return { include, exclude };
}

// Pull the `||host` anchor off a pattern so it can be indexed by host.
// Host is `null` when the pattern is not host-anchored, in which case the whole
// pattern falls back to a regex tested against the full URL.
function splitHostAnchor(pattern) {
  if (!pattern.startsWith('||')) {
    return { host: null, rest: pattern };
  }

  let i = 2;
  while (i < pattern.length && !'/^*|'.includes(pattern[i])) {
    i++;
  }

  const host = pattern.slice(2, i).toLowerCase();

  return host
    ? { host, rest: pattern.slice(i) }
    : { host: null, rest: pattern };
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, serialize());

// Generate rules list.
function serialize() {
  return `// Generated by scripts/rules.js from the AdGuard TrackParamFilter.
// Do not edit; run \`npm run rules\` instead.

export const version = ${rules.version};

export const block = ${serializeList(rules.block)};

export const allow = ${serializeList(rules.allow)};
`;
}

function serializeList(list) {
  return stringify({
    any: runtimeBucket(list.any, true),
    hosts: Object.fromEntries(
      Object.entries(list.hosts).map(([host, b]) => [
        host,
        runtimeBucket(b, false),
      ]),
    ),
  });
}

function runtimeBucket(b, asSet) {
  return {
    n: asSet ? new Set(b.n) : b.n,
    r: b.r.map((entry) => ({
      ...entry,
      p: entry.p === null ? null : new RegExp(entry.p),
      ...(entry.u ? { u: new RegExp(entry.u) } : {}),
    })),
  };
}

const size = (b) => b.n.length + b.r.length;
const count = (index) =>
  size(index.any) + Object.values(index.hosts).reduce((n, b) => n + size(b), 0);

console.log(
  `Parsed ${stats.lines} rules -> ${stats.kept} kept ` +
    `(${count(rules.block)} block, ${count(rules.allow)} allow) ` +
    `across ${Object.keys(rules.block.hosts).length} hosts -> ${OUTPUT}`,
);

if (stats.unsupported.size) {
  const summary = [...stats.unsupported]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name}=${n}`)
    .join(' ');
  console.log(`Skipped, unsupported modifier: ${summary}`);
}

for (const failure of stats.failed) {
  console.warn(`Skipped, parse error: ${failure}`);
}
