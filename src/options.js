import { add, normalize, read, remove } from './lib/allowlist.js';

const form = document.getElementById('allow-form');
const input = document.getElementById('allow-input');
const error = document.getElementById('allow-error');
const list = document.getElementById('allow-list');
const empty = document.getElementById('allow-empty');

// localize text
const labels = [
  document.getElementById('allowlist-title'),
  document.getElementById('allowlist-desc'),
  empty,
];

function fail(message) {
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}

function render(domains) {
  list.replaceChildren();
  empty.classList.toggle('hidden', domains.length > 0);

  for (const domain of domains) {
    const item = document.createElement('li');
    item.className =
      'flex items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-700';

    const name = document.createElement('span');
    name.textContent = domain;
    name.className = 'truncate text-sm';

    const drop = document.createElement('button');
    drop.type = 'button';
    drop.textContent = chrome.i18n.getMessage('allowlist_remove');
    drop.className =
      'shrink-0 text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400 cursor-pointer';
    drop.addEventListener('click', async () => {
      render(await remove(domain));
    });

    item.append(name, drop);
    list.append(item);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const value = input.value;

  if (!normalize(value)) {
    fail(chrome.i18n.getMessage('error_not_domain'));
    return;
  }

  fail('');
  input.value = '';
  render(await add(value));
});

input.addEventListener('input', () => fail(''));

// Another window may be editing the same list.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.allowlist) {
    render(changes.allowlist.newValue ?? []);
  }
});

// Set localized labels
// To test locale - set in src/manifest.json:6 (default_locale) target lang and rename "en" _locales as "_en"
async function locale() {
  for (const label of labels) {
    const key = label.id.replace(/-/g, '_');

    if (label.id === 'allowlist-desc') {
      label.innerHTML = chrome.i18n.getMessage(key, [
        `<code class="rounded bg-zinc-100 px-1 dark:bg-zinc-700">example.com</code>`,
        `<code class="rounded bg-zinc-100 px-1 dark:bg-zinc-700">any.example.com</code>`,
      ]);
    } else {
      label.textContent = chrome.i18n.getMessage(key);
    }
  }
}

// Load
locale();
read().then(render);
