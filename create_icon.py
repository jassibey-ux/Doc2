#!/usr/bin/env python3
"""
Generate Windows icon file for SCENSUS Dashboard.

This script creates a simple icon using PIL/Pillow.
Run: python create_icon.py

If you don't have Pillow installed: pip install Pillow
"""

import sys

def create_icon():
    """Create a simple SCENSUS icon."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
        from PIL import Image, ImageDraw, ImageFont

    # Create icon at multiple sizes for Windows ICO format
    sizes = [16, 32, 48, 64, 128, 256]
    images = []

    for size in sizes:
        # Create image with orange background (SCENSUS brand color)
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Draw rounded rectangle background
        padding = size // 8
        draw.rounded_rectangle(
            [padding, padding, size - padding, size - padding],
            radius=size // 5,
            fill=(255, 107, 0, 255)  # Orange - #FF6B00
        )

        # Draw "S" letter
        try:
            # Try to use a bold font if available
            font_size = int(size * 0.5)
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            # Fall back to default font
            font = ImageFont.load_default()

        text = "S"

        # Get text bounding box
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Center the text
        x = (size - text_width) // 2
        y = (size - text_height) // 2 - bbox[1]

        # Draw white text
        draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

        images.append(img)

    # Save as ICO
    output_path = "scensus_icon.ico"
    images[0].save(
        output_path,
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=images[1:]
    )

    print(f"Icon created: {output_path}")
    print(f"Sizes included: {sizes}")
    return output_path


def create_simple_icon():
    """Create a very simple icon without external fonts."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("ERROR: Pillow is required. Install with: pip install Pillow")
        sys.exit(1)

    sizes = [16, 32, 48, 64, 128, 256]
    images = []

    for size in sizes:
        # Create image with transparent background
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Draw circle background (orange)
        margin = max(1, size // 16)
        draw.ellipse(
            [margin, margin, size - margin, size - margin],
            fill=(255, 107, 0, 255)  # Orange
        )

        # Draw simple "S" shape using arcs
        inner_margin = size // 4
        mid = size // 2

        # Top arc of S
        draw.arc(
            [inner_margin, inner_margin, size - inner_margin, mid + inner_margin//2],
            start=180, end=360,
            fill=(255, 255, 255, 255),
            width=max(2, size // 8)
        )

        # Bottom arc of S
        draw.arc(
            [inner_margin, mid - inner_margin//2, size - inner_margin, size - inner_margin],
            start=0, end=180,
            fill=(255, 255, 255, 255),
            width=max(2, size // 8)
        )

        images.append(img)

    # Save as ICO
    output_path = "scensus_icon.ico"
    images[-1].save(
        output_path,
        format='ICO',
        sizes=[(s, s) for s in sizes]
    )

    print(f"Simple icon created: {output_path}")
    return output_path


if __name__ == "__main__":
    try:
        create_icon()
    except Exception as e:
        print(f"Fancy icon failed ({e}), creating simple icon...")
        create_simple_icon()
