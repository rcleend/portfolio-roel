"""Original, lightweight 1990s desktop peripherals, authored from visual study.

The reference is FaceTheEdge's ``90s Pc Desktop style 002`` public preview:
https://sketchfab.com/3d-models/90s-pc-desktop-style-002-ec97f236db9342d0802a3ab75cf4da4b
Its downloadable source is not public. No source geometry or textures are used.
The existing under-desk tower and screen image remain; only the three desktop
    peripherals, the external desktop leads and the loose floppy disks are replaced.

All detail is baked into the existing PC atlas. No extra runtime textures,
materials, objects, animations, lights or JavaScript are required.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


REFERENCE = 'https://sketchfab.com/3d-models/90s-pc-desktop-style-002-ec97f236db9342d0802a3ab75cf4da4b'
DESK_TOP = 0.7852


def _linear(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


def _plastic(name, color, roughness=0.51, grain=True):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    base = _linear(color)
    shader.inputs['Base Color'].default_value = (*base, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Specular IOR Level'].default_value = 0.28
    material.diffuse_color = (*base, 1)
    if grain:
        coordinates = nodes.new('ShaderNodeNewGeometry')
        fine = nodes.new('ShaderNodeTexNoise')
        fine.inputs['Scale'].default_value = 1350
        fine.inputs['Detail'].default_value = 1.5
        links.new(coordinates.outputs['Position'], fine.inputs['Vector'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.16
        bump.inputs['Distance'].default_value = 0.00012
        links.new(fine.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        age = nodes.new('ShaderNodeTexNoise')
        age.inputs['Scale'].default_value = 18
        age.inputs['Detail'].default_value = 2
        links.new(coordinates.outputs['Position'], age.inputs['Vector'])
        ramp = nodes.new('ShaderNodeValToRGB')
        for element, factor in zip(ramp.color_ramp.elements, (0.95, 1.035)):
            element.color = (*(v * factor for v in base), 1)
        links.new(age.outputs['Fac'], ramp.inputs['Fac'])
        links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
    return material


def _tag(obj):
    obj['hero_asset'] = 'pc'
    obj['asset_group'] = '02_Desk'
    obj['source_asset'] = 'Original procedural reconstruction / public visual reference'
    obj['visual_reference'] = REFERENCE
    return obj


def _mesh(name, vertices, faces, material, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.collections['02_Desk'].objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return _tag(obj)


def _select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def _round_rect(width, height, radius, steps=3):
    """Counterclockwise perimeter in a 2D plane, with straight sides."""
    points = []
    for cx, cy, first in ((width / 2 - radius, -height / 2 + radius, -90),
                          (width / 2 - radius, height / 2 - radius, 0),
                          (-width / 2 + radius, height / 2 - radius, 90),
                          (-width / 2 + radius, -height / 2 + radius, 180)):
        for i in range(steps + 1):
            angle = math.radians(first + 90 * i / steps)
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def _loft(name, loops, material, cap=True, smooth=False):
    n = len(loops[0])
    vertices = [v for loop in loops for v in loop]
    faces = [(j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n,
              (j + 1) * n + i) for j in range(len(loops) - 1) for i in range(n)]
    if cap:
        faces.extend([tuple(reversed(range(n))), tuple(range((len(loops) - 1) * n, len(loops) * n))])
    obj = _mesh(name, vertices, faces, material, smooth)
    if cap:
        # The front-facing XZ profiles and upward XY profiles have opposite
        # winding relative to their extrusion axes. Close volumes consistently.
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        mesh.to_mesh(obj.data)
        mesh.free()
    return obj


def _box(name, centre, size, material, bevel=0.001, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    bpy.data.collections['02_Desk'].objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Small moulded edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = segments
        modifier.harden_normals = True
        normal = obj.modifiers.new('Face weighted normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
    return _tag(obj)


def _cylinder(name, centre, radius, depth, material, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=centre)
    obj = bpy.context.object
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    bpy.data.collections['02_Desk'].objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new('Turned rim', 'BEVEL')
    bevel.width, bevel.segments = min(0.0015, depth / 4), 2
    bevel.harden_normals = True
    normal = obj.modifiers.new('Face weighted normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    return _tag(obj)


def _join(objects, name):
    for obj in objects:
        _select([obj])
        bpy.ops.object.convert(target='MESH')
    _select(objects)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return _tag(obj)


def _monitor(screen, ivory, rear, shadow, dark):
    x, y = -1.34, 1.66
    parts = []
    # Circular swivel foot and concealed tilt cradle sit directly on the desktop.
    parts.append(_cylinder('CRT rubber underside', (x, 1.86, DESK_TOP + 0.002), 0.132, 0.004, dark))
    parts.append(_cylinder('CRT low swivel foot', (x, 1.86, DESK_TOP + 0.0125), 0.139, 0.021, ivory))
    parts.append(_cylinder('CRT swivel bearing', (x, 1.86, DESK_TOP + 0.027), 0.099, 0.01, shadow))
    parts.append(_box('CRT tilt cradle', (x, 1.84, 0.839), (0.235, 0.178, 0.056), rear, 0.009, 3))
    # A continuous bevelled ring avoids a four-block, toy-like bezel silhouette.
    outer = _round_rect(0.46, 0.41, 0.012, 5)
    outer_lip = _round_rect(0.454, 0.404, 0.011, 5)
    inner = _round_rect(0.368, 0.296, 0.015, 5)
    aperture = _round_rect(0.356, 0.284, 0.012, 5)
    centre_z, screen_z = 1.063, 1.071
    loops = [[(x + u, y + depth, z + v) for u, v in loop] for loop, depth, z in
             ((outer, 0.04, centre_z), (outer, 0.005, centre_z),
              (outer_lip, 0, centre_z), (inner, 0.001, screen_z),
              (aperture, 0.019, screen_z))]
    bezel_material = ivory.copy()
    bezel_material.name = 'Desktop | continuous bezel ABS'
    bezel = _loft('CRT continuous front bezel', loops, bezel_material, cap=False, smooth=True)
    # The rounded corners are one moulding. Flat normals made each little corner
    # quad leave a dark diagonal in the lightmap, even at high bake resolution.
    normal = bezel.modifiers.new('Continuous bezel highlights', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    parts.append(bezel)
    # Deliberate seam behind the face, followed by a deep taper toward the rear.
    body_loops = []
    for width, height, depth, z, radius in (
            (0.455, 0.405, 0.042, centre_z, 0.012),
            (0.455, 0.405, 0.052, centre_z, 0.012),
            (0.435, 0.385, 0.065, centre_z, 0.012),
            (0.342, 0.291, 0.145, centre_z + 0.009, 0.012),
            (0.302, 0.257, 0.418, centre_z - 0.001, 0.012),
            (0.294, 0.249, 0.425, centre_z - 0.001, 0.010)):
        body_loops.append([(x + u, y + depth, z + v) for u, v in _round_rect(width, height, radius, 5)])
    parts.append(_loft('CRT tapered rear shell', body_loops, rear))
    parts.append(_loft('CRT housing seam', [[(x + u, y + d, centre_z + v) for u, v in
                        _round_rect(0.456, 0.406, 0.012, 5)] for d in (0.04, 0.042)], shadow, cap=False))
    # Subtle engraved moulding lines and an unbranded centre badge.
    for z in (1.247, 0.894):
        parts.append(_box('CRT fine face moulding', (x, y - 0.0005, z), (0.421, 0.0007, 0.001), shadow, 0))
    parts.append(_box('CRT unbranded badge', (x, y - 0.0012, 0.8815), (0.012, 0.0012, 0.006), rear, 0.001, 1))
    parts.append(_box('CRT recessed control shelf', (x, y + 0.027, 0.855), (0.352, 0.03, 0.014), shadow, 0.003))
    for i, offset in enumerate((-0.145, -0.114, -0.083, -0.052, 0.064, 0.094)):
        button = _cylinder('CRT adjustment button', (x + offset, y + 0.005, 0.8605), 0.0083, 0.007, ivory, 20)
        button.rotation_euler[0] = math.pi / 2
        parts.append(button)
    parts.append(_box('CRT power button', (x + 0.141, y - 0.001, 0.857), (0.026, 0.01, 0.008), ivory, 0.0015))
    led = _plastic('Desktop | muted green power LED', '82ac78', 0.36, False)
    led.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (*_linear('82ac78'), 1)
    led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.35
    parts.append(_box('CRT power indicator', (x + 0.177, y - 0.001, 0.863), (0.004, 0.001, 0.002), led, 0.0005))
    # The reference's lower ribbed cooling skirt. Slits are geometric only where
    # they affect the close-up; smaller surface grain lives in the bake.
    parts.append(_box('CRT cooling skirt', (x, y + 0.234, 0.895), (0.321, 0.318, 0.055), rear, 0.004))
    for side in (-1, 1):
        for i in range(17):
            parts.append(_box('CRT lower cooling slit', (x + side * 0.1608, y + 0.096 + i * 0.0165, 0.898),
                              (0.001, 0.0023, 0.042), shadow, 0))
    for i in range(14):
        parts.append(_box('CRT rear cooling slit', (x - 0.102 + i * 0.0155, y + 0.4255, 1.108),
                          (0.003, 0.0009, 0.058), shadow, 0))
    # Rebuild the glass as a lightly convex rounded patch, keeping the existing
    # display image and canonical UV orientation and interaction metadata.
    perimeter = _round_rect(0.356, 0.284, 0.012, 8)
    vertices = [(x, y + 0.008, screen_z)]
    for scale in (0.25, 0.5, 0.75, 1):
        for u, v in perimeter:
            u, v = u * scale, v * scale
            curve = 0.011 * (1 - (u / 0.178) ** 2) * (1 - (v / 0.142) ** 2)
            vertices.append((x + u, y + 0.019 - curve, screen_z + v))
    n = len(perimeter)
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    for ring in range(3):
        a, b = 1 + ring * n, 1 + (ring + 1) * n
        faces.extend((a + i, b + i, b + (i + 1) % n, a + (i + 1) % n) for i in range(n))
    mesh = bpy.data.meshes.new('CRT curved screen | canonical UV')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(screen.data.materials[0])
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = tuple(max(0.0, min(1.0, value)) for value in
                                      ((point.x - x) / 0.356 + 0.5, (point.z - screen_z) / 0.284 + 0.5))
    screen.data = mesh
    screen.matrix_world = Matrix.Identity(4)
    for key in ('source_mesh_name', 'source_model_uid', 'recovered_from_viewer'):
        if key in screen:
            del screen[key]
    _tag(screen)
    screen['interaction_id'] = 'pc-screen'
    screen['replaceable_screen'] = True
    return _join(parts, 'PC_Imported_CRT')


# A tiny original bitmap alphabet makes legible key legends without hundreds of
# text meshes, a large font dependency, or additional runtime draw calls.
_FONT = {
    'A': '0e11111f111111', 'B': '1e11111e11111e', 'C': '0e11101010110e',
    'D': '1e11111111111e', 'E': '1f10101e10101f', 'F': '1f10101e101010',
    'G': '0e11101711110f', 'H': '1111111f111111', 'I': '0e04040404040e',
    'J': '0702020212120c', 'K': '11121418141211', 'L': '1010101010101f',
    'M': '111b1515111111', 'N': '11191513111111', 'O': '0e11111111110e',
    'P': '1e11111e101010', 'Q': '0e11111115120d', 'R': '1e11111e141211',
    'S': '0f10100e01011e', 'T': '1f040404040404', 'U': '1111111111110e',
    'V': '11111111110a04', 'W': '11111115151b11', 'X': '11110a040a1111',
    'Y': '11110a04040404', 'Z': '1f01020408101f',
    '0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f',
    '3': '1f02020401110e', '4': '02060a121f0202', '5': '1f101e0101110e',
    '6': '0608101e11110e', '7': '1f010204080808', '8': '0e11110e11110e',
    '9': '0e11110f01020c', '-': '0000001f000000', '=': '00001f001f0000',
    '/': '01010204081010', '\\': '10100804020101', '*': '00150e1f0e1500',
    '+': '0004041f040400', '.': '00000000000c0c', ',': '00000000000408',
    ';': '000c0c000c0408', "'": '04040800000000', '`': '08040000000000',
    '[': '0e08080808080e', ']': '0e02020202020e', '<': '02040810080402',
    '>': '08040201020408', '^': '040a1100000000', ' ': '00000000000000',
}


def _legend_material(keys, ivory, alternate):
    tile, columns = 64, 16
    rows = math.ceil(len(keys) / columns)
    height = 2 ** math.ceil(math.log2(rows * tile))
    pixels = np.ones((height, columns * tile, 4), dtype=np.float32)
    for index, (_, _, _, _, label, dark) in enumerate(keys):
        ox, oy = index % columns * tile, index // columns * tile
        color = _linear('b3aa96' if dark else 'd4cebd')
        pixels[oy:oy + tile, ox:ox + tile, :3] = color
        label = label.upper()
        scale = 2 if len(label) <= 2 else 1
        for letter_index, letter in enumerate(label):
            glyph = _FONT.get(letter, _FONT[' '])
            for row in range(7):
                bits = int(glyph[row * 2:row * 2 + 2], 16)
                for column in range(5):
                    if bits & (1 << (4 - column)):
                        px = ox + 10 + letter_index * 6 * scale + column * scale
                        py = oy + tile - 12 - (row + 1) * scale
                        pixels[py:py + scale, px:px + scale, :3] = _linear('45473f')
    image = bpy.data.images.new('Desktop original key legends', width=columns * tile, height=height, alpha=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    material = _plastic('Desktop | original key legends', 'd4cebd', 0.52)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    coords = nodes.new('ShaderNodeUVMap')
    coords.uv_map = 'UVMap'
    links.new(coords.outputs['UV'], texture.inputs['Vector'])
    links.new(texture.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])
    return material, columns, height / tile


def _keyboard(ivory, rear, shadow):
    x, y = -1.345, 1.505
    parts = []
    # Level underside; gently inclined upper shell. Every key rests in the keybed.
    def top(at_y):
        return DESK_TOP + 0.017 + (at_y - 1.405) * 0.075
    loops = [[(x + u, y + v, z(u, v)) for u, v in _round_rect(w, d, r, 3)]
             for w, d, r, z in (
                 (0.488, 0.198, 0.008, lambda u, v: DESK_TOP),
                 (0.49, 0.20, 0.008, lambda u, v: DESK_TOP + 0.004),
                 (0.49, 0.20, 0.008, lambda u, v: top(y + v) - 0.003),
                 (0.484, 0.194, 0.007, lambda u, v: top(y + v))) ]
    parts.append(_loft('Keyboard sloped shell', loops, ivory))
    # The panel top is 1 mm above the shell, with its lower half embedded. The
    # key bases embed into it by that same millimetre. Coincident panel/shell
    # faces flicker after GLB quantization, even when Cycles renders them cleanly.
    parts.append(_box('Keyboard recessed keybed', (x - 0.0005, 1.502, top(1.502)),
                      (0.452, 0.158, 0.002), shadow, 0.002))
    # The keybed follows the same shallow slope as the case.
    parts[-1].rotation_euler[0] = math.atan(0.075)
    keys = []
    unit, left = 0.019, -1.5675
    def row(at_y, entries):
        cursor = 0
        for width, label, alternate in entries:
            keys.append((left + (cursor + width / 2) * unit, at_y, width * unit - 0.002, 0.018,
                         label, alternate))
            cursor += width
        assert abs(cursor - 15) < 0.001
    row(1.434, [(1.25, 'CTRL', True), (1.25, 'WIN', True), (1.25, 'ALT', True), (6.25, '', False),
                (1.25, 'ALT', True), (1.25, 'WIN', True), (1.25, 'MENU', True), (1.25, 'CTRL', True)])
    row(1.458, [(2.25, 'SHIFT', True)] + [(1, c, False) for c in 'ZXCVBNM,./'] + [(2.75, 'SHIFT', True)])
    row(1.482, [(1.75, 'CAPS', True)] + [(1, c, False) for c in "ASDFGHJKL;'" ] + [(2.25, 'ENTER', True)])
    row(1.506, [(1.5, 'TAB', True)] + [(1, c, False) for c in 'QWERTYUIOP[]'] + [(1.5, '\\', True)])
    row(1.530, [(1, c, False) for c in '`1234567890-='] + [(2, 'BACK', True)])
    keys.append((left + unit / 2, 1.577, 0.017, 0.018, 'ESC', True))
    for index in range(12):
        key_x = left + 0.048 + index * unit + (index // 4) * 0.0075
        keys.append((key_x, 1.577, 0.017, 0.018, 'F' + str(index + 1), index // 4 != 1))
    nav = left + 0.30
    for at_y, labels in ((1.577, ('PRT', 'SCR', 'PAUSE')), (1.530, ('INS', 'HOME', 'PGUP')),
                         (1.506, ('DEL', 'END', 'PGDN')), (1.434, ('<', 'V', '>'))):
        for i, label in enumerate(labels):
            keys.append((nav + (i + 0.5) * unit, at_y, 0.017, 0.018, label, True))
    keys.append((nav + 1.5 * unit, 1.458, 0.017, 0.018, '^', True))
    num = left + 0.369
    for row_index, labels in enumerate((('NUM', '/', '*', '-'), ('7', '8', '9', '+'),
                                       ('4', '5', '6', None), ('1', '2', '3', 'ENTER'))):
        for i, label in enumerate(labels):
            if label is None:
                continue
            at_y = 1.530 - row_index * 0.024
            depth = 0.042 if label in ('+', 'ENTER') else 0.018
            if depth > 0.018:
                at_y -= 0.012
            keys.append((num + (i + 0.5) * unit, at_y, 0.017, depth, label, row_index == 0 or i == 3))
    keys.extend(((num + unit, 1.434, unit * 2 - 0.002, 0.018, '0', False),
                 (num + unit * 2.5, 1.434, 0.017, 0.018, '.', False)))
    legends, columns, rows = _legend_material(keys, ivory, rear)
    for index, (at_x, at_y, width, depth, label, alternate) in enumerate(keys):
        loops = []
        for inset, dz in ((0, 0), (0.0014, 0.008), (0.0021, 0.009)):
            loops.append([(at_x + u, at_y + v, top(at_y + v) + dz) for u, v in
                          _round_rect(width - inset * 2, depth - inset * 2, 0.001, 1)])
        key = _loft('Keyboard sculpted keycap', loops, rear if alternate else ivory)
        key.data.materials.append(legends)
        key.data.polygons[-1].material_index = 1
        uv = key.data.uv_layers.new(name='UVMap')
        tile_x, tile_y = index % columns, index // columns
        for polygon in key.data.polygons:
            for loop in polygon.loop_indices:
                point = key.data.vertices[key.data.loops[loop].vertex_index].co
                uv.data[loop].uv = ((tile_x + (point.x - at_x) / width + 0.5) / columns,
                                    (tile_y + (point.y - at_y) / depth + 0.5) / rows)
        parts.append(key)
    for index in range(3):
        parts.append(_box('Keyboard status light', (num + 0.013 + index * 0.019, 1.579, top(1.579) + 0.0007),
                          (0.005, 0.002, 0.0012), shadow, 0.0005))
    keyboard = _join(parts, 'PC_Imported_Keyboard')
    keyboard['key_count'] = len(keys)
    keyboard['key_legend_source'] = 'Original bitmap alphabet; no imported font or image'
    return keyboard


def _mouse(ivory, rear, shadow, dark):
    x, y, z = -0.91, 1.575, 0.7912
    parts, loops = [], []
    n = 40
    for scale, dz in ((0.96, 0), (1, 0.003), (1, 0.0038), (1, 0.006), (0.97, 0.012),
                      (0.84, 0.023), (0.55, 0.031), (0.20, 0.034)):
        loop = []
        for index in range(n):
            angle = index * math.tau / n
            u, v = math.cos(angle), math.sin(angle)
            u = math.copysign(abs(u) ** 0.74, u) * 0.034 * scale
            v = math.copysign(abs(v) ** 0.84, v) * 0.051 * scale
            u *= 1 - max(0, v) * 1.4
            loop.append((x + u, y + v, z + dz))
        loops.append(loop)
    parts.append(_loft('Mouse smooth contoured shell', loops, ivory, smooth=True))
    # Colour the shell's own side faces; a duplicate strip would be coplanar
    # with this vertical section and flicker at the runtime camera distance.
    parts[0].data.materials.append(rear)
    for polygon in list(parts[0].data.polygons)[n:2 * n]:
        polygon.material_index = 1
    # Thin surface seams follow the crown and distinguish the two mouse buttons.
    def seam(name, points):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = 0.00035
        curve.bevel_resolution = 1
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for point, coordinates in zip(spline.points, points):
            point.co = (*coordinates, 1)
        curve.materials.append(shadow)
        obj = bpy.data.objects.new(name, curve)
        bpy.data.collections['02_Desk'].objects.link(obj)
        parts.append(_tag(obj))
    # Project the two button seams onto the actual low-poly crown so they cannot
    # float above it or disappear below it after the shell is baked.
    bpy.context.view_layer.update()
    def on_crown(u, v):
        hit, point, _, _ = parts[0].ray_cast(Vector((x + u, y + v, z + 0.1)), Vector((0, 0, -1)))
        assert hit, 'Mouse seam must meet the shell'
        return (point.x, point.y, point.z + 0.0001)
    seam('Mouse button centre split', [on_crown(0, 0.008 + i * 0.042 / 12) for i in range(13)])
    seam('Mouse button shoulders', [on_crown(-0.027 + i * 0.054 / 18, 0.008) for i in range(19)])
    wheel = _cylinder('Mouse rubber scroll wheel', (x, y + 0.024, z + 0.032), 0.007, 0.008, dark, 24)
    wheel.rotation_euler[1] = math.pi / 2
    parts.append(wheel)
    return _join(parts, 'PC_Imported_Mouse')


def apply_desktop():
    """Replace desktop peripherals after the shared material pass, before baking."""
    screen = bpy.data.objects.get('PC_Interactive_Screen')
    assert screen is not None and screen.get('interaction_id') == 'pc-screen'
    remove = [obj for obj in bpy.data.collections['02_Desk'].objects if obj.name in (
        'PC_Imported_CRT', 'PC_Imported_Keyboard', 'PC_Imported_Mouse',
        'PC keyboard connected cord', 'PC mouse connected cord', 'PC monitor VGA lead', 'Task lamp connected mains')
        or obj.name.startswith('Floppy disk')]
    assert len(remove) == 13, 'Expected three old peripherals, four external desktop leads and six floppy parts'
    removed = [obj.name for obj in remove]
    for obj in remove:
        bpy.data.objects.remove(obj, do_unlink=True)
    ivory = _plastic('Desktop | softly aged ivory ABS', 'd0c8b4')
    rear = _plastic('Desktop | warm rear ABS and modifier keys', 'b6ac94', 0.57)
    shadow = _plastic('Desktop | recessed warm grey', '777265', 0.65, False)
    dark = _plastic('Desktop | dark rubber', '343732', 0.72, False)
    monitor = _monitor(screen, ivory, rear, shadow, dark)
    keyboard = _keyboard(ivory, rear, shadow)
    mouse = _mouse(ivory, rear, shadow, dark)
    report = {'removed': removed, 'reference': REFERENCE, 'geometry': 'Original procedural reconstruction', 'objects': []}
    for obj in (monitor, keyboard, mouse, screen):
        obj.data.calc_loop_triangles()
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        low = [min(point[i] for point in points) for i in range(3)]
        high = [max(point[i] for point in points) for i in range(3)]
        report['objects'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles), 'low': low, 'high': high})
    assert sum(row['triangles'] for row in report['objects']) < 13000, 'Desktop exceeded its authoring triangle budget'
    assert min(vertex.co.z for vertex in monitor.data.vertices) >= DESK_TOP - 0.0001
    assert abs(min(vertex.co.z for vertex in keyboard.data.vertices) - DESK_TOP) < 0.0001
    assert bpy.data.objects.get('PC 3.5 inch floppy drive'), 'Existing under-desk tower must remain'
    return report
