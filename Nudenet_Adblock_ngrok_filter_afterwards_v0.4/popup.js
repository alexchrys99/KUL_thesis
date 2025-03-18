const exportButton = document.getElementById('exportButton');
const status = document.getElementById('status');

// Export page load times
exportButton.addEventListener('click', () => {
    chrome.storage.local.get("pageLoadTimesBySite", (data) => {
        if (data.pageLoadTimesBySite) {
            let csv = "Site,Page Load Time (ms)\n";

            for (const [siteUrl, loadTimes] of Object.entries(data.pageLoadTimesBySite)) {
                loadTimes.forEach((loadTime) => {
                    const roundedLoadTime = Math.floor(loadTime);
                    csv += `${siteUrl},${roundedLoadTime}\n`;
                });
            }

            navigator.clipboard.writeText(csv).then(() => {
                status.textContent = "Data copied to clipboard!";
            });
        } else {
            status.textContent = "No data to export.";
        }
    });
});