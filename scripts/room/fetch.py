"""Fetches Poly Haven (CC0) models as 2k glTF and textures as 2k jpg."""
import json, os, sys, urllib.request

UA = {"User-Agent": "art-website-render"}
out = sys.argv[1]

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def save(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        open(path, "wb").write(get(url))

for asset in ["sofa_02", "potted_plant_01", "side_table_01"]:
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    g = files["gltf"]["2k"]["gltf"]
    base = os.path.join(out, asset)
    save(g["url"], os.path.join(base, os.path.basename(g["url"])))
    for rel, f in g.get("include", {}).items():
        save(f["url"], os.path.join(base, rel))
    print("model", asset)

for tex in ["wood_floor"]:
    files = json.loads(get(f"https://api.polyhaven.com/files/{tex}"))
    for kind in ["Diffuse", "nor_gl", "Rough"]:
        f = files[kind]["2k"]["jpg"]
        save(f["url"], os.path.join(out, tex, f"{kind}.jpg"))
    print("texture", tex)
