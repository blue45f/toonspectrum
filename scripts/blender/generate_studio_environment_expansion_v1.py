#!/usr/bin/env python3
"""Author six distinct, metre-scale Studio sets with embedded CC0 PBR resources.

Run in a disposable headless Blender process, not an artist's open session:
  Blender --background --python-exit-code 1 --python this.py -- --only library_reading_room
Original architecture, furniture construction, garments and scientific equipment
are dedicated to CC0 by ToonSpectrum. Existing scanned CC0 props retain source URLs.
Review lights and cameras are deliberately excluded from exported GLBs.
"""
import argparse
import hashlib
import json
import math
import random
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refine_studio_environments_v6 as ref

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/assets/3d/environments/expansion-v1"
ARTIFACTS = ROOT / "artifacts/studio-environment-expansion-v1"
ref.ARTIFACTS = ARTIFACTS
TAU = math.tau
REPORT = {}
MATS = {}
CACHE = {}
TEMPLATES = {}

CATALOG = {
    "library_reading_room": {"name": "도서관 열람실", "theme": "education", "description": "중앙 공동 열람대, 개별 조명, 2층 높이 서가와 조용한 창가 좌석을 갖춘 도서관", "tags": ["library", "reading room", "books", "도서관", "열람실"], "camera": {"position": [12.2, 9.2, 13.8], "target": [0, 1.4, 0], "fovDegrees": 44}},
    "independent_bookshop": {"name": "독립 서점", "theme": "retail", "description": "계단식 신간 진열, 전면 쇼윈도, 벽면 서가와 계산대로 구성된 골목 독립 서점", "tags": ["bookshop", "retail", "books", "서점", "책방"], "camera": {"position": [11.5, 8.8, 13], "target": [0, 1.25, 0], "fovDegrees": 44}},
    "fashion_boutique": {"name": "패션 부티크", "theme": "retail", "description": "입체 재킷과 드레스 행거, 곡선 피팅룸, 거울과 중앙 액세서리 진열대가 있는 의류 매장", "tags": ["fashion", "boutique", "fitting room", "옷가게", "부티크"], "camera": {"position": [12.5, 9, 13.5], "target": [0, 1.3, 0], "fovDegrees": 44}},
    "park_garden_pavilion": {"name": "공원 정자와 산책로", "theme": "urban", "description": "목조 정자, 분절된 지붕, 원형 휴게 데크, 나무 벤치와 곡선 화단이 이어지는 공원", "tags": ["park", "pavilion", "garden", "공원", "정자", "야외"], "camera": {"position": [15, 10.8, 16], "target": [0, 1.2, 0], "fovDegrees": 46}},
    "police_interview_room": {"name": "경찰 조사실", "theme": "urban", "description": "관찰창, 보안문, 고정 대면 책상, 녹음 장치와 CCTV를 갖춘 차분한 조사 공간", "tags": ["police", "interview", "investigation", "경찰", "조사실"], "camera": {"position": [9.5, 7, 10.2], "target": [0, 1.15, 0], "fovDegrees": 44}},
    "science_research_laboratory": {"name": "과학 연구 실험실", "theme": "education", "description": "중앙 실험대, 흄 후드, 현미경, 유리 기구, 개수대와 안전 샤워를 갖춘 연구실", "tags": ["science", "laboratory", "research", "과학실", "실험실", "연구실"], "camera": {"position": [12.5, 9.1, 14], "target": [0, 1.25, 0], "fovDegrees": 44}},
}


def mat(name, color, roughness=0.5, metallic=0, source=None, keep_color=False, alpha=1):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, alpha)
    bs.inputs["Roughness"].default_value = roughness
    bs.inputs["Metallic"].default_value = metallic
    if alpha < 1:
        bs.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "DITHERED"
    if source:
        ref.add_pbr(m, source, not keep_color, CACHE)
        REPORT["sourceMaterials"].append({"material": name, "id": source, "sourceUrl": "https://polyhaven.com/a/" + source, "license": "CC0-1.0"})
    MATS[name] = m
    return m


def finish(obj, name, material, edge=0):
    obj.name = name
    if material:
        obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if edge:
        mod = obj.modifiers.new("Manufactured edge radius", "BEVEL")
        mod.width = min(edge, min(obj.dimensions) * 0.4)
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, pos, size, material, edge=0.015, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.dimensions = size
    finish(obj, name, material, edge)
    obj.rotation_euler.z = rot
    return obj


