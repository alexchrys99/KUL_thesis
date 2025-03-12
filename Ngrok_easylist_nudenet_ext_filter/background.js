chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'predict') {
        fetch('https://2d10-178-51-62-246.ngrok-free.app/predict', {
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
