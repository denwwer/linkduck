import * as rules from '../lib/tracking-rules.js';
import { createMatcher } from '../lib/matcher.js';
import { counted } from '../lib/stats.js';
import { has, read as readAllowlist } from '../lib/allowlist.js';
import { cleanHash } from '../lib/hash.js';
import {decodeUriRedirect} from "./util.js";

const YOUTUBE_REDIRECT_URL = 'https://www.youtube.com/redirect';
const GOOGLE_AD_URL = 'https://www.googleadservices.com/';

const TRIGGERS = ['pointerover', 'contextmenu'];

const matcher = createMatcher(rules);

const destinations = new WeakMap(); // WeakMap to cleanup mem

// Read once and kept in sync, so the hover path stays synchronous. Until the
// first read resolves nothing is allowed, which errs towards cleaning.
let allowlist = [];

readAllowlist().then((domains) => {
  allowlist = domains;
});

// eslint-disable-next-line no-undef
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.allowlist) {
    allowlist = changes.allowlist.newValue ?? [];
  }
});

function clearRedirect(node, qParm, nestedFn) {
  let rUrl;

  try {
    rUrl = new URL(node.href).searchParams.get(qParm);
  } catch {
    return;
  }

  if (nestedFn) {
    rUrl = nestedFn(rUrl);
  }

  if (!rUrl) return;

  let host;

  try {
    host = new URL(rUrl).hostname;
  } catch {
    return;
  }

  // Unwrap the redirect either way — that cannot break the destination — but
  // leave an allowlisted target's own parameters alone.
  // `cleanHash` runs after the rules, which only cover the query string.
  const cleaned = has(allowlist, host)
    ? rUrl
    : cleanHash(matcher.clean(rUrl, location.hostname)); // hostname here is required

  counted();

  rUrl = cleaned;

  destinations.set(node, rUrl);
  node.href = rUrl;
}

function onLink(event) {
  let node = event.target?.closest?.(`a[href^='${YOUTUBE_REDIRECT_URL}']`);
  if (node) {
    clearRedirect(node, 'q');
    return;
  }

  node = event.target?.closest?.(`a[href^='${GOOGLE_AD_URL}']`);
  if (node) {
    clearRedirect(node, 'ai', decodeUriRedirect);
  }
}

function onClick(event) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const link = event.target?.closest?.('a');
  const target = link && destinations.get(link);

  if (!target) return;

  // run before youtube own delegated handler
  event.preventDefault();
  event.stopImmediatePropagation();

  window.open(target, '_blank');
}

for (const type of TRIGGERS) {
  document.addEventListener(type, onLink, true);
}

document.addEventListener('click', onClick, true);
