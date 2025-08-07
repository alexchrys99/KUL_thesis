**NSFW Filtering Browser Extension**

This browser extension filters NSFW content using a client-server model. With the addition of a blocklist, it can also function as an ad-blocker.


**Requirements**
A tunnel service like Ngrok or Cloudflare is required for the extension to communicate with the local server.

A Chromium-based browser (e.g., Google Chrome, Microsoft Edge). This extension is not compatible with Mozilla Firefox.


**Setup Instructions**
**Run the Backend Server:**

	Start the Erax_AI_model_1.1.py script.

**Set up the Tunnel (Ngrok Example):**

	Create an account and download Ngrok.

	Add your authtoken: ngrok config add-authtoken <YOUR_TOKEN>

	Expose your local server (running on port 5000): ngrok http 5000

	Copy the public URL provided by Ngrok (e.g., https://*******.ngrok-free.app).


**Update Extension Files:**

	In the Erax_AI_extension_1.6 folder, open the manifest.json file.

	Replace the placeholder URL in the host_permissions section with your public Ngrok URL.

**Load the Extension:**

	Open your Chromium browser and navigate to the extensions page (e.g., chrome://extensions).

	Enable "Developer mode."

	Click "Load unpacked" and select the entire Erax_AI_extension_1.6 folder.



**Features**
	The backend script (Erax_AI_model_1.1.py) uses three context-aware mechanisms to dynamically lower the detection threshold when a high-risk situation is detected:

	-High-Risk Domain Analysis: Lowers sensitivity on domains with specific keywords.

	-High-Risk Alt-Text Analysis: Lowers sensitivity if an image's alt-text contains specific keywords.

	-Model-Driven Escalation: If the model detects content with high confidence, the entire domain is temporarily treated as high-risk.

Note: The script can be modified to use the NudeNet model instead of the default.
