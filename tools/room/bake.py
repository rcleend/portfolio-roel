"""Bake the restyled native scene into five portable runtime GLBs.

All static objects, including the four imported devices, see the same lights.
The TV/PC screens keep their UVs and semantic metadata; lava keeps its animation.
Run after restyle.py. Intermediate files stay outside public/room until validated.
"""

import argparse
import json
import math
import sys
import time
from contextlib import contextmanager
from pathlib import Path

import bpy
import numpy as np
from bpy_extras.mesh_utils import mesh_linked_uv_islands

sys.path.insert(0, str(Path(__file__).resolve().parent))
from device_surfaces import refine_radio_surfaces, refine_room_surfaces
from tv_dressing import align_tv_light


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


@contextmanager
def shared_bake_target(objects):
    """Extend atlas gutters once across every island in the shared lightmap.

    Baking several objects separately into one image lets a later object's
    margin overwrite an earlier object's small UV islands. A temporary joined
    copy keeps the existing UV layout, while retaining semantic export nodes.
    """
    if len(objects) == 1:
        yield objects
        return
    hidden = {obj: obj.hide_render for obj in objects}
    copies = []
    for obj in objects:
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        duplicate.parent = None
        duplicate.matrix_world = obj.matrix_world.copy()
        duplicate.hide_render = False
        bpy.context.scene.collection.objects.link(duplicate)
        copies.append(duplicate)
        obj.hide_render = True
    select(copies)
    bpy.ops.object.join()
    target = bpy.context.object
    target.name = 'Temporary shared atlas bake'
    try:
        yield [target]
    finally:
        data = target.data
        bpy.data.objects.remove(target, do_unlink=True)
        bpy.data.meshes.remove(data)
        for obj, was_hidden in hidden.items():
            obj.hide_render = was_hidden


def unlit(name, image=None, color=(1, 1, 1, 1), uv='UVMap'):
    material = bpy.data.materials.new(name + '_UNLIT')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs[0].default_value = color
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(emission.outputs[0], output.inputs[0])
    if image:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        coordinates = nodes.new('ShaderNodeUVMap')
        coordinates.uv_map = uv
        links.new(coordinates.outputs[0], texture.inputs[0])
        links.new(texture.outputs[0], emission.inputs[0])
    material.use_backface_culling = True
    return material


def unwrap(objects, size, preserve=False):
    for obj in objects:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        original = obj.data.uv_layers[0]
        atlas = obj.data.uv_layers.new(name='BakedUV')
        obj.data.uv_layers.active = atlas
        atlas.active_render = True
        if preserve:
            for source, target in zip(original.data, atlas.data):
                target.uv = source.uv
    select(objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    if not preserve:
        bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.002,
                                 area_weight=0.5, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    # Keep the monitor's face and inner bevel in one continuous projected island.
    # Smart Project cuts the tiny rounded corners into separate slivers; their
    # different gutters leave diagonal black seams in the seated close-up.
    for obj in objects:
        atlas = obj.data.uv_layers['BakedUV']
        continuous = obj.data.uv_layers.get('ContinuousSurfaceUV')
        marked = obj.data.attributes.get('continuous_surface_uv')
        for face in obj.data.polygons:
            if continuous and marked and marked.data[face.index].value:
                for loop in face.loop_indices:
                    atlas.data[loop].uv = continuous.data[loop].uv
            material = obj.data.materials[face.material_index]
            if material.name == 'Desktop | continuous bezel ABS' and face.normal.y < -0.001:
                for loop in face.loop_indices:
                    point = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    atlas.data[loop].uv = (point.x, point.z)
    islands = sum(len(mesh_linked_uv_islands(obj.data)) for obj in objects)
    # Avoid the UV packer's degenerate-island case on dense imported meshes.
    margin = min(6 / size, 0.1 / math.sqrt(max(1, islands)))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=margin,
                           udim_source='ACTIVE_UDIM')
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers['BakedUV']
        bezel = {face.index for face in mesh.polygons
                 if mesh.materials[face.material_index].name == 'Desktop | continuous bezel ABS'
                 and face.normal.y < -0.001}
        if bezel:
            islands_with_bezel = [island for island in mesh_linked_uv_islands(mesh) if bezel.intersection(island)]
            assert len(islands_with_bezel) == 1, 'The monitor face/bevel must stay one continuous UV island'
        area = 0
        for triangle in mesh.loop_triangles:
            a, b, c = [uv.data[i].uv for i in triangle.loops]
            area += abs((b - a).cross(c - a)) * 0.5
        assert area > 0.00001, (obj.name, 'Collapsed atlas UVs', area)
        assert all(-0.00001 <= v <= 1.00001 for datum in uv.data for v in datum.uv), obj.name


