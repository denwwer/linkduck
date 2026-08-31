export function createMatcher({ block, allow }) {
  return { clean };

  /**
   * Clean URL From trackers.
   * @param input
   * @param hostname
   * @return {*|string}
   */
  function clean(input, hostname) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return input;
    }

    const query = url.search;
    if (query.length < 2) {
      return input;
    }

    const host = url.hostname.toLowerCase();
    const href = url.href;
    const context = {
      href,
      docHost: (hostname ?? host).toLowerCase(),
      reqHost: host,
    };

    // An exception negates the rule carrying the same `$removeparam` value;
    // the naked `@@...$removeparam` form negates all of them at once.
    const negated = new Set();
    walk(allow, host, (bucket) => {
      for (const name of bucket.n) negated.add(name);
      for (const entry of bucket.r) {
        if (applies(entry, context)) negated.add(entry.k);
      }
    });

    if (negated.has('')) {
      return input;
    }

    const names = [];
    const rest = [];
    walk(block, host, (bucket) => {
      if (bucket.n.size ?? bucket.n.length) names.push(bucket.n);
      for (const entry of bucket.r) {
        if (applies(entry, context) && !negated.has(entry.k)) rest.push(entry);
      }
    });

    if (!names.length && !rest.length) {
      return input;
    }

    // Operate on the raw query string: rebuilding it through URLSearchParams
    // would re-encode parameters we are supposed to leave untouched.
    const pairs = query.slice(1).split('&');
    const kept = pairs.filter((pair) => pair !== '' && !dropped(pair));

    if (kept.length === pairs.length) {
      return input;
    }

    const head = href.slice(0, href.length - query.length - url.hash.length);
    return kept.length
      ? `${head}?${kept.join('&')}${url.hash}`
      : head + url.hash;

    function dropped(pair) {
      // Normalize and decode once per parameter, not once per rule: rules are
      // matched against `name=value`, and against its decoded form so an
      // encoded URL still matches a rule written in plain text.
      const norm = pair.includes('=') ? pair : `${pair}=`;
      const plain = decode(norm);
      const name = paramName(norm);
      const plainName = plain === norm ? name : paramName(plain);

      if (!negated.has(name) && names.some((n) => holds(n, name, plainName))) {
        return true;
      }

      return rest.some((entry) => drops(entry, norm, plain));
    }
  }
}

// The `any` bucket is a Set of a few hundred names; host buckets average two
// names, where a plain array both searches and builds faster.
function holds(namesq, name, plain) {
  return namesq instanceof Set
    ? namesq.has(name) || (plain !== name && namesq.has(plain))
    : namesq.includes(name) || (plain !== name && namesq.includes(plain));
}

// Visit the buckets that can apply to `host`, walking it up label by label so
// a `||example.com^` rule also covers `a.b.example.com`.
function walk(index, host, visit) {
  visit(index.any);

  let suffix = host;
  while (suffix) {
    const bucket = index.hosts[suffix];
    if (bucket) visit(bucket);

    const dot = suffix.indexOf('.');
    if (dot === -1) break;
    suffix = suffix.slice(dot + 1);
  }
}

function applies(entry, { href, docHost, reqHost }) {
  if (entry.u && !entry.u.test(href)) return false;
  // `$domain` is the page the request came from, `$denyallow` the target.
  if (entry.d && !inDomains(entry.d, docHost)) return false;
  if (entry.nd && inDomains(entry.nd, docHost)) return false;
  if (entry.da && inDomains(entry.da, reqHost)) return false;
  return true;
}

// `norm` is the `name=value` pair, `plain` its decoded form. A `null` pattern
// is the naked `$removeparam`, which takes everything.
function drops(entry, norm, plain) {
  if (!entry.p) return true;

  const hit = entry.p.test(norm) || (plain !== norm && entry.p.test(plain));

  return entry.inv ? !hit : hit;
}

// `domain=example.com` covers its subdomains too.
function inDomains(domains, host) {
  return domains.some(
    (domain) =>
      host === domain ||
      (host.length > domain.length && host.endsWith(`.${domain}`)),
  );
}

function paramName(pair) {
  const eq = pair.indexOf('=');
  return eq === -1 ? pair : pair.slice(0, eq);
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
