let lastRequestTime = 0;
let observer;  // Declare globally
const requestDelay = 1000; // 1 second delay between requests

async function makeRequest(url, options) {
    const now = Date.now();
    if (now - lastRequestTime < requestDelay) {
        // Wait until the delay is over
        await new Promise(resolve => setTimeout(resolve, requestDelay - (now - lastRequestTime)));
    }

    lastRequestTime = Date.now();
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Request failed:", error);
        throw error; // Re-throw the error for further handling
    }
}

// Function to process images properly (keeping full frame)
async function processImage(img) {
    if (!img.src && !img.dataset.src) {
        console.error("Image source is empty or invalid.");
        return;
    }

    const imageSrc = img.src || img.dataset.src;
    if (!imageSrc || imageSrc.trim() === "" || imageSrc.startsWith("data:")) {
        console.error("Image source is empty or invalid.");
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
        console.log("Sending image data:", imageDataUrl);

        const result = await makeRequest('https://j-malaysia-ref-feat.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
        });

        console.log("Server response:", result);

        if (result.prediction === "NSFW") {
            console.log("NSFW image detected, applying blur.");
            img.style.filter = 'blur(20px)';
            img.style.webkitFilter = 'blur(20px)';
            img.style.pointerEvents = 'none';

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
        } else {
            console.log("Image is safe, no action taken.");
        }
    } catch (error) {
        console.error("Error processing image:", error);
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

        const result = await makeRequest('https://j-malaysia-ref-feat.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
        });

        console.log("GIF response:", result);

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
        const result = await makeRequest('https://j-malaysia-ref-feat.trycloudflare.com/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
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

