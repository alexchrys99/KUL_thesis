// Function to process images properly (keeping full frame)
async function processImage(img) {
    if (!img.src || img.src.trim() === "" || img.src.startsWith("data:")) {
        console.error("Image source is empty or invalid.");
        return;
    }

    // Skip small images (e.g., thumbnails) to avoid false positives
    if (img.naturalWidth < 35 || img.naturalHeight < 35) {
        console.log("Skipping small image (thumbnail).");
        return;
    }

    try {
        // Set crossOrigin to avoid tainted canvas errors
        img.crossOrigin = "anonymous";

        // Wait for image to load completely
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Use natural width/height to get the full frame
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png'); // Preserve PNG details
        console.log("Sending image data:", imageDataUrl);

        const response = await fetch('https://aa4f-178-51-62-246.ngrok-free.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Server response:", result); // Debugging server response

        // Apply blur or remove it based on the prediction result
        if (result.prediction === "NSFW") {
            console.log("NSFW image detected, applying blur.");
            img.style.filter = 'blur(20px)'; // Apply blur to NSFW images
            img.style.webkitFilter = 'blur(20px)'; // For Safari support
            img.style.pointerEvents = 'none'; // Prevent interaction with blurred images
        } else {
            console.log("Image is safe, no action taken.");
        }
    } catch (error) {
        console.error("Error processing image:", error);
    }
}

// Function to process GIFs by extracting frames
async function processGIF(gif) {
    if (!gif.src || gif.src.trim() === "" || gif.src.startsWith("data:")) {
        console.error("GIF source is empty or invalid.");
        return;
    }

    // Skip small GIFs (e.g., thumbnails) to avoid false positives
    if (gif.naturalWidth < 50 || gif.naturalHeight < 50) {
        console.log("Skipping small GIF (thumbnail).");
        return;
    }

    try {
        // Convert GIF to an image for processing (extract first frame)
        const response = await fetch(gif.src, { mode: 'no-cors' });
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        ctx.drawImage(imageBitmap, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png'); // Keep full image details

        console.log("Sending GIF frame for detection:", imageDataUrl);

        const apiResponse = await fetch('https://aa4f-178-51-62-246.ngrok-free.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
        });

        const result = await apiResponse.json();
        console.log("GIF response:", result); // Debugging server response

        if (result.prediction === "NSFW") {
            console.log("NSFW content detected in GIF, applying blur.");
            gif.style.filter = 'blur(20px)'; // Apply blur to GIF if NSFW
            gif.style.webkitFilter = 'blur(20px)'; // For Safari support
            gif.style.pointerEvents = 'none'; // Prevent interaction with blurred images
        } else {
            console.log("GIF is safe, no action taken.");
        }
    } catch (error) {
        console.error("Error processing GIF:", error);
    }
}

// Function to process all media
function processMedia() {
    document.querySelectorAll('img').forEach(processImage);
    document.querySelectorAll('video').forEach(processVideo);
    document.querySelectorAll('img[src$=".gif"]').forEach(processGIF);
}

// Function to process background images (CSS)
async function processBackgroundImage(element) {
    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    const imageUrl = backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
    if (imageUrl && imageUrl[2]) {
        const img = new Image();
        img.src = imageUrl[2];
        await processImage(img); // Reuse the processImage function
    }
}

// Observe for new elements (lazy-loaded media)
function observeMedia() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'IMG' && node.complete) {
                    processImage(node);
                } else if (node.nodeName === 'VIDEO') {
                    processVideo(node);
                } else if (node.nodeName === 'IMG' && node.src.endsWith('.gif')) {
                    processGIF(node);
                } else if (node.nodeName === 'DIV' || node.nodeName === 'SPAN') {
                    processBackgroundImage(node);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Start processing
processMedia();
observeMedia();