// Runs on the QuestLog site only: marks the page so the app can tell the focus lock is installed.
document.documentElement.dataset.questlogExtension = chrome.runtime.getManifest().version;
