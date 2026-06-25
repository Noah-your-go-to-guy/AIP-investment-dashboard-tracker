chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "AIP_TOGGLE_OVERLAY") {
    sendResponse({ ok: true });
  }
});
