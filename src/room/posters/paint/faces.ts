import chewy from '@fontsource/chewy/files/chewy-latin-400-normal.woff2?url';
import nunito600 from '@fontsource/nunito/files/nunito-latin-600-normal.woff2?url';
import nunito800 from '@fontsource/nunito/files/nunito-latin-800-normal.woff2?url';
import silkscreen from '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2?url';

/**
 * The site's three faces as the designs use them (paint/kit.ts): the files the app's own @font-face rules point at
 * (src/app/main.tsx), so the painter's worker, which has no document to find them in, loads the same bytes.
 */
export const FACES: readonly (readonly [family: string, weight: string, url: string])[] = [
  ['Nunito', '800', nunito800],
  ['Nunito', '600', nunito600],
  ['Chewy', '400', chewy],
  ['Silkscreen', '400', silkscreen],
];
