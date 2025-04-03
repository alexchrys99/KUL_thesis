const exportButton = document.getElementById('exportButton');
const exportBlurTimeButton = document.getElementById('exportBlurTimeButton');
const blocklistButton = document.getElementById('blocklistButton');
const blocklistSection = document.getElementById('blocklistSection');
const blockedSitesList = document.getElementById('blockedSitesList');
const unblockButton = document.getElementById('unblockButton');
const blockSiteInput = document.getElementById('blockSiteInput');
const blockSiteButton = document.getElementById('blockSiteButton');
const status = document.getElementById('status');
const exportBlurStatsButton = document.getElementById('exportBlurStatsButton');

// Add this function to update the counter displays
function updateCounters() {
    chrome.storage.local.get(['currentPageFilterCount', 'totalFilterCount'], (data) => {
        document.getElementById('currentPageCount').textContent = data.currentPageFilterCount || 0;
        document.getElementById('totalCount').textContent = data.totalFilterCount || 0;
    });
}

// Add this to the beginning of your popup.js
document.addEventListener('DOMContentLoaded', () => {
    updateCounters();
    // ... rest of your existing initialization code
});

// Update counters every second while popup is open
setInterval(updateCounters, 1000);

// Toggle Blocklist section visibility
blocklistButton.addEventListener('click', () => {
    const isHidden = blocklistSection.style.display === 'none';
    blocklistSection.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        loadBlockedSites();  // Only load sites when showing the section
    }
});

// Load blocked sites from storage and display them
function loadBlockedSites() {
    chrome.storage.local.get('blockedSites', (data) => {
        blockedSitesList.innerHTML = ''; // Clear the list
        if (data.blockedSites && data.blockedSites.length > 0) {
            data.blockedSites.forEach((site) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <input type="checkbox" id="${site}" value="${site}">
                    <label for="${site}">${site}</label>
                `;
                blockedSitesList.appendChild(li);
            });
        } else {
            blockedSitesList.innerHTML = '<li>No sites blocked yet.</li>';
        }
    });
}

// Unblock selected sites
unblockButton.addEventListener('click', () => {
    const selectedSites = Array.from(document.querySelectorAll('#blockedSitesList input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);
    if (selectedSites.length > 0) {
        chrome.runtime.sendMessage({ action: 'unblockSites', sites: selectedSites }, () => {
            status.textContent = 'Sites unblocked successfully!';
            loadBlockedSites(); // Refresh the list
        });
    } else {
        status.textContent = 'No sites selected to unblock.';
    }
});

// Block a new site
blockSiteButton.addEventListener('click', () => {
    const site = blockSiteInput.value.trim();
    if (isValidUrl(site)) {
        chrome.runtime.sendMessage({ action: 'blockSite', site: site }, () => {
            status.textContent = 'Site blocked successfully!';
            blockSiteInput.value = ''; // Clear the input
            loadBlockedSites(); // Refresh the list
        });
    } else {
        status.textContent = 'Invalid URL format. Please enter a valid domain like "facebook.com" or "example.gr".';
    }
});

// Validate URL format
function isValidUrl(url) {
    const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(url);
}

// Export page load times (existing functionality)
exportButton.addEventListener('click', () => {
    chrome.storage.local.get('pageLoadTimesBySite', (data) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving page load times:", chrome.runtime.lastError);
            status.textContent = 'Error retrieving data.';
            return;
        }

        if (data.pageLoadTimesBySite && Object.keys(data.pageLoadTimesBySite).length > 0) {
            let csv = 'Site,Page Load Time (ms)\n'; // CSV header
            Object.entries(data.pageLoadTimesBySite).forEach(([siteUrl, loadTimes]) => {
                loadTimes.forEach((loadTime) => {
                    csv += `${siteUrl},${Math.floor(loadTime)}\n`;
                });
            });

            console.log("Generated CSV:", csv); // Debugging output

            // Workaround for clipboard restrictions
            const textArea = document.createElement("textarea");
            textArea.value = csv;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);

            status.textContent = 'Page load times copied to clipboard!';
        } else {
            status.textContent = 'No page load time data to export.';
        }
    });
});



// Export blur time data in CSV format
exportBlurTimeButton.addEventListener('click', () => {
    chrome.storage.local.get('blurTimesBySite', (data) => {
        if (data.blurTimesBySite) {
            let csv = 'Site,Type,Time to Blur (ms)\n'; // CSV header
            for (const [siteUrl, blurTimes] of Object.entries(data.blurTimesBySite)) {
                blurTimes.forEach((blurTime) => {
                    csv += `${siteUrl},${blurTime.type},${Math.floor(blurTime.timeTaken)}\n`; // Add a row for each blur time
                });
            }
            navigator.clipboard.writeText(csv).then(() => {
                status.textContent = 'Blur times copied to clipboard!';
            });
        } else {
            status.textContent = 'No blur time data to export.';
        }
    });
});

// Load blocked sites when popup opens
loadBlockedSites();
document.getElementById('exportResourceUsageButton').addEventListener('click', () => {
    chrome.storage.local.get(['bytesSavedBySite', 'memoryUsageBySite'], (data) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving resource usage:", chrome.runtime.lastError);
            status.textContent = 'Error retrieving data.';
            return;
        }

        let csv = 'Site,Page size (KB),Memory Usage (MB)\n';
        
        // Combine data from both metrics
        const allSites = new Set([
            ...Object.keys(data.bytesSavedBySite || {}),
            ...Object.keys(data.memoryUsageBySite || {})
        ]);

        allSites.forEach(site => {
            const bytesSaved = data.bytesSavedBySite?.[site] || 0;
            const memoryUsage = data.memoryUsageBySite?.[site] || 0;
            
            // Convert bytes to KB and memory to MB
            csv += `${site},${(bytesSaved / 1024).toFixed(2)},${(memoryUsage / (1024 * 1024)).toFixed(2)}\n`;
        });

        // Workaround for clipboard restrictions
        const textArea = document.createElement("textarea");
        textArea.value = csv;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);

        status.textContent = 'Resource usage data copied to clipboard!';
    });
});

exportBlurStatsButton.addEventListener('click', () => {
    chrome.storage.local.get(['blurStatsBySite'], (data) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving blur stats:", chrome.runtime.lastError);
            status.textContent = 'Error retrieving data.';
            return;
        }

        if (data.blurStatsBySite && Object.keys(data.blurStatsBySite).length > 0) {
            let csv = 'Website,Total Filtered Images\n'; // CSV header
            Object.entries(data.blurStatsBySite).forEach(([site, count]) => {
                csv += `${site},${count}\n`;
            });

            // Create temporary textarea for copying
            const textArea = document.createElement("textarea");
            textArea.value = csv;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);

            status.textContent = 'Blur stats copied to clipboard!';
        } else {
            status.textContent = 'No blur statistics available.';
        }
    });
});
