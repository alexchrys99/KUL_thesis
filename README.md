How it works:
1) For the script test_ext_ads:
     download dependencies:  pip install flask flask-cors nudenet opencv-python pillow Flask-Limiter Flask-Caching
     and run
   
2) Ngrok:
          Create account
          download : https://ngrok.com/downloads/windows?tab=download
           type:
                  ngrok config add-authtoken <token>
                  ngrok http 5000
                 copy the URL
   
4) Replace Ngrok URLS in extension files: in the files background.js, content.js, manifest.js
  update whereever it has URLs like https://***.ngrok-free.app/
