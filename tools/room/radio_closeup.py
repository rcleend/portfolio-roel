"""The CD player's close-up: a 2K skin on the shipped UVs and the parts an open lid reveals.

Run after restyle.py, on the same room-source.blend bake.py reads (it is opened fresh and
never saved). Two stages, each in its own Blender process:

  skin     unwraps the radio exactly as bake.py does (so the atlas layout is the shipped one),
           exports radio-uvcheck-raw.glb for the node stage's UV-identity proof, and bakes the
           radio with its lid closed into a 2048² atlas (radio-skin-2k.png).
  closeup  separates the lid, opens it to OPEN_DEGREES about its hinge, models the original
           parts under it (lid underside, hinge, latch, well liner, turntable, pickup, magazine
           slot, screws), bakes them in the open pose into one 512² atlas and exports
           radio-closeup-raw.glb plus the measurements the runtime needs (radio-closeup.json).

  "$BLENDER_BIN" -b -t 8 --python-exit-code 1 --python tools/room/radio_closeup.py -- \\
    --work .context/room-build --stage skin --device METAL

Coordinates below are glTF's (x right, y up, z towards the viewer) unless named `b_*`;
Blender's are (x, -z, y). tools/room/radio-closeup.mjs turns the outputs into runtime files.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake import configure_bake, export, prepare_scene, select, shared_bake_target, unlit, unwrap  # noqa: E402

SKIN_SIZE = 2048
#: bake.py's own atlas size for the radio. The pack margin depends on it, so the 2K skin is
#: unwrapped at this size to land on the shipped layout and only baked at SKIN_SIZE.
SHIPPED_ATLAS = 1024
CLOSEUP_SIZE = 512
OPEN_DEGREES = 84.0

#: The lid's hinge: the x-parallel axis along its lower back edge (glTF y, z).
HINGE_Y, HINGE_Z = 1.044, -2.161
#: The lid: the one welded component of Part_04 with these bounds (glTF), ≥ 1,000 faces.
LID_PART = 'Radio_Imported_Part_04'
LID_BOUNDS = ((1.010, 1.0409, -2.1612), (1.213, 1.0822, -1.9386))
#: The CD's centre on the well floor (the lid's footprint centre), glTF x and z.
SPINDLE_X, SPINDLE_Z = 1.1115, -2.040
#: The magazine slot across the back of the well.
SLOT_Z, SLOT_MIN_X, SLOT_MAX_X = -2.115, 1.04, 1.18
#: The original model's LCD rectangle and OPR LED, from the source's emission map.
LCD_MIN, LCD_MAX = (0.9862, 1.0529), (1.0436, 1.0692)
LED_POINT = (0.974, 0.988)
#: The transport keys (Part_05 components): the rocker (▷II over ■) and the side keys.
KEY_PART = 'Radio_Imported_Part_05'
ROCKER_BOUNDS = ((1.0886, 1.0350, -1.8962), (1.1137, 1.0766, -1.8830))
KEY_TRAVEL = 0.0015
ROCKER_TILT_DEGREES = 4.0

CREAM = (0.80, 0.80, 0.78)
CHARCOAL = (0.0230, 0.0242, 0.0284)  # sRGB #2a2b30
LINER = (0.0137, 0.0144, 0.0175)  # sRGB #1f2024
SPINDLE_GREY = (0.0423, 0.0452, 0.0545)  # sRGB #3a3c42
LENS_BLUE = (0.0103, 0.0232, 0.0908)  # sRGB #1a2a55


def b(x, y, z):
    """glTF → Blender coordinates."""
    return Vector((x, -z, y))


def to_gltf(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def radio_objects(collections):
    """The radio's meshes in bake.py's order: its unwrap packs islands in selection order."""
    return [obj for collection in collections for obj in collection.objects
            if obj.type == 'MESH' and obj.get('hero_asset') == 'radio']


def open_scene(work, samples, device):
    bpy.ops.wm.open_mainfile(filepath=str(work / 'room-source.blend'))
    scene = bpy.context.scene
    configure_bake(scene, samples, device)
    return scene, prepare_scene(scene)


def bake_into(objects, image, margin):
    scene = bpy.context.scene
    scene.render.bake.margin = margin
    for material in {m for obj in objects for m in obj.data.materials if m}:
        node = material.node_tree.nodes.get('BAKE_TARGET') or material.node_tree.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE_TARGET'
        node.image = image
        material.node_tree.nodes.active = node
    with shared_bake_target(objects) as targets:
        select(targets)
        bpy.ops.object.bake(type='COMBINED')
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape(-1, 4)[:, :3]
    assert np.isfinite(rgb).all(), (image.name, 'Non-finite bake')
    assert (rgb.max(axis=1) > 0.0002).mean() > 0.015, (image.name, 'Empty bake')
    return rgb


def save_png(image, path):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    image.save_render(str(path), scene=scene)


def stage_skin(args, work):
    _, collections = open_scene(work, args.samples, args.device)
    radio = radio_objects(collections)
    assert len(radio) == 7, f'Expected the seven radio meshes, found {len(radio)}'
    unwrap(radio, SHIPPED_ATLAS)
    print('UV_READY radio', SHIPPED_ATLAS, len(radio), flush=True)
    path = work / 'radio-skin-2k.png'
    if not args.skip_bake:
        target = bpy.data.images.new('radio_skin_2k', width=SKIN_SIZE, height=SKIN_SIZE, alpha=False,
                                     float_buffer=True)
        print('BAKE_START radio-skin-2k', flush=True)
        # bake.py's 10 px margin at 1024², at the same texel scale.
        bake_into(radio, target, margin=20)
        save_png(target, path)
        print('BAKE_DONE radio-skin-2k', flush=True)
    # Exactly what bake.py exports for radio-raw.glb, so the node stage can compare the UVs.
    texture = bpy.data.images.load(str(path), check_existing=True) if path.exists() else \
        bpy.data.images.new('uvcheck', width=4, height=4)
    material = unlit('device_radio_BAKED', texture, uv='BakedUV')
    for obj in radio:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        for layer in list(obj.data.uv_layers):
            if layer.name != 'BakedUV':
                obj.data.uv_layers.remove(layer)
        obj.name += '_base'
    export(radio, work / 'radio-uvcheck-raw.glb')
    print('EXPORT_DONE radio-uvcheck-raw.glb', flush=True)



def srgb(hex_colour):
    """A '#rrggbb' swatch as scene-linear RGBA, as restyle.py's palette is converted."""
    channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return (*linear, 1.0)


