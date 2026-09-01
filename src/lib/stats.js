const KEY = 'stats';
const ID_KEY = 'syncId';
const AT_KEY = 'syncedAt';
const SYNC_KEY = 'totals';

const FLUSH_DELAY = 2000;
const SYNC_DELAY = 300000; // 5min
const MAX_DEVICES = 30;

let pool = 0;
let flush = null;
let id = null;

/**
 * Check if content.js can reach extension.
 */
function connected() {
  return Boolean(chrome.runtime?.id);
}

/**
 * Update stats.
 */
export function counted() {
  if (!connected()) return;

  pool += 1;

  schedule();
}

// collect in pool to avoid "to many writes"
function schedule() {
  flush ||= setTimeout(() => {
    const count = pool;

    pool = 0;
    flush = null;

    if (!connected()) return;

    record(count).catch((e) => {
      // Keep the count and retry on the next flush.
      pool += count;

      if (!connected()) return;

      console.error('flush stats', e);
      schedule();
    });
  }, FLUSH_DELAY);
}

async function record(count = 1) {
  const current = await own();
  const next = {
    day: current.day,
    today: current.today + count,
    total: current.total + count,
  };

  await chrome.storage.local.set({ [KEY]: next });

  // A failed push must not lose the count already stored above.
  push(next.total).catch((e) => {
    if (connected()) console.error('push stats', e);
  });

  return next;
}

/**
 * Publish this device's total to sync storage, at most once per SYNC_DELAY.
 * @param total
 * @return {Promise<void>}
 */
async function push(total) {
  const stored = await chrome.storage.local.get(AT_KEY);

  if (Date.now() - (stored[AT_KEY] ?? 0) < SYNC_DELAY) return;

  const device = await installId();
  const synced = await chrome.storage.sync.get(SYNC_KEY);
  const remote = synced[SYNC_KEY] ?? {};

  if (remote[device] !== total) {
    const next = { ...remote, [device]: total };
    const excess = Object.keys(next).length - MAX_DEVICES;

    if (excess > 0) {
      const stale = Object.keys(next)
        .filter((key) => key !== device)
        .slice(0, excess);

      for (const key of stale) delete next[key];
    }

    await chrome.storage.sync.set({ [SYNC_KEY]: next });
  }

  await chrome.storage.local.set({ [AT_KEY]: Date.now() });
}

/**
 * Stable id for this install, so a device only ever updates its own total.
 * @return {Promise<string>}
 */
function installId() {
  id ||= (async () => {
    const stored = await chrome.storage.local.get(ID_KEY);

    if (stored[ID_KEY]) return stored[ID_KEY];

    const fresh = crypto.randomUUID();

    await chrome.storage.local.set({ [ID_KEY]: fresh });

    return fresh;
  })().catch((e) => {
    // Retry on the next push rather than wedging the id forever.
    id = null;

    throw e;
  });

  return id;
}

/**
 * Read this device's stats.
 * @return {Promise<{day: string, today: number, total: number}>}
 */
async function own() {
  const stored = await chrome.storage.local.get(KEY);

  return rollOver(stored[KEY]);
}

/**
 * Read stats, with `total` summed across every synced device.
 * @return {Promise<{day: string, today: number, total: number}>}
 */
export async function read() {
  const [stats, device, synced] = await Promise.all([
    own(),
    installId(),
    chrome.storage.sync.get(SYNC_KEY),
  ]);

  const remote = synced[SYNC_KEY] ?? {};
  let others = 0;

  for (const [key, value] of Object.entries(remote)) {
    // This device's own entry is up to SYNC_DELAY stale; use the local one.
    if (key !== device && Number.isFinite(value)) others += value;
  }

  return { ...stats, total: stats.total + others };
}

/**
 * Store 24h and total cleaned links metrics.
 * @param stats
 * @return {*|{day: string, today: number, total}}
 */
function rollOver(stats) {
  const day = new Intl.DateTimeFormat('en-CA').format(new Date());

  return stats?.day === day
    ? stats
    : { day, today: 0, total: stats?.total ?? 0 };
}
