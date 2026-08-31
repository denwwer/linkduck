const ACTIVE_ICON = {
  16: 'icon16.png',
  48: 'icon48.png',
  128: 'icon128.png',
};

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'active') return;

  const tabId = sender.tab?.id;

  if (tabId == null || tabId < 0) return;

  chrome.action.setIcon({ tabId, path: ACTIVE_ICON }).catch(() => {
    // tab closed
  });
});
