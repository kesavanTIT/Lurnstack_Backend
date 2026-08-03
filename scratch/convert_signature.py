from PIL import Image
import os

input_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\acce10e2-2af3-4f3b-a70c-93d6f1910b2b\media__1785736159304.png"
output_path1 = r"d:\Lurnstack-backned\src\assets\image\signature.png"
output_path2 = r"d:\Lurnstack-backned\templates\signature.png"

# Ensure output directories exist
os.makedirs(os.path.dirname(output_path1), exist_ok=True)
os.makedirs(os.path.dirname(output_path2), exist_ok=True)

img = Image.open(input_path).convert("RGBA")
datas = img.getdata()

new_data = []
for item in datas:
    r, g, b, a = item
    # Background is black (low r, g, b). Signature is blue (high b or g relative to black).
    # Calculate brightness/intensity of non-black pixels
    intensity = max(r, g, b)
    if intensity < 35: # dark background
        new_data.append((0, 0, 0, 0)) # Fully transparent
    else:
        # Scale alpha smoothly based on intensity so anti-aliased edges look smooth
        alpha = min(255, int((intensity - 20) * 1.5))
        # Set signature stroke color to dark black (#111827)
        new_data.append((17, 24, 39, alpha))

img.putdata(new_data)
# Crop to content bounding box
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

img.save(output_path1, "PNG")
img.save(output_path2, "PNG")

print("Successfully converted signature to black with transparent background!")
print(f"Saved to {output_path1} and {output_path2}")
