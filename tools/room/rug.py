"""Fit the supplied folded rug to the room and retain its authored UVs.

The source atlas puts the rug face on the right and its backing on the left.
Classifying that UV split (rather than normals) keeps the turned-over corner
plain, even where its underside faces the camera.
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

RUG_ROTATION_DEGREES = -15  # Clockwise when viewed from above.


def _bounds(obj):
    points = [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return tuple(Vector(tuple(fn(p[i] for p in points) for i in range(3)))
                 for fn in (min, max))


def _textile(name, color, image=None, uv_bounds=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = 0.94
    shader.inputs['Specular IOR Level'].default_value = 0.2
    shader.inputs['Sheen Weight'].default_value = 0.18 if image else 0.08
    shader.inputs['Sheen Roughness'].default_value = 0.8
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    if image:
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        # Remap just the top island to the full artwork without unwrapping the
        # bent cloth again: the artwork continues correctly under the fold.
        shift = nodes.new('ShaderNodeVectorMath')
        shift.operation = 'SUBTRACT'
        shift.inputs[1].default_value = (*uv_bounds[0], 0)
        links.new(uv.outputs['UV'], shift.inputs[0])
        scale = nodes.new('ShaderNodeVectorMath')
        scale.operation = 'MULTIPLY'
        scale.inputs[1].default_value = (
            1 / (uv_bounds[1][0] - uv_bounds[0][0]),
            1 / (uv_bounds[1][1] - uv_bounds[0][1]), 1,
        )
        links.new(shift.outputs['Vector'], scale.inputs[0])
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'EXTEND'
        links.new(scale.outputs['Vector'], texture.inputs['Vector'])
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    coordinates = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 550
    noise.inputs['Detail'].default_value = 2
    noise.inputs['Roughness'].default_value = 0.65
    links.new(coordinates.outputs['Object'], noise.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.13
    bump.inputs['Distance'].default_value = 0.0008
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return material


def replace_rug(texture_path):
    """Replace the old rug/fringe, keeping its width and centre, now square."""
    source = Path(__file__).resolve().parent / 'assets' / 'rug-source.glb'
    texture_path = Path(texture_path).resolve()
    if not source.is_file() or not texture_path.is_file():
        raise FileNotFoundError(f'Rug source and artwork are required: {source}, {texture_path}')
    old = bpy.data.objects['Woven kilim rug']
    old_min, old_max = _bounds(old)
    width = old_max.x - old_min.x
    center = (old_min + old_max) * 0.5
    tv_min, tv_max = _bounds(bpy.data.objects['TV_Interactive_Screen'])
    tv_center = (tv_min + tv_max) * 0.5
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = [obj for obj in bpy.data.objects if obj not in existing]
    meshes = [obj for obj in imported if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError(f'Expected one supplied rug mesh, found {len(meshes)}')
    rug = meshes[0]
    # The glTF arrives below ground and far from its origin. Bake its full
    # parent transform before normalizing, including glTF's Y-up conversion.
    rug.data.transform(rug.matrix_world)
    rug.parent = None
    rug.matrix_world = Matrix.Identity(4)
    rug.data.update()
    bpy.context.view_layer.update()
    source_min, source_max = _bounds(rug)
    source_center = (source_min + source_max) * 0.5
    x_scale = width / (source_max.x - source_min.x)
    y_scale = width / (source_max.y - source_min.y)
    # A geometric-mean vertical scale retains the original cloth/fold profile
    # while adapting its rectangular footprint into the requested square.
    z_scale = math.sqrt(x_scale * y_scale)
    floor = bpy.data.objects['Scanned worn pine floor']
    ground = _bounds(floor)[1].z + 0.001
    room_rotation = Matrix.Rotation(math.radians(RUG_ROTATION_DEGREES), 3, 'Z')

    def corner_position(corner):
        offset = room_rotation @ Vector((corner[0] * width / 2, corner[1] * width / 2, 0))
        return Vector((center.x + offset.x, center.y + offset.y, ground))

    nearest_corner = min(
        ((x, y) for x in (-1, 1) for y in (-1, 1)),
        key=lambda corner: (corner_position(corner).xy - tv_center.xy).length_squared,
    )
    # The supplied folded corner is +X,+Y. A proper rotation, never reflection,
    # moves it to the TV-nearest corner without reversing texture handedness.
    turns = {(1, 1): 0, (-1, 1): 1, (-1, -1): 2, (1, -1): 3}
    rotation = room_rotation @ Matrix.Rotation(turns[nearest_corner] * math.pi / 2, 3, 'Z')
    for vertex in rug.data.vertices:
        point = vertex.co
        fitted = rotation @ Vector(((point.x - source_center.x) * x_scale,
                                     (point.y - source_center.y) * y_scale, 0))
        vertex.co = (center.x + fitted.x, center.y + fitted.y,
                     ground + (point.z - source_min.z) * z_scale)
    rug.data.update()
    rug.name = 'Woven geometric rug'
    rug.data.name = 'Supplied rug | square footprint and original folded corner'
    room = bpy.data.collections['03_Room']
    for collection in list(rug.users_collection):
        collection.objects.unlink(rug)
    room.objects.link(rug)
    for obj in imported:
        if obj != rug:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj == old or obj.name.startswith('Cotton rug fringe'):
            bpy.data.objects.remove(obj, do_unlink=True)
    uv = rug.data.uv_layers[0]
    uv.name = 'UVMap'
    # Keep the source UV assignment: the folded flap's visible backing has
    # left-half UVs even though its geometric normal can point upward.
    face_polygons = [polygon for polygon in rug.data.polygons
                     if sum(uv.data[i].uv.x for i in polygon.loop_indices)
                     / len(polygon.loop_indices) > 0.5]
    face_uvs = [uv.data[i].uv for polygon in face_polygons for i in polygon.loop_indices]
    uv_bounds = tuple(tuple(fn(point[i] for point in face_uvs) for i in range(2))
                      for fn in (min, max))
    artwork = bpy.data.images.load(str(texture_path), check_existing=True)
    artwork.colorspace_settings.name = 'sRGB'
    rug.data.materials.clear()
    rug.data.materials.append(_textile('Rug | geometric plush wool', (0.5, 0.5, 0.5), artwork, uv_bounds))
    rug.data.materials.append(_textile('Rug | unprinted woven backing', (0.19, 0.17, 0.14)))
    face_indices = {polygon.index for polygon in face_polygons}
    for polygon in rug.data.polygons:
        polygon.material_index = 0 if polygon.index in face_indices else 1
    # Duplicate UV channels in the supplied file carry identical values.
    for layer in list(rug.data.uv_layers)[1:]:
        rug.data.uv_layers.remove(layer)
    rug['asset_group'] = '03_Room'
    rug['bake_atlas'] = 'rug'
    rug['supplied_asset'] = 'rug'
    rug['source_asset'] = 'Rug - Square pattern / Sousinho / CC-BY-4.0'
    rug['source_url'] = 'https://sketchfab.com/3d-models/rug-square-pattern-e45054df5644444ebca0670d75a6cf93'
    rug['square_width_m'] = width
    rug['folded_corner'] = list(nearest_corner)
    rug['folded_corner_xy'] = list(corner_position(nearest_corner).xy)
    rug['rotation_degrees'] = RUG_ROTATION_DEGREES
    rug['finish'] = 'Square plush geometric wool; original mesh, fold and backing UVs retained'
    bpy.context.view_layer.update()
    return rug
