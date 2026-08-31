import { read } from './lib/stats.js';

// localize text
const labels = [
  document.getElementById('tracker-title'),
  document.getElementById('tracker-24h'),
  document.getElementById('tracker-all'),
];

const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function show(id, value) {
  const node = document.getElementById(id);

  if (node) {
    node.textContent = compact.format(value);
  }
}

async function render() {
  const stats = await read();

  show('today', stats.today);
  show('total', stats.total);
}

// Set localized labels
// To test locale - set in src/manifest.json:6 (default_locale) target lang and rename "en" _locales as "_en"
async function locale() {
  for (const label of labels) {
    const key = label.id.replace(/-/g, '_');
    label.textContent = chrome.i18n.getMessage(key);
  }
}

// Track stats updates when popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.stats) {
    render();
  }
});

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Load
locale();
render();