def export(objects, path, animated=False):
    select(objects)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True, export_extras=True,
        export_yup=True, export_cameras=False, export_lights=False, export_animations=animated,
        export_animation_mode='SCENE', export_anim_scene_split_object=False,
        export_nla_strips_merged_animation_name='Lava flow', export_frame_step=12,
        export_force_sampling=True, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_image_format='AUTO',
    )


COLLECTIONS = ('01_TV', '02_Desk', '03_Room', '04_Drawer', '05_Posters_and_mic')
REFINED_ROOM_ATLASES = ('01_TV_surfaces', '02_Desk_surfaces', '03_Room_window', '04_Drawer_surfaces')


def configure_bake(scene, samples, device):
    """Cycles COMBINED bake settings every atlas shares (tools/room/radio_closeup.py reuses them)."""
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    if device == 'METAL':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'METAL'
        preferences.get_devices()
        assert any(item.type == 'METAL' for item in preferences.devices), 'No Metal GPU available'
        for item in preferences.devices:
            item.use = item.type == 'METAL'
        scene.cycles.device = 'GPU'
    else:
        scene.cycles.device = 'CPU'
    scene.render.bake.margin = 10
    # Extend each island's own colour. ADJACENT_FACES pulls dark underside samples
    # across the tiny bevels in these imported meshes, producing black outlines.
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    for name in ('direct', 'indirect', 'diffuse', 'glossy', 'transmission', 'emit'):
        setattr(scene.render.bake, 'use_pass_' + name, True)


def prepare_scene(scene):
    """Binds source UVs, drops omitted objects and converts every baked object to a world-space mesh.

    Returns the asset-group collections in export order.
    """
    collections = [bpy.data.collections[name] for name in COLLECTIONS]
    # Bind the source UV explicitly BEFORE creating or activating a bake UV channel.
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in list(material.node_tree.nodes):
            if node.type == 'NORMAL_MAP':
                node.uv_map = 'UVMap'
            if node.type == 'TEX_IMAGE' and not node.inputs[0].is_linked:
                coords = material.node_tree.nodes.new('ShaderNodeUVMap')
                coords.uv_map = 'UVMap'
                material.node_tree.links.new(coords.outputs[0], node.inputs[0])
    for obj in list(scene.objects):
        if obj.get('omit_export'):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.get('glass_shell'):
            obj.hide_render = True
    for collection in collections:
        for obj in list(collection.objects):
            if obj.type not in ('MESH', 'CURVE', 'FONT') or obj.get('animated_lava'):
                continue
            select([obj])
            if obj.type == 'CURVE':
                obj.data.resolution_u = 4
                obj.data.bevel_resolution = 2
            if obj.type == 'FONT':
                obj.data.resolution_u = 3
                obj.data.extrude = 0
            bpy.ops.object.convert(target='MESH')
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return collections


