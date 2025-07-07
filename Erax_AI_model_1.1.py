import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from io import BytesIO
import cv2
import numpy as np
import os
import torch
import torch_directml
import time
import atexit
import signal
import sys
import re
from statistics import mean
from collections import defaultdict

# EraX Model imports
from ultralytics import YOLO
from huggingface_hub import snapshot_download

# +++ ADDED FOR CONTROL FLAGS +++
ENABLE_DOMAIN_RULES = False       # Set to False to disable URL/title-based threshold adjustments
ENABLE_UNSAFE_WORD_CHECK = False   # Set to False to disable alt_text/caption keyword checking
# +++++++++++++++++++++++++++++++

# Add global variables for tracking
processing_times = []
total_images_processed = 0
category_stats = defaultdict(int)
model = None # Placeholder for the loaded YOLO model

# Configuration for EraX Model
ERAX_MODEL_REPO_ID = "erax-ai/EraX-NSFW-V1.0"
ERAX_MODEL_FILENAME = "erax_nsfw_yolo11n.pt"  # Nano version selected
ERAX_MODEL_LOCAL_DIR = "./erax_model_cache"

# Define NSFW classes and threshold
NSFW_CLASSES = ['PENIS', 'VAGINA', 'NIPPLE', 'ANUS', 'MAKE_LOVE']
DEFAULT_NSFW_THRESHOLD = 0.2
# Unsafe Words Configuration
UNSAFE_CONTEXT_PATTERNS = [
    r'\b(fuck|sex|sexy|porn|nude|naked|lust|erotic|explicit|hardcore|softcore)\b',
    r'\b(slut|whore|bitch|cock|pussy|dick|tits|jizz|cum|ass|creampie)\b',

    r'\b(blowjob|handjob|footjob|rimjob|deepthroat|facefuck|doggystyle)\b',
    r'\b(gangbang|threesome|foursome|orgy|ffm|fmf|mfm|bdsm|cuckold)\b',
    r'\b(cumshot|bukake|squirt|squirting|golden shower|money shot)\b',
    r'\b(pegging|scissoring|tribadism|hentai|69)\b',

    r'\b(johnny sins|mia khalifa|riley reid|lana rhoades|kendra lust)\b',
    r'\b(angela white|eva elfie|brandi love|lisa ann|bonnie blue)\b',

    r'\b(stepmom|milf|gilf|ebony|incest)\b',

    r'\b(rape|snuff|gore|bestiality|child abuse)\b'
]
UNSAFE_WORD_THRESHOLD = 0.005

# Create directory structure for saving images
BASE_DIR = r"C:\Users\alexc\Desktop\vsfiles\for_live_browsing\adblock_nsfw_test\some_tests_ext_thr\yolov11"
THRESHOLD_DIR = f"test_threshold_{DEFAULT_NSFW_THRESHOLD}"
FULL_DIR = os.path.join(BASE_DIR, THRESHOLD_DIR)

for category in ['images', 'thumbnails']:
    for subcategory in ['original', 'sfw', 'nsfw']:
        os.makedirs(os.path.join(FULL_DIR, category, subcategory), exist_ok=True)

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
            if count > 0:
                print(f"{category}: {count} images")
        print("==========================\n")

atexit.register(print_statistics)

def load_erax_nsfw_model():
    global model
    model_path = os.path.join(ERAX_MODEL_LOCAL_DIR, ERAX_MODEL_FILENAME)
    if not os.path.exists(model_path):
        print(f"Downloading EraX NSFW model: {ERAX_MODEL_FILENAME} from {ERAX_MODEL_REPO_ID}...")
        try:
            snapshot_download(
                repo_id=ERAX_MODEL_REPO_ID,
                local_dir=ERAX_MODEL_LOCAL_DIR,
                allow_patterns=[ERAX_MODEL_FILENAME],
                force_download=False,
                resume_download=True
            )
            print("Download complete.")
        except Exception as e:
            print(f"Error downloading EraX model: {e}")
            sys.exit(1)
    else:
        print(f"Found existing EraX model: {model_path}")

    try:
        print(f"Loading EraX NSFW model from: {model_path}")
        # Force CPU mode to avoid DirectML issues
        model = YOLO(model_path)
        print(f"EraX NSFW model ({ERAX_MODEL_FILENAME}) loaded successfully on CPU")
    except Exception as e:
        print(f"Error loading EraX YOLO model: {e}")
        sys.exit(1)

