"""Bake only the rug into its shipped atlas UVs, preserving every runtime vertex and the other floor islands.

Open the restyled native room-source.blend, then run with -- --work <dir>. The work directory contains
runtime.glb (decoded from the shipped room.glb by the node asset pipeline). No source blend is overwritten.
"""
import argparse
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake import configure_bake, select

args = argparse.ArgumentParser()
args.add_argument('--work', required=True)
work = Path(args.parse_args(sys.argv[sys.argv.index('--') + 1:]).work).resolve()
source = bpy.data.objects['Woven geometric rug']
# The source is packed; explicitly replace its top albedo with the new, unretouched generated texture.
image = bpy.data.images.load(str(Path(__file__).resolve().parent / 'assets/rug-geometric.png'), check_existing=False)
for material in source.data.materials:
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE':
            node.image = image

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(work / 'runtime.glb'))
imported = set(bpy.data.objects) - before
rug = next(o for o in imported if o.type == 'MESH' and o.name.startswith('Woven geometric rug'))
for obj in imported - {rug}:
    bpy.data.objects.remove(obj, do_unlink=True)
rug.parent = None
rug.data.uv_layers[0].name = 'BakedUV'
source_uv = rug.data.uv_layers.new(name='UVMap')
rug.data.materials.clear()
for material in source.data.materials:
    rug.data.materials.append(material)

# Match against the authored surface, so the original UV seam and plain folded backing survive quantization.
source.data.calc_loop_triangles()
triangles = list(source.data.loop_triangles)
vertices = [source.matrix_world @ v.co for v in source.data.vertices]
bvh = BVHTree.FromPolygons(vertices, [t.vertices[:] for t in triangles], all_triangles=True)
uv = source.data.uv_layers['UVMap']
max_error = 0
for face in rug.data.polygons:
    center = rug.matrix_world @ face.center
    _, _, index, distance = bvh.find_nearest(center)
    max_error = max(max_error, distance)
    triangle = triangles[index]
    face.material_index = source.data.polygons[triangle.polygon_index].material_index
    xyz = [vertices[i] for i in triangle.vertices]
    tex = [Vector((*uv.data[i].uv, 0)) for i in triangle.loops]
    for loop in face.loop_indices:
        point = rug.matrix_world @ rug.data.vertices[rug.data.loops[loop].vertex_index].co
        source_uv.data[loop].uv = barycentric_transform(point, *xyz, *tex).xy
assert max_error < 0.005, f'Source and shipped rug differ: {max_error}'
print('RUG_TRANSFER_MAX_ERROR', max_error, flush=True)
source.hide_render = True
for obj in bpy.context.scene.objects:
    if obj.get('glass_shell') or obj.get('omit_export'):
        obj.hide_render = True

atlas = bpy.data.images.new('Rug-only relight', width=2048, height=2048, alpha=True, float_buffer=True)
atlas.generated_color = (0, 0, 0, 0)
for material in rug.data.materials:
    nodes = material.node_tree.nodes
    for node in nodes: node.select = False
    target = nodes.new('ShaderNodeTexImage')
    target.image = atlas
    target.select = True
    nodes.active = target
rug.data.uv_layers.active = rug.data.uv_layers['BakedUV']
rug.data.uv_layers['BakedUV'].active_render = True
configure_bake(bpy.context.scene, 96, 'METAL')
select([rug])
bpy.ops.object.bake(type='COMBINED')
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.image_settings.color_mode = 'RGBA'
bpy.context.scene.render.image_settings.color_depth = '8'
atlas.save_render(str(work / 'rug-baked.png'), scene=bpy.context.scene)
print('RUG_BAKED', work / 'rug-baked.png', flush=True)
