// Counter for how many URLs the extension has stripped.

const KEY = 'stats';
const FLUSH_DELAY = 2000;

let pool = 0;
let flush = null;

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

  // collect in pool to avoid "to many writes"
  flush ||= setTimeout(() => {
    const count = pool;

    pool = 0;
    flush = null;

    if (!connected()) return;

    record(count).catch((e) => {
      if (!connected()) return;

      console.error('flush stats', e);
    });
  }, FLUSH_DELAY);
}

async function record(count = 1) {
  const current = await read();
  const next = {
    day: current.day,
    today: current.today + count,
    total: current.total + count,
  };

  await chrome.storage.local.set({ [KEY]: next });

  return next;
}

/**
 * Read stats.
 * @return {Promise<*|{day: string, today: number, total}>}
 */
export async function read() {
  const stored = await chrome.storage.local.get(KEY);

  return rollOver(stored[KEY]);
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