def abs_material(name, colour, roughness, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = srgb(colour)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return material


def link_mesh(name, bm, material):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return obj


def frame(axis):
    """A rotation taking local +Z to `axis` (Blender coordinates)."""
    return axis.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()


def lathe(bm, centre, axis, profile, segments):
    """Revolves (radius, height) points, bottom to top, about `axis` through `centre`.

    A radius of 0 closes that end with a fan; a profile's open ends stay open.
    """
    transform = Matrix.Translation(centre) @ frame(axis)
    rings = []
    for radius, height in profile:
        if radius <= 1e-7:
            rings.append([bm.verts.new(transform @ Vector((0, 0, height)))])
            continue
        rings.append([bm.verts.new(transform @ Vector((radius * math.cos(2 * math.pi * k / segments),
                                                         radius * math.sin(2 * math.pi * k / segments), height)))
                      for k in range(segments)])
    for lower, upper in zip(rings, rings[1:]):
        for k in range(segments):
            k1 = (k + 1) % segments
            if len(lower) == 1:
                bm.faces.new((lower[0], upper[k], upper[k1]))
            elif len(upper) == 1:
                bm.faces.new((lower[k], upper[0], lower[k1]))
            else:
                bm.faces.new((lower[k], lower[k1], upper[k1], upper[k]))
    return rings


def oriented_box(bm, centre, half, rotation):
    """A box of half-extents `half` (local x, y, z) rotated by `rotation` (3×3) about `centre`."""
    corners = {}
    for i in range(8):
        local = Vector((half[0] * (1 if i & 1 else -1), half[1] * (1 if i & 2 else -1), half[2] * (1 if i & 4 else -1)))
        corners[i] = bm.verts.new(centre + rotation @ local)
    for quad in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
        bm.faces.new([corners[i] for i in quad])


def split_component(obj, bounds, name, min_faces):
    """Moves the welded component of `obj` whose world bounds match `bounds` (glTF, ±2 mm) into its own object."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    parent = list(range(len(bm.verts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    welded = {}
    for vertex in bm.verts:
        key = tuple(round(c / 1e-4) for c in vertex.co)
        if key in welded:
            parent[find(vertex.index)] = find(welded[key])
        else:
            welded[key] = vertex.index
    for edge in bm.edges:
        a, c = find(edge.verts[0].index), find(edge.verts[1].index)
        if a != c:
            parent[a] = c
    components = {}
    for face in bm.faces:
        components.setdefault(find(face.verts[0].index), []).append(face)
    lo = b(*bounds[0])
    hi = b(*bounds[1])
    lo, hi = Vector(map(min, lo, hi)), Vector(map(max, lo, hi))
    matches = []
    for faces in components.values():
        points = [v.co for face in faces for v in face.verts]
        c_lo = Vector(map(min, *points)) if len(points) > 1 else points[0]
        c_hi = Vector(map(max, *points)) if len(points) > 1 else points[0]
        if all(abs(c_lo[i] - lo[i]) < 0.002 and abs(c_hi[i] - hi[i]) < 0.002 for i in range(3)):
            matches.append([face.index for face in faces])
    bm.free()
    assert len(matches) == 1 and len(matches[0]) >= min_faces, (name, [len(m) for m in matches])
    select([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for index in matches[0]:
        obj.data.polygons[index].select = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    part = next(o for o in bpy.context.selected_objects if o != obj)
    part.name = name
    return part


class Well:
    """The tub under the lid, measured by ray casts against the radio without its lid."""

    def __init__(self, radio):
        verts, polys = [], []
        for obj in radio:
            base = len(verts)
            verts.extend(v.co.copy() for v in obj.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in obj.data.polygons)
        self.tree = BVHTree.FromPolygons(verts, polys)
        # The tub floor is a plane rising towards the front; fit it on a grid inside the lid's footprint.
        samples = []
        for x in np.linspace(1.03, 1.19, 9):
            for z in np.linspace(-2.13, -1.96, 9):
                samples.append((x, z, self.down(x, z)))
        design = np.array([[x, z, 1.0] for x, z, _ in samples])
        heights = np.array([y for *_, y in samples])
        (self.ax, self.az, self.a0), *_ = np.linalg.lstsq(design, heights, rcond=None)
        residual = float(np.sqrt(np.mean((design @ np.array([self.ax, self.az, self.a0]) - heights) ** 2)))
        assert residual < 0.0015, ('The tub floor is not a plane', residual)
        normal = Vector((-self.ax, 1.0, -self.az)).normalized()
        self.normal = normal  # glTF
        print('WELL floor slope %.2f°, rms %.2f mm' % (math.degrees(math.atan(self.az)), residual * 1000), flush=True)

    def down(self, x, z, start=1.2):
        hit, *_ = self.tree.ray_cast(b(x, start, z), Vector((0, 0, -1)))
        assert hit is not None, ('No surface under', x, z)
        return hit.z

    def floor(self, x, z):
        return self.ax * x + self.az * z + self.a0

    def front(self, x, y, start=-1.7):
        """The first surface hit looking at the radio's front from +z, and its normal (glTF)."""
        hit, normal, *_ = self.tree.ray_cast(b(x, y, start), Vector((0, 1, 0)))
        assert hit is not None, ('Nothing in front at', x, y)
        return hit, normal


#: The lid opening (the lid's footprint) and the liner, 4 mm inside it.
OPENING = (1.010, 1.213, -2.161, -1.939)
LINER_INSET = 0.004
LINER_LIFT = 0.0005
TURNTABLE_RADIUS, TURNTABLE_HEIGHT = 0.014, 0.004
SPINDLE_RADIUS, SPINDLE_HEIGHT = 0.0073, 0.0032
PICKUP = (SPINDLE_X - 0.010, SPINDLE_X + 0.010, SPINDLE_Z + 0.016, SPINDLE_Z + 0.061)
SLOT_HALF = 0.001
LID_SKIN = 0.0025


def rim_height(z):
    """The opening's rim, which follows the lid's slope from 1.0425 at the back to 1.081 at the front."""
    return 1.0425 + (z + 2.165) * (1.081 - 1.0425) / (2.165 - 1.936)


def liner(well, material):
    """Floor, walls and a flange out to the opening, with holes for the magazine slit and the pickup."""
    bm = bmesh.new()
    x0, x1, z0, z1 = OPENING[0] + LINER_INSET, OPENING[1] - LINER_INSET, OPENING[2] + LINER_INSET, OPENING[3] - LINER_INSET
    lift = lambda x, z: well.floor(x, z) + LINER_LIFT  # noqa: E731
    holes = [(SLOT_MIN_X, SLOT_MAX_X, SLOT_Z - SLOT_HALF, SLOT_Z + SLOT_HALF), PICKUP]
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    vert = {}

    def v(x, z, y=None):
        key = (round(x, 6), round(z, 6), None if y is None else round(y, 6))
        if key not in vert:
            vert[key] = bm.verts.new(b(x, lift(x, z) if y is None else y, z))
        return vert[key]

    for xa, xb in zip(xs, xs[1:]):
        for za, zb in zip(zs, zs[1:]):
            cx, cz = (xa + xb) / 2, (za + zb) / 2
            if any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            bm.faces.new((v(xa, zb), v(xb, zb), v(xb, za), v(xa, za)))
    # Each hole: walls down into the radio and a floor, so it reads as a real opening. Faces wind
    # counter-clockwise seen from where they are seen: floors from above, walls from inside.
    for depth, (hx0, hx1, hz0, hz1) in zip((0.008, 0.0035), holes):
        drop = lambda x, z, depth=depth: lift(x, z) - depth  # noqa: E731
        corners = [(hx0, hz1), (hx1, hz1), (hx1, hz0), (hx0, hz0)]
        for (ax, az), (cx, cz) in zip(corners, corners[1:] + corners[:1]):
            bm.faces.new((v(cx, cz), v(cx, cz, drop(cx, cz)), v(ax, az, drop(ax, az)), v(ax, az)))
        bm.faces.new([v(x, z, drop(x, z)) for x, z in corners])
    # Walls up to the rim, then a flange out to the opening's edge.
    ring = [(x0, z1), (x1, z1), (x1, z0), (x0, z0)]
    outer = [(OPENING[0], OPENING[3]), (OPENING[1], OPENING[3]), (OPENING[1], OPENING[2]), (OPENING[0], OPENING[2])]
    floor_points = [p for p in vert if p[2] is None]
    for i in range(4):
        (ax, az), (cx, cz) = ring[i], ring[(i + 1) % 4]
        (ox, oz), (px, pz) = outer[i], outer[(i + 1) % 4]
        top_a, top_c = v(ax, az, rim_height(az)), v(cx, cz, rim_height(cz))
        # The floor's own vertices along this edge, so the wall meets it without cracks.
        edge = sorted((p for p in floor_points if _between(p, (ax, az), (cx, cz))),
                      key=lambda p: (p[0] - ax) ** 2 + (p[1] - az) ** 2)
        bm.faces.new([top_a, top_c, *(vert[p] for p in reversed(edge))])
        bm.faces.new((v(ox, oz, rim_height(oz)), v(px, pz, rim_height(pz)), top_c, top_a))
    return link_mesh('CD_Liner', bm, material)


def _between(p, a, c):
    """True when (x, z) point `p` lies on the segment a–c."""
    px, pz = p[0], p[1]
    cross = (c[0] - a[0]) * (pz - a[1]) - (c[1] - a[1]) * (px - a[0])
    if abs(cross) > 1e-9:
        return False
    dot = (px - a[0]) * (c[0] - a[0]) + (pz - a[1]) * (c[1] - a[1])
    return -1e-9 <= dot <= (c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 + 1e-9



def floor_basis(well):
    """Blender-space axes of the well floor: x along the radio, y towards its back, z the floor's normal."""
    normal = Vector((well.normal.x, -well.normal.z, well.normal.y))
    across = Vector((1, 0, 0))
    across = (across - normal * across.dot(normal)).normalized()
    return Matrix((across, normal.cross(across), normal)).transposed(), normal


def on_floor(well, x, z, height):
    """The point `height` above the liner floor at (x, z), along the floor's normal (Blender)."""
    _, normal = floor_basis(well)
    return b(x, well.floor(x, z) + LINER_LIFT, z) + normal * height


def turntable(well, material):
    """Turntable, spindle cap and the three ball-clamp nubs that grip a disc's hole."""
    bm = bmesh.new()
    _, normal = floor_basis(well)
    base = on_floor(well, SPINDLE_X, SPINDLE_Z, 0)
    t, r, s, h = TURNTABLE_HEIGHT, TURNTABLE_RADIUS, SPINDLE_RADIUS, SPINDLE_HEIGHT
    lathe(bm, base, normal, [(r, -0.0004), (r, t - 0.0006), (r - 0.0006, t), (s + 0.0006, t), (s, t + 0.0004),
                             (s, t + h - 0.0012), (s - 0.0016, t + h), (0, t + h + 0.0002)], 40)
    basis, _ = floor_basis(well)
    for k in range(3):
        angle = 2 * math.pi * k / 3 + math.pi / 6
        centre = base + basis @ Vector((math.cos(angle) * (s - 0.0002), math.sin(angle) * (s - 0.0002), t + h * 0.55))
        lathe(bm, centre, normal, [(0, -0.001), (0.0007, -0.0007), (0.001, 0), (0.0007, 0.0007), (0, 0.001)], 8)
    return link_mesh('CD_Turntable', bm, material)


def pickup(well, sled_material, lens_material, rail_material):
    """The optical pickup in its slot: two guide rails along the slot, a sled and its lens."""
    basis, normal = floor_basis(well)
    x0, x1, z0, z1 = PICKUP
    floor = -0.0035
    rails = bmesh.new()
    for x in (x0 + 0.0035, x1 - 0.0035):
        start = on_floor(well, x, z1 - 0.001, floor + 0.0012)
        end = on_floor(well, x, z0 + 0.001, floor + 0.0012)
        lathe(rails, start, end - start, [(0, 0), (0.001, 0), (0.001, (end - start).length), (0, (end - start).length)], 8)
    sled = bmesh.new()
    centre = on_floor(well, SPINDLE_X, (z0 + z1) / 2 + 0.006, floor + 0.0026)
    oriented_box(sled, centre, (0.0075, 0.006, 0.0012), basis)
    lens = bmesh.new()
    lathe(lens, centre + normal * 0.0012, normal, [(0.0024, 0), (0.0024, 0.0004), (0.002, 0.0009), (0.0012, 0.0013),
                                                   (0, 0.0015)], 20)
    return [link_mesh('CD_PickupRails', rails, rail_material), link_mesh('CD_PickupSled', sled, sled_material),
            link_mesh('CD_PickupLens', lens, lens_material)]


def slot_lips_and_screws(well, material, screw_material):
    basis, normal = floor_basis(well)
    lips = bmesh.new()
    for side in (-1, 1):
        z = SLOT_Z + side * (SLOT_HALF + 0.0005)
        centre = on_floor(well, (SLOT_MIN_X + SLOT_MAX_X) / 2, z, 0.0005)
        oriented_box(lips, centre, ((SLOT_MAX_X - SLOT_MIN_X) / 2 + 0.001, 0.0005, 0.0005), basis)
    screws = bmesh.new()
    x0, x1, z0, z1 = OPENING[0] + LINER_INSET, OPENING[1] - LINER_INSET, OPENING[2] + LINER_INSET, OPENING[3] - LINER_INSET
    for x, z in ((x0 + 0.007, z0 + 0.007), (x1 - 0.007, z0 + 0.007), (x0 + 0.007, z1 - 0.007), (x1 - 0.007, z1 - 0.007)):
        lathe(screws, on_floor(well, x, z, 0), normal,
              [(0.0015, -0.0002), (0.0015, 0.0004), (0.0011, 0.0008), (0, 0.001)], 12)
    return [link_mesh('CD_SlotLips', lips, material), link_mesh('CD_Screws', screws, screw_material)]


def hinge_barrels(material):
    bm = bmesh.new()
    for x in (1.03, 1.19):
        lathe(bm, b(x - 0.007, HINGE_Y, HINGE_Z), Vector((1, 0, 0)),
              [(0, 0), (0.0025, 0), (0.003, 0.0005), (0.003, 0.0135), (0.0025, 0.014), (0, 0.014)], 14)
    return link_mesh('CD_HingeBarrels', bm, material)


class LidPlane:
    """The closed lid's top surface as a plane, fitted to its up-facing faces (glTF)."""

    def __init__(self, lid):
        points = [p.center for p in lid.data.polygons if p.normal.z > 0.8]
        design = np.array([[c.x, -c.y, 1.0] for c in points])
        heights = np.array([c.z for c in points])
        (self.ax, self.az, self.a0), *_ = np.linalg.lstsq(design, heights, rcond=None)
        self.normal = Vector((-self.ax, 1.0, -self.az)).normalized()

    def inner(self, x, z, below=0.0):
        """A point on the underside skin (LID_SKIN under the top), `below` further down its normal (Blender)."""
        top = b(x, self.ax * x + self.az * z + self.a0, z)
        down = -Vector((self.normal.x, -self.normal.z, self.normal.y))
        return top + down * (LID_SKIN / self.normal.y + below)

    def basis(self):
        up = Vector((self.normal.x, -self.normal.z, self.normal.y))
        across = Vector((1, 0, 0))
        across = (across - up * across.dot(up)).normalized()
        return Matrix((across, up.cross(across), up)).transposed()


def lid_underside(lid, material):
    """The lid's moulded inside: its shell thickened 2.5 mm inwards, keeping only the new inner skin and rim."""
    skin = lid.copy()
    skin.data = lid.data.copy()
    skin.name = 'CD_LidSkin'
    bpy.context.scene.collection.objects.link(skin)
    select([skin])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.dissolve_limited(angle_limit=math.radians(3))
    bpy.ops.object.mode_set(mode='OBJECT')
    skin.data.materials.clear()
    skin.data.materials.append(material)
    skin.data.materials.append(material)
    for polygon in skin.data.polygons:
        polygon.material_index = 0
    modifier = skin.modifiers.new('inner skin', 'SOLIDIFY')
    modifier.thickness = LID_SKIN
    modifier.offset = -1
    modifier.use_even_offset = True
    modifier.use_rim = True
    modifier.material_offset = 1
    modifier.material_offset_rim = 1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == 0], context='FACES')
    for face in bm.faces:
        face.material_index = 0
    bm.to_mesh(skin.data)
    bm.free()
    skin.data.materials.pop(index=1)
    return skin


