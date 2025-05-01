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




 
 
 v0.4 is with adblocking rules for blocking youtube ads (In first videos it might show some ads but after initialize, almost never shows ads), gambling sites, porn sites


v0.7 blocks porn/bet sites and most of youtube adds, dynamic addition of sites to block


v0.9 dark theme, counter of filtered images

V1.0 adds an extra layer of protection by forcing safe search filters in youtube, or google