def cyl(name, pos, radius, depth, material, vertices=32, axis=(0, 0, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    obj = finish(bpy.context.object, name, material, min(0.008, radius * .1, depth * .15))
    obj.rotation_euler = Vector(axis).to_track_quat("Z", "Y").to_euler()
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def tube(name, a, b, radius, material, vertices=20):
    a, b = Vector(a), Vector(b)
    return cyl(name, (a + b) * .5, radius, (b - a).length, material, vertices, b - a)


def lathe(name, pos, profile, material, segments=48):
    verts = [(r * math.cos(TAU * j / segments) + pos[0], r * math.sin(TAU * j / segments) + pos[1], z + pos[2]) for r, z in profile for j in range(segments)]
    faces = []
    for i in range(len(profile) - 1):
        for j in range(segments):
            a = i * segments + j
            b = i * segments + (j + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


def ring(name, pos, major, minor, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=40, minor_segments=8, location=pos, rotation=rot)
    obj = finish(bpy.context.object, name, material)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def text_label(name, value, pos, size, material, rot=(math.pi / 2, 0, 0)):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = value
    curve.align_x = "CENTER"
    curve.size = size
    curve.extrude = .001
    curve.bevel_depth = .0005
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = rot
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def palette():
    mat("Warm oak", (.36, .19, .085), source="wood_table_001")
    mat("Walnut", (.14, .065, .03), source="wood_table_001", keep_color=True)
    mat("Limestone", (.74, .70, .60), source="marble_01")
    mat("Concrete", (.63, .67, .66), source="concrete_floor_02", keep_color=True)
    mat("Ivory plaster", (.81, .80, .73), source="white_plaster_02", keep_color=True)
    mat("Ink blue", (.025, .08, .105), .55)
    mat("Sage", (.24, .36, .28), .7)
    mat("Brass", (.6, .4, .17), .27, .8)
    mat("Steel", (.47, .54, .57), .28, .85)
    mat("Black metal", (.035, .045, .048), .35, .7)
    mat("Porcelain", (.88, .9, .88), .23)
    mat("Paper", (.75, .71, .6), .85)
    mat("Glass", (.58, .79, .81), .13, alpha=.23)
    mat("Mirror", (.40, .55, .56), .08, .92)
    mat("Warm light", (1, .85, .52), .4)
    mat("Upholstery", (.28, .37, .35), source="denmin_fabric_02", keep_color=True)
    for i, color in enumerate([(.12, .22, .33), (.47, .18, .12), (.22, .33, .22), (.66, .5, .28), (.36, .23, .4), (.55, .52, .45)]):
        mat("Book cover " + str(i), color, .7)


def room(width, depth, height, floor="Limestone", wall="Ivory plaster"):
    box("Architecture_Floor", (0, 0, .09), (width, depth, .18), MATS[floor], .035)
    box("Architecture_BackWall", (0, depth / 2 - .1, height / 2), (width, .2, height), MATS[wall])
    box("Architecture_LeftWall", (-width / 2 + .1, -.05, height / 2), (.2, depth - .1, height), MATS[wall])
    for z in [.29, height - .12]:
        box("Architecture_BackMoulding", (0, depth / 2 - .22, z), (width - .2, .08, .13), MATS["Warm oak"])
        box("Architecture_LeftMoulding", (-width / 2 + .22, -.05, z), (.08, depth - .1, .13), MATS["Warm oak"])


def clone(slug, name, pos, height=None, width=None, rot=0):
    if slug not in TEMPLATES:
        TEMPLATES[slug] = ref.load_template(slug, REPORT)
    prototype, dims = TEMPLATES[slug]
    obj = bpy.data.objects.new("Refined_" + name, prototype.data)
    bpy.context.collection.objects.link(obj)
    factor = height / dims.z if height else width / dims.x
    obj.scale = (factor, factor, factor)
    obj.rotation_euler.z = rot
    obj.location = pos
    return obj


def books(name, x, y, z, width, count, height=.31, depth=.23):
    random.seed(name)
    step = width / count
    for i in range(count):
        h = height * random.uniform(.8, 1.13)
        xx = x - width / 2 + step * (i + .5)
        w = step * random.uniform(.74, .95)
        cover = MATS["Book cover " + str(i % 6)]
        # A U-shaped binding surrounds exposed pages, rather than hiding a page
        # block inside an opaque solid cover. Shared shelves remain inexpensive.
        thickness = min(.006, w * .12)
        outline = [(-w/2, depth/2), (-w/2, -depth/2), (w/2, -depth/2), (w/2, depth/2), (w/2-thickness, depth/2), (w/2-thickness, -depth/2+thickness), (-w/2+thickness, -depth/2+thickness), (-w/2+thickness, depth/2)]
        verts = [(xx+px, y+py, z+zz) for zz in [0,h] for px,py in outline]
        faces = [(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)] + [tuple(reversed(range(8))),tuple(range(8,16))]
        mesh = bpy.data.meshes.new(name + "_Binding")
        mesh.from_pydata(verts, [], faces); mesh.update()
        binding = bpy.data.objects.new(name + "_BoundSpine", mesh)
        bpy.context.collection.objects.link(binding); binding.data.materials.append(cover)
        box(name + "_PageBlock", (xx, y + .012, z + h / 2), (w - thickness*2, depth - .032, h - .018), MATS["Paper"], 0)
        for band in [.14, .79]:
            box(name + "_SpineFoil", (xx, y - depth / 2 - .002, z + h * band), (w * .74, .005, .009), MATS["Brass"], 0)


def bookcase(name, x, y, width=2, height=2.6, levels=5):
    wood = MATS["Walnut"]
    box(name + "_Back", (x, y + .18, .18 + height / 2), (width, .06, height), wood)
    for side in [-1, 1]:
        box(name + "_Upright", (x + side * (width / 2 - .05), y, .18 + height / 2), (.1, .42, height), wood)
    for i in range(levels + 1):
        zz = .25 + i * (height - .12) / levels
        box(name + "_Shelf", (x, y - .015, zz), (width, .49, .075), wood)
        if i < levels:
            books(name + str(i), x, y - .055, zz + .04, width - .19, max(8, int(width * 10)), min(.42, (height / levels) * .75), .24)
    box(name + "_Cornice", (x, y, height + .22), (width + .06, .5, .12), MATS["Warm oak"])


def table(name, x, y, w, d, h=.78, material="Warm oak"):
    box(name + "_Top", (x, y, h), (w, d, .075), MATS[material], .028)
    for xx in [-w / 2 + .15, w / 2 - .15]:
        for yy in [-d / 2 + .12, d / 2 - .12]:
            box(name + "_Leg", (x + xx, y + yy, (.18 + h) / 2), (.075, .075, h - .18), MATS["Black metal"], .012)
    box(name + "_Apron", (x, y, h - .12), (w - .22, d - .15, .14), MATS[material], .015)


def lamp(name, x, y, z, scale=1):
    s = scale
    lathe(name + "_Base", (x, y, z), [(0, 0), (.13*s, 0), (.15*s, .018*s), (.14*s, .035*s), (0, .045*s)], MATS["Brass"])
    tube(name + "_Stem", (x, y, z + .04*s), (x, y, z + .42*s), .017*s, MATS["Brass"])
    lathe(name + "_Shade", (x, y, z + .34*s), [(.22*s, 0), (.215*s, .02*s), (.15*s, .16*s), (.05*s, .22*s), (.02*s, .22*s), (.045*s, .20*s), (.145*s, .14*s), (.2*s, .015*s)], MATS["Ink blue"])
    cyl(name + "_Diffuser", (x, y, z + .35*s), .195*s, .008*s, MATS["Warm light"])


def window(name, x, y, z, w, h):
    box(name + "_Glass", (x, y, z), (w, .045, h), MATS["Glass"], .002)
    for dx in [-w/2, 0, w/2]:
        box(name + "_Mullion", (x + dx, y - .035, z), (.06, .10, h + .12), MATS["Brass"], .006)
    for dz in [-h/2, h/2]:
        box(name + "_Rail", (x, y - .035, z + dz), (w + .1, .11, .065), MATS["Brass"], .006)


def library():
    room(10, 8, 4.4, floor="Warm oak")
    for x in [-3.7, -1.24, 1.24, 3.7]:
        bookcase("Library_GrandShelf", x, 3.53, 2.26, 3.35, 6)
    table("Library_CommunalDesk", .5, -.05, 5.6, 1.4, .84)
    for x in [-1.35, .5, 2.35]:
        for side in [-1, 1]:
            clone("modern_arm_chair_01", "ReadingChair", (x, side * 1.2, .18), height=.91, rot=0 if side == 1 else math.pi)
            box("Library_DeskWritingPad", (x, side * .38, .883), (.65, .42, .014), MATS["Sage"], .012)
        lamp("Library_DeskLamp", x, 0, .89)
    clone("book_encyclopedia_set_01", "ReferenceVolumes", (-3.6, .1, .86), height=.32)
    table("Library_ReferenceStand", -3.6, -.15, 1, 2.6, .82)
    for y in [-.85, .85]:
        books("Library_ReferenceStack", -3.6, y, .86, .62, 6, .25)
    clone("potted_plant_04", "LibraryPlant", (3.95, -2.65, .18), height=1.65)
    # Clerestory panels imply daylight without an opaque extra wall hiding the set.
    for x in [-2.6, 0, 2.6]:
        window("Library_Clerestory", x, 3.76, 3.9, 2.1, .55)
    box("Library_SignPanel", (-4.74, 0, 2.75), (.09, 3.3, .35), MATS["Ink blue"])
    text_label("Library_Sign", "READING ROOM", (-4.68, 0, 2.68), .2, MATS["Paper"], (math.pi/2, 0, math.pi/2))
    REPORT["semanticParts"] = ["six-seat shared reading table", "individual desk lamps", "high multi-level bound-book shelves", "reference desk", "clerestory windows", "open front circulation"]


def bookshop():
    room(8.5, 8, 3.6)
    for x in [-2.9, -.7, 1.5]:
        bookcase("Bookshop_WallShelf", x, 3.55, 2.03, 2.6, 5)
    # Offset tiered islands leave a clearly navigable central passage.
    for x, y in [(-1.9, -.1), (.95, -1.2)]:
        for tier in range(3):
            z = .3 + tier * .25
            yy = y + tier * .32
            box("Bookshop_SteppedDisplay", (x, yy, .18 + z / 2), (1.8, 1.5 - tier * .37, z), MATS["Warm oak"], .035)
            for j in range(4):
                bx = x - .6 + j * .4
                cover = MATS["Book cover " + str((j + tier) % 6)]
                obj = box("Bookshop_FaceOutBook", (bx, yy - .37 + tier*.06, .20 + z + .15), (.29, .047, .38), cover, .008)
                obj.rotation_euler.x = -.22
                box("Bookshop_CoverMedallion", (bx, yy - .40 + tier*.06, .20 + z + .19), (.17, .009, .12), MATS["Paper"], .005)
    table("Bookshop_Checkout", 2.8, 1.75, 1.6, .85, 1.02, "Ink blue")
    box("Bookshop_RegisterBase", (2.8, 1.7, 1.11), (.32, .26, .09), MATS["Black metal"])
    tube("Bookshop_RegisterStem", (2.8, 1.74, 1.13), (2.8, 1.76, 1.36), .035, MATS["Black metal"])
    box("Bookshop_RegisterScreen", (2.8, 1.79, 1.4), (.43, .06, .29), MATS["Ink blue"])
    lamp("Bookshop_CounterLamp", 3.32, 1.6, 1.06, .85)
    # Partial front glazing only, keeping a wide entrance and readable interior.
    window("Bookshop_Shopfront", -2.65, -3.88, 1.78, 2.7, 2.95)
    box("Bookshop_ShopfrontSill", (-2.65, -3.79, .47), (2.9, .45, .15), MATS["Ink blue"])
    books("Bookshop_WindowBooks", -2.65, -3.70, .56, 2.5, 13, .37)
    clone("modern_arm_chair_01", "BookshopReadingChair", (2.85, -2.4, .18), height=.95, rot=-.45)
    clone("potted_plant_02", "BookshopPlant", (3.55, 3.15, .18), height=1.55)
    box("Bookshop_Header", (-.5, 3.56, 3.15), (4.1, .13, .38), MATS["Ink blue"])
    text_label("Bookshop_Identity", "PAPER & STORIES", (-.5, 3.47, 3.06), .25, MATS["Paper"])
    REPORT["semanticParts"] = ["offset three-tier display islands", "face-out new releases", "checkout register", "book-lined shopfront window", "full-height bound-book shelves", "reading nook"]


def garment(name, x, y, z, color, dress=False):
    material = MATS[color]
    # Closed, shaped cloth volume: neck, shoulder line, waist, flared hem, seam.
    levels = [(0, .12, .075), (-.07, .25, .09), (-.22, .28, .095), (-.5, .20, .075), (-.78 if not dress else -1.2, .28 if not dress else .48, .12 if not dress else .21)]
    count = 24
    verts = []
    for dz, rx, ry in levels:
        for i in range(count):
            a = TAU * i / count
            pleat = 1 + (.035 if dz > -.5 else .065) * math.cos(6*a)
            verts.append((x + rx * math.cos(a) * pleat, y + ry * math.sin(a) * pleat, z + dz))
    faces = [(i*count+j, i*count+(j+1)%count, (i+1)*count+(j+1)%count, (i+1)*count+j) for i in range(len(levels)-1) for j in range(count)]
    faces += [tuple(range((len(levels)-1)*count, len(levels)*count))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in mesh.polygons:
        p.use_smooth = True
    if not dress:
        for side in [-1, 1]:
            tube(name + "_Sleeve", (x+side*.24, y, z-.13), (x+side*.37, y, z-.54), .105, material, 24)
            ring(name + "_Cuff", (x+side*.37, y, z-.54), .09, .012, MATS["Paper"])
        for dz in [-.18, -.32, -.46, -.6]:
            cyl(name + "_Button", (x, y-.098, z+dz), .013, .009, MATS["Brass"], 12, (0,-1,0))
        for side in [-1, 1]:
            tube(name + "_Lapel", (x+side*.08, y-.085, z-.02), (x+side*.04, y-.107, z-.25), .023, MATS["Paper"], 12)
    tube(name + "_Hanger", (x-.21, y, z-.04), (x, y, z+.13), .012, MATS["Warm oak"])
    tube(name + "_Hanger", (x+.21, y, z-.04), (x, y, z+.13), .012, MATS["Warm oak"])
    ring(name + "_Hook", (x, y, z+.19), .04, .008, MATS["Brass"], (math.pi/2,0,0))


def curtain(name, center, radius, height, start, end, material):
    n = 112
    verts = []
    for z in [center[2], center[2]+height]:
        for i in range(n+1):
            a = start+(end-start)*i/n
            r = radius + .035*math.cos(i*math.pi/2)
            verts.append((center[0]+r*math.cos(a), center[1]+r*math.sin(a), z))
    faces = [(i,i+1,i+n+2,i+n+1) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(material)
    for face in mesh.polygons: face.use_smooth=True
    for i in range(18):
        a=start+(end-start)*i/17
        ring(name+"_Eyelet", (center[0]+radius*math.cos(a),center[1]+radius*math.sin(a),center[2]+height+.035),.045,.008,MATS["Brass"],(math.pi/2,0,a))


def boutique():
    room(9.5, 8, 3.65)
    for i, color in enumerate([(.38,.24,.19),(.64,.54,.38),(.22,.29,.36),(.48,.23,.25)]):
        mat("Fashion fabric "+str(i),color,source="denmin_fabric_02",keep_color=True)
    for x in [-2.7,.7]:
        y=2.7
        for xx in [x-1.28,x+1.28]:
            tube("Boutique_RackPost",(xx,y,.18),(xx,y,2.25),.027,MATS["Brass"])
            box("Boutique_RackFoot",(xx,y,.23),(.12,.72,.10),MATS["Brass"])
        tube("Boutique_RackRail",(x-1.28,y,2.25),(x+1.28,y,2.25),.029,MATS["Brass"])
        for j in range(4):
            garment("Boutique_TailoredGarment",x-.9+j*.6,y,2.0,"Fashion fabric "+str(j),dress=x>0)
    # The fitting-room arc is open toward the front, not an opaque cylinder.
    curtain("Boutique_FittingCurtain",(-3.25,-.35,.23),.95,2.5,0,math.pi*1.52,MATS["Upholstery"])
    ring("Boutique_FittingTrack",(-3.25,-.35,2.81),.95,.025,MATS["Brass"])
    box("Boutique_MirrorFrame",(3.95,2.87,1.75),(1.13,.12,2.65),MATS["Brass"],.055)
    box("Boutique_Mirror",(3.95,2.79,1.75),(1.01,.035,2.51),MATS["Mirror"],.04)
    table("Boutique_DisplayIsland",.7,-.65,2.1,1.1,.9,"Limestone")
    for j in range(3):
        x=.02+j*.65
        lathe("Boutique_AccessoryStand",(x,-.67,.95),[(0,0),(.20,0),(.20,.035),(.16,.05),(.16,.17),(.12,.24),(0,.24)],MATS["Brass"])
        ring("Boutique_Bracelet",(x,-.67,1.2),.105,.018,MATS["Paper"])
    # Upholstered seam-defined bench on a leg frame.
    box("Boutique_BenchCushion",(1.7,-2.75,.65),(2.6,.76,.22),MATS["Upholstery"],.09)
    for x in [.55,2.85]:
        box("Boutique_BenchSupport",(x,-2.75,.36),(.06,.62,.37),MATS["Brass"])
    for x in [.9,1.7,2.5]:
        box("Boutique_BenchStitch",(x,-2.75,.766),(.009,.62,.004),MATS["Paper"],.001)
    clone("potted_plant_04","BoutiquePlant",(3.7,-.8,.18),height=1.7)
    text_label("Boutique_Identity","ATELIER 07",(0,3.76,3.04),.32,MATS["Brass"])
    REPORT["semanticParts"]=["eight shaped garments with hangers and jacket buttons", "twin brass garment racks", "open pleated fitting room", "full length mirror", "accessory display plinths", "upholstered waiting bench"]


def bench(name, x, y, rot=0):
    parts=[]
    for yy in [-.22,-.11,0,.11,.22]:
        parts.append(box(name+"_SeatSlat",(x,y+yy,.68),(1.85,.085,.07),MATS["Warm oak"],.025))
    for zz in [.93,1.08,1.23]:
        parts.append(box(name+"_BackSlat",(x,y+.28,zz),(1.85,.08,.12),MATS["Warm oak"],.025))
    for xx in [-.68,.68]:
        parts.append(tube(name+"_Leg",(x+xx,y-.22,.18),(x+xx,y-.22,.67),.04,MATS["Black metal"]))
        parts.append(tube(name+"_BackLeg",(x+xx,y+.22,.18),(x+xx,y+.28,1.3),.04,MATS["Black metal"]))
        parts.append(tube(name+"_Arm",(x+xx,y-.23,.92),(x+xx,y+.24,.96),.032,MATS["Black metal"]))
        for zz in [.93,1.08,1.23]:
            parts.append(cyl(name+"_Bolt",(x+xx,y+.232,zz),.012,.012,MATS["Brass"],12,(0,-1,0)))
    if rot:
        for obj in parts:
            dx,dy=obj.location.x-x,obj.location.y-y
            obj.location.x=x+dx*math.cos(rot)-dy*math.sin(rot)
            obj.location.y=y+dx*math.sin(rot)+dy*math.cos(rot)
            obj.rotation_euler.z+=rot


def garden_tree(name, x, y, height, seed):
    rng=random.Random(seed)
    wood=MATS["Walnut"]
    leaves=[mat("Garden leaf "+str(i),color,.75) for i,color in enumerate([(.085,.21,.055),(.15,.29,.075),(.22,.35,.10)])]
    leaf_vertices=[[],[],[]];leaf_faces=[[],[],[]]
    def branch(a,b,radius):
        a,b=Vector(a),Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=14,radius1=radius,radius2=radius*.4,depth=(b-a).length,location=(a+b)*.5)
        obj=finish(bpy.context.object,name+"_TaperedBranch",wood)
        obj.rotation_euler=(b-a).to_track_quat("Z","Y").to_euler()
        for face in obj.data.polygons: face.use_smooth=len(face.vertices)==4
    branch((x,y,.17),(x+.11,y+.04,height*.76),.13)
    for i in range(9):
        angle=TAU*i/9+.22
        start=Vector((x+.055,y+.025,height*(.43+.025*i)))
        end=Vector((x+math.cos(angle)*height*.24,y+math.sin(angle)*height*.24,height*(.72+.02*(i%3))))
        branch(start,end,.055)
        for j in range(3):
            yaw=angle+(j-1)*.62
            tip=end+Vector((math.cos(yaw)*.35,math.sin(yaw)*.35,.30+.09*j))
            branch(end,tip,.025)
            for k in range(30):
                theta=rng.uniform(0,TAU);rad=rng.uniform(.05,.43);zz=rng.uniform(-.18,.39)
                center=tip+Vector((math.cos(theta)*rad,math.sin(theta)*rad,zz))
                direction=rng.uniform(0,TAU);length=rng.uniform(.17,.27);width=length*.37
                u=Vector((math.cos(direction),math.sin(direction),rng.uniform(-.35,.35))).normalized()
                v=Vector((-u.y,u.x,0)).normalized()
                points=[center-u*length*.5,center-u*length*.22-v*width,center+u*length*.23-v*width*.75,center+u*length*.5,center+u*length*.23+v*width*.75,center-u*length*.22+v*width,center+Vector((0,0,.025))]
                color=(i+j+k)%3;base=len(leaf_vertices[color]);leaf_vertices[color].extend(tuple(p) for p in points)
                leaf_faces[color].extend((base+6,base+t,base+(t+1)%6) for t in range(6))
    for i in range(3):
        mesh=bpy.data.meshes.new(name+"_IndividualLeaves");mesh.from_pydata(leaf_vertices[i],[],leaf_faces[i]);mesh.update()
        obj=bpy.data.objects.new(name+"_LeafCanopy",mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(leaves[i])


def grass_bed(name,x,y,radius,seed):
    rng=random.Random(seed)
    mat("Garden grass",(.17,.27,.08),.9)
    verts=[];faces=[]
    for i in range(420):
        a=rng.uniform(0,TAU);r=radius*math.sqrt(rng.random())
        xx,yy=x+math.cos(a)*r,y+math.sin(a)*r
        height=rng.uniform(.09,.24);angle=rng.uniform(0,TAU)
        dx,dy=.016*math.cos(angle),.016*math.sin(angle)
        base=len(verts)
        verts.extend([(xx-dx,yy-dy,.25),(xx+dx,yy+dy,.25),(xx+dx*.7,yy+dy*.7,.25+height*.55),(xx+.04*math.cos(angle),yy+.04*math.sin(angle),.25+height)])
        faces.extend([(base,base+1,base+2),(base,base+2,base+3)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(MATS["Garden grass"])


def pavilion():
    mat("Garden soil",(.16,.12,.075),source="coast_sand_rocks_02",keep_color=True)
    mat("Roof charcoal",(.055,.095,.095),source="concrete_floor_02",keep_color=True)
    box("Park_Ground",(0,0,.075),(13,11,.15),MATS["Garden soil"],.14)
    # Interlocking pavers describe actual circulation rather than painted patches.
    for ix in range(12):
        for iy in range(3):
            box("Park_PathPaver",(-5.8+ix*1.05,-3.9+iy*.65,.19),(1,.60,.10),MATS["Limestone"],.035)
    cx,cy=-1.3,1.25
    cyl("Pavilion_StonePlinth",(cx,cy,.28),3.2,.28,MATS["Limestone"],8)
    cyl("Pavilion_TimberDeck",(cx,cy,.46),2.92,.12,MATS["Warm oak"],8)
    for i in range(8):
        a=TAU*i/8+math.pi/8
        x,y=cx+2.62*math.cos(a),cy+2.62*math.sin(a)
        box("Pavilion_Column",(x,y,1.9),(.20,.20,2.8),MATS["Walnut"])
        box("Pavilion_ColumnShoe",(x,y,.64),(.26,.26,.3),MATS["Black metal"])
        for dz in [.57,.71]:
            cyl("Pavilion_ShoeBolt",(x,y-.135,dz),.025,.013,MATS["Brass"],12,(0,-1,0))
        b=a+TAU/8
        nx,ny=cx+2.62*math.cos(b),cy+2.62*math.sin(b)
        tube("Pavilion_Header",(x,y,3.18),(nx,ny,3.18),.115,MATS["Walnut"],8)
        # Radial rafters support an eight-segment hipped roof with visible fascia.
        tube("Pavilion_Rafter",(x,y,3.20),(cx,cy,4.48),.09,MATS["Warm oak"],8)
        # Rear half roof stays complete; front segments are an explicit architectural cutaway.
        if math.sin(a) >= -.45:
            segments=8
            for strip in range(segments):
                t0,t1=strip/segments,(strip+1)/segments
                r0,r1=3.15*(1-t0),3.15*(1-t1)
                z0,z1=3.25+1.30*t0,3.25+1.30*t1
                verts=[(cx+r0*math.cos(a),cy+r0*math.sin(a),z0),(cx+r0*math.cos(b),cy+r0*math.sin(b),z0),(cx+r1*math.cos(b),cy+r1*math.sin(b),z1),(cx+r1*math.cos(a),cy+r1*math.sin(a),z1)]
                mesh=bpy.data.meshes.new("RoofStandingSeamPanel");mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update()
                obj=bpy.data.objects.new("Pavilion_RoofPanel",mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(MATS["Roof charcoal"])
                solid=obj.modifiers.new("Roof sheet thickness","SOLIDIFY");solid.thickness=.035
                bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=solid.name)
                tube("Pavilion_RoofSeam",verts[0],verts[3],.018,MATS["Black metal"],8)
    table("Pavilion_CentralTable",cx,cy,1.5,1.25,.98)
    bench("Pavilion_InteriorBench",cx,cy+1.65,math.pi)
    bench("Park_PathBench",3.55,-1.35,.08)
    for x,y,h in [(5.35,-1.25,.90),(-5.5,-.75,.90)]:
        clone("potted_plant_04" if x>0 else "potted_plant_02","GardenPlant",(x,y,.15),height=h)
    for x,y,r,h,seed in [(4.4,2.9,1.38,4.1,29),(-5.0,3.25,1.0,3.7,71)]:
        cyl("Park_RaisedPlantingSoil",(x,y,.21),r,.12,MATS["Garden soil"],48)
        ring("Park_RaisedBedEdging",(x,y,.25),r,.07,MATS["Limestone"])
        garden_tree("Park_DeciduousTree",x,y,h,seed)
        grass_bed("Park_GrassUnderplanting",x,y,r-.13,seed)
    # Stepped approach leaves a clear standing area in front of the pavilion.
    for i in range(2):
        box("Pavilion_EntryStep",(cx,-1.87-i*.34,.21+i*.07),(1.8,.72,.15),MATS["Limestone"],.035)
    REPORT["semanticParts"]=["octagonal post-and-rafter pavilion", "rear standing seam roof with front architectural cutaway", "stone plinth and stepped entry", "central table", "bolted timber-slat benches", "paved pedestrian route", "branched deciduous trees with individual leaves and grass planting beds"]


def metal_chair(name,x,y,rot=0):
    parts=[]
    parts.append(box(name+"_Seat",(x,y,.65),(.47,.46,.07),MATS["Ink blue"],.07))
    parts.append(box(name+"_Back",(x,y+.20,1.02),(.47,.06,.35),MATS["Ink blue"],.07))
    for xx in [-.19,.19]:
        parts.append(tube(name+"_BackTube",(x+xx,y+.19,.18),(x+xx,y+.22,1.2),.019,MATS["Steel"]))
        parts.append(tube(name+"_FrontTube",(x+xx,y-.19,.18),(x+xx,y-.19,.64),.019,MATS["Steel"]))
        parts.append(tube(name+"_Brace",(x+xx,y-.19,.4),(x+xx,y+.19,.4),.012,MATS["Steel"]))
    if rot:
        for obj in parts:
            dx,dy=obj.location.x-x,obj.location.y-y
            obj.location.x=x+dx*math.cos(rot)-dy*math.sin(rot);obj.location.y=y+dx*math.sin(rot)+dy*math.cos(rot);obj.rotation_euler.z+=rot


def interview():
    room(7,6,3.35,floor="Concrete",wall="Concrete")
    # Observation glass is recessed into a framed interior wall panel.
    box("Interview_MirrorRecess",(-.85,2.73,1.95),(3.25,.16,1.55),MATS["Black metal"],.025)
    box("Interview_ObservationGlass",(-.85,2.62,1.95),(3.05,.035,1.34),MATS["Mirror"],.012)
    for x in [-2.1,.4]:
        box("Interview_WindowFastener",(x,2.586,1.95),(.025,.012,1.34),MATS["Steel"],.003)
    box("Interview_SecurityDoor",(2.25,2.70,1.43),(1.15,.12,2.5),MATS["Ink blue"],.035)
    for x in [1.64,2.86]:
        box("Interview_DoorFrame",(x,2.65,1.45),(.085,.18,2.65),MATS["Steel"])
    box("Interview_DoorLintel",(2.25,2.65,2.78),(1.3,.18,.08),MATS["Steel"])
    for z in [.62,1.4,2.2]:
        cyl("Interview_DoorHinge",(2.81,2.56,z),.033,.15,MATS["Steel"])
    box("Interview_LockPlate",(1.85,2.61,1.35),(.11,.045,.25),MATS["Steel"])
    tube("Interview_Handle",(1.87,2.54,1.4),(2.05,2.54,1.4),.025,MATS["Steel"])
    box("Interview_DoorVisionFrame",(2.25,2.60,2.06),(.39,.035,.51),MATS["Steel"])
    box("Interview_DoorVisionGlass",(2.25,2.57,2.06),(.32,.018,.44),MATS["Glass"])
    table("Interview_FixedTable",0,-.1,1.85,.98,.85,"Steel")
    for x in [-.775,.775]:
        for y in [-.47,.27]:
            box("Interview_FloorAnchor",(x,y,.22),(.22,.22,.07),MATS["Steel"])
            for dx in [-.07,.07]:
                for dy in [-.07,.07]:
                    cyl("Interview_AnchorBolt",(x+dx,y+dy,.264),.016,.016,MATS["Black metal"],12)
    metal_chair("Interview_Chair",0,.95)
    metal_chair("Interview_Chair",0,-1.22,math.pi)
    box("Interview_Recorder",(.49,-.12,.925),(.32,.23,.08),MATS["Black metal"],.013)
    for i in range(7):
        box("Interview_RecorderGrille",(.41+i*.023,-.12,.969),(.009,.13,.004),MATS["Steel"],.001)
    cyl("Interview_RecordButton",(.58,-.19,.97),.018,.01,MATS["Book cover 1"],20)
    box("Interview_CaseFolder",(-.37,.03,.905),(.47,.32,.017),MATS["Paper"],.008)
    tube("Interview_CameraBracket",(-2.8,2.7,2.96),(-2.8,2.42,2.96),.045,MATS["Steel"])
    box("Interview_CCTVBody",(-2.8,2.28,2.94),(.22,.35,.17),MATS["Porcelain"],.035)
    cyl("Interview_CCTVLens",(-2.8,2.084,2.94),.052,.05,MATS["Black metal"],32,(0,-1,0))
    for x in [-1.9,1.2]:
        box("Interview_CeilingSupport",(x,1.62,3.31),(.045,2.53,.06),MATS["Steel"])
        for y in [.27,.73]:
            tube("Interview_LightSuspension",(x,y,3.23),(x,y,3.31),.012,MATS["Steel"])
        box("Interview_CeilingLightFrame",(x,.5,3.2),(1.22,.65,.065),MATS["Steel"])
        box("Interview_CeilingDiffuser",(x,.5,3.155),(1.12,.55,.025),MATS["Porcelain"])
    box("Interview_AcousticPanel",(-3.36,.4,1.78),(.07,2.6,1.5),MATS["Upholstery"])
    for i in range(13):
        box("Interview_AcousticBatten",(-3.30,-.85+i*.2,1.78),(.035,.035,1.5),MATS["Sage"],.006)
    text_label("Interview_DoorLabel","ROOM 02",(2.25,2.615,2.45),.095,MATS["Paper"])
    REPORT["semanticParts"]=["framed observation glass", "hinged security door with latch and vision panel", "fixed interview table with floor anchors", "two tubular steel chairs", "recorder and case folder", "security camera", "acoustic wall battens"]


def beaker(name,x,y,z,r=.11,h=.25,liquid=False):
    lathe(name,(x,y,z),[(0,0),(r,0),(r,.015),(r,h),(r-.012,h+.006),(r-.018,h-.01),(r-.018,.025),(0,.025)],MATS["Glass"],40)
    if liquid:
        cyl(name+"_Liquid",(x,y,z+h*.24),r-.022,h*.4,MATS["Sage"],32)
    for i in range(4):
        tube(name+"_Graduation",(x+r*.40,y-r*.94,z+h*(.25+.15*i)),(x+r*.7,y-r*.78,z+h*(.25+.15*i)),.003,MATS["Porcelain"],8)


def microscope(name,x,y,z):
    box(name+"_Foot",(x,y,z+.025),(.34,.44,.05),MATS["Porcelain"],.055)
    tube(name+"_Arm",(x,y+.12,z+.06),(x,y+.16,z+.38),.053,MATS["Porcelain"])
    tube(name+"_Arm",(x,y+.16,z+.38),(x,y-.02,z+.52),.052,MATS["Porcelain"])
    box(name+"_Stage",(x,y-.055,z+.23),(.26,.24,.025),MATS["Black metal"],.018)
    tube(name+"_OpticsTube",(x,y-.02,z+.51),(x,y-.12,z+.63),.035,MATS["Black metal"])
    cyl(name+"_ObjectiveTurret",(x,y-.04,z+.41),.067,.04,MATS["Black metal"])
    for dx in [-.038,0,.038]:
        cyl(name+"_Objective",(x+dx,y-.055,z+.35),.019,.095,MATS["Steel"],20)
    cyl(name+"_FocusKnob",(x+.075,y+.14,z+.30),.045,.06,MATS["Black metal"],24,(1,0,0))
    cyl(name+"_Condenser",(x,y-.06,z+.16),.055,.06,MATS["Steel"])


def cabinet(name,x,y,w,d,h):
    box(name+"_Carcass",(x,y,(h+.18)/2),(w,d,h-.18),MATS["Porcelain"],.025)
    for i in range(max(1,int(w/.65))):
        step=w/max(1,int(w/.65));xx=x-w/2+step*(i+.5)
        box(name+"_Door",(xx,y-d/2-.017,(h+.22)/2),(step-.026,.03,h-.30),MATS["Sage"],.012)
        tube(name+"_Pull",(xx+.15,y-d/2-.055,h-.21),(xx+.15,y-d/2-.055,h-.37),.012,MATS["Steel"])
    box(name+"_Worktop",(x,y,h+.03),(w+.05,d+.05,.065),MATS["Ink blue"],.025)


def laboratory():
    room(10,8,3.8,floor="Concrete")
    cabinet("Lab_BackBench",-.45,3.13,7.6,1.0,1.04)
    cabinet("Lab_LeftBench",-3.75,1.2,1.9,1.0,1.04)
    # Central open knee-space bench, distinct from a solid cabinet block.
    table("Lab_CentralIsland",.15,-.55,4.9,1.45,1.07,"Ink blue")
    for x in [-1.7,0,1.7]:
        box("Lab_UtilityPedestal",(x,-.55,1.28),(.12,.20,.35),MATS["Porcelain"])
        for side in [-1,1]:
            cyl("Lab_GasTap",(x, -.55+side*.16,1.29),.032,.08,MATS["Brass"],20,(0,side,0))
    # Working fume hood has a deep open cavity, raised transparent sash and baffles.
    hx,hy=-2.5,3.0
    for xx in [hx-.97,hx+.97]:
        box("Lab_FumeHoodSide",(xx,hy,1.82),(.14,.93,1.55),MATS["Porcelain"])
    box("Lab_FumeHoodBack",(hx,hy+.38,1.82),(1.9,.1,1.55),MATS["Porcelain"])
    box("Lab_FumeHoodHeader",(hx,hy,2.57),(2.1,.95,.23),MATS["Porcelain"])
    box("Lab_FumeSash",(hx,hy-.45,2.08),(1.8,.026,.70),MATS["Glass"])
    tube("Lab_FumeSashHandle",(hx-.68,hy-.49,1.73),(hx+.68,hy-.49,1.73),.017,MATS["Steel"])
    for x in [-2.85,-2.2]:
        beaker("Lab_HoodBeaker",x,2.85,1.1,.12,.32,True)
    cyl("Lab_ExtractionDuct",(hx,hy,2.98),.2,.6,MATS["Steel"])
    # Recessed sink assembled from a bowl profile, rim, and curved faucet neck.
    sx=2.0
    cutter=cyl("Temporary_SinkCutout",(sx,3.10,1.04),.315,.5,None,48)
    for name in ["Lab_BackBench_Worktop","Lab_BackBench_Carcass"]:
        target=bpy.data.objects[name]
        modifier=target.modifiers.new("Recessed sink opening","BOOLEAN")
        modifier.operation="DIFFERENCE";modifier.solver="EXACT";modifier.object=cutter
        bpy.context.view_layer.objects.active=target
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    lathe("Lab_SinkBowl",(sx,3.10,1.06),[(.33,0),(.32,-.015),(.29,-.15),(.08,-.19),(0,-.19)],MATS["Steel"])
    ring("Lab_SinkRim",(sx,3.10,1.08),.33,.023,MATS["Steel"])
    tube("Lab_Faucet",(sx,3.5,1.08),(sx,3.5,1.43),.028,MATS["Steel"])
    tube("Lab_Faucet",(sx,3.5,1.43),(sx,3.2,1.43),.028,MATS["Steel"])
    tube("Lab_Faucet",(sx,3.2,1.43),(sx,3.2,1.36),.028,MATS["Steel"])
    microscope("Lab_Microscope",-1.7,-.8,1.11)
    microscope("Lab_Microscope",1.65,-.7,1.11)
    for x in [-.6,-.2,.3]:
        beaker("Lab_GraduatedBeaker",x,-.98,1.11,.09+(.3+x)*.03,.20+(.3+x)*.1,True)
    for x in [-1.1,.85]:
        tube("Lab_RetortStand",(x,-.13,1.1),(x,-.13,1.94),.015,MATS["Steel"])
        box("Lab_RetortBase",(x,-.13,1.12),(.25,.27,.045),MATS["Black metal"])
        tube("Lab_RetortClamp",(x,-.13,1.68),(x,-.39,1.68),.015,MATS["Steel"])
        lathe("Lab_ErlenmeyerFlask",(x,-.38,1.28),[(0,0),(.14,.01),(.15,.035),(.045,.24),(.038,.34),(.032,.34),(.032,.25),(.135,.035),(0,.025)],MATS["Glass"])
    for x in [-1.4,.2,1.8]:
        cyl("Lab_StoolSeat",(x,-1.85,.79),.23,.075,MATS["Ink blue"])
        cyl("Lab_StoolColumn",(x,-1.85,.48),.035,.56,MATS["Steel"])
        ring("Lab_StoolFootRing",(x,-1.85,.43),.22,.018,MATS["Steel"])
        for i in range(5):
            a=TAU*i/5
            xx,yy=x+.27*math.cos(a),-1.85+.27*math.sin(a)
            tube("Lab_StoolCasterLeg",(x,-1.85,.3),(xx,yy,.23),.023,MATS["Steel"])
            cyl("Lab_StoolCaster",(xx,yy,.225),.045,.038,MATS["Black metal"],16,(math.cos(a),math.sin(a),0))
    # Safety shower is readable and operationally located beside the exit aisle.
    tube("Lab_SafetyShowerPipe",(4.25,2.9,.18),(4.25,2.9,2.95),.045,MATS["Steel"])
    tube("Lab_ShowerArm",(4.25,2.9,2.95),(4.25,2.3,2.95),.045,MATS["Steel"])
    lathe("Lab_ShowerHead",(4.25,2.3,2.74),[(.20,0),(.20,.02),(.07,.15),(.035,.17)],MATS["Brass"])
    tube("Lab_ShowerPullRod",(4.25,2.48,2.84),(4.25,2.48,1.55),.01,MATS["Steel"])
    ring("Lab_ShowerPull",(4.25,2.48,1.5),.055,.01,MATS["Brass"],(math.pi/2,0,0))
    box("Lab_SafetySign",(4.15,3.75,2.2),(.55,.035,.55),MATS["Sage"])
    text_label("Lab_SafetyCross","+",(4.15,3.72,2.02),.42,MATS["Porcelain"])
    text_label("Lab_Identity","RESEARCH / 04",(.9,3.76,3.17),.24,MATS["Ink blue"])
    REPORT["semanticParts"]=["open knee-space central research island", "raised-sash fume hood and extraction duct", "two detailed optical microscopes", "graduated beakers and retort-clamped flasks", "sink and faucet", "five-caster laboratory stools", "safety shower and pull handle"]


BUILDERS={"library_reading_room":library,"independent_bookshop":bookshop,"fashion_boutique":boutique,"park_garden_pavilion":pavilion,"police_interview_room":interview,"science_research_laboratory":laboratory}


def setup_review(name):
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.device="CPU";scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.cycles.adaptive_threshold=.06;scene.cycles.max_bounces=6
    scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    world=bpy.data.worlds.new("ReviewWorld");world.use_nodes=True
    world.node_tree.nodes["Background"].inputs["Color"].default_value=(.55,.62,.72,1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value=.5
    scene.world=world
    camera=CATALOG[name]["camera"]
    data=bpy.data.cameras.new("ReviewCamera");obj=bpy.data.objects.new("ReviewCamera",data);scene.collection.objects.link(obj)
    obj.location=ref.y_up(camera["position"])
    target=ref.y_up(camera["target"])
    obj.rotation_euler=(target-obj.location).to_track_quat("-Z","Y").to_euler()
    data.type="PERSP";data.lens_unit="FOV";data.angle=math.radians(camera["fovDegrees"]);scene.camera=obj
    for label,pos,energy,size,color in [("Key",(-6,-5,11),1800,8,(1,.91,.78)),("Fill",(7,-2,8),1300,7,(.77,.88,1)),("Top",(0,6,10),1800,7,(1,.97,.9))]:
        light=bpy.data.lights.new("Review"+label,"AREA");light.energy=energy;light.shape="DISK";light.size=size;light.color=color
        obj=bpy.data.objects.new("Review"+label,light);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat("-Z","Y").to_euler()


def generate(name,skip_render=False):
    global REPORT,MATS,CACHE,TEMPLATES
    ref.reset_scene()
    bpy.context.scene.name=name
    REPORT={"id":"ts-bg3d-"+name+"-expansion-v1","generator":"scripts/blender/generate_studio_environment_expansion_v1.py","license":"CC0-1.0","sourceModels":[],"sourceMaterials":[],"semanticParts":[],"studioRuntimeVerified":False,"allAnglesArtisticallyApproved":False,"visualReviewLevel":"generated-preview-pending-review"}
    MATS={};CACHE={};TEMPLATES={}
    palette();BUILDERS[name]()
    for prototype,_ in TEMPLATES.values():
        bpy.data.objects.remove(prototype,do_unlink=True)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    scales={m.name:1 for m in MATS.values()}
    for obj in meshes:
        if not obj.name.startswith("Refined_"):
            ref.projected_uv(obj,scales)
    ref.combine_original_by_material(meshes)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    # Bake all object transforms so Three.js broad and precise bounds agree.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        if obj.data.users>1: obj.data=obj.data.copy()
        obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    low,high=ref.world_bounds(meshes)
    path=OUT/(name+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_cameras=False,export_lights=False,export_animations=False,export_yup=True,export_image_format="AUTO",export_extras=False)
    metrics=ref.glb_metrics(path)
    REPORT["metrics"]=metrics
    REPORT["byteSize"]=path.stat().st_size
    REPORT["sha256"]="sha256:"+hashlib.sha256(path.read_bytes()).hexdigest()
    REPORT["bounds"]=[round(high.x-low.x,5),round(high.z-low.z,5),round(high.y-low.y,5)]
    REPORT["camera"]=CATALOG[name]["camera"]
    REPORT["url"]="/assets/3d/environments/expansion-v1/"+name+".glb"
    REPORT["fileName"]=name+".glb"
    REPORT["thumbnailUrl"]="/assets/3d/environments/expansion-v1/thumbnails/"+name+".png"
    REPORT.update({k:v for k,v in CATALOG[name].items() if k!="camera"})
    if not skip_render:
        setup_review(name)
        bpy.context.scene.render.filepath=str(ARTIFACTS/(name+".png"))
        bpy.ops.render.render(write_still=True)
        shutil.copy2(ARTIFACTS/(name+".png"),OUT/"thumbnails"/(name+".png"))
    (ARTIFACTS/(name+".json")).write_text(json.dumps(REPORT,indent=2,ensure_ascii=False)+"\n")
    print("EXPANSION_RESULT "+json.dumps({"id":name,"metrics":metrics,"bounds":REPORT["bounds"]}),flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--only",nargs="*")
    parser.add_argument("--skip-render",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    OUT.mkdir(parents=True,exist_ok=True);(OUT/"thumbnails").mkdir(exist_ok=True);ARTIFACTS.mkdir(parents=True,exist_ok=True)
    for name in args.only or CATALOG:
        if name not in BUILDERS: raise ValueError("Unknown environment: "+name)
        generate(name,args.skip_render)
    reports=[json.loads((ARTIFACTS/(name+".json")).read_text()) for name in CATALOG if (ARTIFACTS/(name+".json")).exists()]
    (OUT/"manifest.json").write_text(json.dumps({"version":"expansion-v1","assets":reports},indent=2,ensure_ascii=False)+"\n")
    sources=sorted({s["sourceUrl"] for r in reports for s in r["sourceModels"]+r["sourceMaterials"]})
    (OUT/"LICENSES.md").write_text("# Studio environment expansion v1\n\nOriginal scene architecture, bespoke furniture, garments and equipment: ToonSpectrum, CC0-1.0.\n\nGenerator: `scripts/blender/generate_studio_environment_expansion_v1.py`, Blender 5.2.\n\nScanned models and PBR image sources: Poly Haven, CC0-1.0. Embedded images are reduced to at most 1024px; shared material images and model meshes are reused within each GLB. No external runtime resource requests.\n\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n\n"+"\n".join("- "+url for url in sources)+"\n\nReview status is recorded separately from source licensing and mobile admission. A generated preview is not an all-angle quality approval.\n")


if __name__=="__main__": main()
