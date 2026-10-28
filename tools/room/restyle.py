"""Art-direct the existing revision-5 meshes; never edits the input Blender file.

blender -b -t 8 --python-exit-code 1 --python tools/room/restyle.py -- \
  --source /path/to/attic-room.blend --out .context/room-build
"""

import argparse
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

TOOL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOL_DIR))
from desk_finishes import apply_desk_finishes
from rug import replace_rug
from room_finishes import apply_room_finishes
from basket_placement import settle_basket_papers
from desktop import apply_desktop
from tv_dressing import align_tv_light, dress_tv


def linear(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


def principled(material, color, roughness=0.6, metallic=0):
    """Rebuild a surface, removing incompatible scan noise and baked-in grime."""
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = (*linear(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Specular IOR Level'].default_value = 0.3
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    material.diffuse_color = (*linear(color), 1)
    return shader


def grain(material, color, scale=(3, 65, 3), contrast=0.1):
    shader = principled(material, color, 0.53)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    coords = nodes.new('ShaderNodeTexCoord')
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = scale
    links.new(coords.outputs['Generated'], stretch.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3
    noise.inputs['Detail'].default_value = 2
    noise.inputs['Roughness'].default_value = 0.55
    links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    base = linear(color)
    for element, multiplier in zip(ramp.color_ramp.elements, (1 - contrast, 1 + contrast)):
        element.color = (*(min(1, c * multiplier) for c in base), 1)
    links.new(noise.outputs['Fac'], ramp.inputs[0])
    links.new(ramp.outputs[0], shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs[0], shader.inputs['Normal'])


def fabric(material, color):
    shader = principled(material, color, 0.88)
    shader.inputs['Sheen Weight'].default_value = 0.22
    shader.inputs['Sheen Roughness'].default_value = 0.65
    nodes, links = material.node_tree.nodes, material.node_tree.links
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 170
    noise.inputs['Detail'].default_value = 1
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.14
    bump.inputs['Distance'].default_value = 0.001
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs[0], shader.inputs['Normal'])


def soften_textured(material, roughness=0.57, normal_strength=0.2):
    """Keep logos, keys and grille markings, with a common satin response."""
    if not material.use_nodes:
        return
    nodes, links = material.node_tree.nodes, material.node_tree.links
    for node in nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = normal_strength
        elif node.type == 'BUMP':
            node.inputs['Strength'].default_value *= 0.15
        elif node.type == 'BSDF_PRINCIPLED':
            for name, value in [('Roughness', roughness), ('Metallic', 0), ('Specular IOR Level', 0.3)]:
                for link in list(node.inputs[name].links):
                    links.remove(link)
                node.inputs[name].default_value = value
            # Source normal textures remain; their amplitude is now consistent across devices.


def bevel(obj, width, segments=3):
    if obj.type != 'MESH':
        return
    # Width is in metres, not in an imported model's arbitrary local units.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    existing = next((m for m in obj.modifiers if m.type == 'BEVEL'), None)
    modifier = existing or obj.modifiers.new('Crafted edge radius', 'BEVEL')
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = 'ANGLE'
    modifier.angle_limit = math.radians(38)
    modifier.use_clamp_overlap = True
    modifier.harden_normals = True
    if not any(m.type == 'WEIGHTED_NORMAL' for m in obj.modifiers):
        normal = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 50


def plank_floor():
    """Refine the existing flat floor into shallow, bevelled boards in the same bounds."""
    floor = bpy.data.objects['Scanned worn pine floor']
    materials = []
    for i, color in enumerate(('a77753', 'b2815c', 'a97751', 'bb8b65', 'a27250', 'b58460')):
        m = bpy.data.materials.new(f'Oiled oak | board {i + 1}')
        grain(m, color, (1.5, 95, 4), 0.08)
        materials.append(m)
    verts, faces, material_indices = [], [], []
    rng = random.Random(26)
    for row in range(22):
        y0, y1 = -2.4 + row * 4.8 / 22, -2.4 + (row + 1) * 4.8 / 22
        x = -2.8
        first = (0.45, 0.95, 1.4)[row % 3]
        while x < 2.799:
            end = min(2.8, x + (first if x == -2.8 else 1.4))
            a, b, c, d = x + 0.001, end - 0.001, y0 + 0.001, y1 - 0.001
            offset = len(verts)
            verts.extend([(a,c,-0.018),(b,c,-0.018),(b,d,-0.018),(a,d,-0.018),
                          (a,c,0.006),(b,c,0.006),(b,d,0.006),(a,d,0.006)])
            faces.extend([tuple(offset + i for i in f) for f in
                          ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7))])
            material_indices.extend([rng.randrange(len(materials))] * 6)
            x = end
    mesh = bpy.data.meshes.new('Original floor | crafted oak boards')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for m in materials:
        mesh.materials.append(m)
    for polygon, index in zip(mesh.polygons, material_indices):
        polygon.material_index = index
    floor.data = mesh
    floor.matrix_world.identity()
    bevel(floor, 0.002, 3)
    floor['finish'] = 'Softly bevelled oiled oak; original floor footprint and surface height'


def matte_game_case():
    """Keep the original case and printed insert, without its transparent overwrap.

    The source has a separate 64-face plastic film over the cover. Flattening its
    translucent shader into an opaque lightmap would hide the SSX3 artwork.
    """
    obj = bpy.data.objects['PS2_SSX3_case']
    material = obj.data.materials[0]
    image = material.node_tree.nodes['Image Texture'].image
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    alpha = pixels.reshape(image.size[1], image.size[0], 4)[:, :, 3]
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.00001)
    uv = mesh.loops.layers.uv.active
    seen, film = set(), []
    for vert in mesh.verts:
        if vert in seen:
            continue
        component, pending = {vert}, [vert]
        while pending:
            for edge in pending.pop().link_edges:
                for neighbour in edge.verts:
                    if neighbour not in component:
                        component.add(neighbour)
                        pending.append(neighbour)
        seen.update(component)
        faces = {face for vertex in component for face in vertex.link_faces}
        samples = []
        for face in faces:
            center = sum((loop[uv].uv for loop in face.loops), face.loops[0][uv].uv * 0) / len(face.loops)
            samples.append(alpha[int(center.y * image.size[1]) % image.size[1],
                                 int(center.x * image.size[0]) % image.size[0]])
        if max(samples) < 0.8:
            film.extend(faces)
    assert len(film) == 64, 'Expected the revision-5 game case transparent overwrap'
    bmesh.ops.delete(mesh, geom=film, context='FACES')
    mesh.to_mesh(obj.data)
    mesh.free()
    shader = material.node_tree.nodes['Principled BSDF']
    for link in list(shader.inputs['Alpha'].links):
        material.node_tree.links.remove(link)
    shader.inputs['Alpha'].default_value = 1
    obj['finish'] = 'Original case and printed insert; matte finish without transparent overwrap'


