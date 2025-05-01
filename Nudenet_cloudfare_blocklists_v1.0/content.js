const processedImages = new Map(); // Cache for processed image results

// Function to get image signature (URL or data-src)
function getImageSignature(img) {
    return img.src || img.dataset.src || '';
}

let lastRequestTime = 0;
let observer;  // Declare globally
const requestDelay = 1000; // 1 second delay between requests

// Initialize counters
let currentPageFilterCount = 0;

// Add at the top of the file with other global variables
let firstProcessingTime = null;
let safeSearchEnabled = true; // Default to enabled

// Function to update counters in storage
function updateFilterCounts() {
    chrome.storage.local.get(['totalFilterCount', 'currentPageFilterCount'], (data) => {
        const totalCount = (data.totalFilterCount || 0) + 1;
        const currentCount = currentPageFilterCount; // Use the local counter
        
        // Ensure total count is at least equal to current page count
        const finalTotalCount = Math.max(totalCount, currentCount);
        
        chrome.storage.local.set({ 
            totalFilterCount: finalTotalCount,
            currentPageFilterCount: currentCount
        }, () => {
            console.log(`Updated counts - Current page: ${currentCount}, Total: ${finalTotalCount}`);
        });
    });
}

// Function to update site-specific blur stats
function updateSiteBlurStats() {
    const currentSite = window.location.hostname;
    
    chrome.storage.local.get(['blurStatsBySite'], (data) => {
        const blurStatsBySite = data.blurStatsBySite || {};
        blurStatsBySite[currentSite] = (blurStatsBySite[currentSite] || 0) + 1;
        
        chrome.storage.local.set({ blurStatsBySite }, () => {
            console.log(`Updated blur stats for ${currentSite}: ${blurStatsBySite[currentSite]} images`);
        });
    });
}

// Update the counter when an image is blurred
function incrementCounter() {
    currentPageFilterCount++;
    updateFilterCounts();
    updateSiteBlurStats();
}

