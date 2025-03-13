// Function to process images properly (keeping full frame)
async function processImage(img) {
    if (!img.src && !img.dataset.src) {
        console.error("Image source is empty or invalid.");
        return;
    }

    // Use data-src if src is not available (for lazy-loaded images)
    const imageSrc = img.src || img.dataset.src;
    if (!imageSrc || imageSrc.trim() === "" || imageSrc.startsWith("data:")) {
        console.error("Image source is empty or invalid.");
        return;
    }

    try {
        // Set crossOrigin to avoid tainted canvas errors
        img.crossOrigin = "anonymous";

        // Wait for image to load completely
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;

            // If the image is lazy-loaded, set the src attribute
            if (!img.src && img.dataset.src) {
                img.src = img.dataset.src;
            }
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Use natural width/height to get the full frame
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png'); // Preserve PNG details
        console.log("Sending image data:", imageDataUrl);

        const response = await fetch('https://a16f-178-51-62-246.ngrok-free.app/predict', {
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
    if (!gif.src && !gif.dataset.src) {
        console.error("GIF source is empty or invalid.");
        return;
    }

    // Use data-src if src is not available (for lazy-loaded GIFs)
    const gifSrc = gif.src || gif.dataset.src;
    if (!gifSrc || gifSrc.trim() === "" || gifSrc.startsWith("data:")) {
        console.error("GIF source is empty or invalid.");
        return;
    }

    try {
        // Convert GIF to an image for processing (extract first frame)
        const response = await fetch(gifSrc, { mode: 'no-cors' });
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        ctx.drawImage(imageBitmap, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/png'); // Keep full image details

        console.log("Sending GIF frame for detection:", imageDataUrl);

        const apiResponse = await fetch('https://a16f-178-51-62-246.ngrok-free.app/predict', {
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

// Function to process videos (including GIF videos)
async function processVideo(video) {
    // Check if the video has already been marked as NSFW
    if (video.dataset.nsfwProcessed === "true") {
        console.log("Video already marked as NSFW, skipping further checks.");
        return;
    }

    try {
        // Check if the video has a valid source (src, data-webm, or data-mp4)
        const videoSrc = video.src || video.getAttribute('data-webm') || video.getAttribute('data-mp4');
        if (!videoSrc || videoSrc.trim() === "" || videoSrc.startsWith("data:")) {
            console.error("Video source is empty or invalid.");
            return;
        }

        // Ensure the video is loaded
        if (video.readyState < 2) { // 2 = HAVE_CURRENT_DATA
            await new Promise((resolve, reject) => {
                video.addEventListener('loadeddata', resolve, { once: true });
                video.addEventListener('error', reject, { once: true });
            });
        }

        // Create a canvas to capture a frame from the video
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current frame of the video onto the canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageDataUrl = canvas.toDataURL('image/png'); // Convert frame to base64

        console.log("Sending video frame for detection:", imageDataUrl);

        const apiResponse = await fetch('https://a0d3-178-51-62-246.ngrok-free.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_image: imageDataUrl })
        });

        const result = await apiResponse.json();
        console.log("Video frame response:", result); // Debugging server response

        if (result.prediction === "NSFW") {
            console.log("NSFW content detected in video, applying persistent blur.");
            applyPersistentBlur(video); // Use the persistent blur function
        } else {
            console.log("Video frame is safe, no action taken.");
        }
    } catch (error) {
        console.error("Error processing video:", error);
    }
}

// Function to apply a persistent blur effect to a video
function applyPersistentBlur(video) {
    // Create a container for the video and its blurred overlay
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';

    // Wrap the video inside the container
    video.parentNode.insertBefore(container, video);
    container.appendChild(video);

    // Create a blurred overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backdropFilter = 'blur(20px)'; // Apply blur effect
    overlay.style.pointerEvents = 'none'; // Allow clicks to pass through to the video
    overlay.style.zIndex = '1'; // Ensure the overlay is on top of the video

    // Append the overlay to the container
    container.appendChild(overlay);

    // Mark the video as processed to avoid re-applying the blur
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
        if (node.nodeName === 'IMG' && node.complete) {
            processImage(node);
        } else if (node.nodeName === 'VIDEO') {
            processVideo(node);
        } else if (node.nodeName === 'IMG' && node.src.endsWith('.gif')) {
            processGIF(node);
        }
    });
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
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Start processing
processMedia();
observeMedia();
traverseShadowDOM(document.body);