import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { characters, type SkillId, skills } from '@/content';
import { type PixelArtSheet, validatePixelArt } from '@/engine/gfx/PixelArt';
import { parseSpriteSheetSpec, specImageSize } from '@/engine/gfx/SpriteSheetSpec';
import { CUSTOMER_SHEET, HERO_SHEET, type SheetContract, SKILL_ICON_SHEET, strayHeroAnimations } from './contracts';
import type { SheetSource } from './module';
import { lookRegistry } from './registry';

/**
 * Every look folder in the repository, checked without a browser: modules
 * that declare the right piece, and sheets that meet their kind's contract
 * with PNGs the size their JSON describes. Drawing every look is covered end
 * to end in e2e/looks.spec.ts.
 */
const LOOKS_DIR = resolve(import.meta.dirname);
const ROOT = resolve(LOOKS_DIR, '../../../..');
const characterIds = characters.map((character) => character.id);
const skillIds = Object.keys(skills) as SkillId[];
const { offer } = lookRegistry;

describe('registered looks', () => {
  it('include classic for every hero, the customer and every skill', () => {
    for (const id of characterIds) expect(offer.characters[id]).toContain('classic');
    expect(offer.customer).toContain('classic');
    for (const id of skillIds) expect(offer.skills[id]).toContain('classic');
  });

  it('give every folder with art an index module, so nothing drawn goes unregistered', () => {
    const pieceFolders = readdirSync(LOOKS_DIR)
      .filter((name) => statSync(join(LOOKS_DIR, name)).isDirectory())
      .flatMap((look) => [
        ...subfolders(join(LOOKS_DIR, look, 'characters')),
        join(LOOKS_DIR, look, 'customer'),
        ...subfolders(join(LOOKS_DIR, look, 'skills')),
      ])
      .filter((folder) => exists(folder) && readdirSync(folder).some((file) => /\.(png|json)$/.test(file)));
    const unregistered = pieceFolders.filter((folder) => !readdirSync(folder).includes('index.ts'));
    expect(unregistered.map((folder) => relative(ROOT, folder))).toEqual([]);
  });

  it.each(characterIds.flatMap((id) => offer.characters[id].map((look) => [look, id] as const)))(
    '%s %s meets the hero contract',
    async (look, id) => {
      const module = await lookRegistry.hero(look, id);
      checkSheet(module.sheet, HERO_SHEET, `${look}/${id}`);
      // Beyond the eight, a hero sheet may only pose its own hero's skills: anything else would never play.
      expect(strayHeroAnimations(animationNames(module.sheet), id), `${look}/${id}`).toEqual([]);
      for (const source of Object.values(module.fx)) checkSheet(source, null, `${look}/${id} fx`);
    },
  );

  it.each(offer.customer)('%s customer meets the customer contract', async (look) => {
    const module = await lookRegistry.customer(look);
    checkSheet(module.sheet, CUSTOMER_SHEET, `${look}/customer`);
  });

  it.each(skillIds.flatMap((id) => offer.skills[id].map((look) => [look, id] as const)))(
    '%s %s meets the skill contract',
    async (look, id) => {
      const module = await lookRegistry.skill(look, id);
      if (module.icon) checkSheet(module.icon, SKILL_ICON_SHEET, `${look}/${id} icon`);
      else expect(look, 'only classic must have every icon').not.toBe('classic');
      for (const source of Object.values(module.fx)) checkSheet(source, null, `${look}/${id} fx`);
    },
  );
});

/** Pixel art must compile and play the kind's animations; an image sheet must also fit its frame, origin and PNG. */
function checkSheet(source: SheetSource, contract: SheetContract<string> | null, name: string): void {
  if (!('png' in source)) {
    const art = source as PixelArtSheet;
    expect(() => validatePixelArt(art, name)).not.toThrow();
    if (contract) expect(Object.keys(art.animations), name).toEqual(expect.arrayContaining([...contract.animations]));
    return;
  }
  const spec = parseSpriteSheetSpec(source.json, name);
  if (contract) {
    expect(
      spec.animations.map((animation) => animation.name),
      name,
    ).toEqual(expect.arrayContaining([...contract.animations]));
    expect(spec.frame, name).toEqual(contract.frame);
    expect(spec.origin, name).toEqual(contract.origin);
  }
  expect(pngSize(resolve(ROOT, `.${source.png}`)), name).toEqual(specImageSize(spec));
}

function animationNames(source: SheetSource): string[] {
  if ('png' in source)
    return parseSpriteSheetSpec(source.json, 'sheet.json').animations.map((animation) => animation.name);
  return Object.keys((source as PixelArtSheet).animations);
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('latin1'), `${file} is a PNG`).toBe('PNG');
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

function subfolders(dir: string): string[] {
  return exists(dir)
    ? readdirSync(dir)
        .map((name) => join(dir, name))
        .filter(exists)
    : [];
}

/** True for an existing directory. */
function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
