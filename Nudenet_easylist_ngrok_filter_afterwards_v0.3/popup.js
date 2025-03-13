const detectButton = document.getElementById('detectButton');
const adblockToggle = document.getElementById('adblockToggle');
const nsfwToggle = document.getElementById('nsfwToggle');

detectButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (adblockToggle.checked) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: blockAds
            });
        }

        if (nsfwToggle.checked) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: processMedia
            });
        }
    });
});

adblockToggle.addEventListener('change', (event) => {
    chrome.storage.local.set({ adblockEnabled: event.target.checked });
});

nsfwToggle.addEventListener('change', (event) => {
    chrome.storage.local.set({ nsfwEnabled: event.target.checked });
});

chrome.storage.local.get(['adblockEnabled', 'nsfwEnabled'], (data) => {
    adblockToggle.checked = data.adblockEnabled !== false;
    nsfwToggle.checked = data.nsfwEnabled !== false;
});