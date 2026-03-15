import requests
import os
from PIL import Image, ImageDraw, ImageFont

# 1. Create a dummy image with text
img = Image.new('RGB', (400, 200), color=(255, 255, 255))
d = ImageDraw.Draw(img)
# Using default font since we don't know paths
d.text((50, 50), "Prescription: Warfarin 5mg", fill=(0, 0, 0))
d.text((50, 100), "Ibuprofen 200mg", fill=(0, 0, 0))
img.save('test_medicine.png')

# 2. Test the API
url = "http://localhost:8000/api/extract-medicine"
with open('test_medicine.png', 'rb') as f:
    files = {'file': ('test_medicine.png', f, 'image/png')}
    print(f"Sending request to {url}...")
    try:
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(response.json())
    except Exception as e:
        print(f"Request failed: {e}")

# Cleanup
if os.path.exists('test_medicine.png'):
    os.remove('test_medicine.png')
