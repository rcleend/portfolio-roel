"""Clean baked device shading without moving vertices or changing atlas UVs."""

import math
from collections import defaultdict

import bpy
import bmesh
from mathutils import Vector


def continuous_plant_pot_uvs(obj):
    """Unroll the scanned pot, retaining the original leaf atlas coordinates."""
    mesh = obj.data
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=0.000001)
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    cx, cy, base = obj['pot_center']
    uv = mesh.uv_layers.new(name='ContinuousSurfaceUV')
    marked = mesh.attributes.new(name='continuous_surface_uv', type='BOOLEAN', domain='FACE')
    for face in mesh.polygons:
        if mesh.materials[face.material_index].name != 'Plant | clean ivory ceramic':
            continue
        marked.data[face.index].value = True
        points = [mesh.vertices[mesh.loops[i].vertex_index].co for i in face.loop_indices]
        if abs(face.normal.z) > 0.8:
            for loop, point in zip(face.loop_indices, points):
                uv.data[loop].uv = (point.x - cx + 0.5, point.y - cy)
            continue
        angles = [(math.atan2(p.y - cy, -(p.x - cx)) + math.pi) / (2 * math.pi) for p in points]
        if max(angles) - min(angles) > 0.5:
            angles = [u + 1 if u < 0.5 else u for u in angles]
        for loop, u, point in zip(face.loop_indices, angles, points):
            uv.data[loop].uv = (u * math.pi * 0.10, point.z - base)
    mesh.uv_layers.active = mesh.uv_layers['UVMap']
    mesh.uv_layers['UVMap'].active_render = True


def continuous_cabinet_edge_uvs(obj):
    """Keep the tabletop and its front lip on one continuous lightmap island.

    The old automatic unwrap cut directly through the soft TV contact shadow.
    Its dark gutter then extended across the narrow bevel as a hard black line.
    Project the top/front together, with seams only at the sides and underside.
    """
    mesh = obj.data
    area = sum(face.area for face in mesh.polygons)
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=0.000001)
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    # Imported bevels include zero-area duplicate slivers. Welding removes those
    # while retaining the actual cabinet surface and all vertex positions.
    assert abs(sum(face.area for face in mesh.polygons) - area) < 0.000001, 'Cabinet surface area changed'
    uv = mesh.uv_layers.new(name='ContinuousSurfaceUV')
    marked = mesh.attributes.new(name='continuous_surface_uv', type='BOOLEAN', domain='FACE')
    for face in mesh.polygons:
        points = [mesh.vertices[mesh.loops[i].vertex_index].co for i in face.loop_indices]
        if min(p.z for p in points) < 0.4566:
            continue
        if face.normal.z < -0.1 or face.normal.x > 0.1 or abs(face.normal.y) > 0.7:
            continue
        marked.data[face.index].value = True
        for loop, point in zip(face.loop_indices, points):
            # Top recedes towards +X; front descends towards -Z. Their unfolded
            # coordinates must go in opposite directions rather than overlap.
            uv.data[loop].uv = (point.y, point.x + point.z)
    assert any(d.value for d in marked.data), 'Missing continuous cabinet lip'
    mesh.uv_layers.active = mesh.uv_layers['UVMap']
    mesh.uv_layers['UVMap'].active_render = True


def continuous_lamp_uvs(obj):
    """Unroll round housings with a single seam facing the wall, and planar caps.

    Join coincident imported vertices so the UV packer cannot break this strip
    back into independent triangles. Only duplicate vertices are merged.
    """
    mesh = obj.data
    faces = len(mesh.polygons)
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=0.000001)
    edit.to_mesh(mesh)
    edit.free()
    assert len(mesh.polygons) == faces, (obj.name, 'Welding changed lamp faces')
    low = [min(v.co[k] for v in mesh.vertices) for k in range(3)]
    high = [max(v.co[k] for v in mesh.vertices) for k in range(3)]
    cx, cy = [(low[k] + high[k]) * 0.5 for k in range(2)]
    circumference = math.pi * max(high[0] - low[0], high[1] - low[1])
    uv = mesh.uv_layers.new(name='ContinuousSurfaceUV')
    marked = mesh.attributes.new(name='continuous_surface_uv', type='BOOLEAN', domain='FACE')
    for face in mesh.polygons:
        marked.data[face.index].value = True
        points = [mesh.vertices[mesh.loops[loop].vertex_index].co for loop in face.loop_indices]
        if abs(face.normal.z) > 0.8:
            # Separate top and bottom caps from one another and the side strip.
            offset = circumference * (2 if face.normal.z > 0 else 4)
            coords = [(p.x - cx + offset, p.y - cy) for p in points]
        else:
            angles = [(math.atan2(p.x - cx, -(p.y - cy)) + math.pi) / (2 * math.pi) for p in points]
            if max(angles) - min(angles) > 0.5:
                angles = [u + 1 if u < 0.5 else u for u in angles]
            coords = [(u * circumference, p.z - low[2]) for u, p in zip(angles, points)]
        for loop, coord in zip(face.loop_indices, coords):
            uv.data[loop].uv = coord
    # Restore the source layer for the materials. The atlas unwrap uses this
    # auxiliary layer only after Smart Project has laid out the other objects.
    mesh.uv_layers.active = mesh.uv_layers['UVMap']
    mesh.uv_layers['UVMap'].active_render = True


