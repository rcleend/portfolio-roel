// Supersampling is an offline bake detail: keep every atlas at its runtime size.

import { EXTTextureWebP } from '@gltf-transform/extensions';
import { compressTexture } from '@gltf-transform/functions';
import sharp from 'sharp';

export const REFINED_ROOM_ATLASES = ['01_TV_surfaces', '02_Desk_surfaces', '03_Room_window', '04_Drawer_surfaces'];

export async function compressBakedTextures(document, key) {
  document.createExtension(EXTTextureWebP).setRequired(true);
  for (const texture of document.getRoot().listTextures()) {
    const name = texture.getName();
    const furniture = REFINED_ROOM_ATLASES.some((atlas) => name.startsWith(atlas));
    const small =
      name.startsWith('device_tv_rear') ||
      name.startsWith('01_TV_plant') ||
      name.startsWith('product-engineer-cover') ||
      name.startsWith('game-cover-');
    const size = small || key === 'radio' ? 1024 : 2048;
    await compressTexture(texture, {
      encoder: sharp,
      targetFormat: 'webp',
      quality: furniture || ['tv', 'pc', 'radio'].includes(key) ? 94 : 90,
      resize: [size, size],
    });
  }
}