app = Flask(__name__)
CORS(app)

SITE_SPECIFIC_RULES = [
     {
        'pattern': r'(?i)(porn|xxx|adult|nsfw|sex|onlyfans|milf|dick|boob|hentai|\.xxx|\.porn|\.adult|reddit\.com\/r\/.*(?:nsfw|porn|gonewild|milf|dick|boob|hentai|onlyfans))',
        'title_pattern': r'(?i)(porn|xxx|adult|nsfw|sex|explicit|18\+|milf|dick|boob|hentai)',
        'category': 'Adult Domain',
        'threshold': 0.005
    }
]

def get_next_image_number(directory):
    existing_files = [f for f in os.listdir(directory) if f.endswith(('.jpg', '.jpeg', '.png'))]
    numbers = [int(f.split('.')[0]) for f in existing_files if f.split('.')[0].isdigit()]
    return max(numbers) + 1 if numbers else 1

def is_thumbnail(image):
    return image.shape[0] < 128 or image.shape[1] < 128

def process_base64_image(base64_image):
    if ',' in base64_image:
        header, base64_data = base64_image.split(',', 1)
        try:
            image_format = header.split('/')[1].split(';')[0].lower()
        except IndexError:
            image_format = 'png'
    else:
        base64_data = base64_image
        image_format = 'png'

    padding = len(base64_data) % 4
    if padding:
        base64_data += '=' * (4 - padding)
    try:
        decoded_image = base64.b64decode(base64_data)
        image = Image.open(BytesIO(decoded_image))
        image_extension = "jpg" if image_format in ["jpeg", "jpg"] else image_format

        image_np = np.array(image)

        if len(image_np.shape) == 2:
            image_np = cv2.cvtColor(image_np, cv2.COLOR_GRAY2RGB)
        elif image_np.shape[-1] == 4:
            image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)
        elif image_np.shape[-1] != 3:
            raise ValueError("Invalid image format")
        return image_np, image_extension
    except Exception as e:
        raise ValueError(f"Error processing base64 image: {str(e)}")

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    global total_images_processed, processing_times
    
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        response.headers.add("Access-Control-Allow-Private-Network", "true")
        return response, 200
    
    start_time = time.time()
    
    try:
        data = request.json
        base64_image = data.get('base64_image', '')
        source_url = data.get('source_url', 'unknown')
        page_title = data.get('page_title', '')
        alt_text = data.get('alt_text', '').lower()
        caption = data.get('caption', '').lower()
        # <<< CHANGE 1: Check for escalation status from the extension
        use_low_threshold = data.get('use_low_threshold', False)
        
        if not base64_image:
            return jsonify({"error": "No image data provided"}), 400
        
        try:
            img_np, image_extension = process_base64_image(base64_image)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            print(f"Error in image preprocessing: {e}")
            return jsonify({"error": str(e)}), 400
        
        # <<< CHANGE 2: Apply low threshold if the page is already flagged as high-risk
        if use_low_threshold:
            threshold = UNSAFE_WORD_THRESHOLD 
        else:
            threshold = get_site_specific_threshold(source_url, page_title)
        
        escalate_flag = False

        if ENABLE_UNSAFE_WORD_CHECK:
            text_context = alt_text + " " + caption
            found_unsafe_word = None
            for pattern in UNSAFE_CONTEXT_PATTERNS:
                match = re.search(pattern, text_context, re.IGNORECASE)
                if match:
                    found_unsafe_word = match.group(0)
                    threshold = min(threshold, UNSAFE_WORD_THRESHOLD)
                    # <<< CHANGE 3: Set escalate_flag to True if alt text contains a keyword
                    escalate_flag = True
                    print(f"Unsafe keyword '{found_unsafe_word}' found via regex. Lowering threshold to {threshold} and escalating.")
                    category_stats['Unsafe Word Trigger'] += 1
                    break

        try:
            with torch.no_grad():
                results = model(img_np, conf=threshold, verbose=False)
        except RuntimeError as e:
            if "Cannot set version_counter for inference tensor" in str(e):
                print("Handling inference tensor error - trying with CPU copy")
                img_np_copy = img_np.copy()
                results = model(img_np_copy, conf=threshold, verbose=False)
            else:
                raise
        
        detections = []
        for result in results:
            boxes = result.boxes
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                conf = boxes.conf[i].item()
                cls_name = result.names[cls_id].upper()
                detections.append({'class': cls_name, 'confidence': conf})
        
        is_nsfw, highest_conf, detected_class = check_nsfw(detections, threshold)

        # <<< CHANGE 4: Escalate if the model's confidence is high
        if highest_conf > 0.5:
             escalate_flag = True
        
        is_thumb = is_thumbnail(img_np)
        category = "thumbnails" if is_thumb else "images"
        
        next_number = get_next_image_number(os.path.join(FULL_DIR, category, "original"))
        
        original_path = os.path.join(FULL_DIR, category, "original", f"{next_number}.{image_extension}")
        cv2.imwrite(original_path, cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR))
        
        target_folder = "nsfw" if is_nsfw else "sfw"
        target_path = os.path.join(FULL_DIR, category, target_folder, f"{next_number}.{image_extension}")
        cv2.imwrite(target_path, cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR))
        
        total_images_processed += 1
        processing_time = time.time() - start_time
        processing_times.append(processing_time)
        
        if is_nsfw:
            category_stats['NSFW'] += 1
            print(f"NSFW detected ({detected_class} - {highest_conf:.2f}) - URL: {source_url} - Time: {processing_time:.2f}s")
            return jsonify({
                'prediction': 'NSFW', 'confidence': highest_conf, 'class': detected_class,
                'processing_time': processing_time,
                'escalate': escalate_flag,
                'details': { 'nsfw_detected': True, 'category': category, 'threshold_used': threshold,
                             'saved_paths': { 'original': original_path, 'categorized': target_path } }
            })
        else:
            category_stats['SFW'] += 1
            print(f"SFW image - URL: {source_url} - Time: {processing_time:.2f}s")
            return jsonify({
                'prediction': 'SFW', 'confidence': highest_conf, 'processing_time': processing_time,
                'escalate': escalate_flag,
                'details': { 'nsfw_detected': False, 'category': category, 'threshold_used': threshold,
                             'saved_paths': { 'original': original_path, 'categorized': target_path } }
            })
            
    except Exception as e:
        end_time = time.time()
        processing_time = end_time - start_time
        print(f"Error processing image: {str(e)} - Time: {processing_time:.2f}s")
        processing_times.append(processing_time)
        return jsonify({ 'error': str(e), 'prediction': 'ERROR', 'processing_time': processing_time })

