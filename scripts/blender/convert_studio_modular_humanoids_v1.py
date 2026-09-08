"""Convert official complete humanoid FBX characters into honest, posed VRM1 assets.

Run with Blender --background --factory-startup --disable-autoexec --python FILE.
Original FBX files remain immutable. Female leg parenting is repaired while
preserving every rest-space bone matrix, so hips control both legs in VRM.
"""
import hashlib
import json
from pathlib import Path
import struct

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'artifacts/studio-asset-expansion/modular-humanoid-sources'
WORK = ROOT / 'artifacts/studio-asset-expansion/assembled-modular-v1'
PUBLIC = ROOT / 'apps/web/public/vrm/quaternius-modular-v1'
BASE_BONES = {'hips': 'Hips', 'spine': 'Abdomen', 'chest': 'Torso',
              'upperChest': 'Chest', 'neck': 'Neck', 'head': 'Head'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def bone_mapping(armature):
    names = set(armature.data.bones.keys())
    mapping = dict(BASE_BONES)
    for human, suffix in [('left', 'L'), ('right', 'R')]:
        for part in ['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot']:
            mapping[human + part] = part + '.' + suffix
        for finger, source in [('Index', 'Index'), ('Middle', 'Middle'), ('Ring', 'Ring'), ('Little', 'Pinky')]:
            start = 1 if source + '1.' + suffix in names else 2
            for index, segment in enumerate(['Proximal', 'Intermediate', 'Distal']):
                mapping[human + finger + segment] = source + str(start + index) + '.' + suffix
        # The male source has two real thumb segments, not three. Do not invent one.
        segments = [('Proximal', 'Thumb2'), ('Distal', 'Thumb3')]
        if 'Thumb1.' + suffix in names:
            segments = [('Metacarpal', 'Thumb1'), *segments]
        for segment, source in segments:
            mapping[human + 'Thumb' + segment] = source + '.' + suffix
    assert set(mapping.values()) <= names, 'Missing authored humanoid bones'
    return mapping


def repair_leg_parenting(armature):
    before = {bone.name: bone.matrix_local.copy() for bone in armature.data.bones}
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    edits = []
    for name in ['UpperLeg.L', 'UpperLeg.R']:
        bone = armature.data.edit_bones[name]
        if bone.parent.name != 'Hips':
            edits.append({'bone': name, 'previousParent': bone.parent.name, 'parent': 'Hips'})
            bone.use_connect = False
            bone.parent = armature.data.edit_bones['Hips']
            bone.matrix = before[name]
    bpy.ops.object.mode_set(mode='OBJECT')
    delta = max(abs(bone.matrix_local[row][column] - before[bone.name][row][column])
                for bone in armature.data.bones for row in range(4) for column in range(4))
    # Blender's edit-bone decomposition round-trip changes these imported float
    # matrices by at most 1.34e-5; reject anything beyond that numerical scale.
    assert delta < 2e-5, 'Reparenting changed authored bind-space geometry: ' + str(delta)
    return edits, delta


def package_vrm(glb, identifier, source, mapping):
    raw = glb.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    json_length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    document = json.loads(raw[20:20 + json_length])
    binary_chunks = raw[20 + json_length:]
    node_by_name = {node.get('name'): index for index, node in enumerate(document['nodes'])}
    joints = {joint for skin in document.get('skins', []) for joint in skin['joints']}
    human_bones = {}
    for human, name in mapping.items():
        node = node_by_name[name]
        assert node in joints, name + ' is not a skinned joint'
        human_bones[human] = {'node': node}
    parents = {child: index for index, node in enumerate(document['nodes']) for child in node.get('children', [])}
    for human in ['leftUpperLeg', 'rightUpperLeg', 'spine']:
        node = human_bones[human]['node']
        ancestors = []
        while node in parents:
            node = parents[node]
            ancestors.append(node)
        assert human_bones['hips']['node'] in ancestors, 'Invalid VRM hips hierarchy'
    document.setdefault('extensions', {})['VRMC_vrm'] = {
        'specVersion': '1.0',
        'meta': {
            'name': identifier.replace('quaternius-', '').replace('-', ' '), 'version': '1.0',
            'authors': ['Quaternius'], 'licenseUrl': 'https://vrm.dev/licenses/1.0/',
            'otherLicenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'copyrightInformation': 'Original complete characters by Quaternius, CC0 1.0 Universal. VRM1 mapping by ToonStudio.',
            'references': [source['sourceUrl']],
            'thirdPartyLicenses': 'CC0 1.0 Universal; source License.txt and SHA256 receipts retained with the acquisition.',
            'avatarPermission': 'everyone', 'commercialUsage': 'corporation',
            'creditNotation': 'unnecessary', 'allowRedistribution': True,
            'modification': 'allowModificationRedistribution',
            'allowExcessivelyViolentUsage': True, 'allowExcessivelySexualUsage': True,
            'allowPoliticalOrReligiousUsage': True, 'allowAntisocialOrHateUsage': True,
        },
        'humanoid': {'humanBones': human_bones},
    }
    document['extensionsUsed'] = list(dict.fromkeys([*document.get('extensionsUsed', []), 'VRMC_vrm']))
    document['asset']['extras'] = {'studioSourceLicense': 'CC0-1.0', 'originalExpressionCapability': 'none',
                                  'sourceFbxSha256': source['sha256'], 'style': 'stylized-low-poly'}
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    vrm = struct.pack('<4sIIII', b'glTF', 2, 20 + len(encoded) + len(binary_chunks), len(encoded), 0x4E4F534A) + encoded + binary_chunks
    assert vrm[20 + len(encoded):] == binary_chunks
    assert all('uri' not in image for image in document.get('images', []))
    assert all('uri' not in buffer for buffer in document.get('buffers', []))
    (PUBLIC / (identifier + '.vrm')).write_bytes(vrm)
    return {'id': identifier, 'url': '/vrm/quaternius-modular-v1/' + identifier + '.vrm',
            'bytes': len(vrm), 'sha256': digest(vrm), 'sourceFbxSha256': source['sha256'],
            'assembledGlbSha256': digest(raw), 'binaryChunksPreserved': True,
            'humanBones': len(human_bones), 'skins': len(document['skins']),
            'meshes': len(document['meshes']), 'animations': len(document.get('animations', [])),
            'images': len(document.get('images', [])), 'expressions': False,
            'sourceUrl': source['sourceUrl'], 'sourceName': source['name'],
            'gender': 'female' if source['path'].startswith('modular-women/') else 'male',
            'style': 'stylized-low-poly', 'limitations': ['no-facial-expressions', 'no-toe-bones']
                + (['two-segment-thumbs'] if len(human_bones) == 48 else [])}


def main():
    sources = json.loads((SOURCE / 'source-receipts.json').read_text())['sources']
    assert len(sources) == 21
    WORK.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    records = []
    for source in sources:
        original = SOURCE / source['path']
        assert digest(original.read_bytes()) == source['sha256']
        gender = 'female' if source['path'].startswith('modular-women/') else 'male'
        identifier = 'quaternius-modular-' + gender + '-' + source['name'].lower()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(original))
        alpha_repairs = []
        if gender == 'female':
            # The official female FBX palette is opaque (diffuse RGBA alpha=1),
            # but Blender's imported Principled opacity is zero for every solid
            # palette material. Repair only that contradictory, untextured case.
            for material in bpy.data.materials:
                if not material.use_nodes:
                    continue
                assert not any(node.type == 'TEX_IMAGE' for node in material.node_tree.nodes)
                for node in material.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED' and not node.inputs['Alpha'].is_linked:
                        alpha = node.inputs['Alpha'].default_value
                        if alpha == 0 and material.diffuse_color[3] == 1:
                            node.inputs['Alpha'].default_value = 1
                            alpha_repairs.append({'material': material.name, 'from': 0, 'to': 1,
                                'reason': 'opaque source palette alpha=1, contradictory imported Principled alpha=0'})
        armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
        assert len(armatures) == 1, 'Expected one complete authored humanoid'
        armature = armatures[0]
        assert not bpy.data.actions, 'Source animations need explicit preservation review'
        mapping = bone_mapping(armature)
        edits, delta = repair_leg_parenting(armature)
        bpy.context.view_layer.update()
        meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
        assert meshes and all(any(mod.type == 'ARMATURE' for mod in obj.modifiers) for obj in meshes)
        discarded = [sum(sorted((group.weight for group in vertex.groups), reverse=True)[4:])
                     for obj in meshes for vertex in obj.data.vertices]
        assert max(discarded, default=0) < 0.2, 'Four-influence browser skinning requires dedicated weight repair'
        bpy.ops.wm.save_as_mainfile(filepath=str(WORK / (identifier + '.blend')))
        glb = WORK / (identifier + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', export_skins=True,
                                  export_animations=False, export_yup=True, export_apply=False)
        record = package_vrm(glb, identifier, source, mapping)
        record.update({'restHierarchyRepairs': edits, 'maximumRestMatrixDelta': delta,
                       'importedPaletteAlphaRepairs': alpha_repairs,
                       'skinningInfluenceLimit': 4,
                       'maximumDiscardedInfluenceMass': max(discarded, default=0),
                       'meanDiscardedInfluenceMass': sum(discarded) / max(1, len(discarded)),
                       'verticesWithDiscardedInfluences': sum(value > 1e-6 for value in discarded),
                       'sourceVertexCount': sum(len(obj.data.vertices) for obj in meshes)})
        records.append(record)
        print('MODULAR_VRM generated', flush=True)
    (PUBLIC / 'manifest.json').write_text(json.dumps({'version': 1, 'sourceLicense': 'CC0-1.0',
        'entries': records, 'visualReviewed': False, 'productionPublished': False}, indent=2) + '\n')
    (PUBLIC / 'LICENSE.txt').write_text('CC0 1.0 Universal (CC0 1.0)\nPublic Domain Dedication\n'
        'https://creativecommons.org/publicdomain/zero/1.0/\n\nOriginal complete characters by Quaternius.\n'
        'https://quaternius.com/packs/ultimatemodularcharacters.html\n'
        'https://quaternius.com/packs/ultimatemodularwomen.html\n\n'
        'ToonStudio conversion: preserved original meshes and palette materials; normalized the '
        'four strongest skin weights for browser skinning, with discarded influence statistics in the manifest; '
        'restored female solid-palette opacity where the FBX-imported shader alpha contradicted source RGBA alpha=1; '
        'reparented female upper legs under hips with a maximum 2e-5 matrix round-trip tolerance; exported GLB and '
        'added VRM1 humanoid/license metadata without altering the exported binary chunk. '
        'No expressions, toe bones or missing thumb bones were invented.\n')
    print('MODULAR_SUMMARY ' + json.dumps({'characters': len(records), 'bytes': sum(row['bytes'] for row in records)}))


main()
