#!/usr/bin/env python3
"""Apply the targeted visual-review corrections before regenerating affected candidates."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "scripts/blender/generate_studio_premium_world_v1.py"
RACK = '''def rack():
    # A continuous tube has no overlapping capped-cylinder seams at the crown.
    for x in [-.75, 0, .75]:
        points = [(x, -.33, .03), (x, -.33, .78)]
        points += [(x, -.33*math.cos(i*PI/32), .78+.33*math.sin(i*PI/32)) for i in range(1, 33)]
        points += [(x, .33, .03)]
        vertices = []
        for i, point in enumerate(points):
            tangent = Vector(points[min(i+1, len(points)-1)])-Vector(points[max(0, i-1)])
            tangent.normalize()
            normal = Vector((1, 0, 0))
            binormal = tangent.cross(normal).normalized()
            for j in range(16):
                a = j*math.tau/16
                vertex = Vector(point)+.026*(math.cos(a)*normal+math.sin(a)*binormal)
                vertices.append(tuple(vertex))
        faces = []
        for i in range(len(points)-1):
            for j in range(16):
                a=i*16+j;b=i*16+(j+1)%16
                faces.append((a,b,b+16,a+16))
        faces += [tuple(range(15,-1,-1)),tuple((len(points)-1)*16+j for j in range(16))]
        mesh=bpy.data.meshes.new("Continuous cycle rack tube")
        mesh.from_pydata(vertices, [], faces);mesh.update()
        obj=bpy.data.objects.new("Seamless formed steel cycle rack",mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(m("Steel"))
        for face in mesh.polygons: face.use_smooth=len(face.vertices)==4
        for y in [-.33, .33]:
            C("Cycle rack floor plate",(x,y,.025),.10,.04,m("Steel"),32)
            for dx in [-.055,.055]: bolt(x+dx,y,.052,.012)


'''
BREAD = '''def bread():
    B("Bread serving board",(0,0,.025),(.62,.43,.05),m("Walnut"),.065)
    crust=g.mat("Artisan baked crust",(.34,.13,.035),.82)
    score=g.mat("Artisan open score",(.64,.37,.12),.91)
    for i,x in enumerate([-.18,0,.18]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=1,location=(x,0,.114))
        loaf=bpy.context.object;loaf.name="Rounded hand-shaped artisan loaf"
        for vertex in loaf.data.vertices:
            p=vertex.co
            variation=1+.012*math.sin(p.y*19+i)*math.sin(p.x*17+p.z*13)
            p.x*=.074*variation;p.y*=.166*variation;p.z*=.067*variation
        loaf.data.materials.append(crust)
        for face in loaf.data.polygons: face.use_smooth=True
        # Scoring follows the curved crust instead of floating straight sticks.
        for y in [-.075,0,.075]:
            points=[]
            for j in range(9):
                t=-.039+j*.078/8;yy=y+t*.5
                z=.114+.067*math.sqrt(max(.04,1-(t/.074)**2-(yy/.166)**2))+.0005
                points.append((x+t,yy,z))
            for a,b in zip(points,points[1:]): T("Bread scored crust opening",a,b,.0028,score,8)


'''


def main():
    source=TARGET.read_text()
    for name, replacement, following in [("rack",RACK,"bin_prop"),("bread",BREAD,"display")]:
        start=source.index("def "+name+"():")
        end=source.index("def "+following+"():",start)
        source=source[:start]+replacement+source[end:]
    TARGET.write_text(source)
    print("Authored polish applied; regenerate bread-tray, bakery-display-case, artisan-bakery, cycle-rack, transit-boulevard and riverside-promenade")


if __name__ == "__main__": main()