def get_site_specific_threshold(url, title):
    if not ENABLE_DOMAIN_RULES:
        category_stats['Default (Domain Rules Disabled)'] += 1
        return DEFAULT_NSFW_THRESHOLD

    threshold = DEFAULT_NSFW_THRESHOLD
    
    for rule in SITE_SPECIFIC_RULES:
        url_match = re.search(rule['pattern'], url) if url else False
        title_match = re.search(rule['title_pattern'], title) if title else False
        
        if url_match or title_match:
            category_stats[rule['category']] += 1
            print(f"Applied {rule['category']} threshold for {url}")
            return rule['threshold']
    
    category_stats['Default'] += 1
    return threshold

def check_nsfw(detections, threshold):
    highest_conf = 0
    detected_class = None
    
    for detection in detections:
        if detection['class'] in NSFW_CLASSES:
            conf = detection['confidence']
            if conf > highest_conf:
                highest_conf = conf
                detected_class = detection['class']
            
            if conf >= threshold:
                return True, conf, detected_class
    
    return False, highest_conf, detected_class

if __name__ == '__main__':
    def signal_handler(sig, frame):
        print("\nShutting down server...")
        print_statistics()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    load_erax_nsfw_model()
    
    print("Starting Flask server...")
    print(f"Domain-specific rules are {'ENABLED' if ENABLE_DOMAIN_RULES else 'DISABLED'}.")
    print(f"Unsafe word check is {'ENABLED' if ENABLE_UNSAFE_WORD_CHECK else 'DISABLED'}.")
    print("Press Ctrl+C to stop the server and see statistics")
    app.run(host='0.0.0.0', port=5000)
