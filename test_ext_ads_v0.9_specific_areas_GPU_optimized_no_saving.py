import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from nudenet import NudeDetector
from PIL import Image
from io import BytesIO
import cv2
import numpy as np
import torch
import torch_directml
import time
import atexit
import signal
import sys
import re
from statistics import mean
from collections import defaultdict

# Add global variables for tracking
processing_times = []
total_images_processed = 0
category_stats = defaultdict(int)

def print_statistics():
    if processing_times:
        avg_time = mean(processing_times)
        print("\n=== Processing Statistics ===")
        print(f"Total images processed: {total_images_processed}")
        print(f"Average processing time: {avg_time:.2f} seconds")
        print(f"Fastest processing time: {min(processing_times):.2f} seconds")
        print(f"Slowest processing time: {max(processing_times):.2f} seconds")
        print("\n=== Category-wise Statistics ===")
        for category, count in category_stats.items():
            if count > 0:  # Only print categories with images
                print(f"{category}: {count} images")
        print("==========================\n")

# Register the statistics function to run at exit
atexit.register(print_statistics)

def check_gpu():
    try:
        dml_device = torch_directml.device()
        print("DirectML GPU device found")
        return dml_device
    except Exception as e:
        print(f"GPU not available, falling back to CPU. Error: {e}")
        return torch.device("cpu")

# Initialize device and detector
device = check_gpu()
detector = NudeDetector()

app = Flask(__name__)
CORS(app)

NSFW_THRESHOLDS = {
    'EXPOSED': {
        'threshold': 0.2,
        'classes': [
             'FEMALE_BREAST_EXPOSED',
            'FEMALE_GENITALIA_EXPOSED',
            'BUTTOCKS_EXPOSED',
            'MALE_GENITALIA_EXPOSED',
            'ANUS_EXPOSED'
        ]
    },
    'COVERED': {
        'threshold': 0.2,
        'classes': [
            'FEMALE_GENITALIA_COVERED',
            'FEMALE_BREAST_COVERED',
            'BUTTOCKS_COVERED',
            'ANUS_COVERED',
        ]
    }
}

# Site-specific threshold rules using regex for both URL and title/text content
SITE_SPECIFIC_RULES = [
     {
        'pattern': r'(?i)(porn|xxx|adult|nsfw|sex|onlyfans|milf|dick|boob|hentai|\.xxx|\.porn|\.adult|reddit\.com\/r\/.*(?:nsfw|porn|gonewild|milf|dick|boob|hentai|onlyfans))',
        'title_pattern': r'(?i)(porn|xxx|adult|nsfw|sex|explicit|18\+|milf|dick|boob|hentai)',
        'category': 'Adult Domain',
        'thresholds': {
            'EXPOSED': 0.15,
            'COVERED': 0.3
        }
    },
    {
        'pattern': r'(?i)(instagram\.com|tiktok\.com|facebook\.com|twitter\.com|x\.com|reddit\.com)',
        'title_pattern': r'(?i)(model|fitness|workout|beach|swim|lingerie)',
        'category': 'Social Media',
        'thresholds': {
            'EXPOSED': 0.3,
            'COVERED': 0.5
        }
    },
    {
        'pattern': r'(?i)(education|gov|school|university)\.(?:com|org|edu|gov)',
        'title_pattern': r'(?i)(education|research|study|academic|science)',
        'category': 'Educational/Government',
        'thresholds': {
            'EXPOSED': 0.45,
            'COVERED': 0.55
        }
    }
]

def get_site_specific_thresholds(source_url, page_title=''):
    if not source_url:
        category_stats['Default'] += 1
        return (NSFW_THRESHOLDS['EXPOSED']['threshold'], 
                NSFW_THRESHOLDS['COVERED']['threshold'], 
                'Default')
    
    for rule in SITE_SPECIFIC_RULES:
        url_match = re.search(rule['pattern'], source_url)
        title_match = page_title and re.search(rule['title_pattern'], page_title)
        
        if url_match or title_match:
            category_stats[rule['category']] += 1
            return (rule['thresholds']['EXPOSED'], 
                    rule['thresholds']['COVERED'], 
                    rule['category'])
    
    category_stats['Default'] += 1
    return (NSFW_THRESHOLDS['EXPOSED']['threshold'], 
            NSFW_THRESHOLDS['COVERED']['threshold'], 
            'Default')

