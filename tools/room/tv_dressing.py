"""Opening-view props: the supplied desk plant and original Product Engineer cover."""

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

ASSETS = Path(__file__).resolve().parent / 'assets'
PLANT_HEIGHT = 0.21
# Blender axes: the TV faces -X; its right is -Y. Pot sits on the cabinet top.
PLANT_POSITION = Vector((2.27, -0.12, 0.486))


def _material(name, image, ceramic=False, lift_shadows=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = 0.68 if ceramic else 0.56
    shader.inputs['Specular IOR Level'].default_value = 0.25
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    if ceramic:
        # The scan has painted light, dark seams and a paper label on the back.
        # Replace that albedo with a quiet warm ceramic finish;
        # the actual relief and room illumination supply its shape and shadow.
        shader.inputs['Base Color'].default_value = (0.64, 0.60, 0.52, 1)
    elif lift_shadows:
        # The source is an unlit photograph with its own shade. Lift that shade
        # before adding the night room's light, so the leaves are not lit twice.
        gamma = nodes.new('ShaderNodeGamma')
        gamma.inputs['Gamma'].default_value = 0.65
        links.new(texture.outputs['Color'], gamma.inputs['Color'])
        links.new(gamma.outputs['Color'], shader.inputs['Base Color'])
    else:
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return material


def add_desk_plant():
    if bpy.data.objects.get('TV desk plant'):
        return
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / 'desk-plant-source.glb'))
    imported = [obj for obj in bpy.data.objects if obj not in existing]
    plant, = [obj for obj in imported if obj.type == 'MESH']
    plant.data.transform(plant.matrix_world)
    plant.parent = None
    plant.matrix_world = Matrix.Identity(4)
    # Weld scan vertices before decimation. Otherwise each UV island simplifies
    # its border independently and opens visible cracks through the ceramic.
    edit = bmesh.new()
    edit.from_mesh(plant.data)
    bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=0.000001)
    edit.to_mesh(plant.data)
    edit.free()
    plant.data.update()
    image = next(n.image for n in plant.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
    plant.data.materials.clear()
    plant.data.materials.append(_material('Plant | original variegated leaves', image, lift_shadows=True))
    plant.data.materials.append(_material('Plant | clean ivory ceramic', image, ceramic=True))
    # The scanned pot is centred here; preserve the leaves, soil and stems.
    pot_center = Vector((-0.138, -0.025, 0))
    for face in plant.data.polygons:
        center = face.center
        radial = (center.xy - pot_center.xy).length
        if center.z < -0.005 and 0.055 < radial < 0.075:
            face.material_index = 1
        face.use_smooth = True
    low = min(v.co.z for v in plant.data.vertices)
    high = max(v.co.z for v in plant.data.vertices)
    scale = PLANT_HEIGHT / (high - low)
    rotation = Matrix.Rotation(math.radians(25), 3, 'Z')
    for vertex in plant.data.vertices:
        p = rotation @ Vector((vertex.co.x - pot_center.x, vertex.co.y - pot_center.y, vertex.co.z - low))
        vertex.co = PLANT_POSITION + p * scale
    for layer in list(plant.data.uv_layers)[1:]:
        plant.data.uv_layers.remove(layer)
    plant.data.uv_layers[0].name = 'UVMap'
    plant.name = 'TV desk plant'
    collection = bpy.data.collections['01_TV']
    for old in list(plant.users_collection):
        old.objects.unlink(plant)
    collection.objects.link(plant)
    for obj in imported:
        if obj != plant:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Keep the outline and leaf texture while removing invisible scan density.
    bpy.ops.object.select_all(action='DESELECT')
    plant.select_set(True)
    bpy.context.view_layer.objects.active = plant
    decimate = plant.modifiers.new('Small prop scan simplification', 'DECIMATE')
    decimate.ratio = 0.20
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    plant['asset_group'] = '01_TV'
    plant['bake_atlas'] = 'plant'
    plant['supplied_asset'] = 'desk-plant'
    plant['height_m'] = PLANT_HEIGHT
    plant['pot_center'] = list(PLANT_POSITION)
    plant['source_author'] = 'jakecollingdesign (https://sketchfab.com/jakecollingdesign)'
    plant['source_license'] = 'CC-BY-NC-SA-4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)'
    plant['source_url'] = 'https://sketchfab.com/3d-models/desk-plant-cedfdeab85aa49d68125306b0cacde34'
    plant['finish'] = 'Smoothed scan, clean ivory ceramic, source leaf colour, shared room illumination'
    bpy.context.view_layer.update()


def replace_game_cover():
    old_title, title = 'Star Wars Battlefront II', 'Product Engineer'
    pieces = [obj for obj in bpy.data.objects if obj.get('game_title') == old_title]
    if not pieces:
        assert any(obj.get('game_title') == title for obj in bpy.data.objects), 'Missing game case'
        return
    body = bpy.data.objects['PS2 game case ' + old_title]
    center = body.matrix_world.translation.copy()
    turn = Matrix.Translation(center) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(-center)
    for obj in pieces:
        obj.matrix_world = turn @ obj.matrix_world
        obj.name = obj.name.replace(old_title, title)
        obj.data.name = obj.data.name.replace(old_title, title)
        obj['game_title'] = title
        obj['rotation_delta_degrees'] = 180
        if obj.type == 'FONT':
            obj.data.body = 'PRODUCT ENGINEER'
    cover = bpy.data.objects['PS2 printed cover ' + title]
    image = bpy.data.images.load(str(ASSETS / 'product-engineer-cover.png'), check_existing=True)
    image.colorspace_settings.name = 'sRGB'
    cover.data.materials.clear()
    cover.data.materials.append(_material('PS2 cover Product Engineer', image))
    # Verify the bottom of the printed cover faces the opening camera (-X).
    uv = cover.data.uv_layers[0]
    bottom, top = [], []
    for loop in cover.data.loops:
        point = cover.matrix_world @ cover.data.vertices[loop.vertex_index].co
        (bottom if uv.data[loop.index].uv.y < 0.5 else top).append(point.x)
    assert sum(bottom) / len(bottom) < sum(top) / len(top), 'Game cover is upside down to the camera'


def dress_tv():
    add_desk_plant()
    replace_game_cover()


def align_tv_light():
    """A dim rectangular emitter on the glass, facing into the room (-X).

    The old 20 W tilted disk projected a bright blue stripe across the cabinet
    lip. Keep the real screen's direction and let the chin occlude its light.
    Called at bake time too, so existing editable sources receive the correction.
    """
    light = bpy.data.objects['TV screen reflected blue']
    light.location = (2.158, 0.32, 0.836)
    light.rotation_euler = Vector((-1, 0, 0)).to_track_quat('-Z', 'Y').to_euler()
    light.data.shape = 'RECTANGLE'
    light.data.size = 0.49
    light.data.size_y = 0.37
    light.data.energy = 2
