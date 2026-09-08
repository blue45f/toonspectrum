"""Author eleven refined Studio props without overwriting the legacy sources.

Run in a separate Blender background process from the repository root:
  blender -b --python scripts/blender/generate_studio_refined_props_v8.py -- --only fox_mask ice_cream_cone

Every output preserves the corresponding legacy world bounds and root origin.
Preview lighting is excluded from GLBs. Packed image materials are shared by
the Blender source and GLB; no render-only procedural shader is substituted.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "apps/web/public/assets/3d"
OUTPUT = LEGACY / "refined-v8"
ARTIFACTS = ROOT / "artifacts/studio-asset-quality-v8"
TAU = math.tau
PI = math.pi
MAT = {}


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)
    MAT.clear()


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def material(name, color, roughness=0.5, metallic=0.0, texture=None, alpha=1.0, emission=0.0):
    if name in MAT:
        return MAT[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, alpha)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, alpha)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = "DITHERED"
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    if texture:
        size = 512
        y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
        noise = np.random.default_rng(19).random((size, size)).astype(np.float32)
        if texture == "wood":
            grain = np.sin(x * 480 + .7 * np.sin(y * 9)) + .35 * np.sin(x * 900 + y * 3)
            variation = 0.98 + 0.025 * grain + 0.01 * noise
        elif texture == "fabric":
            variation = 0.96 + 0.015 * np.sin(x * TAU * 140) + 0.015 * np.sin(y * TAU * 140) + 0.03 * noise
        else:
            variation = 0.96 + 0.07 * noise
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[:, :, :3] = np.clip(np.array(color)[None, None, :] * variation[:, :, None], 0, 1)
        pixels[:, :, 3] = alpha
        image = bpy.data.images.new(name + "_BaseColor", width=size, height=size, alpha=alpha < 1)
        image.pixels.foreach_set(pixels.ravel())
        image.pack()
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    MAT[name] = mat
    return mat


def palette():
    return {
        "oak": material("Oak fine grain", (0.40, 0.235, 0.11), .46, texture="wood"),
        "oaklight": material("Natural oak", (0.64, 0.44, 0.24), .45, texture="wood"),
        "dark": material("Powder coated graphite", (0.055, 0.070, 0.073), .44, .25),
        "steel": material("Brushed stainless steel", (0.48, 0.52, 0.54), .28, .84),
        "brass": material("Satin champagne brass", (0.62, 0.42, 0.18), .30, .82),
        "cream": material("Warm porcelain", (0.85, 0.82, 0.74), .26),
        "rubber": material("Soft graphite rubber", (0.025, 0.030, 0.032), .88),
        "teal": material("Woven sage upholstery", (0.19, 0.32, 0.29), .9, texture="fabric"),
        "seam": material("Upholstery seam", (0.105, 0.18, 0.16), .91),
        "red": material("Deep vermilion enamel", (0.51, 0.047, 0.035), .30, .12),
    }


def finish(obj, mat, edge=0, smooth=False):
    obj.name = "GEO-" + obj.name
    if mat:
        obj.data.materials.append(mat)
    if edge:
        active(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = obj.modifiers.new("Machined edge radius", "BEVEL")
        bevel.width = edge
        bevel.segments = 4
        bevel.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for p in obj.data.polygons:
            p.use_smooth = True
        normal = obj.modifiers.new("Area weighted normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        normal.weight = 40
        bpy.ops.object.modifier_apply(modifier=normal.name)
    elif smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc, mat, edge=.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    return finish(o, mat, min(edge, min(size) * .36))


def cylinder(name, radius, depth, loc, mat, rot=(0, 0, 0), edge=.001, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, mat, min(edge, depth * .2, radius * .2), True)


def sphere(name, size, loc, mat, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    active(o)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, smooth=True)


def mesh(name, vertices, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    return finish(obj, mat, smooth=smooth)


def lathe(name, profile, mat, sides=64, loc=(0, 0, 0)):
    vertices = [(loc[0] + r * math.cos(i * TAU / sides), loc[1] + r * math.sin(i * TAU / sides), loc[2] + z)
                for r, z in profile for i in range(sides)]
    faces = []
    for j in range(len(profile) - 1):
        for i in range(sides):
            n = (i + 1) % sides
            faces.append((j * sides + i, j * sides + n, (j + 1) * sides + n, (j + 1) * sides + i))
    obj = mesh(name, vertices, faces, mat, smooth=True)
    uv = obj.data.uv_layers.new(name="UVMap")
    for face in obj.data.polygons:
        for li in face.loop_indices:
            vi = obj.data.loops[li].vertex_index
            uv.data[li].uv = ((vi % sides) / sides, (vi // sides) / max(1, len(profile) - 1))
    return obj


def path(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    curve.resolution_u = 12
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new("GEO-" + name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    active(obj)
    bpy.ops.object.convert(target="MESH")
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def rod(name, a, b, radius, mat):
    return path(name, [a, b], radius, mat)


def ring(name, radius, width, loc, mat, plane="XY", scale=(1, 1)):
    points = []
    for i in range(80):
        a = i * TAU / 80
        u, v = radius * scale[0] * math.cos(a), radius * scale[1] * math.sin(a)
        d = (u, v, 0) if plane == "XY" else ((u, 0, v) if plane == "XZ" else (0, u, v))
        points.append(tuple(loc[k] + d[k] for k in range(3)))
    return path(name, points, width, mat, True)


def rounded_rect(name, width, depth, radius, z, mat, tube=.002, center=(0, 0), plane="XY"):
    points = []
    for cx, cy, start in ((width / 2 - radius, depth / 2 - radius, 0),
                          (-width / 2 + radius, depth / 2 - radius, 90),
                          (-width / 2 + radius, -depth / 2 + radius, 180),
                          (width / 2 - radius, -depth / 2 + radius, 270)):
        for i in range(13):
            a = math.radians(start + i * 90 / 12)
            u = cx + radius * math.cos(a) + center[0]
            v = cy + radius * math.sin(a) + center[1]
            points.append((u, v, z) if plane == "XY" else (u, z, v))
    return path(name, points, tube, mat, True)


def text(name, body, size, loc, mat, rot=(PI / 2, 0, 0), align="CENTER"):
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    data.size = size
    data.align_x = align
    data.align_y = "CENTER"
    data.extrude = size * .01
    data.bevel_depth = size * .002
    o = bpy.data.objects.new("GEO-" + name, data)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(mat)
    active(o)
    bpy.ops.object.convert(target="MESH")
    return o


def cut(target, cutter):
    active(target)
    mod = target.modifiers.new("Functional opening", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def build_fox_mask():
    p = palette()
    def width_at(z):
        t = (z - .010) / .127
        return .73 + .22 * (t + 1) / 2 + .115 * math.exp(-((t + .10) / .35) ** 2)

    def surface_y(x, z):
        t = (z - .010) / .127
        face = -.068 * math.sqrt(max(.003, 1 - (x / (.100 * width_at(z))) ** 2 - t ** 2))
        muzzle = .025 * math.exp(-(x / .025) ** 2 - ((z + .032) / .041) ** 2)
        return face - muzzle

    def paint(name, coordinates, paint_mat=None):
        obj = mesh(name, [(x, surface_y(x, z) - .00065, z) for x, z in coordinates], [tuple(range(len(coordinates)))], paint_mat or p["red"])
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=6, use_grid_fill=True)
        for vertex in bm.verts:
            vertex.co.y = surface_y(vertex.co.x, vertex.co.z) - .00065
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        for face in obj.data.polygons:
            face.use_smooth = True
        return obj

    shell = sphere("Sculpted fox face shell", (.100, .068, .127), (0, 0, .010), p["cream"], 112, 72)
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > .00001], context="VERTS")
    bm.to_mesh(shell.data)
    bm.free()
    for v in shell.data.vertices:
        z = v.co.z + .010
        v.co.x *= width_at(z)
        v.co.y = surface_y(v.co.x, z)
    shell.data.update()
    active(shell)
    solid = shell.modifiers.new("Actual 3.5 mm mask thickness", "SOLIDIFY")
    solid.thickness = .0035
    solid.offset = -1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    for sx in (-1, 1):
        outline = []
        for upper in (True, False):
            values = np.linspace(-1, 1, 33) if upper else np.linspace(1, -1, 33)[1:-1]
            for t in values:
                x = sx * .044 + t * .025
                z = .033 + sx * t * .006 + (.010 if upper else -.0075) * (1 - t * t)
                outline.append((x, z))
        count = len(outline)
        vertices = [(x, y, z) for y in (-.16, .05) for x, z in outline]
        faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
        faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
        cutter = mesh("Almond aperture cutting solid", vertices, faces, None)
        cut(shell, cutter)
        paint("Flush vermilion eye calligraphy", [(sx * x, z) for x, z in ((.018, .041), (.042, .058), (.074, .061), (.066, .053), (.043, .052))])
        for j in range(2):
            paint("Flush cheek marking", [(sx * x, z) for x, z in ((.055 + .006 * j, -.008 - .016 * j), (.073 + .006 * j, -.016 - .016 * j), (.071 + .006 * j, -.020 - .016 * j), (.057 + .006 * j, -.013 - .016 * j))])
        ear_verts = [(sx * .027, -.062, .080), (sx * .087, -.021, .094), (sx * .072, -.013, .178),
                     (sx * .027, -.020, .080), (sx * .087, .008, .094), (sx * .072, 0, .178)]
        ear = mesh("Sculpted pointed fox ear", ear_verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], p["cream"])
        finish(ear, None, .002)
        active(shell)
        union = shell.modifiers.new("Continuous ceramic ear junction", "BOOLEAN")
        union.operation = "UNION"
        union.solver = "EXACT"
        union.object = ear
        bpy.ops.object.modifier_apply(modifier=union.name)
        bpy.data.objects.remove(ear, do_unlink=True)
        front = [Vector(v) for v in ear_verts[:3]]
        inset = []
        for i in range(3):
            point = front[i] * .72 + front[(i + 1) % 3] * .14 + front[(i + 2) % 3] * .14
            point.y -= .0006
            inset.append(tuple(point))
        mesh("Flush red ear enamel", inset, [(0, 1, 2)], p["red"])
        points = [(sx * .088, .007, .005), (sx * .103, .014, -.014), (sx * .104, .018, -.070), (sx * .098, .018, -.121)]
        path("Braided hanging cord", points, .0023, p["red"])
        ring("Cord eyelet", .005, .0015, (sx * .092, .003, .003), p["brass"], "XZ")
        for dx in (-.002, 0, .002):
            rod("Cord tassel", (sx * .098 + dx, .018, -.116), (sx * .099 + dx, .018, -.139), .0008, p["red"])
    finish(shell, None, .00045)
    paint("Flush triangular nose enamel", [(-.009, -.032), (.009, -.032), (0, -.044)], p["dark"])
    paint("Flush mouth calligraphy", [(-.010, -.062), (0, -.068), (.010, -.062), (0, -.070)])


def build_ice_cream_cone():
    p = palette()
    biscuit = material("Toasted waffle", (.61, .33, .115), .70, texture="grain")
    ridge = material("Raised baked waffle lattice", (.75, .47, .20), .68)
    lathe("Hollow tapered waffle cone", [(.001, 0), (.030, .112), (.028, .114), (.026, .110), (.0012, .010), (.001, 0)], biscuit, 80)
    # Two families of diagonals conform exactly to the cone surface.
    for direction in (-1, 1):
        for band in range(12):
            points = []
            for i in range(65):
                t = .12 + .87 * i / 64
                angle = band * TAU / 12 + direction * 2.9 * t
                radius = .001 + .029 * t + .00035
                points.append((radius * math.cos(angle), radius * math.sin(angle), .112 * t))
            path("Conformal waffle diagonal", points, .00072, ridge)
    ring("Rolled cone rim", .0296, .0014, (0, 0, .112), ridge)
    flavors = [material("Strawberry gelato", (.78, .34, .37), .68, texture="grain"), material("Vanilla gelato", (.91, .78, .56), .66, texture="grain")]
    for level, (z, radius) in enumerate(((.132, .034), (.183, .031))):
        o = sphere("Hand scooped gelato", (radius, radius, radius * .92), (0, 0, z), flavors[level], 64, 40)
        for v in o.data.vertices:
            n = v.co.normalized()
            variation = 1 + .035 * math.sin(n.x * 16 + n.z * 11) * math.cos(n.y * 14) + .012 * math.sin(n.x * 51 + n.y * 33)
            v.co *= variation
        # A single irregular ruffled boundary, joined visually to the scoop.
        pts = [(math.cos(a) * radius * (.84 + .06 * math.sin(9 * a)), math.sin(a) * radius * (.84 + .06 * math.sin(9 * a)), z - radius * .48 + .0015 * math.sin(7 * a)) for a in np.linspace(0, TAU, 100, endpoint=False)]
        path("Scooped ruffle", pts, .0025, flavors[level], True)
    cherry = material("Cherry glaze", (.48, .017, .025), .22)
    sphere("Cherry", (.010, .0095, .009), (.005, -.002, .219), cherry)
    path("Curved cherry stem", [(.005, -.002, .226), (.006, -.001, .234), (.010, 0, .241)], .0011, p["oak"])


def build_bubble_tea():
    p = palette()
    clear_pet = material("Clear PET cup", (.83, .91, .89), .16, alpha=.18)
    tea = material("Milk tea", (.54, .31, .14), .40)
    syrup = material("Brown sugar syrup", (.36, .20, .075), .26, alpha=.16)
    pearl = material("Tapioca pearls", (.032, .015, .008), .28)
    lathe("Open tapered PET cup", [(.022, .002), (.023, .004), (.031, .153), (.032, .156), (.0305, .157), (.0295, .153), (.0215, .006), (.022, .002)], clear_pet, 80)
    lathe("Tea fill below the lid", [(0, .043), (.0232, .043), (.0282, .132), (0, .132)], tea, 64)
    lathe("Clear syrup around visible tapioca", [(0, .006), (.0215, .006), (.0232, .043), (0, .043)], syrup, 64)
    for layer in range(3):
        for i in range(9):
            a = i * TAU / 9 + layer * .35
            r = .015 if i else 0
            sphere("Tapioca pearl", (.0043, .0043, .0041), (r * math.cos(a), r * math.sin(a), .012 + layer * .008), pearl, 20, 12)
    lathe("Snap fit lid with open straw port", [(.007, .158), (.030, .158), (.0325, .155), (.033, .157), (.032, .161), (.029, .164), (.007, .164), (.007, .158)], clear_pet, 80)
    straw = lathe("Hollow wide boba straw", [(.005, .075), (.005, .217), (.0039, .217), (.0039, .075), (.005, .075)], p["red"], 40)
    straw.rotation_euler = (.035, -.025, 0)
    lathe("Sage paper cup sleeve", [(.0250, .045), (.0271, .085), (.0278, .085), (.0257, .045), (.0250, .045)], p["teal"], 64)
    text("Cup sleeve identity", "TEA", .012, (0, -.0271, .065), p["cream"])
    ring("Lower embossed cup foot", .0224, .0012, (0, 0, .004), clear_pet)


def build_hanging_sign():
    p = palette()
    box("Wall bracket backplate", (.022, .065, .150), (.015, 0, -.052), p["dark"], .006)
    rod("Bracket horizontal arm", (.014, 0, 0), (.49, 0, 0), .011, p["dark"])
    path("Curved bracket brace", [(.022, 0, -.110), (.075, 0, -.100), (.126, 0, -.075), (.178, 0, -.020), (.190, 0, 0)], .007, p["dark"])
    for z in (-.11, -.01):
        cylinder("Wall mounting bolt", .006, .007, (.029, 0, z), p["brass"], (0, PI / 2, 0), vertices=12)
    for x in (.085, .420):
        for i in range(5):
            ring("Interlocking chain link", .010, .0022, (x, 0, -.019 - i * .025), p["brass"], "XZ" if i % 2 == 0 else "YZ", (0.8, 1.35))
        ring("Board suspension eye", .011, .0023, (x, 0, -.147), p["brass"], "XZ")
    box("Sign oak panel", (.430, .028, .208), (.25, 0, -.263), p["oak"], .012)
    box("Sign recessed enamel face", (.391, .003, .169), (.25, -.015, -.263), p["teal"], .009)
    rounded_rect("Thin brass face border", .373, .151, .018, -.018, p["brass"], .0015, (.25, -.263), "XZ")
    text("Shop lettering", "OPEN", .062, (.25, -.020, -.247), p["cream"])
    text("Shop subline", "STUDIO  /  09 - 18", .012, (.25, -.020, -.304), p["cream"])
    for x in (.063, .437):
        for z in (-.343, -.183):
            cylinder("Panel fastening", .0038, .004, (x, -.018, z), p["brass"], (PI / 2, 0, 0), vertices=16)


def build_chair():
    p = palette()
    for x in (-.168, .168):
        for y in (-.158, .158):
            rod("Splayed oak leg", (x * 1.09, y * 1.12, .014), (x, y, .446), .019, p["oak"])
            cylinder("Quiet rubber glide", .019, .012, (x * 1.09, y * 1.12, .009), p["rubber"])
    for y in (-.156, .156):
        box("Seat structural apron", (.358, .028, .065), (0, y, .412), p["oak"], .006)
    for x in (-.163, .163):
        box("Side apron", (.030, .322, .065), (x, 0, .412), p["oak"], .006)
        path("Continuous curved back post", [(x, .160, .405), (x, .182, .60), (x, .209, .84), (x, .214, .925)], .018, p["oak"])
    box("Cushioned seat", (.397, .377, .072), (0, -.001, .465), p["teal"], .032)
    rounded_rect("Seat sewn welt", .374, .354, .050, .457, p["seam"], .0024)
    # Bowed solid back panel with a broad comfortable surface.
    vertices = []
    for z in (.725, .905):
        for i in range(25):
            x = -.177 + .354 * i / 24
            vertices.append((x, .208 - .032 * (1 - (x / .177) ** 2), z))
    back = mesh("Curved oak backrest", vertices, [(i, i + 1, i + 26, i + 25) for i in range(24)], p["oaklight"], True)
    active(back)
    solid = back.modifiers.new("Bent plywood thickness", "SOLIDIFY")
    solid.thickness = .017
    bpy.ops.object.modifier_apply(modifier=solid.name)
    finish(back, None, .006)
    for x in (-.146, .146):
        for z in (.760, .871):
            cylinder("Backrest brass fastener", .0036, .003, (x, .185, z), p["brass"], (PI / 2, 0, 0), vertices=16)


def build_desk():
    p = palette()
    top = box("Solid oak desktop", (1.22, .64, .040), (0, 0, .756), p["oaklight"], .012)
    cut(top, cylinder("Cable port cutter", .027, .13, (.45, .226, .755), None, edge=0))
    ring("Cable grommet rim", .028, .003, (.45, .226, .778), p["dark"])
    for x in (-.543, .543):
        for y in (-.244, .244):
            box("Square section steel leg", (.035, .035, .717), (x, y, .363), p["dark"], .004)
            box("Adjustable foot", (.038, .038, .013), (x, y, .008), p["rubber"], .004)
        box("Side structural rail", (.033, .51, .044), (x, 0, .705), p["dark"], .004)
    box("Rear cross rail", (1.10, .026, .09), (0, .246, .687), p["dark"], .005)
    box("Drawer cabinet", (.338, .500, .550), (.348, .012, .444), p["oak"], .006)
    for i in range(3):
        z = .280 + i * .171
        box("Floating drawer front", (.316, .021, .155), (.348, -.254, z), p["oaklight"], .006)
        rod("Drawer brass pull", (.284, -.278, z + .046), (.412, -.278, z + .046), .004, p["brass"])
        for x in (.284, .412):
            rod("Drawer handle mount", (x, -.259, z + .046), (x, -.278, z + .046), .003, p["brass"])
    box("Under desk cable tray", (.56, .10, .028), (-.175, .182, .700), p["dark"], .005)


def build_sofa():
    p = palette()
    fabric = material("Warm linen upholstery", (.48, .40, .29), .93, texture="fabric")
    seam = material("Linen seam thread", (.30, .25, .18), .92)
    for x in (-.746, .746):
        for y in (-.275, .275):
            cylinder("Turned walnut foot", .034, .123, (x, y, .066), p["oak"], edge=.006)
            cylinder("Foot glide", .030, .008, (x, y, .006), p["rubber"])
    box("Upholstered lower frame", (1.70, .744, .187), (0, 0, .216), fabric, .032)
    box("Upholstered back frame", (1.70, .160, .480), (0, .300, .578), fabric, .056)
    for x in (-.785, .785):
        box("Soft rounded arm", (.182, .752, .348), (x, -.008, .466), fabric, .066)
        rounded_rect("Arm front sewn seam", .142, .284, .045, -.389, seam, .0022, (x, .458), "XZ")
    for i, x in enumerate((-.470, 0, .470)):
        box("Seat cushion", (.450, .598, .137), (x, -.047, .376), fabric, .045)
        rounded_rect("Seat cushion piping", .429, .573, .055, .369, seam, .0022, (x, -.047))
        back = box("Plump back cushion", (.450, .172, .345), (x, .213, .622), fabric, .059, (.10, 0, 0))
        rounded_rect("Back cushion sewn border", .407, .300, .055, .121, seam, .0018, (x, .621), "XZ")
    # One lumbar pillow gives an authored asymmetry without hiding the seating.
    box("Accent lumbar pillow", (.350, .137, .220), (-.492, .082, .534), p["teal"], .055, (.05, -.08, -.06))


def build_blackboard():
    p = palette()
    slate = material("Fine slate writing surface", (.037, .112, .089), .86, texture="grain")
    chalk = material("Chalk", (.78, .83, .74), .95)
    box("Slate board", (1.76, .038, 1.04), (0, 0, 1.45), slate, .009)
    for z in (.881, 2.019):
        box("Oak horizontal moulding", (1.90, .078, .070), (0, 0, z), p["oaklight"], .012)
    for x in (-.915, .915):
        box("Oak vertical moulding", (.070, .078, 1.075), (x, 0, 1.45), p["oaklight"], .010)
    for x in (-.720, .720):
        rod("Steel stand upright", (x, .010, .12), (x, .010, .916), .023, p["steel"])
        box("Caster cross foot", (.075, .234, .037), (x, 0, .080), p["dark"], .014)
        for y in (-.086, .086):
            cylinder("Rolling rubber wheel", .031, .025, (x, y, .034), p["rubber"], (0, PI / 2, 0), .003)
            cylinder("Caster axle", .010, .029, (x, y, .034), p["steel"], (0, PI / 2, 0))
    box("Aluminium chalk tray", (1.68, .100, .025), (0, -.057, .870), p["steel"], .006)
    box("Raised tray front lip", (1.68, .012, .022), (0, -.108, .888), p["steel"], .003)
    text("Board heading", "STORY LAB", .115, (-.61, -.021, 1.812), chalk, align="LEFT")
    rod("Chalk heading rule", (-.61, -.022, 1.707), (.59, -.022, 1.707), .0025, chalk)
    for i, label in enumerate(("01   SET THE SCENE", "02   FIND THE MOMENT", "03   TELL YOUR STORY")):
        text("Lesson line", label, .048, (-.59, -.021, 1.560 - i * .160), chalk, align="LEFT")
    for x in (-.66, -.54, -.42):
        cylinder("Chalk stick", .007, .075, (x, -.057, .894), chalk, (0, PI / 2, 0), .001)
    box("Felt eraser", (.15, .052, .030), (.55, -.055, .899), p["oak"], .007)
    box("Eraser felt", (.144, .048, .007), (.55, -.055, .884), p["rubber"], .002)


def build_mailbox():
    p = palette()
    for z, radius in ((.055, .006), (.720, .006)):
        box("Post collar", (.100, .102, .025), (0, 0, z), p["oaklight"], radius)
    box("Chamfered timber post", (.080, .080, .750), (0, 0, .375), p["oak"], .006)
    box("Mailbox support plank", (.324, .176, .023), (0, 0, .773), p["oaklight"], .005)
    # Extruded arch profile makes an actual flat floor and curved roof.
    cross = [(-.080, 0), (.080, 0), (.080, .077)]
    cross += [(math.cos(a) * .080, .077 + math.sin(a) * .080) for a in np.linspace(0, PI, 41)[1:]]
    vertices = [(x, y, .790 + z) for x in (-.150, .150) for y, z in cross]
    count = len(cross)
    faces = [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    body = mesh("Hollow arched mailbox shell", vertices, faces, p["red"], True)
    active(body)
    mod = body.modifiers.new("Sheet metal thickness", "SOLIDIFY")
    mod.thickness = .0025
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # The closed front is a shaped door with a raised rim, not a cylindrical drum.
    for x, name, mat in ((-.150, "Arched back panel", p["red"]), (.152, "Arched front door", p["red"])):
        panel = mesh(name, [(x, y, .790 + z) for y, z in cross], [tuple(range(count))], mat)
        active(panel)
        thick = panel.modifiers.new("Door thickness", "SOLIDIFY")
        thick.thickness = .004
        bpy.ops.object.modifier_apply(modifier=thick.name)
    path("Raised door perimeter", [(.156, y, .790 + z) for y, z in cross], .0024, p["steel"], True)
    rod("Mailbox lower door hinge", (.156, -.046, .795), (.156, .046, .795), .004, p["steel"])
    path("Door pull loop", [(.158, -.020, .919), (.174, -.020, .919), (.174, .020, .919), (.158, .020, .919)], .003, p["brass"])
    box("Flag upright", (.009, .012, .148), (-.051, -.085, .951), p["brass"], .002)
    box("Signal flag", (.062, .012, .042), (-.024, -.085, 1.004), p["red"], .006)
    cylinder("Flag pivot", .009, .011, (-.051, -.086, .885), p["steel"], (PI / 2, 0, 0))
    text("Mailbox address", "28", .047, (.006, -.082, .867), p["cream"])


def build_traffic_light():
    p = palette()
    for z, r, d in ((.025, .121, .05), (.11, .073, .13), (1.40, .047, 2.52)):
        cylinder("Signal mast section", r, d, (0, 0, z), p["dark"], edge=.006)
    for i in range(4):
        a = TAU * i / 4 + PI / 4
        cylinder("Foundation hex bolt", .010, .016, (.087 * math.cos(a), .087 * math.sin(a), .058), p["steel"], vertices=6)
    path("Bent mast arm", [(0, 0, 2.57), (.02, 0, 2.635), (.09, 0, 2.657), (.350, 0, 2.657)], .030, p["dark"])
    box("Signal backplate", (.315, .017, .820), (.345, .094, 2.310), p["dark"], .030)
    box("Weather sealed signal housing", (.226, .156, .752), (.345, .01, 2.310), p["dark"], .027)
    lens_colors = ((.53, .025, .018), (.58, .24, .018), (.018, .29, .16))
    for i, z in enumerate((2.550, 2.310, 2.070)):
        lens = material("Signal lens " + str(i), lens_colors[i], .20, emission=.65 if i == 0 else .06)
        cylinder("Recessed lens", .067, .018, (.345, -.079, z), lens, (PI / 2, 0, 0), .003, 64)
        ring("Lamp retaining bezel", .073, .005, (.345, -.088, z), p["dark"], "XZ")
        # Open visor: top and sides only, with no cap covering the lamp.
        points = []
        for y in (-.077, -.184):
            for j in range(41):
                a = -.14 * PI + 1.28 * PI * j / 40
                points.append((.345 + .084 * math.cos(a), y, z + .084 * math.sin(a)))
        hood = mesh("Open sheet metal lamp hood", points, [(j, j + 1, j + 42, j + 41) for j in range(40)], p["dark"], True)
        active(hood)
        solid = hood.modifiers.new("Hood gauge", "SOLIDIFY")
        solid.thickness = .003
        bpy.ops.object.modifier_apply(modifier=solid.name)
        for j in range(3):
            ring("Fresnel lens ring", .023 + j * .015, .00065, (.345, -.089, z), lens, "XZ")


def build_robot_pet():
    p = palette()
    shellmat = material("Ceramic robot shell", (.69, .74, .72), .27, .18)
    status = material("Soft amber status LEDs", (.73, .33, .04), .30, emission=.45)
    box("Rounded torso shell", (.142, .218, .111), (0, .019, .282), shellmat, .040)
    box("Floating dark belly chassis", (.108, .190, .048), (0, .019, .231), p["dark"], .016)
    for y in (-.054, .062):
        rounded_rect("Torso service panel seam", .118, .074, .025, y, p["dark"], .0013, (0, .284), "XZ")
    for i in range(5):
        box("Spine cooling vent", (.044, .005, .002), (0, -.016 + .013 * i, .338), p["dark"], .0006)
    rod("Neck rotary stem", (0, -.068, .287), (0, -.097, .333), .027, p["steel"])
    box("Rounded head casing", (.103, .111, .085), (0, -.123, .354), shellmat, .027)
    box("Inset glass face", (.087, .020, .041), (0, -.174, .356), p["dark"], .011)
    for x in (-.022, .022):
        cylinder("Expressive optic lens", .010, .004, (x, -.186, .359), status, (PI / 2, 0, 0), .001, 32)
    for sx in (-1, 1):
        box("Folded ear housing", (.022, .028, .039), (sx * .039, -.109, .408), shellmat, .008, (0, sx * .24, 0))
        box("Ear recessed antenna panel", (.012, .006, .023), (sx * .039, -.124, .410), p["dark"], .004, (0, sx * .24, 0))
        for y, tag in ((-.059, "Front"), (.089, "Rear")):
            hip = (sx * .072, y, .267)
            knee = (sx * .088, y + .021, .150)
            ankle = (sx * .088, y - .012, .046)
            cylinder(tag + " hip rotary joint", .025, .026, hip, p["steel"], (0, PI / 2, 0), .003, 40)
            rod(tag + " upper leg shell", hip, knee, .020, shellmat)
            cylinder(tag + " knee pivot", .021, .028, knee, p["dark"], (0, PI / 2, 0), .003, 40)
            rod(tag + " lower actuator", knee, ankle, .012, p["steel"])
            rod(tag + " actuator sleeve", tuple(knee[k] * .75 + ankle[k] * .25 for k in range(3)), ankle, .017, shellmat)
            box(tag + " paw", (.049, .069, .033), (sx * .088, y - .025, .023), shellmat, .011)
            box(tag + " sole pad", (.044, .063, .013), (sx * .088, y - .025, .010), p["rubber"], .006)
    path("Continuous articulated tail", [(0, .119, .291), (0, .155, .315), (0, .175, .351), (0, .185, .393)], .008, p["dark"])
    for y, z in ((.146, .310), (.169, .343), (.181, .376)):
        sphere("Tail joint collar", (.011, .011, .011), (0, y, z), p["steel"], 24, 16)
    sphere("Tail status tip", (.011, .011, .015), (0, .185, .396), status, 24, 16)


BUILDERS = {
    "fox_mask": build_fox_mask,
    "ice_cream_cone": build_ice_cream_cone,
    "bubble_tea": build_bubble_tea,
    "robot_pet": build_robot_pet,
    "hanging_sign": build_hanging_sign,
    "chair": build_chair,
    "desk": build_desk,
    "sofa": build_sofa,
    "blackboard": build_blackboard,
    "mailbox": build_mailbox,
    "traffic_light": build_traffic_light,
}


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    if not points:
        raise RuntimeError("No mesh geometry")
    return (Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)]))


def fit_to_legacy(target):
    bpy.context.view_layer.update()
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # Rotated object bounding-box corners overestimate a round straw's true
    # footprint; derive the new fit from actual transformed vertices instead.
    points = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    factor = Vector([(target[1][i] - target[0][i]) / (high[i] - low[i]) for i in range(3)])
    for o in objs:
        world = o.matrix_world.copy()
        for v in o.data.vertices:
            point = world @ v.co
            v.co = Vector([(point[i] - low[i]) * factor[i] + target[0][i] for i in range(3)])
        o.matrix_world.identity()
        o.data.update()
    bpy.context.view_layer.update()
    return [float(v) for v in factor]


def frame(asset_id, filepath, target_bounds, samples, resolution):
    scene = bpy.context.scene
    low, high = target_bounds
    size = high - low
    centre = (low + high) / 2
    extent = max(size)
    stage = []
    floor_mat = material("Preview neutral limestone", (.25, .28, .28), .85)
    floor = box("Preview ground", (extent * 200, extent * 200, extent * .01), (centre.x, centre.y, low.z - extent * .008), floor_mat, 0)
    stage.append(floor)
    direction = Vector((1.1, -2.2, 1.10)).normalized()
    if asset_id == "fox_mask":
        direction = Vector((.38, -2.6, .42)).normalized()
    bpy.ops.object.camera_add(location=centre + direction * extent * 4)
    camera = bpy.context.object
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = extent * 1.38
    camera.data.clip_start = extent * .001
    camera.data.clip_end = extent * 1000
    scene.camera = camera
    stage.append(camera)
    for label, vector, power, width, color in (("Key", (-2, -3, 4), 420, 2.6, (1.0, .86, .71)),
                                               ("Fill", (3, -1, 2), 230, 3.0, (.73, .85, 1)),
                                               ("Rim", (1, 3, 4), 500, 2.0, (1, .93, .82))):
        bpy.ops.object.light_add(type="AREA", location=centre + Vector(vector) * extent)
        light = bpy.context.object
        light.name = "PREVIEW-" + label
        light.data.energy = power * extent ** 2
        light.data.shape = "DISK"
        light.data.size = width * extent
        light.data.color = color
        light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()
        stage.append(light)
    scene.world = bpy.data.worlds.new("Neutral studio world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.30, .35, .40, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .40
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .045
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 12
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(filepath)
    bpy.ops.render.render(write_still=True)
    return stage


def glb_receipt(file):
    raw = file.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw)
    length, kind = struct.unpack_from("<II", raw, 12)
    if magic != b"glTF" or version != 2 or total != len(raw) or kind != 0x4E4F534A:
        raise RuntimeError("Malformed GLB header")
    doc = json.loads(raw[20:20 + length])
    if any("uri" in b for b in doc.get("buffers", [])) or any("uri" in i for i in doc.get("images", [])):
        raise RuntimeError("Export must embed its resources")
    tris = sum(doc["accessors"][p["indices"]]["count"] // 3 for m in doc.get("meshes", []) for p in m["primitives"] if "indices" in p)
    return {"bytes": len(raw), "triangles": tris, "meshCount": len(doc.get("meshes", [])), "materialCount": len(doc.get("materials", [])), "embeddedImages": len(doc.get("images", [])), "externalUris": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=list(BUILDERS), nargs="+")
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--resolution", type=int, default=720)
    parser.add_argument("--skip-before", action="store_true", help="Reuse unchanged legacy previews while refining new models")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.context.preferences.filepaths.save_version = 0
    for folder in (OUTPUT, OUTPUT / "thumbnails", ARTIFACTS / "sources", ARTIFACTS / "previews"):
        folder.mkdir(parents=True, exist_ok=True)
    report_path = ARTIFACTS / "quality-report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {"generator": str(Path(__file__).relative_to(ROOT)), "license": "CC0-1.0", "assets": {}}
    selected = args.only or list(BUILDERS)
    for asset_id in selected:
        clear()
        legacy = LEGACY / (asset_id + ".glb")
        bpy.ops.import_scene.gltf(filepath=str(legacy))
        bpy.context.view_layer.update()
        target = bounds(bpy.context.scene.objects)
        before_receipt = glb_receipt(legacy)
        before_path = ARTIFACTS / "previews" / (asset_id + "-before.png")
        if not args.skip_before or not before_path.exists():
            frame(asset_id, before_path, target, args.samples, args.resolution)
        clear()
        BUILDERS[asset_id]()
        for obj in tuple(bpy.context.scene.objects):
            if obj.type != "MESH" or obj.data.uv_layers:
                continue
            if any(mat and any(node.type == "TEX_IMAGE" for node in mat.node_tree.nodes) for mat in obj.data.materials):
                active(obj)
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
                bpy.ops.object.mode_set(mode="OBJECT")
        factor = fit_to_legacy(target)
        current = bounds(bpy.context.scene.objects)
        error = max(abs(current[k][i] - target[k][i]) for k in range(2) for i in range(3))
        if error > 1e-5:
            raise RuntimeError(f"{asset_id}: bounds drift {error}")
        root = bpy.data.objects.new("TS_" + asset_id + "_refined_v8", None)
        root["asset_id"] = asset_id
        root["asset_generator"] = "generate_studio_refined_props_v8.py"
        root["asset_license"] = "CC0-1.0"
        root["units"] = "metres"
        root["legacy_bounds_preserved"] = True
        bpy.context.scene.collection.objects.link(root)
        for obj in list(bpy.context.scene.objects):
            if obj.type == "MESH":
                obj.parent = root
        export = OUTPUT / (asset_id + ".glb")
        bpy.ops.export_scene.gltf(filepath=str(export), export_format="GLB", export_apply=True, export_extras=True, export_materials="EXPORT", export_cameras=False, export_lights=False, export_animations=False)
        receipt = glb_receipt(export)
        after_path = ARTIFACTS / "previews" / (asset_id + "-after.png")
        frame(asset_id, after_path, target, args.samples, args.resolution)
        (OUTPUT / "thumbnails" / (asset_id + ".png")).write_bytes(after_path.read_bytes())
        extra_previews = []
        if asset_id == "fox_mask":
            centre = (target[0] + target[1]) / 2
            extent = max(target[1] - target[0])
            for label, direction in (("three-quarter", (1.7, -2.2, .60)), ("inside", (1.3, 2.0, .55))):
                camera = bpy.context.scene.camera
                camera.location = centre + Vector(direction).normalized() * extent * 4
                camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
                path_out = ARTIFACTS / "previews" / (asset_id + "-" + label + ".png")
                bpy.context.scene.render.filepath = str(path_out)
                bpy.ops.render.render(write_still=True)
                extra_previews.append(str(path_out.relative_to(ROOT)))
        source = ARTIFACTS / "sources" / (asset_id + ".blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(source), check_existing=False)
        report["assets"][asset_id] = {"url": "/assets/3d/refined-v8/" + asset_id + ".glb", "thumbnailUrl": "/assets/3d/refined-v8/thumbnails/" + asset_id + ".png", "source": str(source.relative_to(ROOT)), "beforePreview": str(before_path.relative_to(ROOT)), "afterPreview": str(after_path.relative_to(ROOT)), "additionalPreviews": extra_previews, "before": before_receipt, "after": receipt, "boundsErrorMetres": error, "boundsBlender": [list(v) for v in target], "newGeometryScale": factor, "originPreserved": True, "visualReview": "pending", "gripSocketReview": "bounds and origin preserved; per-character runtime review required"}
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print("REFINED_COMPLETE " + asset_id + " " + json.dumps(receipt), flush=True)
    print("REFINED_PACK_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