def is_thumbnail(image):
    return image.shape[0] < 128 or image.shape[1] < 128

def process_image_gpu(image):
    # Convert image to tensor and move to GPU
    if isinstance(image, np.ndarray):
        image_tensor = torch.from_numpy(image).to(device)
    else:
        image_tensor = image.to(device)
    return image_tensor

def process_base64_image(base64_image):
    """Helper function to process base64 image data"""
    if ',' not in base64_image:
        raise ValueError("Invalid base64 format")
        
    header, base64_data = base64_image.split(',', 1)
    image_format = header.split('/')[1].split(';')[0].lower()
    
    # Add padding if necessary
    padding = len(base64_data) % 4
    if padding:
        base64_data += '=' * (4 - padding)

    decoded_image = base64.b64decode(base64_data)
    image = Image.open(BytesIO(decoded_image))
    
    # Convert to numpy array
    image = np.array(image)
    
    # Handle image channels
    if len(image.shape) == 2:  # Grayscale
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[-1] == 4:  # RGBA
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
    elif image.shape[-1] != 3:  # Invalid number of channels
        raise ValueError("Invalid image format")
        
    return image

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        response.headers.add("Access-Control-Allow-Private-Network", "true")
        return response, 200

    try:
        global total_images_processed
        start_time = time.time()  # Start timing

        base64_image = request.json.get('base64_image')
        source_url = request.json.get('source_url', '')
        page_title = request.json.get('page_title', '')

        if not base64_image:
            return jsonify({"error": "No image data provided"}), 400

        try:
            # Process the base64 image
            image = process_base64_image(base64_image)
            
            # Move to GPU if available
            image_tensor = process_image_gpu(image)

        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            print(f"Error in image preprocessing: {e}")
            return jsonify({"error": str(e)}), 400

        try:
            # Get site-specific thresholds
            exposed_threshold, covered_threshold, rule_match = get_site_specific_thresholds(source_url, page_title)
            
            # Detect NSFW content
            results = detector.detect(image)
            
            is_nsfw = False
            detections = []

            for result in results:
                class_name = result['class']
                score = result['score']

                # Check exposed content with site-specific threshold
                if class_name in NSFW_THRESHOLDS['EXPOSED']['classes']:
                    if score >= exposed_threshold:
                        is_nsfw = True
                        detections.append({
                            'class': class_name,
                            'score': float(score),
                            'type': 'exposed',
                            'threshold_used': exposed_threshold
                        })

                # Check covered content with site-specific threshold
                elif class_name in NSFW_THRESHOLDS['COVERED']['classes']:
                    if score >= covered_threshold:
                        is_nsfw = True
                        detections.append({
                            'class': class_name,
                            'score': float(score),
                            'type': 'covered',
                            'threshold_used': covered_threshold
                        })

            # Calculate processing time and update statistics
            processing_time = time.time() - start_time
            processing_times.append(processing_time)
            total_images_processed += 1

            result = {
                "prediction": "NSFW" if is_nsfw else "SFW",
                "details": {
                    "nsfw_detected": is_nsfw,
                    "detections": detections,
                    "processing_time": f"{processing_time:.2f} seconds"
                }
            }
           
            return jsonify(result)

        except Exception as e:
            print(f"Error in detection: {e}")
            return jsonify({"error": str(e)}), 500

    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify({"error": str(e)}), 500

def signal_handler(sig, frame):
    print("\nShutting down server...")
    print_statistics()
    sys.exit(0)

if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal_handler)
    
    if hasattr(torch, 'cuda') and torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    print(f"Running with device: {device}")
    print("Press Ctrl+C to stop the server and see statistics")
    app.run(port=5000, debug=True)
