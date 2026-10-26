"""Simplify the room shell and restore natural grain to the existing oak floor.

Call after ``plank_floor()`` and before the source scene's orphan purge. The floor
keeps its six oak swatches and bevelled boards; only their surface detail changes.
The packed original CC0 scan supplies grain, never its old colour or painted seams.
"""

import random

import bpy
import numpy as np


FLOOR_TEXTURES = {
    'colour': 'wood_floor_worn_diff_2k.jpg',
    'normal': 'wood_floor_worn_nor_gl_2k.jpg',
    'roughness': 'wood_floor_worn_rough_2k.jpg',
}

# Centres of twelve complete board interiors in the original scan. Cropping away
# the scanned joints prevents a second set of dark seams across the actual boards.
GRAIN_BANDS = (0.080, 0.157, 0.234, 0.311, 0.388, 0.465,
               0.542, 0.619, 0.696, 0.773, 0.850, 0.927)
GRAIN_HALF_WIDTH = 0.026


def _remove_wall_decoration():
    removed = {'rafters': [], 'posters': [], 'poster_tape': [], 'photocopies': []}
    for obj in list(bpy.data.objects):
        kind = None
        if obj.name.startswith('Cutaway_attic_rafter'):
            kind = 'rafters'
        elif obj.get('poster_id'):
            kind = 'posters'
        elif obj.name.startswith('Visible wall poster masking tape'):
            kind = 'poster_tape'
        elif obj.name.startswith('Small overlapping photocopy'):
            kind = 'photocopies'
        if kind:
            removed[kind].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def _grain_uvs(floor):
    """Map a different seam-free strip onto every existing physical floorboard."""
    mesh = floor.data
    assert len(mesh.vertices) % 8 == 0, 'Expected individual eight-vertex oak boards'
    count = len(mesh.vertices) // 8
    assert len(mesh.polygons) == count * 6, 'Expected six faces per oak board'
    uv = mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    mesh.uv_layers.active = uv
    uv.active_render = True
    rng = random.Random(42)
    boards = []
    for index in range(count):
        points = [v.co for v in mesh.vertices[index * 8:index * 8 + 8]]
        low = tuple(min(point[axis] for point in points) for axis in range(3))
        high = tuple(max(point[axis] for point in points) for axis in range(3))
        boards.append((low, high, rng.random(), rng.choice(GRAIN_BANDS), rng.choice((-1, 1))))
    for face in mesh.polygons:
        board = face.vertices[0] // 8
        assert all(index // 8 == board for index in face.vertices), 'Floorboard topology changed'
        low, high, offset, band, direction = boards[board]
        for loop_index in face.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if abs(face.normal.z) > 0.5:
                # Long fibres follow the board's X axis, at two metres per scan.
                u = offset + direction * (point.x - low[0]) / 2
                v = band + ((point.y - low[1]) / (high[1] - low[1]) - 0.5) * GRAIN_HALF_WIDTH * 2
            elif abs(face.normal.y) > 0.5:
                u = offset + direction * (point.x - low[0]) / 2
                v = band + (point.z - low[2]) * 0.25
            else:
                u = offset + direction * (point.y - low[1]) / 2
                v = band + (point.z - low[2]) * 0.25
            uv.data[loop_index].uv = (u, v)
    return count


def _mean_grain_luminance(image):
    # Image.pixels contains the file's sRGB samples. Shader image nodes decode
    # them to linear RGB before the luminance operation, so match that here.
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape(image.size[1], image.size[0], 4)[:, :, :3]
    mask = np.zeros(image.size[1], dtype=bool)
    for band in GRAIN_BANDS:
        mask[round((band - GRAIN_HALF_WIDTH) * image.size[1]):
             round((band + GRAIN_HALF_WIDTH) * image.size[1])] = True
    rgb = rgb[mask]
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return float(np.mean(linear @ np.array((0.2126, 0.7152, 0.0722))))


def _natural_oak(material, images, mean_luminance):
    base = tuple(material.diffuse_color)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = base
    shader.inputs['Roughness'].default_value = 0.53
    shader.inputs['Specular IOR Level'].default_value = 0.3
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'

    textures = {}
    for role, image in images.items():
        texture = nodes.new('ShaderNodeTexImage')
        texture.name = 'Original floor scan | ' + role
        texture.image = image
        texture.extension = 'REPEAT'
        texture.interpolation = 'Linear'
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        textures[role] = texture

    luminance = nodes.new('ShaderNodeRGBToBW')
    links.new(textures['colour'].outputs['Color'], luminance.inputs['Color'])
    modulation = nodes.new('ShaderNodeMath')
    modulation.operation = 'MULTIPLY_ADD'
    modulation.inputs[1].default_value = 0.5 / mean_luminance
    modulation.inputs[2].default_value = 0.5
    links.new(luminance.outputs[0], modulation.inputs[0])
    clamp = nodes.new('ShaderNodeClamp')
    clamp.inputs['Min'].default_value = 0.6
    clamp.inputs['Max'].default_value = 1.4
    links.new(modulation.outputs[0], clamp.inputs['Value'])
    colour = nodes.new('ShaderNodeMixRGB')
    colour.blend_type = 'MULTIPLY'
    colour.inputs[0].default_value = 1
    colour.inputs[1].default_value = base
    links.new(clamp.outputs[0], colour.inputs[2])
    links.new(colour.outputs[0], shader.inputs['Base Color'])

    roughness = nodes.new('ShaderNodeMapRange')
    roughness.inputs['From Min'].default_value = 0
    roughness.inputs['From Max'].default_value = 1
    roughness.inputs['To Min'].default_value = 0.46
    roughness.inputs['To Max'].default_value = 0.62
    links.new(textures['roughness'].outputs['Color'], roughness.inputs['Value'])
    links.new(roughness.outputs['Result'], shader.inputs['Roughness'])
    normal = nodes.new('ShaderNodeNormalMap')
    normal.uv_map = 'UVMap'
    normal.inputs['Strength'].default_value = 0.16
    links.new(textures['normal'].outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    material['grain_source'] = 'Original packed Poly Haven wood floor scan; luminance only'
    material['grain_strength'] = 0.5


def apply_room_finishes():
    """Remove the requested wall/ceiling decoration and detail the current floor."""
    floor = bpy.data.objects.get('Scanned worn pine floor')
    assert floor is not None and floor.type == 'MESH', 'Expected the existing room floor'
    materials = list(floor.data.materials)
    assert len(materials) == 6 and all(m.name.startswith('Oiled oak | board ') for m in materials), \
        'Call apply_room_finishes after plank_floor'
    images = {role: bpy.data.images.get(name) for role, name in FLOOR_TEXTURES.items()}
    assert all(images.values()), 'Original packed floor scan must exist before orphan purge'
    board_count = _grain_uvs(floor)
    mean_luminance = _mean_grain_luminance(images['colour'])
    for material in materials:
        _natural_oak(material, images, mean_luminance)
    floor['finish'] = 'Existing warm oak palette and bevelled boards; natural scan grain with restrained pore detail'
    floor['grain_source'] = 'Poly Haven Wood Floor Worn CC0; original packed textures'
    removed = _remove_wall_decoration()
    return {
        'removed': removed,
        'floorboards': board_count,
        'floor_materials': [material.name for material in materials],
        'floor_textures': list(FLOOR_TEXTURES.values()),
        'grain_mean_luminance': mean_luminance,
    }
