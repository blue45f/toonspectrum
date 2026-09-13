"""Blender-only process: import embedded GLB, normalize, preserve pose, render neutral source."""
import math, sys
import bpy
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source,output,yaw=args[0],args[1],math.radians(float(args[2]))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
objects=list(bpy.context.scene.objects);meshes=[obj for obj in objects if obj.type=='MESH']
if not meshes or sum(len(obj.data.vertices) for obj in meshes)>2_000_000:raise ValueError('Mesh complexity limit exceeded')
points=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
if not all(math.isfinite(component) for point in points for component in point):raise ValueError('Non-finite model bounds')
lo=Vector(tuple(min(point[i] for point in points) for i in range(3)));hi=Vector(tuple(max(point[i] for point in points) for i in range(3)))
center=(lo+hi)/2;span=max(hi-lo)
if not 1e-9<span<1e12:raise ValueError('Invalid model bounds')
root=bpy.data.objects.new('NormalizedCharacter',None);bpy.context.collection.objects.link(root)
for obj in objects:
    if obj.parent is None:
        world=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=world
root.scale=(2/span,)*3;root.location=-center*(2/span)
# Remove imported lights/cameras. User files do not control render settings or external paths.
for obj in objects:
    if obj.type in {'LIGHT','CAMERA'}:bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.device='CPU'
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.8,.8,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
for location,power,size in [((3,-4,5),700,4),((-3,-1,2),350,3)]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new('Softbox',data);bpy.context.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',data);bpy.context.collection.objects.link(camera)
camera.location=(math.sin(yaw)*5,-math.cos(yaw)*5,.25);camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.55;data.clip_start=.01;data.clip_end=100
scene.camera=camera;scene.render.filepath=output;bpy.ops.render.render(write_still=True)