async function makeRequest(url, options) {
    const now = Date.now();
    if (now - lastRequestTime < requestDelay) {
        await new Promise(resolve => setTimeout(resolve, requestDelay - (now - lastRequestTime)));
    }

    lastRequestTime = Date.now();
    try {
        const response = await fetch(url, {
            ...options,
            body: JSON.stringify({
                ...JSON.parse(options.body),
                source_url: window.location.hostname,
                page_title: document.title
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Request failed:", error);
        throw error;
    }
}

// Function to process images properly (keeping full frame)
async function processImage(img) {
    // Skip processing for images with specific dimensions from CSS
    const computedStyle = window.getComputedStyle(img);
    const width = parseInt(computedStyle.width);
    const height = parseInt(computedStyle.height);
    
    // Skip if image has explicit small dimensions or contains specific class names
    if ((width > 0 && width < 128) || (height > 0 && height < 128) ||
        img.className.toLowerCase().includes('logo') ||
        img.className.toLowerCase().includes('icon') ||
        img.className.toLowerCase().includes('avatar') ||
        img.width < 128 || img.height < 128) {
        console.log("Skipping small/logo image:", img.src);
        return;
    }

    // Wait for image to load before checking natural dimensions
    if (!img.complete) {
        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    }

    // Additional check for natural dimensions after load
    if (img.naturalWidth < 128 || img.naturalHeight < 128) {
        console.log("Skipping small image after load:", img.src);
        return;
    }

    // Record the first processing attempt time
    if (firstProcessingTime === null) {
        firstProcessingTime = performance.now();
        chrome.runtime.sendMessage({
            action: "logFirstProcessingTime",
            siteUrl: window.location.hostname,
            timeFromLoad: firstProcessingTime
        });
    }

    if (!img.src && !img.dataset.src) {
        console.error("Image source is empty or invalid.");
        return;
    }

    const imageSrc = img.src || img.dataset.src;
    if (!imageSrc || imageSrc.trim() === "" || imageSrc.startsWith("data:")) {
        console.error("Image source is empty or invalid.");
        return;
    }

    // Check cache first
    const imageSignature = getImageSignature(img);
    if (processedImages.has(imageSignature)) {
        const cachedResult = processedImages.get(imageSignature);
        console.log("Using cached result for image:", imageSignature);
        
        if (cachedResult === "NSFW") {
            console.log("Applying cached NSFW blur");
            img.style.filter = 'blur(20px)';
            img.style.webkitFilter = 'blur(20px)';
            img.style.pointerEvents = 'none';
        }
        return;
    }

    try {
        img.crossOrigin = "anonymous";

        const startTime = performance.now();

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;

            if (!img.src && img.dataset.src) {
                img.src = img.dataset.src;
            }
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png');

        const result = await makeRequest('https://rand-indicator-grounds-peace.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                base64_image: imageDataUrl,
                source_url: window.location.hostname,
                page_title: document.title
            })
        });

        console.log("Server response:", result);

        // Cache the result
        processedImages.set(imageSignature, result.prediction);

        if (result.prediction === "NSFW") {
            console.log("NSFW image detected, applying blur.");
            img.style.filter = 'blur(20px)';
            img.style.webkitFilter = 'blur(20px)';
            img.style.pointerEvents = 'none';
            incrementCounter();

            const endTime = performance.now();
            const timeTaken = endTime - startTime;
            console.log(`Time taken to apply blur: ${timeTaken} ms`);

            const siteUrl = window.location.hostname;
            chrome.storage.local.get('blurTimesBySite', (data) => {
                const blurTimesBySite = data.blurTimesBySite || {};
                if (!blurTimesBySite[siteUrl]) {
                    blurTimesBySite[siteUrl] = [];
                }
                blurTimesBySite[siteUrl].push({ type: 'image', timeTaken });
                chrome.storage.local.set({ blurTimesBySite });
            });
        }
    } catch (error) {
        console.error("Error processing image:", error);
        // Don't cache errors - allow retry
        setTimeout(() => processImage(img), 5000);
    }
}

// Function to process GIFs by extracting frames
async function processGIF(gif) {
    if (!gif.src && !gif.dataset.src) {
        console.error("GIF source is empty or invalid.");
        return;
    }

    const gifSrc = gif.src || gif.dataset.src;
    if (!gifSrc || gifSrc.trim() === "" || gifSrc.startsWith("data:")) {
        console.error("GIF source is empty or invalid.");
        return;
    }

    // Check cache first
    const gifSignature = getImageSignature(gif);
    if (processedImages.has(gifSignature)) {
        const cachedResult = processedImages.get(gifSignature);
        console.log("Using cached result for GIF:", gifSignature);
        
        if (cachedResult === "NSFW") {
            console.log("Applying cached NSFW blur to GIF");
            gif.style.filter = 'blur(20px)';
            gif.style.webkitFilter = 'blur(20px)';
            gif.style.pointerEvents = 'none';
        }
        return;
    }

    try {
        const startTime = performance.now();

        // Convert GIF to an image for processing (extract first frame)
        const response = await fetch(gifSrc, { mode: 'no-cors' });
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        ctx.drawImage(imageBitmap, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png');
        console.log("Sending GIF frame for detection:", imageDataUrl);

        const result = await makeRequest('https://rand-indicator-grounds-peace.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                base64_image: imageDataUrl,
                source_url: window.location.hostname,
                page_title: document.title
            })
        });

        console.log("GIF response:", result);

        // Add caching after getting result
        processedImages.set(gifSignature, result.prediction);
        
        if (result.prediction === "NSFW") {
            console.log("NSFW content detected in GIF, applying blur.");
            gif.style.filter = 'blur(20px)';
            gif.style.webkitFilter = 'blur(20px)';
            gif.style.pointerEvents = 'none';

            const endTime = performance.now();
            const timeTaken = endTime - startTime;
            console.log(`Time taken to apply blur: ${timeTaken} ms`);

            const siteUrl = window.location.hostname;
            chrome.storage.local.get('blurTimesBySite', (data) => {
                const blurTimesBySite = data.blurTimesBySite || {};
                if (!blurTimesBySite[siteUrl]) {
                    blurTimesBySite[siteUrl] = [];
                }
                blurTimesBySite[siteUrl].push({ type: 'gif', timeTaken });
                chrome.storage.local.set({ blurTimesBySite });
            });
        } else {
            console.log("GIF is safe, no action taken.");
        }
    } catch (error) {
        console.error("Error processing GIF:", error);
        // Don't cache errors
    }
}

