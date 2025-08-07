NSFW & ADs filtering browser extension


 
How it works:

1) For the script test_ext_ads:
     download dependencies: 
	
	pip install flask flask-cors nudenet opencv-python pillow Flask-Limiter Flask-Caching torch torch-directml numpy
     
	 run (choose version if you want download images or not, the images will be saved in specific folder change the path
   
2) Ngrok (simpler than cloudflare):
          Create account
          download : https://ngrok.com/downloads/windows?tab=download

           type:

                  ngrok config add-authtoken <token>
                  ngrok http 5000

           copy the URL
   
4) Replace Ngrok URLS in extension files: in the files background.js, content.js, manifest.js

   update wherever it has URLs like:
	
	 https://***.ngrok-free.app/

5) Enable developer options in chromium browsers (won't work on Mozzila)

   Load the whole folder (Enable/Disable checkboxes don't work for now)




 
 
 v0.4 is with adblocking rules for blocking youtube ads (In the first videos, it might show some ads but after initialize, almost never shows ads), gambling sites, porn sites


v0.7 blocks porn/bet sites and most of youtube adds, dynamic addition of sites to block


v0.9 dark theme, counter of filtered images

v1.0 adds an extra layer of protection by forcing safe search filters in youtube, or google



v1.2 Limits are depleted in a few minutes due to API requests 
"settimeout=0"(continuousrequests from API) 



v1.4 simplified version: removed unnecessary non-functional buttons, corrected bugs (improved DOM logic). Cloudflare works better now, but be careful with the limits. Prevented deactivation of 'Safe Search'.


v1.5 Removed Ad-blocking, only necessary parts for detection of visual elements of NSFW elements

only NSFW filtering browser extension







v1.6 removal of extra code Erax_AI_extension_1.6

The script Erax_AI_model_1.1.py contains the logic of 3 mechanisms for context (apply dynamically low threshold)
With minimal changes, also Nudenet can be used

1) dangerous domains
2) dangerous alt-text
3) If the model detects a class with a high confidence, then the website becomes dangerouus
