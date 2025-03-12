import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from nudenet import NudeDetector
from PIL import Image
from io import BytesIO
import cv2
import numpy as np
import os
import uuid  # To generate unique filenames

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the NudeDetector
detector = NudeDetector()

# Set the default threshold value
THRESHOLD = 0.5 # Adjust this value as needed

# Define the base directory dynamically based on threshold
BASE_DIR = f"test_{str(THRESHOLD).replace('.', '_')}"

# Create the root folder with the threshold-based name
os.makedirs(f"{BASE_DIR}/original", exist_ok=True)
os.makedirs(f"{BASE_DIR}/sfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/nsfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/nsfw_filtered", exist_ok=True)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get the base64 image data from the request
        base64_image = request.json['base64_image']
        print(f"Received base64 image data with threshold {THRESHOLD}.")

        # Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        try:
            header, base64_data = base64_image.split(',', 1)
            image_format = header.split('/')[1].split(';')[0].lower()  # Extract format
        except ValueError:
            print("Invalid base64 format: missing header.")
            return jsonify({"error": "Invalid base64 format"}), 400

        # Decode the base64 data
        try:
            decoded_image = base64.b64decode(base64_data)
            image = Image.open(BytesIO(decoded_image))
            image_extension = "jpg" if image_format in ["jpeg", "jpg"] else image_format  # Ensure correct extension
            
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

        # Generate a unique filename for the image
        image_id = str(uuid.uuid4())
        original_image_path = f"{BASE_DIR}/original/{image_id}.{image_extension}"

        # Save the original image with correct handling for PNG
        if image_extension == "png":
            cv2.imwrite(original_image_path, cv2.cvtColor(image, cv2.COLOR_RGB2RGBA))  # Preserve transparency
        else:
            cv2.imwrite(original_image_path, image)
        print(f"Original image saved to: {original_image_path}")

        # Detect NSFW content
        try:
            results = detector.detect(image)
            nsfw_classes = [
                'FEMALE_BREAST_EXPOSED', 'FEMALE_GENITALIA_EXPOSED', 'MALE_GENITALIA_EXPOSED',
                'FEMALE_BREAST_COVERED', 'FEMALE_BUTTOCKS_EXPOSED', 'MALE_BUTTOCKS_EXPOSED',
                'FEMALE_GENITALIA_COVERED', 'MALE_GENITALIA_COVERED', 
                'FEMALE_NIPPLE_EXPOSED', 'FEMALE_ARMPITS_EXPOSED', 'MALE_CHEST_EXPOSED',
                'FEMALE_CLEAVAGE_VISIBLE', 'FEMALE_UNDERWEAR_EXPOSED', 'MALE_UNDERWEAR_EXPOSED',
                'FEMALE_SPORTS_BRA', 'MALE_CHEST_BARE', 'BIKINI', 'FEMALE_CLEAVAGE_VISIBLE',
                'MALE_BREAST_EXPOSED'
            ]

            nsfw_detected = any(
                result['score'] >= THRESHOLD and result['class'] in nsfw_classes
                for result in results
            )
            print(f"NSFW detected: {nsfw_detected}")
        except Exception as e:
            print(f"Error detecting NSFW content: {e}")
            return jsonify({"error": str(e)}), 500

        # Save the processed image in the appropriate folder
        if nsfw_detected:
            # Save to nsfw folder without blur
            processed_image_path = f"{BASE_DIR}/nsfw/{image_id}_{str(THRESHOLD).replace('.', '_')}_nsfw.{image_extension}"
            cv2.imwrite(processed_image_path, image)
            print(f"NSFW image saved to: {processed_image_path}")
            
            # Save a filtered version with blur
            processed_filtered_image_path = f"{BASE_DIR}/nsfw_filtered/{image_id}_{str(THRESHOLD).replace('.', '_')}_nsfw_filtered.{image_extension}"
            blurred_image = cv2.GaussianBlur(image, (99, 99), 0)
            cv2.imwrite(processed_filtered_image_path, blurred_image)
            print(f"Blurred NSFW image saved to: {processed_filtered_image_path}")
        else:
            # Save to sfw folder
            processed_image_path = f"{BASE_DIR}/sfw/{image_id}_{str(THRESHOLD).replace('.', '_')}_sfw.{image_extension}"
            cv2.imwrite(processed_image_path, image)
            print(f"SFW image saved to: {processed_image_path}")

        # Convert processed image back to base64
        try:
            with open(processed_image_path, "rb") as image_file:
                processed_base64 = base64.b64encode(image_file.read()).decode('utf-8')
                processed_image_url = f"data:image/{image_extension};base64,{processed_base64}"
                print("Processed image converted to base64.")
        except Exception as e:
            print(f"Error converting processed image to base64: {e}")
            return jsonify({"error": str(e)}), 500

        return jsonify({
            "prediction": "NSFW" if nsfw_detected else "SFW",
            "processed_image": processed_image_url
        })

    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)  # Run in debug mode for detailed logs