// Function to process videos (including GIF videos)
async function processVideo(video) {
    if (video.dataset.nsfwProcessed === "true") {
        console.log("Video already marked as NSFW, skipping further checks.");
        return;
    }

    try {
        const startTime = performance.now();

        const videoSrc = video.src || video.getAttribute('data-webm') || video.getAttribute('data-mp4');
        if (!videoSrc || videoSrc.trim() === "" || videoSrc.startsWith("data:")) {
            console.error("Video source is empty or invalid.");
            return;
        }

        if (video.readyState < 2) { // 2 = HAVE_CURRENT_DATA
            await new Promise((resolve, reject) => {
                video.addEventListener('loadeddata', resolve, { once: true });
                video.addEventListener('error', reject, { once: true });
            });
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageDataUrl = canvas.toDataURL('image/png');
        const result = await makeRequest('https://rand-indicator-grounds-peace.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                base64_image: imageDataUrl,
                source_url: window.location.hostname,
                page_title: document.title
            })
        });

        if (result.prediction === "NSFW") {
            console.log("NSFW content detected in video, applying persistent blur.");
            applyPersistentBlur(video);

            const endTime = performance.now();
            const timeTaken = endTime - startTime;
            console.log(`Time taken to apply blur: ${timeTaken} ms`);

            const siteUrl = window.location.hostname;
            chrome.storage.local.get('blurTimesBySite', (data) => {
                const blurTimesBySite = data.blurTimesBySite || {};
                if (!blurTimesBySite[siteUrl]) {
                    blurTimesBySite[siteUrl] = [];
                }
                blurTimesBySite[siteUrl].push({ type: 'video', timeTaken });
                chrome.storage.local.set({ blurTimesBySite });
            });
        }
    } catch (error) {
        console.error("Error processing video:", error);
    }
}

// Function to apply a persistent blur effect to a video
function applyPersistentBlur(video) {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';

    video.parentNode.insertBefore(container, video);
    container.appendChild(video);

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backdropFilter = 'blur(20px)';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1';

    container.appendChild(overlay);

    video.dataset.nsfwProcessed = "true";
}

// Function to process all media
function processMedia() {
    document.querySelectorAll('img').forEach(processImage);
    document.querySelectorAll('video').forEach(processVideo);
    document.querySelectorAll('img[src$=".gif"]').forEach(processGIF);
}

// Function to traverse Shadow DOM and process media
function traverseShadowDOM(root) {
    root.querySelectorAll('*').forEach((node) => {
        if (node.shadowRoot) {
            traverseShadowDOM(node.shadowRoot);
        }

        if (node.nodeName === 'IMG') {
            processImage(node);
        } else if (node.nodeName === 'VIDEO') {
            processVideo(node);
        }
    });
}


