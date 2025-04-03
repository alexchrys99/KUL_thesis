// NSFW Prediction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://pack-gaps-colour-rate.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: request.imageUrl })
        })
        .then((response) => response.json())
        .then((data) => sendResponse(data))
        .catch((error) => sendResponse({ error: error.message }));

        return true; // Allows async response
    }
});

// Initialize an object to store page load times by site
// Initialize objects to store page load times and blur times by site
let pageLoadTimesBySite = {};
let blurTimesBySite = {};

// Helper function to save data to chrome.storage.local
function saveToStorage(data, callback) {
    chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving data to storage:", chrome.runtime.lastError);
        } else {
            console.log("Data saved to storage:", data);
            if (callback) callback();
        }
    });
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(" Received message:", request);

    if (request.action === "logPageLoadTime") {
        console.log(` Logging page load time for ${request.siteUrl}: ${request.loadTime} ms`);

        chrome.storage.local.get(["pageLoadTimesBySite", "bytesSavedBySite"], (data) => {
            let pageLoadTimesBySite = data.pageLoadTimesBySite || {};
            let bytesSavedBySite = data.bytesSavedBySite || {};

            if (!pageLoadTimesBySite[request.siteUrl]) {
                pageLoadTimesBySite[request.siteUrl] = [];
            }
            pageLoadTimesBySite[request.siteUrl].push(request.loadTime);

            // Store page size data
            if (request.pageSize) {
                bytesSavedBySite[request.siteUrl] = request.pageSize;
            }

            chrome.storage.local.set({ 
                pageLoadTimesBySite,
                bytesSavedBySite 
            }, () => {
                console.log("Page metrics stored successfully.");
            });
        });
    }
    else if (request.action === "logMemoryUsage") {
        chrome.storage.local.get("memoryUsageBySite", (data) => {
            let memoryUsageBySite = data.memoryUsageBySite || {};
            memoryUsageBySite[request.siteUrl] = request.memoryUsage;
            chrome.storage.local.set({ memoryUsageBySite });
        });
    }
});

// Function to export page load times as a CSV string
function exportPageLoadTimes() {
    chrome.storage.local.get("pageLoadTimesBySite", (data) => {
        if (data.pageLoadTimesBySite) {
            let csv = "Site,Page Load Time (ms)\n"; // CSV header

            // Loop through each site and its load times
            for (const [siteUrl, loadTimes] of Object.entries(data.pageLoadTimesBySite)) {
                loadTimes.forEach((loadTime) => {
                    csv += `${siteUrl},${loadTime}\n`; // Add a row for each load time
                });
            }

            // Log the CSV string
            console.log("Exported page load times as CSV:\n", csv);

            // Copy the CSV string to the clipboard
            navigator.clipboard.writeText(csv).then(() => {
                console.log("CSV data copied to clipboard. Paste it into a text file or spreadsheet.");
            });
        } else {
            console.log("No page load times stored yet.");
        }
    });
}

// Function to export blur times as a CSV string
function exportBlurTimes() {
    chrome.storage.local.get("blurTimesBySite", (data) => {
        if (data.blurTimesBySite) {
            let csv = "Site,Type,Time to Blur (ms)\n"; // CSV header

            // Loop through each site and its blur times
            for (const [siteUrl, blurTimes] of Object.entries(data.blurTimesBySite)) {
                blurTimes.forEach((blurTime) => {
                    csv += `${siteUrl},${blurTime.type},${blurTime.timeTaken}\n`; // Add a row for each blur time
                });
            }

            // Log the CSV string
            console.log("Exported blur times as CSV:\n", csv);

            // Copy the CSV string to the clipboard
            navigator.clipboard.writeText(csv).then(() => {
                console.log("CSV data copied to clipboard. Paste it into a text file or spreadsheet.");
            });
        } else {
            console.log("No blur times stored yet.");
        }
    });
}

// Export the data when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    exportPageLoadTimes();
    exportBlurTimes();
});

// Initialize blocked sites in storage if not already set
chrome.storage.local.get('blockedSites', (data) => {
    if (!data.blockedSites) {
        chrome.storage.local.set({ blockedSites: [] });
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'blockSite') {
        blockSite(request.site);
    } else if (request.action === 'unblockSites') {
        unblockSites(request.sites);
    }
});

let nextRuleId = 112478; // 112477 highest ID in rules.json

// Block a site
function blockSite(site) {
    chrome.storage.local.get('blockedSites', (data) => {
        const blockedSites = data.blockedSites || [];
        if (!blockedSites.includes(site)) {
            blockedSites.push(site);
            chrome.storage.local.set({ blockedSites: blockedSites }, () => {
                updateBlockingRules(blockedSites);
            });
        }
    });
}

// Unblock sites
function unblockSites(sites) {
    chrome.storage.local.get('blockedSites', (data) => {
        const blockedSites = data.blockedSites || [];
        const updatedBlockedSites = blockedSites.filter((site) => !sites.includes(site));
        chrome.storage.local.set({ blockedSites: updatedBlockedSites }, () => {
            updateBlockingRules(updatedBlockedSites);
        });
    });
}

// Update blocking rules dynamically
function updateBlockingRules(blockedSites) {
    // Generate rules for blocked sites
    const rules = blockedSites.map((site) => {
        const normalizedSite = site.replace(/^https?:\/\//, '').replace(/^www\./, '');
        return {
            id: nextRuleId++, // Use the next available ID
            priority: 1,
            action: { type: 'block' },
            condition: { urlFilter: `*://*.${normalizedSite}/*`, resourceTypes: ['main_frame'] },
        };
    });

    // Get the current dynamic rules to remove old ones
    chrome.declarativeNetRequest.getDynamicRules((currentRules) => {
        const removeRuleIds = currentRules.map((rule) => rule.id);

        // Update the rules
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds, // Remove all old dynamic rules
            addRules: rules, // Add new dynamic rules
        }, () => {
            console.log('Updated dynamic rules:', rules);
        });
    });
}

// Add this to your existing listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.storage.local.set({ currentPageFilterCount: 0 });
    }
});
