// NSFW Prediction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://4266-2a02-85f-ec74-d400-e418-eeb5-7824-8cf0.ngrok-free.app/predict', {
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
