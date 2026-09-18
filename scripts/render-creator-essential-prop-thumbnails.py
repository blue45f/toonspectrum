import bpy, math, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / 'apps/web/public/creator-essentials'
IDS = ['prop-desk','prop-chair','prop-bench','prop-bookshelf','prop-streetlamp','prop-window-wall','prop-doorway','prop-stairs']

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0: datablocks.remove(block)

def bounds(objects):
    pts=[]
    for o in objects:
        if o.type!='MESH': continue
        pts += [o.matrix_world @ Vector(corner) for corner in o.bound_box]
    if not pts: raise RuntimeError('no mesh bounds')
    lo=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
    hi=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    return lo,hi

def add_area(name, loc, energy, size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=loc
    return obj

def point_at(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def strip_png_metadata(path: Path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"not a PNG: {path}")
    out = bytearray(raw[:8]); offset = 8
    dropped = {b"tEXt", b"zTXt", b"iTXt", b"tIME", b"eXIf"}
    while offset + 12 <= len(raw):
        length = int.from_bytes(raw[offset:offset+4], "big")
        end = offset + 12 + length
        chunk_type = raw[offset+4:offset+8]
        if chunk_type not in dropped:
            out.extend(raw[offset:end])
        offset = end
        if chunk_type == b"IEND": break
    path.write_bytes(out)

def render_one(asset_id):
    clear()
    source=ASSET_DIR/f'{asset_id}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    lo,hi=bounds(meshes); center=(lo+hi)*0.5; size=hi-lo; radius=max(size.length*0.5,0.1)
    # Ground slightly below source bounds for a real contact shadow.
    bpy.ops.mesh.primitive_plane_add(size=max(radius*5,3), location=(center.x,center.y,lo.z-0.004))
    ground=bpy.context.object; mat=bpy.data.materials.new('ground'); mat.diffuse_color=(0.92,0.91,0.88,1); mat.roughness=0.96; ground.data.materials.append(mat)
    cam_data=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',cam_data); bpy.context.collection.objects.link(cam); bpy.context.scene.camera=cam
    cam_data.lens=58
    direction=Vector((1.25,-1.65,1.05)).normalized(); distance=max(radius*3.4,1.8)
    cam.location=center+direction*distance; point_at(cam,center+Vector((0,0,size.z*0.03)))
    add_area('key',center+Vector((2.4,-3.0,4.2))*max(radius,0.7),900,4.0*max(radius,0.7))
    add_area('fill',center+Vector((-2.8,-1.3,2.1))*max(radius,0.7),520,3.4*max(radius,0.7))
    add_area('rim',center+Vector((0.8,3.0,3.3))*max(radius,0.7),700,3.2*max(radius,0.7))
    for o in [x for x in bpy.context.scene.objects if x.type=='LIGHT']: point_at(o,center)
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=768; scene.render.resolution_y=768; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=False
    scene.world.color=(0.055,0.068,0.082)
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.filepath=str(ASSET_DIR/f'{asset_id}.preview.png')
    # camera fit after all geometry is present, with a safe margin
    cam.data.lens=52
    scene.render.image_settings.color_mode='RGB'
    bpy.ops.render.render(write_still=True)
    strip_png_metadata(Path(scene.render.filepath))
    print('rendered',asset_id,scene.render.filepath)

for asset_id in IDS: render_one(asset_id)
