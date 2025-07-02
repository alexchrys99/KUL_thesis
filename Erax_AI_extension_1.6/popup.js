const exportButton = document.getElementById('exportButton');
const exportBlurTimeButton = document.getElementById('exportBlurTimeButton');
const status = document.getElementById('status');
const exportBlurStatsButton = document.getElementById('exportBlurStatsButton');

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
