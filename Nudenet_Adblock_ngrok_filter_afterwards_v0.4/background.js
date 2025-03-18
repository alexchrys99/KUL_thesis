// NSFW Prediction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://5952-178-51-62-246.ngrok-free.app/predict', {
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
let pageLoadTimesBySite = {};

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "logPageLoadTime") {
        const siteUrl = request.siteUrl;
        const loadTime = request.loadTime;

        // Log the received data
        console.log(`Received page load time for ${siteUrl}:`, loadTime, "ms");

        // Store the page load time by site
        if (!pageLoadTimesBySite[siteUrl]) {
            pageLoadTimesBySite[siteUrl] = [];
        }
        pageLoadTimesBySite[siteUrl].push(loadTime);

        // Save the data to chrome.storage for persistence
        chrome.storage.local.set({ pageLoadTimesBySite: pageLoadTimesBySite }, () => {
            console.log(`Page load time for ${siteUrl} saved.`);
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

// Export the data when the extension icon is clicked
chrome.action.onClicked.addListener(exportPageLoadTimes);