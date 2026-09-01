import { afterEach, beforeEach, expect, describe, test, vi } from 'vitest';

// chrome.storage mock
let local;
let sync;
let stats;

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

function area(store) {
  return {
    get: async (key) => (key in store ? { [key]: store[key] } : {}),
    set: async (values) => Object.assign(store, values),
  };
}

beforeEach(async () => {
  local = {};
  sync = {};

  globalThis.chrome = {
    runtime: { id: 'test' },
    storage: { local: area(local), sync: area(sync) },
  };

  // module keeps a pool and a cached install id between calls
  vi.resetModules();
  stats = await import('../src/lib/stats.js');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('read', () => {
  test('no data yet', async () => {
    expect(await stats.read()).toEqual({ day: today(), today: 0, total: 0 });
  });

  test('adds other devices to the local total', async () => {
    local.stats = { day: today(), today: 3, total: 10 };
    sync.totals = { other: 5, another: 7 };

    expect(await stats.read()).toEqual({ day: today(), today: 3, total: 22 });
  });

  test('own synced entry does not double count', async () => {
    local.stats = { day: today(), today: 3, total: 10 };
    local.syncId = 'me';
    sync.totals = { me: 8, other: 5 };

    // 8 is a stale copy of the local 10
    expect((await stats.read()).total).toBe(15);
  });

  test('ignores malformed remote entries', async () => {
    local.stats = { day: today(), today: 0, total: 4 };
    sync.totals = { other: 'nope', another: null, ok: 6 };

    expect((await stats.read()).total).toBe(10);
  });

  test('new day resets today and keeps totals', async () => {
    local.stats = { day: '2000-01-01', today: 99, total: 10 };
    sync.totals = { other: 5 };

    expect(await stats.read()).toEqual({ day: today(), today: 0, total: 15 });
  });
});

describe('counted', () => {
  test('pools increments into a single local write', async () => {
    vi.useFakeTimers();

    stats.counted();
    stats.counted();
    stats.counted();

    expect(local.stats).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2000);

    expect(local.stats).toEqual({ day: today(), today: 3, total: 3 });
  });

  test('pushes this device total to sync', async () => {
    vi.useFakeTimers();

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    expect(sync).toEqual({ totals: { [local.syncId]: 1 } });
  });

  test('drops the oldest device once the map is full', async () => {
    vi.useFakeTimers();

    local.syncId = 'me';
    sync.totals = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`d${i}`, 1]),
    );

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    const keys = Object.keys(sync.totals);

    expect(keys).toHaveLength(30);
    expect(keys).not.toContain('d0');
    expect(keys).toContain('d1');
    expect(sync.totals.me).toBe(1);
  });

  test('drops nothing when this device already holds a slot', async () => {
    vi.useFakeTimers();

    local.syncId = 'me';
    sync.totals = {
      ...Object.fromEntries(Array.from({ length: 29 }, (_, i) => [`d${i}`, 1])),
      me: 5,
    };

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    expect(Object.keys(sync.totals)).toHaveLength(30);
    expect(sync.totals.d0).toBe(1);
    expect(sync.totals.me).toBe(1);
  });

  test('sync push is throttled, local write is not', async () => {
    vi.useFakeTimers();

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    const at = local.syncedAt;

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    expect(local.stats.total).toBe(2);
    expect(sync.totals[local.syncId]).toBe(1);
    expect(local.syncedAt).toBe(at);

    // past SYNC_DELAY the next flush publishes again
    await vi.advanceTimersByTimeAsync(300000);
    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    expect(sync.totals[local.syncId]).toBe(3);
  });

  test('keeps the count when the local write fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    chrome.storage.local.set = async () => {
      throw new Error('quota');
    };

    stats.counted();
    await vi.advanceTimersByTimeAsync(2000);

    chrome.storage.local.set = area(local).set;

    await vi.advanceTimersByTimeAsync(2000);

    expect(local.stats.total).toBe(1);
  });
});
