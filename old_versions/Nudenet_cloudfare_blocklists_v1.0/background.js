// NSFW Prediction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://rand-indicator-grounds-peace.trycloudflare.com/predict', {
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

// Initialize counters
let currentPageBlockCount = 0;
let totalBlockCount = 0;

// Listen for rule matches using declarativeNetRequest
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((details) => {
    console.log('Rule matched:', details);
    
    // Increment counters
    currentPageBlockCount++;
    totalBlockCount++;
    
    // Update storage
    chrome.storage.local.set({
        currentPageBlockCount: currentPageBlockCount,
        totalBlockCount: totalBlockCount
    }, () => {
        console.log(`Rule matched - Current page blocks: ${currentPageBlockCount}, Total blocks: ${totalBlockCount}`);
    });
});

// Reset page counter when navigating to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        currentPageBlockCount = 0;
        chrome.storage.local.set({ currentPageBlockCount: 0 });
    }
});

// Initialize settings when extension starts
chrome.runtime.onInstalled.addListener(() => {
    // Always set safeSearchEnabled to true
    chrome.storage.local.set({ safeSearchEnabled: true });
    
    chrome.storage.local.set({
        currentPageBlockCount: 0,
        totalBlockCount: 0
    });
});

// Verify rules are loaded
chrome.declarativeNetRequest.getDynamicRules(rules => {
    console.log('Active blocking rules:', rules.length);
});

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
    else if (request.action === "logFirstProcessingTime") {
        chrome.storage.local.get('firstProcessingTimes', (data) => {
            let firstProcessingTimes = data.firstProcessingTimes || {};
            if (!firstProcessingTimes[request.siteUrl]) {
                firstProcessingTimes[request.siteUrl] = [];
            }
            firstProcessingTimes[request.siteUrl].push(request.timeFromLoad);
            chrome.storage.local.set({ firstProcessingTimes });
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

// Function to check matched rules and update counters
function updateBlockedRulesCount() {
    chrome.declarativeNetRequest.getMatchedRules({}, (result) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        const blockedRules = result.rulesMatchedInfo.filter(rule => 
            rule.action && rule.action.type === 'block'
        );

        chrome.storage.local.get(['totalBlockCount'], (data) => {
            const newTotalCount = (data.totalBlockCount || 0) + blockedRules.length;
            currentPageBlockCount += blockedRules.length;
            
            chrome.storage.local.set({
                currentPageBlockCount: currentPageBlockCount,
                totalBlockCount: newTotalCount
            }, () => {
                console.log(`Blocked rules - Current page: ${currentPageBlockCount}, Total: ${newTotalCount}`);
            });
        });
    });
}

// Check for blocked rules periodically
setInterval(updateBlockedRulesCount, 5000);

// Reset counter for new page loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        currentPageBlockCount = 0;
        chrome.storage.local.set({ currentPageBlockCount: 0 });
    }
});

// Initialize counters when extension starts
chrome.runtime.onStartup.addListener(() => {
    currentPageBlockCount = 0;
    chrome.storage.local.set({ 
        currentPageBlockCount: 0,
        totalBlockCount: 0 
    });
});
