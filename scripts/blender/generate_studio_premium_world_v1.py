#!/usr/bin/env python3
"""Original, reproducible scene/prop pack. Run only in a disposable Blender process.

Blender --background --python-exit-code 1 --python this.py -- --shard 0
Geometry: ToonSpectrum CC0. Embedded material sources retain Poly Haven provenance.
Preview generation is NOT visual approval; publication requires a hash-bound review.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_studio_environment_expansion_v1 as g

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/studio-premium-world-v1"
GENERATOR = "scripts/blender/generate_studio_premium_world_v1.py"
SOURCE_URL = "https://github.com/blue45f/toonspectrum/blob/main/" + GENERATOR
B, C, T, L, R = g.box, g.cyl, g.tube, g.lathe, g.ring
PI = math.pi

PROPS = [
    ("slatted-bench", "팔걸이 원목 벤치", "bench", "architecture"),
    ("street-lantern", "브라스 거리 가로등", "lamp", "architecture"),
    ("sheltered-bus-stop", "유리 지붕 버스 정류장", "shelter", "architecture"),
    ("ticket-kiosk", "역사 무인 발권기", "kiosk", "architecture"),
    ("parcel-locker", "공용 무인 택배 보관함", "locker", "architecture"),
    ("cycle-rack", "스테인리스 자전거 거치대", "rack", "architecture"),
    ("timber-litter-bin", "원목 슬랫 쓰레기통", "bin", "architecture"),
    ("illuminated-bollard", "보행로 조명 볼라드", "bollard", "architecture"),
    ("tree-planter", "사각 수목 플랜터", "planter", "nature"),
    ("striped-shop-awning", "상점 스트라이프 차양", "awning", "architecture"),
    ("florist-display-cart", "플라워숍 꽃 진열 카트", "flowercart", "pbr-detailed-prop"),
    ("bakery-display-case", "베이커리 곡면 진열장", "display", "pbr-detailed-prop"),
    ("artisan-espresso-machine", "브라스 에스프레소 머신", "espresso", "pbr-detailed-prop"),
    ("bread-tray", "아티장 빵 트레이", "bread", "food"),
    ("street-drain-grate", "도로 배수 그레이팅", "drain", "architecture"),
    ("parking-meter", "주차 정산 미터", "meter", "architecture"),
]
SCENES = [
    ("shopping-arcade", "아케이드 상점 거리", "arcade", "retail", [14, 10, 16], [0, 1.5, 0]),
    ("hillside-stair-alley", "언덕 주택 계단 골목", "alley", "urban", [15, 11, 18], [0, 2.0, 0]),
    ("transit-boulevard", "버스 정류장과 대로", "boulevard", "transit", [17, 11, 17], [0, 1.1, 0]),
    ("artisan-bakery", "아티장 베이커리", "bakery", "hospitality", [12, 9, 14], [0, 1.2, 0]),
    ("flower-atelier", "골목 플라워 아틀리에", "florist", "retail", [12, 9, 14], [0, 1.3, 0]),
    ("station-concourse", "역사 발권 대합실", "station", "transit", [15, 10, 17], [0, 1.5, 0]),
    ("rooftop-greenhouse", "옥상 온실 정원", "greenhouse", "urban", [15, 11, 17], [0, 1.5, 0]),
    ("riverside-promenade", "강변 데크 산책로", "riverside", "urban", [17, 12, 18], [0, 1.2, 0]),
]


def m(name):
    return g.MATS[name]


def palette():
    g.palette()
    g.mat("Terracotta", (.45, .19, .10), .76)
    g.mat("Leaf dark", (.055, .17, .08), .72)
    g.mat("Leaf light", (.19, .38, .11), .68)
    g.mat("Petal coral", (.74, .25, .20), .54)
    g.mat("Petal cream", (.95, .77, .48), .53)
    g.mat("Bread crust", (.57, .28, .075), .80)
    g.mat("Bread score", (.92, .68, .30), .90)
    g.mat("Asphalt", (.09, .11, .12), .88, source="concrete_floor_02", keep_color=True)
    g.mat("Water", (.025, .16, .20), .19, .32)
    for name in ["Warm light"]:
        shader = m(name).node_tree.nodes.get("Principled BSDF")
        shader.inputs["Emission Color"].default_value = (1, .65, .25, 1)
        shader.inputs["Emission Strength"].default_value = .8


def move_group(objects, x, y, z=0, angle=0):
    for obj in objects:
        px, py = obj.location.x, obj.location.y
        obj.location = (x + px * math.cos(angle) - py * math.sin(angle),
                        y + px * math.sin(angle) + py * math.cos(angle), obj.location.z + z)
        obj.rotation_euler.z += angle


def place(kind, x, y, z=0, angle=0):
    before = set(bpy.context.scene.objects)
    BUILDERS[kind]()
    objects = [obj for obj in bpy.context.scene.objects if obj not in before]
    move_group(objects, x, y, z, angle)


def bolt(x, y, z, radius=.018):
    C("Recessed hex fastener", (x, y, z), radius, .016, m("Steel"), 6)


def bench():
    for i in range(6):
        B("Bench seat timber", (0, -.24 + i*.09, .48), (1.85, .075, .065), m("Warm oak"), .018)
    for i in range(5):
        B("Bench back timber", (0, .265, .64+i*.09), (1.85, .065, .075), m("Warm oak"), .018)
    for x in [-.72, .72]:
        for y in [-.19, .22]:
            T("Bench leg", (x, y, .04), (x, y, .48), .032, m("Black metal"))
            C("Bench mounting foot", (x, y, .02), .085, .04, m("Black metal"), 24)
        T("Bench back upright", (x, .25, .42), (x, .28, 1.08), .025, m("Black metal"))
        T("Bench arm front", (x, -.18, .48), (x, -.18, .75), .024, m("Black metal"))
        B("Bench arm cap", (x, .035, .765), (.09, .48, .065), m("Walnut"), .025)
        for y in [-.24, .21]: bolt(x, y, .522)


def lamp():
    L("Lantern pedestal", (0, 0, 0), [(0,0),(.20,0),(.20,.08),(.14,.12),(.11,.30),(.065,.45),(.045,2.6),(.08,2.67)], m("Black metal"))
    C("Lantern lower plate", (0,0,2.68), .27, .06, m("Brass"), 32)
    B("Lantern diffuser", (0,0,2.99), (.32,.32,.55), m("Warm light"), .04)
    for x in [-.21,.21]:
        for y in [-.21,.21]: T("Lantern frame", (x,y,2.7),(x*.78,y*.78,3.28),.018,m("Black metal"))
    L("Lantern roof", (0,0,3.25), [(0,0),(.34,0),(.34,.035),(.11,.20),(0,.23)],m("Black metal"),4)
    C("Lantern finial",(0,0,3.51),.035,.09,m("Brass"),24)


def shelter():
    B("Shelter plinth",(0,0,.05),(3.8,1.7,.10),m("Concrete"),.04)
    for x in [-1.65,1.65]:
        B("Shelter frame",(x,.60,1.28),(.10,.10,2.5),m("Black metal"),.02)
        T("Shelter roof outrigger",(x,.62,2.48),(x,-.78,2.59),.045,m("Black metal"))
        B("Shelter side glazing",(x,.05,1.45),(.025,1.05,1.70),m("Glass"),.008)
    B("Shelter rear glazing",(0,.64,1.48),(3.24,.025,1.72),m("Glass"),.008)
    B("Shelter roof metal perimeter",(0,-.04,2.59),(3.9,1.70,.085),m("Steel"),.035)
    B("Shelter translucent roof",(0,-.04,2.65),(3.7,1.50,.03),m("Glass"),.01)
    place("bench",-.28,.20,.08)
    B("Route information enclosure",(1.20,.53,1.6),(.38,.055,.68),m("Ink blue"),.025)
    B("Route diagram",(1.20,.494,1.6),(.30,.008,.57),m("Paper"),.008)
    for z in [1.4,1.52,1.64,1.76]:
        C("Route stop node",(1.16,.483,z),.018,.008,m("Sage"),16,(0,-1,0))
    T("Route line",(1.16,.48,1.4),(1.16,.48,1.76),.004,m("Sage"),8)


def kiosk():
    B("Kiosk weighted plinth",(0,0,.055),(.67,.60,.11),m("Black metal"),.045)
    B("Kiosk cabinet",(0,0,.89),(.56,.48,1.60),m("Porcelain"),.065)
    B("Kiosk fascia",(0,-.251,1.11),(.47,.025,1.05),m("Ink blue"),.028)
    B("Kiosk screen glass",(0,-.271,1.32),(.39,.015,.39),m("Mirror"),.018)
    for x in [-.12,0,.12]: B("Touch menu card",(x,-.284,1.30),(.09,.004,.12),m("Sage"),.007)
    B("Card terminal",(.11,-.294,.94),(.14,.055,.17),m("Black metal"),.018)
    B("Receipt slot",(-.075,-.281,.81),(.26,.017,.028),m("Black metal"),.004)
    B("Ticket retrieval",(0,-.27,.57),(.35,.026,.16),m("Black metal"),.025)
    for z in [.22,.26,.30]: B("Kiosk vent",(0,.247,z),(.37,.015,.012),m("Black metal"),.003)


def locker():
    B("Locker housing",(0,0,1.05),(2.34,.57,2.10),m("Black metal"),.055)
    for col in range(4):
        for row in range(4):
            x=-.87+col*.58;z=.28+row*.51
            B("Locker inset door",(x,-.296,z),(.54,.045,.46),m("Sage") if col%2 else m("Porcelain"),.018)
            B("Locker latch",(x+.18,-.327,z),(.06,.02,.10),m("Black metal"),.008)
            B("Locker number plate",(x-.15,-.326,z+.12),(.095,.008,.038),m("Brass"),.004)
    for x in [-1.14,1.14]: B("Locker rain edge",(x,-.08,2.12),(.075,.82,.06),m("Steel"))


def rack():
    for x in [-.75,0,.75]:
        for side in [-1,1]:
            T("Cycle rack leg",(x,side*.33,.03),(x,side*.33,.78),.026,m("Steel"))
            C("Cycle rack floor plate",(x,side*.33,.025),.10,.04,m("Steel"),24)
        # A single curved tube closes the inverted U without disconnected end caps.
        points=[(x,.33*math.cos(i*PI/16),.78+.33*math.sin(i*PI/16)) for i in range(17)]
        for a,b in zip(points,points[1:]): T("Cycle rack curved crown",a,b,.026,m("Steel"),12)


def bin_prop():
    C("Bin inner liner",(0,0,.46),.29,.88,m("Black metal"),40)
    for i in range(20):
        a=i*math.tau/20
        B("Bin radial timber",(.31*math.cos(a),.31*math.sin(a),.45),(.072,.035,.84),m("Warm oak"),.008,a-PI/2)
    for z in [.16,.72]: R("Bin retaining band",(0,0,z),.334,.019,m("Black metal"))
    L("Bin rolled opening",(0,0,.88),[(.22,0),(.35,0),(.35,.045),(.24,.045),(.22,.02)],m("Steel"),48)


def bollard():
    L("Bollard turned body",(0,0,0),[(0,0),(.12,0),(.12,.04),(.082,.07),(.082,.72),(.10,.74)],m("Black metal"))
    C("Bollard light diffuser",(0,0,.80),.079,.14,m("Warm light"),32)
    C("Bollard weather cap",(0,0,.89),.105,.04,m("Black metal"),32)
    for a in [0,PI/2,PI,3*PI/2]: T("Bollard guard",(.089*math.cos(a),.089*math.sin(a),.72),(.089*math.cos(a),.089*math.sin(a),.88),.010,m("Black metal"),8)


def planter():
    for x in [-.56,.56]: B("Planter side",(x,0,.30),(.08,1.18,.60),m("Concrete"),.025)
    for y in [-.56,.56]: B("Planter side",(0,y,.30),(1.06,.08,.60),m("Concrete"),.025)
    B("Planter soil",(0,0,.52),(1.02,1.02,.08),m("Walnut"),.01)
    g.garden_tree("Planter young tree",0,0,2.65,831)


def awning():
    for i in range(14):
        x=-1.3+i*.2
        panel=B("Canvas awning stripe",(x,-.36,2.20),(.20,1.12,.045),m("Paper") if i%2 else m("Sage"),.008)
        panel.rotation_euler.x=.22
        B("Canvas scalloped valance",(x,-.90,2.01),(.20,.035,.22),m("Paper") if i%2 else m("Sage"),.025)
    for x in [-1.38,1.38]:
        T("Awning wall brace",(x,.10,1.82),(x,-.88,2.11),.023,m("Steel"))
        B("Awning wall mounting plate",(x,.12,2.05),(.12,.065,.55),m("Black metal"))


def flower(x,y,z,seed):
    for i in range(5):
        a=(seed+i)*2.39996;top=(x+.12*math.cos(a),y+.12*math.sin(a),z+.42+(i%3)*.05)
        T("Flower stem",(x,y,z),top,.006,m("Leaf dark"),8)
        for j in range(5):
            p=j*math.tau/5
            petal=C("Flower petal",(top[0]+.027*math.cos(p),top[1]+.027*math.sin(p),top[2]),.026,.016,m("Petal coral") if seed%2 else m("Petal cream"),12)
            petal.scale=(1,.75,1)
        C("Flower centre",top,.014,.019,m("Brass"),12)


def flowercart():
    for x in [-.57,.57]:
        for y in [-.25,.25]:
            C("Cart caster wheel",(x,y,.12),.10,.055,m("Black metal"),24,(1,0,0))
            T("Cart caster fork",(x,y,.13),(x,y,.24),.022,m("Steel"))
    for z in [.29,.86]: B("Florist cart tray",(0,0,z),(1.4,.70,.07),m("Warm oak"),.025)
    for x in [-.62,.62]:
        for y in [-.28,.28]: T("Cart corner frame",(x,y,.21),(x,y,1.0),.020,m("Black metal"))
    T("Cart push handle",(-.62,.28,1.0),(.62,.28,1.0),.023,m("Black metal"))
    for i,x in enumerate([-.43,0,.43]):
        L("Galvanized flower bucket",(x,0,.90),[(0,0),(.13,0),(.17,.30),(.16,.315),(.15,.29),(.12,.02),(0,.02)],m("Steel"),32)
        flower(x,0,1.01,i+3)


def bread():
    B("Bread serving board",(0,0,.025),(.62,.43,.05),m("Walnut"),.065)
    for i,x in enumerate([-.18,0,.18]):
        loaf=C("Artisan bread loaf",(x,0,.095),.070,.29,m("Bread crust"),32,(0,1,0))
        loaf.scale.z=.85
        for y in [-.08,0,.08]: T("Bread crust diagonal score",(x-.038,y-.018,.159),(x+.038,y+.018,.159),.006,m("Bread score"),10)


def display():
    B("Display cabinet base",(0,0,.43),(1.95,.84,.86),m("Warm oak"),.065)
    for x in [-.94,.94]: B("Display end glazing",(x,0,1.11),(.022,.79,.58),m("Glass"),.01)
    B("Display front glazing",(0,-.40,1.11),(1.89,.02,.58),m("Glass"),.01)
    B("Display glass roof",(0,0,1.42),(1.98,.86,.025),m("Glass"),.014)
    for z in [.90,1.18]:
        B("Display shelf",(0,.03,z),(1.87,.68,.028),m("Steel"),.01)
        for x in [-.60,0,.60]: place("bread",x,.03,z+.02)
    B("Display kick plate",(0,-.439,.13),(1.8,.023,.15),m("Brass"),.008)
    for x in [-.82,.82]: T("Display front frame",(x,-.42,.88),(x,-.42,1.42),.013,m("Brass"))


def espresso():
    B("Espresso body",(0,0,.30),(.72,.42,.51),m("Ink blue"),.065)
    B("Espresso polished face",(0,-.225,.32),(.65,.045,.33),m("Brass"),.025)
    B("Espresso cup tray",(0,0,.57),(.78,.46,.03),m("Steel"),.018)
    B("Espresso drip tray",(0,-.33,.06),(.74,.28,.06),m("Steel"),.018)
    for i in range(13): B("Espresso drainage slot",(-.30+i*.05,-.34,.093),(.015,.19,.006),m("Black metal"),.002)
    for x in [-.18,.18]:
        C("Espresso group head",(x,-.31,.32),.069,.11,m("Steel"),32)
        T("Espresso portafilter",(x,-.33,.27),(x,-.55,.27),.021,m("Walnut"))
        C("Espresso pressure dial",(x,-.257,.45),.041,.015,m("Paper"),32,(0,-1,0))
        T("Espresso dial needle",(x,-.268,.45),(x+.018,-.268,.467),.0025,m("Black metal"),8)
    for x in [-.32,.32]: T("Espresso steam wand",(x,-.25,.33),(x,-.45,.12),.009,m("Steel"))


def drain():
    B("Drain surround",(0,0,.026),(.91,.47,.052),m("Concrete"),.018)
    B("Drain dark cavity",(0,0,.055),(.82,.38,.014),m("Black metal"),.008)
    for i in range(16): B("Drain removable grate slat",(-.39+i*.052,0,.071),(.024,.36,.025),m("Steel"),.005)
    for x in [-.39,.39]:
        for y in [-.17,.17]: bolt(x,y,.09,.013)


def meter():
    C("Parking meter foot",(0,0,.025),.13,.05,m("Steel"),32)
    C("Parking meter post",(0,0,.56),.046,1.08,m("Steel"),32)
    B("Parking meter head",(0,0,1.30),(.34,.24,.51),m("Sage"),.10)
    B("Parking meter display",(0,-.13,1.41),(.22,.02,.13),m("Mirror"),.018)
    B("Parking meter card slot",(0,-.135,1.21),(.19,.015,.027),m("Black metal"),.004)
    C("Parking meter control",(.07,-.141,1.11),.032,.02,m("Brass"),24,(0,-1,0))


def window(x,y,z,w=1.25,h=1.45):
    B("Window stone reveal",(x,y,z),(w+.16,.15,h+.16),m("Limestone"),.022)
    B("Window glass",(x,y-.095,z),(w,.025,h),m("Mirror"),.008)
    B("Window centre mullion",(x,y-.12,z),(.045,.05,h),m("Paper"),.008)
    B("Window transom",(x,y-.12,z),(w,.05,.045),m("Paper"),.008)
    B("Window sill",(x,y-.18,z-h/2-.06),(w+.23,.35,.09),m("Limestone"),.025)


def facade(x,y,w,h=4.8):
    B("Shop masonry facade",(x,y,h/2),(w,.32,h),m("Ivory plaster"),.035)
    B("Shop masonry skirting",(x,y-.20,.30),(w,.13,.60),m("Concrete"),.015)
    B("Shop glazed door frame",(x,y-.22,1.32),(1.13,.14,2.5),m("Black metal"),.020)
    B("Shop glazed door",(x,y-.30,1.36),(.94,.025,2.25),m("Glass"),.01)
    T("Shop door pull",(x+.34,y-.36,1.20),(x+.34,y-.36,1.60),.016,m("Brass"))
    for dx in [-w*.31,w*.31]: window(x+dx,y-.25,1.48,w*.24,1.80)
    for dx in [-w*.26,w*.26]: window(x+dx,y-.08,3.66,w*.25,1.26)
    B("Facade cornice",(x,y-.17,h-.08),(w+.16,.5,.16),m("Limestone"),.025)
    place("awning",x,y-.25,.10)


def paved_ground(w,d):
    B("Site foundation",(0,0,.055),(w,d,.11),m("Concrete"),.04)
    for ix in range(int(w)):
        for iy in range(int(d)):
            B("Individual paving slab",(-w/2+.5+ix,-d/2+.5+iy,.13),(.975,.975,.10),m("Limestone"),.009)


def arcade():
    paved_ground(12,10)
    for x in [-3.8,0,3.8]: facade(x,3.4,3.75)
    for x in [-5.4,-1.8,1.8,5.4]:
        B("Arcade structural column",(x,1.75,2.3),(.16,.16,4.2),m("Black metal"),.015)
        T("Arcade glass roof rafter",(x,1.75,4.40),(x,3.5,4.68),.055,m("Steel"))
    B("Arcade glazed canopy",(0,2.6,4.56),(11.5,1.9,.028),m("Glass"),.008)
    for x in [-4.4,4.4]: place("lamp",x,-2.3,.18)
    place("flowercart",-3.8,1.3,.18);place("bench",1.3,-.8,.18)
    place("planter",-4.5,-.8,.18);place("bin",3.0,-.8,.18)


def alley():
    B("Alley lower landing",(0,-2.8,.09),(10,5,.18),m("Concrete"),.04)
    for step in range(12):
        B("Alley stair tread",(0,-.7+step*.42,.13+step*.13),(2.5,.46,.26+step*.26),m("Limestone"),.022)
    for side in [-1,1]:
        for i in range(7):
            y=-.7+i*.77;z=.30+i*.238
            T("Stair rail upright",(side*1.36,y,z),(side*1.36,y,z+1),.021,m("Steel"))
        T("Continuous stair handrail",(side*1.36,-.8,1.30),(side*1.36,4.0,2.81),.027,m("Steel"))
        for row in range(2):
            x=side*3.2;y=.4+row*3.0;base=row*1.15
            B("Hill dwelling",(x,y,base+2.0),(3.0,2.7,4.0),m("Terracotta") if row else m("Ivory plaster"),.04)
            for z in [1.1,2.9]: window(x,y-1.40,base+z,1.4,1.2)
            B("Dwelling roof coping",(x,y,base+4.08),(3.18,2.88,.16),m("Concrete"),.03)
    place("planter",-3.5,-2.2,.18);place("lamp",3.8,-2.3,.18)
    place("drain",0,-2.0,.18);place("bench",-1.4,-3.8,.18)


def boulevard():
    B("Road asphalt",(0,0,.05),(15,11,.10),m("Asphalt"),.04)
    B("Raised sidewalk",(0,2.55,.16),(15,5.4,.22),m("Concrete"),.025)
    for x in range(-7,8): B("Kerb stone",(x,-.13,.24),(.985,.20,.27),m("Limestone"),.025)
    for x in [-5,-2,1,4]: B("Road lane dash",(x,-3.5,.111),(1.45,.10,.007),m("Paper"),.002)
    for y in [-4.8,-4.2,-3.6,-3.0,-2.4,-1.8,-1.2]: B("Pedestrian crossing",(4.8,y,.112),(2.4,.30,.008),m("Paper"),.003)
    place("shelter",-2,2.3,.27);place("kiosk",.9,3.3,.27)
    for x in [-6,2.7,6.2]: place("planter",x,4.1,.27)
    for x in [-5.8,1.4]: place("lamp",x,.75,.27)
    place("rack",4.3,2.0,.27);place("bin",.55,1.5,.27)
    place("meter",-6,.65,.27);place("drain",-3,-.4,.11)


def bakery():
    g.room(10,8,3.8)
    for x in [-3.6,-1.2,1.2,3.6]:
        B("Bakery wainscot panel",(x,3.74,1.0),(2.30,.055,1.5),m("Sage"),.025)
        window(x,3.69,2.65,1.70,1.25)
    place("display",-2,1.0,.18);place("display",.1,1.0,.18)
    B("Bakery service counter",(2.5,1.1,.69),(2,.85,1.0),m("Walnut"),.05)
    B("Bakery marble counter",(2.5,1.1,1.22),(2.12,.95,.06),m("Limestone"),.018)
    place("espresso",2.5,1.1,1.26)
    for x in [-3.4,0,3.4]:
        g.table("Bakery cafe table",x,-1.7,1.45,.78,.92)
        g.metal_chair("Bakery chair",x,-2.65)
        g.metal_chair("Bakery chair",x,-.77,PI)
        place("bread",x,-1.7,.97)
    place("planter",-3.8,2.7,.18)


def florist():
    g.room(10,8,3.7,floor="Concrete")
    for x in [-3.6,-1.2,1.2,3.6]:
        for z in [.55,1.35,2.15]:
            B("Florist wall display shelf",(x,3.24,z),(2.1,.70,.07),m("Warm oak"),.02)
            for j in range(3):
                xx=x-.65+j*.65
                L("Florist ceramic vase",(xx,3.20,z+.04),[(0,0),(.15,0),(.13,.30),(.08,.40),(.07,.40),(.12,.28),(.14,.025),(0,.025)],m("Terracotta"),24)
                flower(xx,3.2,z+.25,int(z*100)+j)
    g.table("Florist wrapping table",.8,-.4,2.8,1.3,1.00)
    B("Florist wrapping paper",(.8,-.4,1.07),(1.4,.85,.008),m("Paper"),.01)
    place("flowercart",-2.3,-1.9,.18);place("flowercart",2.9,1.15,.18)
    place("planter",-3.8,.6,.18);place("bench",2.8,-2.6,.18)


def station():
    g.room(13,10,4.6,floor="Concrete")
    for x in [-4.8,0,4.8]:
        B("Station structural pier",(x,4.1,2.3),(.55,.60,4.6),m("Limestone"),.05)
        B("Station roof beam",(x,2.2,4.4),(.38,5.3,.30),m("Steel"),.018)
    for x in [-4.2,-3.15,-2.1]: place("kiosk",x,3.8,.18)
    place("locker",2.4,4.3,.18)
    for x in [-3.4,.2,3.8]: place("bench",x,-1.0,.18)
    for x in [-4.8,4.8]: place("bin",x,-2.5,.18)
    for x in [-1.0,0,1.0]:
        B("Concourse fare gate",(x,1.3,.73),(.28,1.6,1.10),m("Steel"),.045)
        B("Concourse gate glass",(x+.32,1.3,.92),(.32,.035,.85),m("Glass"),.015)
    B("Concourse departure board",(0,4.63,3.55),(3.4,.12,.75),m("Ink blue"),.035)
    for row in range(4):
        for col in range(5): B("Departure board field",(-1.35+col*.65,4.56,3.31+row*.15),(.42,.008,.042),m("Warm light"),.003)


def greenhouse():
    paved_ground(12,10)
    for y in [-4.8,4.8]: B("Rooftop parapet",(0,y,.58),(12,.25,.9),m("Concrete"),.04)
    B("Rooftop rear parapet",(-5.85,0,.58),(.25,9.8,.9),m("Concrete"),.04)
    for x in [-3,-1,1,3]:
        for y in [0,3.6]:
            T("Greenhouse upright",(x,y,.18),(x,y,2.85),.035,m("Sage"))
            T("Greenhouse roof pitch",(x,y,2.85),(x,1.8,3.65),.035,m("Sage"))
    for y in [0,3.6]:
        for z in [.3,1.55,2.85]: T("Greenhouse longitudinal beam",(-3,y,z),(3,y,z),.026,m("Sage"))
        B("Greenhouse rear glazing" if y else "Greenhouse low glazing",(0,y,1.2),(6,.012,1.8 if y else .8),m("Glass"),.004)
    # Front roof intentionally open as an architectural cutaway; rear roof is glazed.
    roof=B("Greenhouse glazed roof",(0,2.7,3.24),(6.05,2.0,.018),m("Glass"),.006);roof.rotation_euler.x=-.42
    for x in [-2,0,2]:
        B("Greenhouse raised planting box",(x,2,.62),(1.3,2.2,.65),m("Warm oak"),.025)
        for y in [1.4,2.1,2.7]: flower(x,y,.98,int(x*10+y*10))
    place("bench",-2.4,-2.5,.18);place("flowercart",2.6,-1.1,.18)
    for x in [-4.7,4.7]: place("planter",x,2.1,.18)
    for x in [-4,-1,2,5]: place("bollard",x,-3.9,.18)


def riverside():
    B("Riverside foundation",(0,0,.04),(15,12,.08),m("Concrete"),.04)
    B("River water surface",(0,3.8,.105),(15,4.4,.04),m("Water"),.005)
    for i in range(42): B("Promenade timber decking",(-7.3+i*.35,-1.75,.20),(.33,6.5,.17),m("Warm oak"),.008)
    for x in range(-7,8):
        T("River railing upright",(x,1.5,.25),(x,1.5,1.35),.028,m("Black metal"))
    for z in [.6,.9,1.35]: T("River continuous railing",(-7.3,1.5,z),(7.3,1.5,z),.018 if z<1 else .033,m("Steel"))
    for x in [-4.8,0,4.8]: place("bench",x,-.5,.29)
    for x in [-6.5,6.5]: place("lamp",x,-2.9,.29)
    place("rack",-3.4,-3.7,.29);place("bin",2.0,-2.3,.29)
    for x in [-5.8,5.8]: place("planter",x,-3.8,.29)
    for i in range(12):
        B("River subtle reflected wave",(-6.2+i*1.15,3.2+(i%3)*.6,.13),(.9,.028,.003),m("Mirror"),.005)


BUILDERS = {"bench":bench,"lamp":lamp,"shelter":shelter,"kiosk":kiosk,"locker":locker,
    "rack":rack,"bin":bin_prop,"bollard":bollard,"planter":planter,"awning":awning,
    "flowercart":flowercart,"display":display,"espresso":espresso,"bread":bread,"drain":drain,"meter":meter,
    "arcade":arcade,"alley":alley,"boulevard":boulevard,"bakery":bakery,"florist":florist,
    "station":station,"greenhouse":greenhouse,"riverside":riverside}


def emit(row, is_scene):
    slug, label, builder, category = row[:4]
    g.ref.reset_scene()
    g.REPORT = {"sourceModels":[],"sourceMaterials":[]}
    g.MATS={};g.CACHE={};g.TEMPLATES={}
    g.ref.ARTIFACTS=OUT/"work"/slug
    g.ref.ARTIFACTS.mkdir(parents=True,exist_ok=True)
    palette();BUILDERS[builder]()
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    for obj in meshes: g.ref.projected_uv(obj,{mat.name:1 for mat in g.MATS.values()})
    g.ref.combine_original_by_material(meshes)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        if obj.data.users>1: obj.data=obj.data.copy()
        obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.context.view_layer.update()
    low,high=g.ref.world_bounds(meshes)
    # Remove unused material provenance and constrain embedded image dimensions.
    used={material for obj in meshes for material in obj.data.materials if material}
    images={node.image for material in used if material.use_nodes for node in material.node_tree.nodes if node.type=="TEX_IMAGE" and node.image}
    limit=1024 if is_scene else 512
    for image in images:
        w,h=image.size
        if max(w,h)>limit: image.scale(max(1,round(w*limit/max(w,h))),max(1,round(h*limit/max(w,h))))
        image.pack()
    source_materials=[s for s in g.REPORT["sourceMaterials"] if s["material"] in {mat.name for mat in used}]
    directory=OUT/"assets"/("ts-world-"+slug)
    directory.mkdir(parents=True,exist_ok=True)
    glb=directory/(slug+".glb")
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,
        export_cameras=False,export_lights=False,export_animations=False,export_yup=True,
        export_image_format="AUTO",export_extras=False)
    metrics=g.ref.glb_metrics(glb)
    assert glb.stat().st_size<32*1024*1024, "Oversized authored model: "+slug
    if is_scene:
        position,target=row[4:6]
    else:
        extent=max(high-low);centre=(low+high)*.5
        target=[centre.x,centre.z, -centre.y]
        position=[target[0]+extent*1.35,target[1]+extent*.85,target[2]+extent*1.55]
    g.CATALOG[slug]={"camera":{"position":position,"target":target,"fovDegrees":44}}
    g.setup_review(slug)
    scene=bpy.context.scene
    scene.cycles.samples=32;scene.cycles.adaptive_threshold=.035
    scene.render.resolution_x=2048 if is_scene else 1536
    scene.render.resolution_y=1536
    scene.render.film_transparent=not is_scene
    scene.render.image_settings.color_mode="RGBA"
    image=directory/(slug+".png")
    scene.render.filepath=str(image)
    bpy.ops.render.render(write_still=True)
    record={"id":"ts-world-"+slug,"slug":slug,"name":label,"kind":"scene" if is_scene else "prop",
        "category":category,"generator":GENERATOR,"blenderVersion":bpy.app.version_string,
        "license":"CC0-1.0","sourceUrl":SOURCE_URL,"sourceMaterials":source_materials,
        "tags":[slug.replace("-"," "),label,"거리" if category=="architecture" else category],
        "metrics":metrics,"byteSize":glb.stat().st_size,"sha256":hashlib.sha256(glb.read_bytes()).hexdigest(),
        "bounds":[round(high.x-low.x,6),round(high.z-low.z,6),round(high.y-low.y,6)],
        "camera":{"position":position,"target":target,"fovDegrees":44},
        "width":scene.render.resolution_x,"height":scene.render.resolution_y,
        "visualReviewed":False,"allAnglesArtisticallyApproved":False}
    (directory/"SOURCE.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n")
    print("PREMIUM_WORLD_RESULT "+json.dumps(record,ensure_ascii=False),flush=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument("--shard",type=int,choices=range(4),default=0)
    parser.add_argument("--only")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    entries=[(row,False) for row in PROPS]+[(row,True) for row in SCENES]
    for index,(row,is_scene) in enumerate(entries):
        if (args.only and row[0]==args.only) or (not args.only and index%4==args.shard): emit(row,is_scene)


if __name__=="__main__": main()
