const processedImages = new Map();

function getImageSignature(img) {
    return img.src || img.dataset.src || '';
}

let observer;

function updateSiteBlurStats() {
    const currentSite = window.location.hostname;
    chrome.storage.local.get(['blurStatsBySite'], (data) => {
        const blurStatsBySite = data.blurStatsBySite || {};
        blurStatsBySite[currentSite] = (blurStatsBySite[currentSite] || 0) + 1;
        chrome.storage.local.set({ blurStatsBySite });
    });
}

function incrementBlurStats() {
    updateSiteBlurStats();
}

async function makeRequest(body) {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'predict', body: body });
        if (chrome.runtime.lastError) {
             throw new Error(chrome.runtime.lastError.message);
        }
        if (response.error) {
            throw new Error(response.error);
        }
        return response;
    } catch (error) {
        console.error("Error sending message to background script:", error);
        throw error;
    }
}

async function processMediaElement(element) {
    if (!element || element.dataset.nsfwProcessed === "true" || !element.isConnected) return;

    const computedStyle = window.getComputedStyle(element);
    const width = parseInt(computedStyle.width);
    const height = parseInt(computedStyle.height);
    if ((width > 0 && width < 128) || (height > 0 && height < 128)) {
        return;
    }

    const imageSignature = getImageSignature(element);
    if (processedImages.has(imageSignature)) {
        if (processedImages.get(imageSignature) === "NSFW") {
            element.style.filter = 'blur(20px)';
            element.style.webkitFilter = 'blur(20px)';
        }
        return;
    }
    
    element.dataset.nsfwProcessed = "true";

    let imageDataUrl;
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        element.crossOrigin = "anonymous";

        if (element.tagName === 'IMG') {
            if (!element.complete) await new Promise(r => { element.onload = r; element.onerror = r; });
            canvas.width = element.naturalWidth;
            canvas.height = element.naturalHeight;
            if (canvas.width < 128 || canvas.height < 128) return;
            ctx.drawImage(element, 0, 0);
        } else if (element.tagName === 'VIDEO') {
            if (element.readyState < 2) await new Promise(r => { element.onloadeddata = r; element.onerror = r; });
            canvas.width = element.videoWidth;
            canvas.height = element.videoHeight;
            if (canvas.width < 128 || canvas.height < 128) return;
            ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
        } else {
             return;
        }
        imageDataUrl = canvas.toDataURL('image/png');
    } catch (e) {
        return;
    }

    try {
        const currentSite = window.location.hostname;
        const elementAltText = (element.alt || "").toLowerCase();

        // #new code - This logic now only prepares the flag to be sent to the backend
        const getStorageData = (keys) => new Promise(resolve => chrome.storage.session.get(keys, resolve));
        const storageData = await getStorageData(['highRiskSites']);
        const isHighRisk = (storageData.highRiskSites || []).includes(currentSite);

        const requestBody = {
            base64_image: imageDataUrl,
            source_url: currentSite,
            page_title: document.title,
            alt_text: elementAltText,
            caption: "",
            use_low_threshold: isHighRisk // This flag tells the backend to use a lower threshold
        };
        
        const result = await makeRequest(requestBody);

        if (result.escalate === true) {
            chrome.runtime.sendMessage({ action: "escalateSite", siteUrl: currentSite });
        }

        processedImages.set(imageSignature, result.prediction);

        if (result.prediction === "NSFW") {
            element.style.filter = 'blur(20px)';
            element.style.webkitFilter = 'blur(20px)';
            incrementBlurStats();
        }
    } catch (error) {
        console.error("Error processing element:", error);
    }
}


async function traverseShadowDOM(root) {
    if (!root) return;
    const nodes = root.querySelectorAll('img, video');
    for (const node of nodes) {
        await processMediaElement(node);
        if (node.shadowRoot) {
            await traverseShadowDOM(node.shadowRoot);
        }
    }
}

function observeMedia() {
    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { 
                    if (node.matches('img, video')) {
                        processMediaElement(node);
                    }
                    const mediaElements = node.querySelectorAll('img, video');
                    for (const media of mediaElements) {
                        processMediaElement(media);
                    }
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

window.onload = () => {
    setTimeout(() => {
        const loadTime = performance.now();
        chrome.runtime.sendMessage({
            action: "logPageLoadTime",
            siteUrl: window.location.hostname,
            loadTime: loadTime
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error sending page load time:", chrome.runtime.lastError.message);
            }
        });
    }, 500);

    traverseShadowDOM(document.body);
    observeMedia();
};

window.addEventListener('unload', () => {
    if (observer) observer.disconnect();
    processedImages.clear();
});