def bake_game_prints(objects, bakes, scene, reuse=False):
    """Keep the original print UVs/resolution, but bake their actual room lighting.

    Raw artwork with a near-white unlit tint looks emissive in this dark room.
    Baking each insert also captures the shelf's shadow instead of giving every
    case the same arbitrary brightness. No new runtime textures or materials.
    """
    textures = {}
    for obj in objects:
        if not obj.name.startswith('PS2 printed cover'):
            continue
        material = obj.data.materials[0]
        nodes, links = material.node_tree.nodes, material.node_tree.links
        source = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.name != 'BAKE_TARGET')
        shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        # Paper has its original albedo; the plant's photographic shadow lift
        # must not brighten the generated Product Engineer print.
        links.new(source.outputs['Color'], shader.inputs['Base Color'])
        shader.inputs['Roughness'].default_value = 0.8
        shader.inputs['Specular IOR Level'].default_value = 0.15
        name = 'game-cover-' + obj['game_title'].lower().replace(' ', '-')
        path = bakes / (name + '.png')
        if not reuse or not path.exists():
            width, height = source.image.size
            scale = min(1, 1024 / max(width, height))
            width, height = int(width * scale), int(height * scale)
            target = bpy.data.images.new(name, width=width, height=height, alpha=False, float_buffer=True)
            node = nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = target
            nodes.active = node
            scene.cycles.samples = 128
            scene.render.bake.margin = 4
            select([obj])
            bpy.ops.object.bake(type='COMBINED')
            scene.render.image_settings.file_format = 'PNG'
            scene.render.image_settings.color_mode = 'RGB'
            scene.render.image_settings.color_depth = '8'
            target.save_render(str(path), scene=scene)
            nodes.remove(node)
            bpy.data.images.remove(target)
            print('PRINT_BAKED', name, width, height, flush=True)
        textures[obj.name] = bpy.data.images.load(str(path), check_existing=True)
        obj['room_lit_print'] = True
    return textures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', required=True)
    parser.add_argument('--samples', type=int, default=48)
    parser.add_argument('--device', choices=('CPU', 'METAL'), default='CPU')
    parser.add_argument('--reuse-bakes', action='store_true', help='Reuse unchanged atlases; delete affected PNGs first')
    parser.add_argument('--only', choices=('pc', 'radio', 'tv', 'furnishings', 'tv-dressing'),
                        help='Rebake/export a device or the furniture/window atlases only')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    work = Path(args.work).resolve()
    bakes = work / 'baked'
    bakes.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(work / 'room-source.blend'))
    scene = bpy.context.scene
    configure_bake(scene, args.samples, args.device)
    align_tv_light()
    collections = prepare_scene(scene)
    refine_room_surfaces([obj for collection in collections for obj in collection.objects])
    batches, room, retained, glass = [], [], [], []
    devices = {key: [] for key in ('tv', 'pc', 'radio', 'ps2')}
    for collection in collections:
        root = bpy.data.objects.new(collection.name, None)
        collection.objects.link(root)
        root['asset_group'] = collection.name
        room.append(root)
        groups = {}
        for obj in list(collection.objects):
            if obj.type != 'MESH':
                continue
            hero = obj.get('hero_asset')
            if hero:
                devices[hero].append(obj)
                obj.name += '_high' if hero == 'tv' else '_base'
                if obj.get('replaceable_screen'):
                    retained.append(obj)
                continue
            obj.parent = root
            if obj.get('animated_lava'):
                room.append(obj)
                continue
            if obj.get('glass_shell'):
                room.append(obj)
                glass.append(obj)
                continue
            if obj.get('retain_texture') or obj.get('exterior'):
                room.append(obj)
                retained.append(obj)
                continue
            if obj.get('bake_atlas') in ('guitar', 'plant'):
                tag = obj['bake_atlas']
            elif obj.name.startswith(('Window ', 'Deep window sill')):
                tag = 'window'
            elif obj.get('bake_atlas') == 'rug' or obj.name.startswith('Scanned worn pine floor'):
                tag = 'floor'
            else:
                tag = 'surfaces'
            groups.setdefault(tag, []).append(obj)
        for tag, objects in groups.items():
            # Keep semantic boundaries while sharing an atlas, including the rug's
            # dimensions/orientation contract and replaceable/cutaway objects.
            separate = [o for o in objects if o.get('replaceable') or o.get('cutaway') or o.get('supplied_asset') in ('rug', 'desk-plant')]
            joined = [o for o in objects if o not in separate]
            if joined:
                select(joined)
                bpy.ops.object.join()
                obj = bpy.context.object
                obj.name = collection.name + '_' + tag
                obj['asset_group'] = collection.name
                separate.append(obj)
            room.extend(separate)
            # Fine furniture bevels and blind slats need the same texel density as
            # the desk; 1K atlases turn their edge highlights into dark stair steps.
            size = 2048
            if tag in ('guitar', 'plant'): size = 1024
            batches.append((collection.name + '_' + tag, separate, size, tag == 'plant'))
    for key, objects in devices.items():
        surfaces = [obj for obj in objects if obj not in retained]
        if key == 'tv':
            # The page opens on this face. Give labels, grille and controls their
            # own atlas instead of spending most TV texels on its hidden rear shell.
            front = [obj for obj in surfaces if obj.name.startswith(
                ('TV_Imported_Front', 'TV_Imported_Logo', 'TV_Imported_AV_front'))]
            # The source UVs keep the moulded front surround continuous. Automatic
            # projection cuts its corners into thin islands with dark gutters.
            batches.append(('device_tv_front', front, 2048, True))
            batches.append(('device_tv_rear', [obj for obj in surfaces if obj not in front], 1024, True))
        else:
            # The desk close-up needs enough texels for sculpted keys and the
            # mouse's curved surface; one shared 2K atlas still keeps draw calls flat.
            batches.append(('device_' + key, surfaces, 2048 if key == 'pc' else 1024, False))
    if args.only:
        batches = [batch for batch in batches if
                   (batch[0] in ('01_TV_surfaces', '01_TV_plant') if args.only == 'tv-dressing'
                    else batch[0] in REFINED_ROOM_ATLASES if args.only == 'furnishings'
                    else batch[0].startswith('device_' + args.only))]
    for name, objects, size, preserve in batches:
        unwrap(objects, size, preserve)
        refine_radio_surfaces(objects)
        print('UV_READY', name, size, len(objects), flush=True)
    # Bake every surface while ALL of the original shaders are still present, so
    # later atlases do not see emissive replacements instead of reflective furniture.
    timings = {}
    for name, objects, size, _ in batches:
        path = bakes / (name + '.png')
        if args.reuse_bakes and path.exists():
            continue
        start = time.time()
        # Supersample the densely packed device bevels; optimize.mjs returns these
        # to their original runtime dimensions after the display transform.
        device_detail = name in ('device_pc', 'device_radio', 'device_tv_front', 'device_tv_rear', '01_TV_plant', *REFINED_ROOM_ATLASES)
        bake_size = max(4096, size * 2) if device_detail else size
        scene.cycles.samples = max(128, args.samples) if device_detail else args.samples
        scene.render.bake.margin = round(10 * bake_size / size)
        target = bpy.data.images.new(name + '_bake', width=bake_size, height=bake_size, alpha=False, float_buffer=True)
        for material in {m for obj in objects for m in obj.data.materials if m}:
            node = material.node_tree.nodes.get('BAKE_TARGET') or material.node_tree.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = target
            material.node_tree.nodes.active = node
        print('BAKE_START', name, flush=True)
        with shared_bake_target(objects) as targets:
            select(targets)
            bpy.ops.object.bake(type='COMBINED')
        pixels = np.empty(len(target.pixels), dtype=np.float32)
        target.pixels.foreach_get(pixels)
        rgb = pixels.reshape(-1, 4)[:, :3]
        assert np.isfinite(rgb).all(), (name, 'Non-finite bake')
        assert (rgb.max(axis=1) > 0.0002).mean() > 0.015, (name, 'Empty bake')
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGB'
        scene.render.image_settings.color_depth = '8'
        target.save_render(str(path), scene=scene)
        timings[name] = round(time.time() - start, 1)
        print('BAKE_DONE', name, timings[name], flush=True)
        bpy.data.images.remove(target)
    # All reflective source shaders must remain intact for these bakes too.
    print_textures = bake_game_prints(retained, bakes, scene, args.reuse_bakes) if args.only in (None, 'tv-dressing') else {}
    for name, objects, _, _ in batches:
        texture = bpy.data.images.load(str(bakes / (name + '.png')), check_existing=True)
        material = unlit(name + '_BAKED', texture, uv='BakedUV')
        for obj in objects:
            obj.data.materials.clear()
            obj.data.materials.append(material)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
            if not obj.get('replaceable'):
                for layer in list(obj.data.uv_layers):
                    if layer.name != 'BakedUV':
                        obj.data.uv_layers.remove(layer)
    for obj in retained:
        old = obj.data.materials[0]
        texture = print_textures.get(obj.name) or next((n.image for n in old.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
        material = unlit(old.name, texture)
        if obj.get('exterior'):
            material['web_tint'] = [0.70, 0.76, 1.0]
        obj.data.materials.clear()
        obj.data.materials.append(material)
    for obj in glass:
        obj.hide_render = False
        material = unlit('Lava | tinted glass', color=(0.32, 0.16, 0.07, 1))
        material.name = 'Lava | lightweight transparent glass'
        # Explicit transparent Principled shader exports alpha without transmission.
        nodes, links = material.node_tree.nodes, material.node_tree.links
        nodes.clear()
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = (0.32, 0.16, 0.07, 1)
        shader.inputs['Alpha'].default_value = 0.10
        shader.inputs['Roughness'].default_value = 0.35
        output = nodes.new('ShaderNodeOutputMaterial')
        links.new(shader.outputs[0], output.inputs[0])
        material.surface_render_method = 'DITHERED'
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if not args.only:
        export(room, work / 'room-raw.glb', animated=True)
    elif args.only == 'furnishings':
        export([obj for _, objects, _, _ in batches for obj in objects], work / 'furnishings-raw.glb')
    elif args.only == 'tv-dressing':
        selected = [obj for _, objects, _, _ in batches for obj in objects]
        selected.extend(obj for obj in retained if obj.name.startswith('PS2 printed cover'))
        export(selected, work / 'tv-dressing-raw.glb')
    for key, objects in devices.items():
        if not args.only or key == args.only:
            export(objects, work / (key + '-raw.glb'))
    if args.only:
        print('DEVICE_EXPORT_DONE', args.only, flush=True)
        return
    report = {'revision': 6, 'samples': args.samples, 'device': args.device,
              'atlases': {name: size for name, _, size, _ in batches}, 'bakeSeconds': timings,
              'source': 'room-source.blend',
              'lighting': 'High-contrast night: dim blue ambient, narrow moonlight and local warm practicals; shared Cycles combined bake, AgX Medium High Contrast, exposure 0.85',
              'preserved': ['furniture placement', 'screen UVs', 'interaction IDs', '48s lava clip'],
              'removed': ['floor pillow', 'wall posters and cards', 'sloped-ceiling wooden rafters']}
    (work / 'bake-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('EXPORT_DONE', flush=True)


if __name__ == '__main__':
    main()
