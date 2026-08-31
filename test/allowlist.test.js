import { beforeEach, expect, describe, test } from 'vitest';
import { add, has, normalize, read, remove } from '../src/lib/allowlist.js';

// chrome.storage.sync mock
let store;

beforeEach(() => {
  store = {};

  globalThis.chrome = {
    storage: {
      sync: {
        get: async (key) => ({ [key]: store[key] }),
        set: async (values) => Object.assign(store, values),
      },
    },
  };
});

describe('has', () => {
  test('host exact', () => {
    expect(has(['example.com'], 'example.com')).toBe(true);
  });

  test('subdomain covered', () => {
    expect(has(['example.com'], 'shop.example.com')).toBe(true);
  });

  test('suffix that is not a subdomain', () => {
    expect(has(['example.com'], 'notexample.com')).toBe(false);
  });

  test('ignore case', () => {
    expect(has(['example.com'], 'Shop.EXAMPLE.com')).toBe(true);
  });
});

describe('normalize', () => {
  test('URL down to host', () => {
    expect(normalize(' https://sub.Example.com:8080/p?x=1')).toBe(
      'sub.example.com',
    );
  });
});

describe('sore', () => {
  test('add', async () => {
    await add('https://zeta.example/p');
    await add('Alpha.example');

    expect(await read()).toEqual(['alpha.example', 'zeta.example']);
  });

  test('remove', async () => {
    await add('example.com');
    await add('other.example');

    expect(await remove('example.com')).toEqual(['other.example']);
    expect(await read()).toEqual(['other.example']);
  });
});