def open_box_bodies():
    """The fitted lids already close these boxes; remove their hidden duplicate caps.

    The source body and lid tops are coplanar. Ray-traced renders hide the issue,
    but quantized WebGL geometry makes the shadowed inner cap fight with the lid.
    """
    for obj in bpy.data.objects:
        if not obj.name.startswith('Board game lower box'):
            continue
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        caps = [face for face in mesh.faces if face.normal.z > 0.99]
        assert len(caps) == 1, obj.name
        bmesh.ops.delete(mesh, geom=caps, context='FACES')
        mesh.to_mesh(obj.data)
        mesh.free()


def lighting(scene):
    # Keep the original rig's night colours and local practical lights, but lower
    # the broad illumination so their pools stand out against a much darker room.
    # Colours are scene-linear RGB, not sRGB material swatches.
    settings = {
        'Blue hour window fill': ((0.24, 0.43, 1.0), 150, 0.16),
        'Warm attic practical': ((0.14, 0.18, 0.70), 3.0, 2.2),
        'Task light tungsten': ((1.0, 0.65, 0.31), 12, 0.045),
        'Lava lamp amber spill': ((1.0, 0.16, 0.025), 5, 0.10),
        'TV screen reflected blue': ((0.42, 0.43, 1.0), 20, 0.4),
        'Windows CRT screen bounce': ((0.38, 0.65, 0.78), 3, 0.2),
        'Window reflected corner fill': ((0.38, 0.51, 0.83), 0.7, 1.2),
    }
    for name, (color, energy, size) in settings.items():
        light = bpy.data.objects[name].data
        light.color = color
        light.energy = energy
        if light.type == 'AREA':
            light.shape = 'DISK'
            light.size = size
        else:
            light.shadow_soft_size = size
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.025, 0.035, 0.15, 1)
    background.inputs['Strength'].default_value = 0.012
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.85
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    scene.cycles.seed = 26