def lid_fittings(plane, material):
    """Two moulded ribs across the skin, the clamp puck over the spindle and the latch hook at the front."""
    basis = plane.basis()
    down = -basis.col[2].to_3d()
    bm = bmesh.new()
    for z in (-2.118, -1.972):
        oriented_box(bm, plane.inner(1.1115, z, 0.001), (0.088, 0.0015, 0.001), basis)
    lathe(bm, plane.inner(SPINDLE_X, SPINDLE_Z, -0.0002), down,
          [(0.017, 0), (0.017, 0.0024), (0.0162, 0.0032), (0.009, 0.0032), (0.0085, 0.0036), (0, 0.0036)], 40)
    hook = plane.inner(SPINDLE_X, -1.947, 0.0015)
    oriented_box(bm, hook, (0.004, 0.002, 0.0015), basis)
    oriented_box(bm, hook + down * 0.0012 + basis.col[1].to_3d() * -0.0016, (0.004, 0.0008, 0.0006), basis)
    return link_mesh('CD_LidFittings', bm, material)


def stage_closeup(args, work):
    _, collections = open_scene(work, args.samples, args.device)
    radio = radio_objects(collections)
    lid = split_component(next(o for o in radio if o.name == LID_PART), LID_BOUNDS, 'CD_Lid', 1000)
    well = Well(radio)
    plane = LidPlane(lid)
    charcoal = abs_material('CD inner ABS', '#2a2b30', 0.55)
    liner_abs = abs_material('CD well liner', '#1f2024', 0.6)
    spindle = abs_material('CD turntable', '#3a3c42', 0.4)
    lens = abs_material('CD pickup lens', '#1a2a55', 0.1)
    steel = abs_material('CD rails and screws', '#8b8e95', 0.35, metallic=1.0)
    cream = abs_material('CD hinge ABS', '#c9c8c2', 0.5)
    lid_parts = [lid_underside(lid, charcoal), lid_fittings(plane, charcoal)]
    well_parts = [liner(well, liner_abs), turntable(well, spindle), *pickup(well, liner_abs, lens, steel),
                  *slot_lips_and_screws(well, liner_abs, steel), hinge_barrels(cream)]
    parts = lid_parts + well_parts
    triangles = sum(len(p.vertices) - 2 for obj in parts for p in obj.data.polygons)
    print('PARTS', len(parts), 'triangles', triangles, flush=True)
    assert triangles <= 4000, ('The close-up parts exceed their geometry budget', triangles)

    hinge = b(SPINDLE_X, HINGE_Y, HINGE_Z)
    opening = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-OPEN_DEGREES), 4, 'X') @ \
        Matrix.Translation(-hinge)
    for obj in [lid, *lid_parts]:
        obj.matrix_world = opening @ obj.matrix_world
    unwrap(parts, CLOSEUP_SIZE)
    path = work / 'device_radio_cd.png'
    if not args.skip_bake:
        image = bpy.data.images.new('device_radio_cd_bake', width=CLOSEUP_SIZE, height=CLOSEUP_SIZE, alpha=False,
                                    float_buffer=True)
        print('BAKE_START device_radio_cd', flush=True)
        bake_into(parts, image, margin=4)
        save_png(image, path)
        print('BAKE_DONE device_radio_cd', flush=True)
    if args.render:
        render_preview(work, lid, parts)
    texture = bpy.data.images.load(str(path), check_existing=True) if path.exists() else \
        bpy.data.images.new('device_radio_cd', width=4, height=4)
    material = unlit('device_radio_cd_BAKED', texture, uv='BakedUV')
    for obj in parts:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        for layer in list(obj.data.uv_layers):
            if layer.name != 'BakedUV':
                obj.data.uv_layers.remove(layer)
    # The underside travels with the lid: export it in the closed pose, for the runtime's hinge.
    for obj in lid_parts:
        obj.matrix_world = opening.inverted() @ obj.matrix_world
    lid_inner = join(lid_parts, 'Radio_CD_LidInner')
    well_node = join(well_parts, 'Radio_CD_Well')
    export([lid_inner, well_node], work / 'radio-closeup-raw.glb')
    measurements = measure(well, radio, lid, opening)
    (work / 'radio-closeup.json').write_text(json.dumps(measurements, indent=2) + '\n')
    print('EXPORT_DONE radio-closeup-raw.glb', flush=True)


