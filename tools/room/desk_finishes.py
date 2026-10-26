"""Use the desk's existing cream enamel on its four imported drawer fronts.

The source desk is one mesh with UV-split vertices. Analyse a temporary welded
copy to identify the thin front panels, then change only their material indices
on the original mesh. Geometry, UVs, handles and other furniture stay intact.
"""

import bmesh
import bpy


def apply_desk_finishes():
    """Call after the shared material palette is styled, before the desk is baked."""
    desk = bpy.data.objects.get('Imported_desk_00_Cube__0')
    assert desk is not None and desk.type == 'MESH', 'Expected the revision-5 imported desk'
    enamel = bpy.data.materials['Paint | worn dove grey']
    enamel_index = next(
        (index for index, material in enumerate(desk.data.materials) if material == enamel),
        None,
    )
    assert enamel_index is not None, 'The desk must already use the shared cream enamel'

    mesh = bmesh.new()
    fronts = []
    try:
        mesh.from_mesh(desk.data)
        mesh.faces.ensure_lookup_table()
        source_index = mesh.faces.layers.int.new('Source polygon index')
        for face in mesh.faces:
            face[source_index] = face.index
        # This is an analysis copy: do not weld or rebuild the actual export geometry.
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.00001)
        seen = set()
        for vertex in mesh.verts:
            if vertex in seen:
                continue
            component, pending = {vertex}, [vertex]
            while pending:
                for edge in pending.pop().link_edges:
                    for neighbour in edge.verts:
                        if neighbour not in component:
                            component.add(neighbour)
                            pending.append(neighbour)
            seen.update(component)
            faces = {face for point in component for face in point.link_faces}
            coordinates = [desk.matrix_world @ point.co for point in component]
            low = [min(point[axis] for point in coordinates) for axis in range(3)]
            high = [max(point[axis] for point in coordinates) for axis in range(3)]
            width, depth, height = [high[axis] - low[axis] for axis in range(3)]
            materials = {desk.data.materials[face.material_index].name for face in faces}
            # Native Blender coordinates: +Y is towards the wall. These four shallow
            # panels sit in front of the drawer bodies. Handles are narrower than
            # 0.4 m, and the hidden backing sheet has zero depth, so neither matches.
            if (
                width > 0.4
                and 0.005 < depth < 0.03
                and 0.08 < height < 0.4
                and 1.38 < low[1] < high[1] < 1.43
                and materials <= {'Scene_-_Root', enamel.name}
            ):
                fronts.append([face[source_index] for face in faces])
    finally:
        mesh.free()

    # Three right-hand drawers and the wide central drawer, including panel edges.
    assert len(fronts) == 4 and sum(map(len, fronts)) == 44, 'Expected exactly four desk drawer fronts'
    for front in fronts:
        for index in front:
            desk.data.polygons[index].material_index = enamel_index
    desk['drawer_finish'] = 'Four cream enamel fronts matching the existing desk; original handles retained'
    return {'object': desk.name, 'fronts': len(fronts), 'faces': 44, 'material': enamel.name}
