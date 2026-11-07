"""Hangs a painting photo at true size on the rendered room wall.

python3 -I composite.py <room dir> <painting.jpg> <widthIn> <heightIn> <out.jpg>

The painting's bottom edge sits 9 in above the sofa back. The room's own
light on the wall is carried onto the painting (rendered wall / wall paint
colour), and a soft shadow falls away from the window. Also writes a
closer crop (<out>-close.jpg) that keeps the whole sofa in view.
"""
import json
import sys

from PIL import Image, ImageChops, ImageFilter

room_dir, photo, w_in, h_in, out = sys.argv[1:6]
w_in, h_in = float(w_in), float(h_in)
room = Image.open(f"{room_dir}/room.jpg").convert("RGB")
meta = json.load(open(f"{room_dir}/room.json"))
ppm = abs(meta["pxPerMeter"])
ox, oy = meta["wallOrigin"]
INCH = 0.0254
WALL_PAINT = (0xE4, 0xDD, 0xD1)

w_px = round(w_in * INCH * ppm)
h_px = round(h_in * INCH * ppm)
bottom_m = meta["sofaTopM"] + 9 * INCH
left = round(ox - w_px / 2)
top = round(oy - (bottom_m * ppm) - h_px)

art = Image.open(photo).convert("RGB").resize((w_px, h_px), Image.LANCZOS)

# The wall's light where the painting hangs: rendered colour over paint
# colour, smoothed, so the window's falloff lands on the painting too.
pad = max(w_px, h_px) // 2
region = room.crop((left - pad, top - pad, left + w_px + pad, top + h_px + pad))
light = region.filter(ImageFilter.GaussianBlur(pad / 3))
paint = Image.new("RGB", light.size, WALL_PAINT)
# light / paint, done as multiply by 255/paint per channel.
light = Image.merge(
    "RGB",
    [
        ch.point(lambda v, p=p: min(255, round(v * 255 / p)))
        for ch, p in zip(light.split(), WALL_PAINT)
    ],
)
light = light.crop((pad, pad, pad + w_px, pad + h_px))
lit = ImageChops.multiply(art, light)

# Soft shadow: the window is on the image's right, so it falls left and
# down, as a 1.5 in deep canvas standing off the wall would cast.
shadow = Image.new("L", room.size, 0)
off_x, off_y = round(-0.016 * ppm), round(0.022 * ppm)
shadow.paste(210, (left + off_x, top + off_y, left + w_px + off_x, top + h_px + off_y))
shadow = shadow.filter(ImageFilter.GaussianBlur(0.016 * ppm))
dark = Image.new("RGB", room.size, (58, 52, 46))
out_img = Image.composite(dark, room, shadow.point(lambda v: v * 0.7))
out_img.paste(lit, (left, top))
out_img.save(out, quality=90)

# Closer: the sofa and its neighbours, still true scale.
sofa_w = meta["sofaWidthM"] * ppm
cw = max(sofa_w * 1.9, w_px * 2.6)
ch = cw * 2 / 3
cx = ox
cy = (top + oy) / 2 + ch * 0.06
box = (
    round(max(0, cx - cw / 2)),
    round(max(0, cy - ch / 2)),
    round(min(room.width, cx + cw / 2)),
    round(min(room.height, cy + ch / 2)),
)
out_img.crop(box).save(out.replace(".jpg", "-close.jpg"), quality=90)
print(out, (w_px, h_px), box)
