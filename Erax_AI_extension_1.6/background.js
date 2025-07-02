// This line is critical for MV3 session storage access from content scripts
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://instructional-ct-teams-safe.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body)
        })
        .then(response => response.json())
        .then(data => sendResponse(data))
        .catch(error => sendResponse({ error: error.message }));
        
        return true; // This is crucial for async sendResponse
    }
    
    // For all other synchronous actions, we don't need to return anything.
    else if (request.action === "logPageLoadTime") {
        console.log(` Logging page load time for ${request.siteUrl}: ${request.loadTime} ms`);
        chrome.storage.local.get(["pageLoadTimesBySite", "bytesSavedBySite"], (data) => {
            let pageLoadTimesBySite = data.pageLoadTimesBySite || {};
            let bytesSavedBySite = data.bytesSavedBySite || {};
            if (!pageLoadTimesBySite[request.siteUrl]) {
                pageLoadTimesBySite[request.siteUrl] = [];
            }
            pageLoadTimesBySite[request.siteUrl].push(request.loadTime);
            if (request.pageSize) {
                bytesSavedBySite[request.siteUrl] = request.pageSize;
            }
            chrome.storage.local.set({ pageLoadTimesBySite, bytesSavedBySite });
        });
    }
    else if (request.action === "logMemoryUsage") {
        chrome.storage.local.get("memoryUsageBySite", (data) => {
            let memoryUsageBySite = data.memoryUsageBySite || {};
            memoryUsageBySite[request.siteUrl] = request.memoryUsage;
            chrome.storage.local.set({ memoryUsageBySite });
        });
    }
    else if (request.action === "escalateSite") {
        const siteToEscalate = request.siteUrl;
        console.log(`Escalating site to high-risk: ${siteToEscalate}`);
        chrome.storage.session.get(['highRiskSites'], (data) => {
            const sites = data.highRiskSites || [];
            if (!sites.includes(siteToEscalate)) {
                sites.push(siteToEscalate);
                chrome.storage.session.set({ highRiskSites: sites });
            }
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

function exportPageLoadTimes() {
    chrome.storage.local.get("pageLoadTimesBySite", (data) => {
        if (data.pageLoadTimesBySite) {
            let csv = "Site,Page Load Time (ms)\n";
            for (const [siteUrl, loadTimes] of Object.entries(data.pageLoadTimesBySite)) {
                loadTimes.forEach((loadTime) => {
                    csv += `${siteUrl},${loadTime}\n`;
                });
            }
            navigator.clipboard.writeText(csv).then(() => {
                console.log("CSV data copied to clipboard.");
            });
        } else {
            console.log("No page load times stored yet.");
        }
    });
}

function exportBlurTimes() {
    chrome.storage.local.get("blurTimesBySite", (data) => {
        if (data.blurTimesBySite) {
            let csv = "Site,Type,Time to Blur (ms)\n";
            for (const [siteUrl, blurTimes] of Object.entries(data.blurTimesBySite)) {
                blurTimes.forEach((blurTime) => {
                    csv += `${siteUrl},${blurTime.type},${blurTime.timeTaken}\n`;
                });
            }
            navigator.clipboard.writeText(csv).then(() => {
                console.log("CSV data copied to clipboard.");
            });
        } else {
            console.log("No blur times stored yet.");
        }
    });
}

chrome.action.onClicked.addListener((tab) => {
    exportPageLoadTimes();
    exportBlurTimes();
});