// Observe for new elements (lazy-loaded media)
function observeMedia() {
    observer = new MutationObserver((mutations) => {  // Assign to global observer
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'IMG' && node.complete) {
                    processImage(node);
                } else if (node.nodeName === 'VIDEO') {
                    processVideo(node);
                } else if (node.nodeName === 'IMG' && node.src.endsWith('.gif')) {
                    processGIF(node);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function observeInstagramMedia() {
    observer = new MutationObserver((mutations) => {  // Assign to global observer
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'IMG') {
                    processImage(node);
                } else if (node.nodeName === 'VIDEO') {
                    processVideo(node);
                }
                traverseShadowDOM(node);
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Start observing when the script runs
observeInstagramMedia();

// Re-observe if the observer is disconnected (e.g., due to page navigation)
setInterval(() => {
    if (!observer) {
        observeInstagramMedia();
    }
}, 1000); // Check every second

// Measure page load time and process media when the page is fully loaded
window.onload = () => {
    currentPageFilterCount = 0;
    chrome.storage.local.set({ currentPageFilterCount: 0 });
    setTimeout(() => {
        const loadTime = performance.now();
        console.log(`🚀 Sending page load time: ${loadTime} ms to background.js`);

        // Calculate total page size
        const resources = performance.getEntriesByType("resource");
        let totalBytes = 0;
        resources.forEach(resource => {
            totalBytes += resource.transferSize || 0;
        });

        chrome.runtime.sendMessage({
            action: "logPageLoadTime",
            siteUrl: window.location.hostname,
            loadTime: loadTime,
            pageSize: totalBytes
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(" Error sending message:", chrome.runtime.lastError);
            } else {
                console.log(" Page load time message sent successfully.");
            }
        });

        // Track memory usage
        if (window.performance && window.performance.memory) {
            const memoryUsage = window.performance.memory.usedJSHeapSize;
            chrome.runtime.sendMessage({
                action: "logMemoryUsage",
                siteUrl: window.location.hostname,
                memoryUsage: memoryUsage
            });
        }
    }, 500);  // Delay to ensure timing data is available

    // Process media elements (images, GIFs, videos)
    observeMedia();
    traverseShadowDOM(document.body);
};

// Add cache cleanup on page unload
window.addEventListener('unload', () => {
    processedImages.clear();
});

// Optional: Periodically clean old entries to prevent memory bloat
setInterval(() => {
    if (processedImages.size > 1000) { // Adjust threshold as needed
        console.log("Cleaning image cache...");
        processedImages.clear();
    }
}, 300000); // Clean every 5 minutes if needed

// Safe Search Enforcer for Google and YouTube
function enforceGoogleYoutubeSafeSearch() {
  // Skip if feature is disabled
  if (!safeSearchEnabled) return;
  
  const currentURL = window.location.href;
  
  // For Google: Check if safe search is explicitly disabled or not set
  if (currentURL.includes('google.com/search')) {
    if (currentURL.includes('safe=off') || currentURL.includes('safe=images') || !currentURL.includes('safe=')) {
      // Force safe search by redirecting
      const newURL = currentURL.includes('safe=') 
        ? currentURL.replace(/safe=(off|images)/g, 'safe=active')
        : currentURL + (currentURL.includes('?') ? '&' : '?') + 'safe=active';
      
      console.log("Enforcing Google safe search. Redirecting to:", newURL);
      window.location.replace(newURL);
      return; // Exit after redirect
    }
  }
  
  // For YouTube: Always enforce restricted mode on search results
  if (currentURL.includes('youtube.com/results') && !currentURL.includes('sp=EgIQAQ')) {
    const newURL = currentURL + (currentURL.includes('?') ? '&' : '?') + 'sp=EgIQAQ';
    console.log("Enforcing YouTube restricted mode. Redirecting to:", newURL);
    window.location.replace(newURL);
    return; // Exit after redirect
  }
}

// Run on page load
enforceGoogleYoutubeSafeSearch();

// Also run when URL changes without page reload (for single-page applications)
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    enforceGoogleYoutubeSafeSearch();
  }
}).observe(document, {subtree: true, childList: true});

// Run immediately when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on a search results page with unsafe settings
  if (window.location.href.includes('google.com/search') || 
      window.location.href.includes('youtube.com/results')) {
    
    // Force immediate check regardless of when extension loaded
    enforceGoogleYoutubeSafeSearch();
    
    // Also check after a short delay to handle dynamic page loads
    setTimeout(enforceGoogleYoutubeSafeSearch, 500);
  }
});

// Listener for settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSafeSearchSetting') {
        // Always keep enabled regardless of the request
        safeSearchEnabled = true;
        enforceGoogleYoutubeSafeSearch();
    }
});

// Initialize the setting when content script loads
chrome.storage.local.get('safeSearchEnabled', (data) => {
    // Always set to true regardless of stored value
    safeSearchEnabled = true;
});
