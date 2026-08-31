const TRACKING = /^utm_/i;

/**
 * Remove `utm_*` parameters from a URL's fragment.
 *
 * Run after `matcher.clean`, which handles the query string.
 *
 * @param {string} input
 * @returns {string} The URL without fragment campaign parameters.
 */
export function cleanHash(input) {
  let url;

  try {
    url = new URL(input);
  } catch {
    return input;
  }

  const hash = strip(url.hash);

  if (hash === url.hash) return input;

  const href = url.href;

  return href.slice(0, href.length - url.hash.length) + hash;
}

function strip(hash) {
  const body = hash.slice(1);

  if (!body) return hash;

  // Everything before the first `?` is the route. Without one the fragment is
  // treated as parameters only if it actually looks like a pair list, so a
  // plain `#products` is never touched.
  const mark = body.indexOf('?');
  const route = mark === -1 ? '' : body.slice(0, mark);
  const query = mark === -1 ? body : body.slice(mark + 1);

  if (!query.includes('=')) return hash;

  const pairs = query.split('&');
  const kept = pairs.filter(
    (pair) => pair !== '' && !TRACKING.test(paramName(pair)),
  );

  if (kept.length === pairs.length) return hash;

  const rest = kept.join('&');

  if (!rest) return route ? `#${route}` : '';

  return mark === -1 ? `#${rest}` : `#${route}?${rest}`;
}

function paramName(pair) {
  const eq = pair.indexOf('=');

  return eq === -1 ? pair : pair.slice(0, eq);
}
