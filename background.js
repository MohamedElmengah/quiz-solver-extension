let allowedTabId = null;

// افتح البانل في التاب اللي دوست فيها بس
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  allowedTabId = tab.id;
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel.html",
    enabled: true
  });
  await chrome.sidePanel.open({ tabId: tab.id });
});

// لو رحت لأي تاب تانية، اقفل البانل فيها، ولو رجعت للتاب الأصلية سيبه مفتوح
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (allowedTabId !== null && tabId !== allowedTabId) {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    }).catch(() => {});
  } else if (tabId === allowedTabId) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true
    }).catch(() => {});
  }
});

// لو التاب الأصلية اتقفلت، صفّر المتغير
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === allowedTabId) {
    allowedTabId = null;
  }
});