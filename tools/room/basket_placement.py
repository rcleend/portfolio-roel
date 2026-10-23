"""Ground the original lightweight basket and papers during offline authoring.

Rigid bodies exist only in a temporary Blender scene. The exported scene keeps
the original meshes and materials, with their settled transforms applied.
"""

import math
import random

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


CENTER = Vector((-2.47, 1.48, 0))
BASE_TOP = 0.031


def _body(obj, kind, shape):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.rigidbody.object_add()
    body = obj.rigid_body
    body.type = kind
    body.collision_shape = shape
    body.use_margin = True
    body.collision_margin = 0.0005
    body.friction = 0.8
    body.restitution = 0
    return body


def _proxy(name, vertices, faces, scene):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    _body(obj, 'PASSIVE', 'MESH')
    return obj


def _settled_transforms(papers):
    original_scene = bpy.context.window.scene
    scene = bpy.data.scenes.new('Temporary wastepaper settling')
    bpy.context.window.scene = scene
    copies = []
    try:
        # Closed bottom; the low-profile original base remains the visible floor.
        n = 48
        vertices = [tuple(CENTER + Vector((0.125 * math.cos(i * math.tau / n),
                                          0.125 * math.sin(i * math.tau / n), BASE_TOP)))
                    for i in range(n)]
        _proxy('Temporary basket bottom', vertices, [tuple(range(n))], scene)
        # The invisible wall follows the inside of the original tapered wires.
        vertices = [tuple(CENTER + Vector((r * math.cos(i * math.tau / n),
                                          r * math.sin(i * math.tau / n), z)))
                    for r, z in ((0.125, BASE_TOP), (0.154, 0.35)) for i in range(n)]
        _proxy('Temporary basket wall', vertices,
               [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)], scene)
        rng = random.Random(81)
        for index, paper in enumerate(papers):
            obj = paper.copy()
            obj.data = paper.data.copy()
            obj.parent = None
            scene.collection.objects.link(obj)
            obj.location = CENTER + Vector((rng.uniform(-0.055, 0.055),
                                             rng.uniform(-0.055, 0.055),
                                             0.43 + index * 0.105))
            bpy.context.view_layer.update()
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            body = _body(obj, 'ACTIVE', 'CONVEX_HULL')
            body.mass = 0.008
            body.linear_damping = 0.5
            body.angular_damping = 0.65
            copies.append(obj)
        scene.rigidbody_world.substeps_per_frame = 20
        scene.rigidbody_world.solver_iterations = 40
        scene.rigidbody_world.point_cache.frame_end = 300
        for frame in range(1, 301):
            scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        # Object scales were applied on the copies, so retain each source scale.
        transforms = []
        for paper, obj in zip(papers, copies):
            location, rotation, _ = obj.evaluated_get(depsgraph).matrix_world.decompose()
            transforms.append((location.copy(), rotation.copy()))
        return transforms
    finally:
        bpy.context.window.scene = original_scene
        for obj in list(scene.objects):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        # Rigid-body operator creates two helper collections in the temp scene.
        collections = list(scene.collection.children)
        bpy.data.scenes.remove(scene)
        for collection in collections:
            if collection.users == 0:
                bpy.data.collections.remove(collection)


def _close_contact_gaps(papers):
    """Seat the actual folded surfaces after convex-hull physics has settled.

    Bullet's hulls bridge small creases in the paper. A short downward projection
    closes those gaps without adding meshes or leaving papers hanging on hulls.
    """
    supported = []
    down = Vector((0, 0, -1))
    for obj in sorted(papers, key=lambda paper: paper.location.z):
        bpy.context.view_layer.update()
        vertices = [obj.matrix_world @ v.co for v in obj.data.vertices]
        faces = [tuple(face.vertices) for face in obj.data.polygons]
        samples = vertices + [(vertices[edge.vertices[0]] + vertices[edge.vertices[1]]) / 2
                              for edge in obj.data.edges]
        samples += [sum((vertices[i] for i in face), Vector()) / len(face) for face in faces]
        gap = min(v.z for v in vertices) - BASE_TOP
        for tree in supported:
            for point in samples:
                hit, _, _, distance = tree.ray_cast(point, down, max(gap, 0) + 0.001)
                if hit is not None:
                    gap = min(gap, distance)
        shift = max(0, gap - 0.0001)

        def shifted_tree(distance):
            return BVHTree.FromPolygons([v + down * distance for v in vertices], faces)

        # Edge-to-edge contact can happen before one of the sampled face points.
        low, high = 0, shift
        for _ in range(16):
            middle = (low + high) / 2
            tree = shifted_tree(middle)
            if any(tree.overlap(other) for other in supported):
                high = middle
            else:
                low = middle
        obj.location.z -= low
        supported.append(shifted_tree(low))


def settle_basket_papers():
    basket = [obj for obj in bpy.context.scene.objects
              if obj.name == 'Wastepaper basket base'
              or obj.name.startswith(('Basket wire', 'Basket circular wire'))]
    papers = sorted((obj for obj in bpy.context.scene.objects
                     if obj.name.startswith('Crumpled folded paper')), key=lambda obj: obj.name)
    assert len(basket) == 29 and len(papers) == 18, 'Original wastepaper geometry changed'
    for obj in basket:
        obj.location.x -= 0.17
    inside, outside = papers[:15], papers[15:]
    for paper, (location, rotation) in zip(inside, _settled_transforms(inside)):
        paper.location = location
        paper.rotation_mode = 'QUATERNION'
        paper.rotation_quaternion = rotation
    _close_contact_gaps(inside)
    # Keep all three original floor papers. The rear one clears the nearby can.
    outside[2].location.y = 1.20
    bpy.context.view_layer.update()
    vertices = [obj.matrix_world @ v.co for obj in inside for v in obj.data.vertices]
    lowest = min(v.z for v in vertices)
    highest = max(v.z for v in vertices)
    assert BASE_TOP - 0.002 <= lowest <= BASE_TOP + 0.003, f'Paper must reach basket floor: {lowest}'
    assert highest < 0.35, f'Paper escaped the basket: {highest}'
    assert max(v.x for v in vertices) < -2.225 - 0.05, 'Paper touches desk'
    assert min(v.x for v in vertices) > -2.715 + 0.04, 'Paper touches baseboard'
    basket_corners = [obj.matrix_world @ Vector(corner) for obj in basket for corner in obj.bound_box]
    assert max(v.x for v in basket_corners) < -2.225 - 0.05, 'Basket touches desk'
    assert min(v.x for v in basket_corners) > -2.715 + 0.04, 'Basket touches baseboard'
    print(f'BASKET_PLACEMENT {len(basket)} original basket parts, {len(inside)} settled papers, '
          f'{len(outside)} floor papers; pile z={lowest:.4f}–{highest:.4f}; no runtime physics', flush=True)