def smooth_moulded_normals(objects):
    """Replace recovered split normals with area-weighted, angle-limited normals.

    The imported UV seams duplicate vertices. Weight across coincident positions
    so flat plastic does not inherit a separate highlight on each skinny triangle.
    A 50-degree crease keeps the actual moulding edges and recessed controls crisp.
    """
    for obj in objects:
        mesh = obj.data
        incident = defaultdict(list)
        position = lambda v: tuple(round(c, 6) for c in v.co)
        for face in mesh.polygons:
            for vertex in face.vertices:
                incident[position(mesh.vertices[vertex])].append(face)
        normals = [None] * len(mesh.loops)
        threshold = math.cos(math.radians(50))
        for face in mesh.polygons:
            face.use_smooth = True
            for loop in face.loop_indices:
                nearby = incident[position(mesh.vertices[mesh.loops[loop].vertex_index])]
                normal = sum((f.normal * f.area for f in nearby if f.normal.dot(face.normal) > threshold), Vector())
                normals[loop] = normal.normalized() if normal.length_squared else face.normal
        mesh.normals_split_custom_set(normals)


def refine_radio_surfaces(objects):
    """Clean the imported radio's shading and casing reflectance for its bake."""
    objects = [obj for obj in objects if obj.get('hero_asset') == 'radio']
    smooth_moulded_normals(objects)
    # Controls share a source material with the grilles. Give the controls their
    # own clean plastic response while retaining the speakers' fine perforations.
    for obj in objects:
        if obj.name.startswith('Radio_Imported_Part_05'):
            for index, material in enumerate(obj.data.materials):
                if material.name == 'secondary':
                    clean = material.copy()
                    clean.name = 'Radio | clean controls'
                    obj.data.materials[index] = clean
    for material in {m for obj in objects for m in obj.data.materials
                     if m and m.name in ('main', 'Radio | clean controls')}:
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = 0
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        if not shader.inputs['Base Color'].is_linked:
            continue
        source = shader.inputs['Base Color'].links[0].from_socket
        # The recovered colour map includes mottled wear and painted edge light.
        # Flatten the plastic reflectance, retaining the dark printed legends and
        # tuner panel. Actual light and contact shadows come from the room bake.
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.name = 'Plastic mask preserving dark print and coloured details'
        ramp.color_ramp.elements[0].position = 0.08
        ramp.color_ramp.elements[1].position = 0.16
        clean = nodes.new('ShaderNodeMixRGB')
        clean.name = 'Clean ABS with original printed markings'
        clean.inputs[2].default_value = (0.25, 0.28, 0.34, 1)
        links.new(source, ramp.inputs['Fac'])
        links.new(ramp.outputs['Color'], clean.inputs[0])
        links.new(source, clean.inputs[1])
        links.new(clean.outputs[0], shader.inputs['Base Color'])


def refine_room_surfaces(objects):
    """Repair manufactured surfaces before atlas groups lose their object names.

    Keep the wood, printed TV legends and speaker perforations. Only the static
    lava housing is baked; its glass and animated wax retain their original data.
    """
    shells = [obj for obj in objects if obj.type == 'MESH'
              and not obj.get('replaceable_screen')
              and not obj.get('animated_lava') and not obj.get('glass_shell')
              and (obj.get('hero_asset') == 'tv'
                   or obj.get('supplied_asset') in ('cabinet', 'desk', 'lamp', 'lava', 'desk-plant')
                   or obj.name.startswith(('Window ', 'Deep window sill')))]
    for obj in shells:
        if obj.get('supplied_asset') == 'desk-plant':
            continuous_plant_pot_uvs(obj)
        if obj.get('supplied_asset') == 'cabinet':
            continuous_cabinet_edge_uvs(obj)
        if obj.get('supplied_asset') == 'lava' or obj.name.startswith((
            'Imported_lamp_05_', 'Imported_lamp_13_', 'Imported_lamp_19_',
        )):
            continuous_lamp_uvs(obj)
    smooth_moulded_normals(shells)
    for obj in objects:
        # These separate flecks used walnut on top of the painted cabinet. Their
        # tiny islands read as random black pixels once baked at room scale.
        if obj.name.startswith('Cabinet small enamel edge wear'):
            obj.data.materials.clear()
            obj.data.materials.append(bpy.data.materials['Paint | worn dove grey'])
    for material in {m for obj in shells if obj.get('hero_asset') == 'tv'
                     for m in obj.data.materials if m}:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        for node in nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = 0.35
            elif node.type == 'BSDF_PRINCIPLED':
                # A uniform satin casing avoids blotches from the scanned
                # roughness/metalness. Colour still carries labels and sockets.
                for name, value in (('Roughness', 0.55), ('Metallic', 0), ('Specular IOR Level', 0.3)):
                    for link in list(node.inputs[name].links):
                        links.remove(link)
                    node.inputs[name].default_value = value
