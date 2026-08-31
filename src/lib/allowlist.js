const KEY = 'allowlist';

/**
 * Get list.
 * @return {Promise<*|*[]>}
 */
export async function read() {
  const stored = await chrome.storage.sync.get(KEY);

  return Array.isArray(stored[KEY]) ? stored[KEY] : [];
}

/**
 * Add to list.
 * @param value
 * @return {Promise<*|*[]>}
 */
export async function add(value) {
  const domain = normalize(value);

  if (!domain) return read();

  const current = await read();

  if (current.includes(domain)) return current;

  const next = [...current, domain].sort();

  await chrome.storage.sync.set({ [KEY]: next });

  return next;
}

/**
 * Remove from list.
 * @param domain
 * @return {Promise<T[]>}
 */
export async function remove(domain) {
  const next = (await read()).filter((entry) => entry !== domain);

  await chrome.storage.sync.set({ [KEY]: next });

  return next;
}

/**
 * Check if in list.
 * @param domains
 * @param host
 * @return {*}
 */
export function has(domains, host) {
  const target = host.toLowerCase();

  return domains.some(
    (domain) =>
      target === domain ||
      (target.length > domain.length && target.endsWith(`.${domain}`)),
  );
}

/**
 * Normalize user domain input.
 * @param value
 * @return {string|null}
 */
export function normalize(value) {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!trimmed) return null;

  const host = trimmed.includes('://')
    ? hostOf(trimmed)
    : hostOf(`https://${trimmed}`);

  return host && host.includes('.') ? host : null;
}

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
