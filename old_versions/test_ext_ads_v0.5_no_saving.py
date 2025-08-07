import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from nudenet import NudeDetector
from PIL import Image
from io import BytesIO
import cv2
import numpy as np

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the NudeDetector
detector = NudeDetector()

# Initialize threshold with a default value
THRESHOLD = 0.4



@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        response.headers.add("Access-Control-Allow-Private-Network", "true")
        return response, 200

    try:
        # Get the base64 image data from the request
        base64_image = request.json['base64_image']
        print(f"Received base64 image data with threshold {THRESHOLD}.")

        # Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        try:
            header, base64_data = base64_image.split(',', 1)
        except ValueError:
            print("Invalid base64 format: missing header.")
            return jsonify({"error": "Invalid base64 format"}), 400

        # Decode the base64 data
        try:
            decoded_image = base64.b64decode(base64_data)
            image = Image.open(BytesIO(decoded_image))

            # Convert PIL Image to NumPy array
            image = np.array(image)
            if image.shape[-1] == 4:  # PNG with alpha channel
                image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)  # Remove alpha
            else:
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # Convert RGB to BGR for OpenCV
            print("Image decoded and converted to OpenCV format.")
        except Exception as e:
            print(f"Error decoding/loading image: {e}")
            return jsonify({"error": str(e)}), 400

        # Detect NSFW content
        try:
            results = detector.detect(image)
            nsfw_classes = [
                #WOMAN BODY PARTS
                'FEMALE_BREAST_EXPOSED', 'FEMALE_GENITALIA_EXPOSED', 
                'FEMALE_BUTTOCKS_EXPOSED', 'FEMALE_GENITALIA_COVERED','FEMALE_NIPPLE_EXPOSED', 
                'FEMALE_UNDERWEAR_EXPOSED', 
                'BIKINI', 'FEMALE_CLEAVAGE_VISIBLE','ANUS_EXPOSED',
                'BUTTOCKS_COVERED', 'ANUS_COVERED'
                
                #MAN BODY PARTS
                'MALE_GENITALIA_COVERED','MALE_BUTTOCKS_EXPOSED','MALE_GENITALIA_EXPOSED',
                'MALE_UNDERWEAR_EXPOSED',
            ]

            nsfw_detected = any(
                result['score'] >= THRESHOLD and result['class'] in nsfw_classes
                for result in results
            )
            print(f"NSFW detected: {nsfw_detected}")
            
            return jsonify({
                "prediction": "NSFW" if nsfw_detected else "SFW",
                "current_threshold": THRESHOLD
            })

        except Exception as e:
            print(f"Error detecting NSFW content: {e}")
            return jsonify({"error": str(e)}), 500

    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify({"error": str(e)}), 500
if __name__ == '__main__':
    app.run(port=5000, debug=True)  # Run in debug mode for detailed logs
