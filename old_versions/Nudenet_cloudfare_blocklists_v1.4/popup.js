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
const safeSearchToggle = document.getElementById('safeSearchToggle');

// Toggle Blocklist section visibility
blocklistButton.addEventListener('click', () => {
    blocklistSection.style.display = blocklistSection.style.display === 'none' ? 'block' : 'none';
    loadBlockedSites();
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

// Export page load times in CSV format
exportButton.addEventListener('click', () => {
    chrome.storage.local.get('pageLoadTimesBySite', (data) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving page load times:", chrome.runtime.lastError);
            status.textContent = 'Error retrieving data.';
            return;
        }

        if (data.pageLoadTimesBySite && Object.keys(data.pageLoadTimesBySite).length > 0) {
            let csv = 'Site,Load Times (ms)\n'; // CSV header
            Object.entries(data.pageLoadTimesBySite).forEach(([siteUrl, loadTimes]) => {
                // Round each load time to the nearest integer
                const roundedTimes = loadTimes.map(time => Math.round(time));
                csv += `${siteUrl},${roundedTimes.join(',')}\n`;
            });

            // Copy to clipboard
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
            let csv = 'Site,Blur Times (ms)\n'; // CSV header
            for (const [siteUrl, blurTimes] of Object.entries(data.blurTimesBySite)) {
                // Round each blur time to the nearest integer
                const times = blurTimes.map(blurTime => Math.round(blurTime.timeTaken));
                csv += `${siteUrl},${times.join(',')}\n`;
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

document.getElementById('exportFirstProcessingButton').addEventListener('click', () => {
    chrome.storage.local.get('firstProcessingTimes', (data) => {
        if (data.firstProcessingTimes && Object.keys(data.firstProcessingTimes).length > 0) {
            let csv = 'Site,Time to First Processing (ms)\n';
            Object.entries(data.firstProcessingTimes).forEach(([site, times]) => {
                const roundedTimes = times.map(time => Math.round(time));
                csv += `${site},${roundedTimes.join(',')}\n`;
            });

            const textArea = document.createElement("textarea");
            textArea.value = csv;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);

            status.textContent = 'First processing times copied to clipboard!';
        } else {
            status.textContent = 'No first processing time data available.';
        }
    });
});

// Load saved preference but always default to true
chrome.storage.local.get('safeSearchEnabled', (data) => {
    // Always set to true regardless of stored value
    safeSearchToggle.checked = true;
    
    // Ensure storage is also set to true
    if (data.safeSearchEnabled !== true) {
        chrome.storage.local.set({ safeSearchEnabled: true });
    }
});

// Safe Search toggle handler
safeSearchToggle.addEventListener('change', () => {
    const isEnabled = safeSearchToggle.checked;
    
    // If user is trying to disable safe search, show warning and prevent it
    if (!isEnabled) {
        const warningMessage = "Safe Search cannot be disabled for your protection. This feature helps prevent exposure to explicit content.";
        alert(warningMessage);
        
        // Force the toggle back to enabled
        safeSearchToggle.checked = true;
        return;
    }
    
    // Only allow enabling (which is already the default)
    chrome.storage.local.set({ safeSearchEnabled: true }, () => {
        status.textContent = 'Safe Search Enforcer enabled';
    });
});
