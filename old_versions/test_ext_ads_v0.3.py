import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from nudenet import NudeDetector
from PIL import Image
from io import BytesIO
import cv2
import numpy as np
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the NudeDetector
detector = NudeDetector()

# Set the default threshold value
THRESHOLD = 0.5  # Adjust this value as needed

# Define the base directory dynamically based on threshold
BASE_DIR = f"test_ext_{str(THRESHOLD).replace('.', '_')}"

# Create the root folder with the threshold-based name
os.makedirs(f"{BASE_DIR}/images/original", exist_ok=True)
os.makedirs(f"{BASE_DIR}/images/sfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/images/nsfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/images/nsfw_filtered", exist_ok=True)
os.makedirs(f"{BASE_DIR}/thumbnails/original", exist_ok=True)
os.makedirs(f"{BASE_DIR}/thumbnails/sfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/thumbnails/nsfw", exist_ok=True)
os.makedirs(f"{BASE_DIR}/thumbnails/nsfw_filtered", exist_ok=True)

# Function to get the next sequential number for saving images
def get_next_image_number(directory):
    # Get a list of existing files in the directory
    existing_files = [f for f in os.listdir(directory) if f.endswith(('.jpg', '.jpeg', '.png'))]
    
    # Extract numbers from filenames
    numbers = []
    for file in existing_files:
        try:
            # Extract the number from the filename (e.g., "1.jpg" -> 1)
            number = int(file.split('.')[0])
            numbers.append(number)
        except ValueError:
            continue  # Skip files that don't match the naming pattern
    
    # Determine the next number
    if numbers:
        return max(numbers) + 1
    else:
        return 1  # Start from 1 if no files exist

# Function to check if an image is a thumbnail (smaller than 128x128)
def is_thumbnail(image):
    return image.shape[0] < 128 or image.shape[1] < 128

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

        # Determine if the image is a thumbnail
        if is_thumbnail(image):
            # Save only in the thumbnails folder
            original_folder = f"{BASE_DIR}/thumbnails/original"
            next_original_number = get_next_image_number(original_folder)
            original_image_path = f"{original_folder}/{next_original_number}.{image_extension}"
            cv2.imwrite(original_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            print(f"Thumbnail saved to: {original_image_path}")
        else:
            # Save in the images folder
            original_folder = f"{BASE_DIR}/images/original"
            next_original_number = get_next_image_number(original_folder)
            original_image_path = f"{original_folder}/{next_original_number}.{image_extension}"
            cv2.imwrite(original_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            print(f"Full-sized image saved to: {original_image_path}")

        # Detect NSFW content
        try:
            results = detector.detect(image)
            nsfw_classes = [
                'FEMALE_BREAST_EXPOSED', 'FEMALE_GENITALIA_EXPOSED', 'MALE_GENITALIA_EXPOSED',
                'FEMALE_BREAST_COVERED', 'FEMALE_BUTTOCKS_EXPOSED', 'MALE_BUTTOCKS_EXPOSED',
                'FEMALE_GENITALIA_COVERED', 'MALE_GENITALIA_COVERED',
                'FEMALE_NIPPLE_EXPOSED', 
                'FEMALE_CLEAVAGE_VISIBLE', 'FEMALE_UNDERWEAR_EXPOSED', 'MALE_UNDERWEAR_EXPOSED',
                'FEMALE_SPORTS_BRA',  'BIKINI', 'FEMALE_CLEAVAGE_VISIBLE','ANUS_EXPOSED',
                'BUTTOCKS_COVERED', 'ANUS_COVERED'
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
            if is_thumbnail(image):
                # Save to nsfw thumbnails folder
                nsfw_folder = f"{BASE_DIR}/thumbnails/nsfw"
                next_nsfw_number = get_next_image_number(nsfw_folder)
                processed_image_path = f"{nsfw_folder}/{next_nsfw_number}.{image_extension}"
                cv2.imwrite(processed_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                print(f"NSFW thumbnail saved to: {processed_image_path}")

                # Save a filtered version with blur
                nsfw_filtered_folder = f"{BASE_DIR}/thumbnails/nsfw_filtered"
                next_filtered_number = get_next_image_number(nsfw_filtered_folder)
                processed_filtered_image_path = f"{nsfw_filtered_folder}/{next_filtered_number}.{image_extension}"
                blurred_image = cv2.GaussianBlur(image, (99, 99), 0)
                cv2.imwrite(processed_filtered_image_path, cv2.cvtColor(blurred_image, cv2.COLOR_BGR2RGB))
                print(f"Blurred NSFW thumbnail saved to: {processed_filtered_image_path}")
            else:
                # Save to nsfw images folder
                nsfw_folder = f"{BASE_DIR}/images/nsfw"
                next_nsfw_number = get_next_image_number(nsfw_folder)
                processed_image_path = f"{nsfw_folder}/{next_nsfw_number}.{image_extension}"
                cv2.imwrite(processed_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                print(f"NSFW image saved to: {processed_image_path}")

                # Save a filtered version with blur
                nsfw_filtered_folder = f"{BASE_DIR}/images/nsfw_filtered"
                next_filtered_number = get_next_image_number(nsfw_filtered_folder)
                processed_filtered_image_path = f"{nsfw_filtered_folder}/{next_filtered_number}.{image_extension}"
                blurred_image = cv2.GaussianBlur(image, (99, 99), 0)
                cv2.imwrite(processed_filtered_image_path, cv2.cvtColor(blurred_image, cv2.COLOR_BGR2RGB))
                print(f"Blurred NSFW image saved to: {processed_filtered_image_path}")
        else:
            if is_thumbnail(image):
                # Save to sfw thumbnails folder
                sfw_folder = f"{BASE_DIR}/thumbnails/sfw"
                next_sfw_number = get_next_image_number(sfw_folder)
                processed_image_path = f"{sfw_folder}/{next_sfw_number}.{image_extension}"
                cv2.imwrite(processed_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                print(f"SFW thumbnail saved to: {processed_image_path}")
            else:
                # Save to sfw images folder
                sfw_folder = f"{BASE_DIR}/images/sfw"
                next_sfw_number = get_next_image_number(sfw_folder)
                processed_image_path = f"{sfw_folder}/{next_sfw_number}.{image_extension}"
                cv2.imwrite(processed_image_path, cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
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