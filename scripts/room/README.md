# Room render

The painting page's "In a room" view: each painting hangs at true size
above a sofa in a Blender render. `src/lib/room.ts` places it from the
measurements in `src/lib/room-data.ts`.

To change the room:

1. `python3 -I scripts/room/fetch.py <assets dir>` downloads the models
   and floor texture (2k glTF and jpg) into a folder outside the repo.
2. `blender -b --python scripts/room/room.py -- <assets dir> <render dir> 256 2000`
   builds the scene and renders `room.jpg` and `room.json`. The camera
   faces the wall square on, so the wall has one scale.
3. `python3 -I scripts/room/export.py <render dir>` writes
   `public/rooms/living-room-*.webp`, the light map, and
   `src/lib/room-data.ts`.

`composite.py` hangs a painting photo on a render for a quick look
outside the site.

## Assets

All from Poly Haven, CC0 (no attribution required, any use):
`sofa_02`, `potted_plant_01`, `side_table_01` (models) and `wood_floor`
(texture). The wall, skirting board, ceiling and lights are made in
`room.py`.