def remove_pillow():
    for obj in list(bpy.data.objects):
        if obj.get('supplied_asset') == 'pillow':
            bpy.data.objects.remove(obj, do_unlink=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()))
    scene = bpy.context.scene
    palette = {
        'Sage | chalk plaster': ('788d86', 0.88, 0),
        'Paint | aged ivory': ('e6dcc7', 0.62, 0),
        'Paint | worn dove grey': ('ded3bc', 0.49, 0),
        'Window layered ivory enamel': ('ece1cb', 0.44, 0),
        'Window blinds warm ivory slats': ('e6d6b9', 0.62, 0),
        'ABS | charcoal': ('343d49', 0.58, 0),
        'Rubber | soft black': ('28313c', 0.86, 0),
        'PC | aged cool grey ABS': ('d8cdb4', 0.57, 0),
        'PC | aged rear plastic': ('afa48f', 0.63, 0),
        'Brushed pewter': ('9ba7af', 0.42, 0.45),
        'Aged brass': ('c29c64', 0.43, 0.5),
        'Terracotta': ('bc795b', 0.69, 0),
        'Ink blue': ('526878', 0.72, 0),
        'Forest green': ('687d69', 0.72, 0),
        'Burgundy': ('8d555c', 0.72, 0),
        'Paper | warm off-white': ('e1d3b4', 0.92, 0),
        'Yellowed masking tape': ('cbb78d', 0.88, 0),
        'Imported lava lamp black anodized metal': ('455363', 0.4, 0.48),
        '01_-_Default': ('465564', 0.43, 0.28),
        '02_-_Default': ('8d9ca8', 0.43, 0.5),
        '03_-_Default': ('c4cbd0', 0.35, 0.55),
        '04_-_Default': ('344553', 0.48, 0),
        '05_-_Default': ('e6dcc7', 0.58, 0),
        'Material_13': ('e6dcc7', 0.58, 0),
        'Stratocaster | Olympic White lacquer': ('efe1be', 0.32, 0),
        'stratocasterguitar_plasticwhite__stripe2_materialsg': ('d0c6ab', 0.46, 0),
        'pxrusdpreviewsurface7sg': ('3c302b', 0.5, 0),
        'PS2 case | blue polypropylene': ('364966', 0.55, 0),
    }
    for name, (color, roughness, metal) in palette.items():
        principled(bpy.data.materials[name], color, roughness, metal)
    for name in ('Walnut | shared grain', 'None'):
        grain(bpy.data.materials[name], '95694c', (4, 4, 65), 0.12)
    grain(bpy.data.materials['Scene_-_Root'], 'b48a63', (3, 65, 3), 0.08)
    fabric(bpy.data.materials['lambert3'], '527a83')
    principled(bpy.data.materials['lambert2'], '384651', 0.59)
    fabric(bpy.data.materials['Upholstery | petrol weave'], '527a83')
    for m in bpy.data.materials:
        # Keep the original maps in the editable source. bake.py refines the TV's
        # satin response and split normals while preserving printed colour detail.
        if m.name in ('TVfront', 'TVback'):
            continue
        if m.users and m.name not in palette and m.name not in ('lambert2', 'lambert3', 'None', 'Scene_-_Root', 'Walnut | shared grain'):
            if m.name.startswith(('MAT_', 'M_PS2_', 'main', 'secondary', 'pxrusd', 'Poster', 'Kilim')):
                soften_textured(m, 0.64)
    # Weld UV-split vertices before subdivision; otherwise the imported triangle
    # islands shrink independently and open cracks in the chair's silhouette.
    for name in ('PC_Imported_Mouse', 'Imported_chair_00_Mesh_lambert3_0'):
        obj = bpy.data.objects[name]
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.00001)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        mesh.to_mesh(obj.data)
        mesh.free()
        sub = obj.modifiers.new('Soft upholstery' if 'chair' in name else 'Rounded mouse shell', 'SUBSURF')
        sub.subdivision_type = 'CATMULL_CLARK'
        sub.levels = sub.render_levels = 1
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    for obj in list(scene.objects):
        if obj.type != 'MESH' or obj.get('replaceable_screen'):
            continue
        if obj.name.startswith(('Imported_desk_', 'Imported_cabinet_', 'Imported_drawer_')):
            bevel(obj, 0.006, 3)
        elif obj.name == 'PC_Imported_CRT':
            bevel(obj, 0.003, 3)
        elif obj.name.startswith('Imported_chair_'):
            bevel(obj, 0.004, 3)
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        elif obj.name.startswith(('Window ', 'Deep window sill', 'Back baseboard', 'Left baseboard', 'Right baseboard')):
            bevel(obj, 0.003, 3)
    plank_floor()
    matte_game_case()
    open_box_bodies()
    remove_pillow()
    apply_desk_finishes()
    apply_room_finishes()
    replace_rug(TOOL_DIR / 'assets/rug-geometric.png')
    settle_basket_papers()
    apply_desktop()
    dress_tv()
    lighting(scene)
    align_tv_light()
    scene['art_direction'] = 'After hours / crafted miniature / revision 6'
    scene['reference'] = 'https://github.com/brunosimon/my-room-in-3d (visual and lighting study only)'
    # Pack only images still used by materials, bounded at their useful authoring resolution.
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    for image in bpy.data.images:
        if image.users and image.source == 'FILE':
            if max(image.size) > 2048:
                ratio = 2048 / max(image.size)
                image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
            image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'room-source.blend'), compress=True)
    if args.render:
        camera = bpy.data.objects['Interior camera']
        camera.location = (-0.55, -2.1, 1.62)
        camera.rotation_euler = (Vector((0.25, 1.1, 1.12)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'PERSP'
        camera.data.sensor_fit = 'HORIZONTAL'
        camera.data.angle = math.radians(88.8)
        scene.camera = camera
        scene.render.resolution_x = 1440
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.render.filepath = str(out / 'direction-preview.png')
        bpy.ops.render.render(write_still=True)
    print('RESTYLED', out, flush=True)


if __name__ == '__main__':
    main()
