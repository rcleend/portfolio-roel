# Rug authoring inputs

- `rug-source.glb`: the supplied **Rug - Square pattern** by
  [Sousinho](https://sketchfab.com/3d-models/rug-square-pattern-e45054df5644444ebca0670d75a6cf93),
  licensed CC BY 4.0 according to its embedded metadata. The original file is retained
  here; `rug.py` performs the square sizing, placement, 15° rotation and material changes.
- `rug-geometric.png`: a 1254 × 1254 square albedo map, generated with the built-in
  OpenAI image generation tool from the user's attached bedroom/rug reference.
  The source photograph is a visual reference only and is not redistributed.

The runtime receives the rendered rug inside the shared floor atlas. These files
are authoring inputs, not additional browser downloads. The folded underside has
its own plain wool material; it does not use the printed top texture.

## Generation prompt

> Transform the rug pattern and textile appearance in the supplied reference photograph into a production-ready SQUARE rug albedo texture for a 3D model. Output one perfectly square 2048x2048 image, exact flat orthographic top-down view, with the textile filling the entire image edge to edge. Extract the artistic language of the rug only: a balanced patchwork of large squares and diagonal half-square triangles, approximately a 5 by 5 grid, in teal blue, light aqua, mustard yellow, muted leaf green, rust orange, warm ivory and charcoal grey. Use the reference's cheerful modern geometric composition and soft dense woven tufted pile, with fine restrained textile fibers, while creating a coherent original square arrangement. Flat neutral diffuse colour/albedo, uniform illumination across the surface, enough subtle fiber detail for close views, no directional shadows, no highlights, no vignette. This is a texture map, not a photograph of a rug lying in a room: no perspective, no folded corner, no surrounding floor, no background, no furniture, no bed, no props, no border, no tassels, no text or watermark. The 3D geometry will supply the folded corner and lighting separately.

The tool returned a 1254 px square image; that original resolution is retained.
