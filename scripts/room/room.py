"""Builds the living-room scene and renders it straight on to the wall.

blender -b --python room.py -- <assets dir> <out dir> [samples] [width]

Writes room.jpg and room.json: where the wall's plane lands in the image
(pixels per metre on the wall, the pixel of the wall point x=0, z=0) and
the sofa top, so a page can hang any painting at true size.
"""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
ASSETS, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
WIDTH = int(argv[3]) if len(argv) > 3 else 2000
HEIGHT = round(WIDTH * 2 / 3)

WALL_H = 2.7
WALL_W = 7.0

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, color, rough=0.9, bump=0.0, scale=40.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if bump > 0:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = scale
        noise.inputs["Detail"].default_value = 8
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def box(name, size, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def srgb(h):
    """Hex colour to linear RGB."""
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# Wall at y = 0 facing +y (the camera side), floor at z = 0.
wall_mat = material("wall", srgb("E4DDD1"), rough=0.92, bump=0.04, scale=60)
box("wall", (WALL_W, 0.1, WALL_H), (0, -0.05, WALL_H / 2), wall_mat)
trim = material("skirting", srgb("F4F1EA"), rough=0.5)
box("skirting", (WALL_W, 0.018, 0.11), (0, 0.009, 0.055), trim)

# Wood floor from Poly Haven's wood_floor (CC0).
floor_mat = bpy.data.materials.new("floor")
floor_mat.use_nodes = True
nt = floor_mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
coord = nt.nodes.new("ShaderNodeTexCoord")
mapping = nt.nodes.new("ShaderNodeMapping")
mapping.inputs["Scale"].default_value = (0.45, 0.45, 0.45)
nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])


def tex(path, non_color=False):
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path)
    if non_color:
        t.image.colorspace_settings.name = "Non-Color"
    nt.links.new(mapping.outputs["Vector"], t.inputs["Vector"])
    return t


wf = os.path.join(ASSETS, "wood_floor")
nt.links.new(tex(os.path.join(wf, "Diffuse.jpg")).outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tex(os.path.join(wf, "Rough.jpg"), True).outputs["Color"], bsdf.inputs["Roughness"])
nmap = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(tex(os.path.join(wf, "nor_gl.jpg"), True).outputs["Color"], nmap.inputs["Color"])
nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 3, 0))
floor = bpy.context.object
floor.scale = (WALL_W, 6, 1)
bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(floor_mat)

# Ceiling, out of frame, so the room bounces light like a room.
box("ceiling", (WALL_W, 6, 0.05), (0, 3, WALL_H + 0.025), material("ceiling", srgb("F2F0EB")))


def place(asset, x, y_back, face_camera=True):
    """Imports a Poly Haven glTF, stands it on the floor, its back at y_back."""
    path = os.path.join(ASSETS, asset, f"{asset}_2k.gltf")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(asset, None)
    scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    if face_camera:
        root.rotation_euler = (0, 0, ROTATE.get(asset, 0.0))
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    root.location = (x - (lo.x + hi.x) / 2, y_back - lo.y, -lo.z)
    bpy.context.view_layer.update()
    return hi - lo


# Poly Haven models face -y; the camera is on +y.
ROTATE = {"sofa_02": math.pi, "side_table_01": math.pi, "potted_plant_01": 0.6}
sofa = place("sofa_02", 0.0, 0.03)
place("side_table_01", -1.32, 0.06)
place("potted_plant_01", 1.38, 0.08)

# Light: a big soft window off to the left, warm; a cool fill from the
# room behind the camera; a little sky for ambience.
bpy.ops.object.light_add(type="AREA", location=(-3.2, 1.6, 1.7))
win = bpy.context.object
win.data.shape = "RECTANGLE"
win.data.size, win.data.size_y = 2.2, 1.6
win.data.energy = 420
win.data.color = (1.0, 0.93, 0.84)
win.rotation_euler = (0, math.radians(-90), math.radians(-12))
bpy.ops.object.light_add(type="AREA", location=(0.6, 5.5, 2.2))
fill = bpy.context.object
fill.data.size = 3.0
fill.data.energy = 120
fill.data.color = (0.9, 0.95, 1.0)
fill.rotation_euler = (math.radians(80), 0, math.radians(180))
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.78, 0.82, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25

# Camera square to the wall, at eye height, so the wall has one scale.
bpy.ops.object.camera_add(location=(0, 4.1, 1.3), rotation=(math.radians(90), 0, math.pi))
cam = bpy.context.object
cam.data.lens = 30
# Shift, not tilt: takes in the floor and keeps the wall square to the lens.
cam.data.shift_y = -0.08
scene.camera = cam

scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = "GPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 90
os.makedirs(OUT, exist_ok=True)
scene.render.filepath = os.path.join(OUT, "room.jpg")
bpy.ops.render.render(write_still=True)


def px(p):
    v = world_to_camera_view(scene, cam, Vector(p))
    return (v.x * WIDTH, (1 - v.y) * HEIGHT)


x0, z0 = px((0, 0, 0))
x1, _ = px((1, 0, 0))
json.dump(
    {
        "width": WIDTH,
        "height": HEIGHT,
        "pxPerMeter": x1 - x0,
        "wallOrigin": [x0, z0],
        "sofaTopM": sofa.z,
        "sofaWidthM": sofa.x,
    },
    open(os.path.join(OUT, "room.json"), "w"),
    indent=2,
)
print("ROOM", json.dumps({"pxPerMeter": x1 - x0, "sofa": list(sofa)}))