def join(objects, name):
    select(objects)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def measure(well, radio, lid, opening):
    """What the runtime needs before it can pivot, press and light anything (glTF metres)."""
    keys = next(o for o in radio if o.name == KEY_PART)
    rocker_lo, rocker_hi = ROCKER_BOUNDS
    cx, cy = (rocker_lo[0] + rocker_hi[0]) / 2, (rocker_lo[1] + rocker_hi[1]) / 2
    face, face_normal = well.front(cx, cy)
    panel = Vector((face_normal.x, face_normal.z, -face_normal.y)).normalized()
    lcd_centre = ((LCD_MIN[0] + LCD_MAX[0]) / 2, (LCD_MIN[1] + LCD_MAX[1]) / 2)
    lcd_hit, lcd_normal = well.front(*lcd_centre)
    led_hit, led_normal = well.front(*LED_POINT)
    led_n = Vector((led_normal.x, led_normal.z, -led_normal.y)).normalized()
    seat = on_floor(well, SPINDLE_X, SPINDLE_Z, TURNTABLE_HEIGHT)
    lid_points = [opening.inverted() @ (lid.matrix_world @ v.co) for v in lid.data.vertices]
    lo = Vector(map(min, *lid_points))
    hi = Vector(map(max, *lid_points))
    del keys
    return {
        'hinge': {'point': [SPINDLE_X, HINGE_Y, HINGE_Z], 'axis': [1, 0, 0], 'openDegrees': OPEN_DEGREES},
        'rocker': {'pivot': [round(cx, 5), round(cy, 5), round(-face.y - 0.003, 5)], 'axis': [1, 0, 0],
                   'tiltDegrees': ROCKER_TILT_DEGREES},
        'keyTravel': {'axis': [round(-c, 5) for c in panel], 'metres': KEY_TRAVEL},
        'turntable': {'centre': to_gltf(seat), 'seatY': round(seat.z, 5),
                      'normal': [round(c, 5) for c in well.normal]},
        'slot': {'z': SLOT_Z, 'minX': SLOT_MIN_X, 'maxX': SLOT_MAX_X,
                 'floorY': round(well.floor((SLOT_MIN_X + SLOT_MAX_X) / 2, SLOT_Z) + LINER_LIFT, 5)},
        'well': {'minX': OPENING[0] + LINER_INSET, 'maxX': OPENING[1] - LINER_INSET,
                 'minZ': OPENING[2] + LINER_INSET, 'maxZ': OPENING[3] - LINER_INSET,
                 'floor': [round(well.ax, 6), round(well.az, 6), round(well.a0 + LINER_LIFT, 6)]},
        'lcd': {'min': list(LCD_MIN), 'max': list(LCD_MAX), 'z': round(-lcd_hit.y, 5),
                'normal': [round(c, 5) for c in Vector((lcd_normal.x, lcd_normal.z, -lcd_normal.y)).normalized()]},
        'led': {'point': [LED_POINT[0], LED_POINT[1], round(-led_hit.y + 0.0003 * led_n.z, 5)],
                'normal': [round(c, 5) for c in led_n], 'radius': 0.0015},
        'lidBounds': [to_gltf(Vector((lo.x, hi.y, lo.z))), to_gltf(Vector((hi.x, lo.y, hi.z)))],
    }


def render_preview(work, lid, parts):
    """A Cycles still from the radio view's direction, for judging the bake against the room."""
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    camera_data = bpy.data.cameras.new('radio preview')
    camera = bpy.data.objects.new('radio preview', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.angle_y = math.radians(30)
    target = Vector((1.06, 1.16, -2.0))
    direction = Vector((0, -math.sin(math.radians(24)), -math.cos(math.radians(24))))
    eye = target - direction * 0.996
    camera.location = b(*eye)
    camera.rotation_euler = (b(*target) - b(*eye)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(work / 'radio-closeup-preview.png')
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', required=True)
    parser.add_argument('--stage', choices=('skin', 'closeup'), required=True)
    parser.add_argument('--samples', type=int, default=48)
    parser.add_argument('--device', choices=('CPU', 'METAL'), default='CPU')
    parser.add_argument('--skip-bake', action='store_true', help='Unwrap and export only (UV checks)')
    parser.add_argument('--render', action='store_true', help='closeup: also render a Cycles preview')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    work = Path(args.work).resolve()
    if args.stage == 'skin':
        stage_skin(args, work)
    else:
        stage_closeup(args, work)


if __name__ == '__main__':
    main()
