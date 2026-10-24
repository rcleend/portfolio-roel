import { describe, expect, it } from 'vitest';
import { createLookRegistry, type LookModuleFiles } from './registry';

/** Index modules exporting `look`, keyed by path like `import.meta.glob` keys them. */
function files(paths: Partial<Record<keyof LookModuleFiles, Record<string, unknown>>>): LookModuleFiles {
  const importers = (looks: Record<string, unknown> = {}) =>
    Object.fromEntries(Object.entries(looks).map(([path, look]) => [path, async () => ({ look })]));
  return { heroes: importers(paths.heroes), customers: importers(paths.customers), skills: importers(paths.skills) };
}

const hero = (characterId: string) => ({ kind: 'hero', characterId });

describe('createLookRegistry', () => {
  it('offers, per piece, every look whose folder has it, in look order', () => {
    const registry = createLookRegistry(
      files({
        heroes: {
          './hibit/characters/hackerman/index.ts': hero('hackerman'),
          './classic/characters/hackerman/index.ts': hero('hackerman'),
          './classic/characters/artsy/index.ts': hero('artsy'),
        },
        customers: { './arcade/customer/index.ts': { kind: 'customer' } },
        skills: { './portrait/skills/power-chord/index.ts': { kind: 'skill', skillId: 'power-chord' } },
      }),
    );
    expect(registry.offer.characters).toEqual({ hackerman: ['classic', 'hibit'], artsy: ['classic'], strategy: [] });
    expect(registry.offer.customer).toEqual(['arcade']);
    expect(registry.offer.skills['power-chord']).toEqual(['portrait']);
    expect(registry.offer.skills['north-star']).toEqual([]);
  });

  it.each([
    [
      { customers: { './neon/customer/index.ts': {} } },
      'Look registry: looks/neon/customer/index.ts is in a folder for an unknown look "neon" (expected classic, arcade, portrait, hibit, terraria, terraria-revised, terraria-hooded)',
    ],
    [
      { heroes: { './arcade/characters/hackermann/index.ts': {} } },
      'Look registry: looks/arcade/characters/hackermann/index.ts is in a folder for an unknown hero "hackermann" (expected hackerman, artsy, strategy)',
    ],
    [
      { skills: { './arcade/skills/power-cord/index.ts': {} } },
      'is in a folder for an unknown skill "power-cord" (expected full-stack-attack, agent-summon, ux-elixir, power-chord, north-star, churn-shield)',
    ],
    [
      { heroes: { './arcade/characters/index.ts': {} } },
      'Look registry: ./arcade/characters/index.ts is not laid out as looks/<lookId>/characters/<characterId>/index.ts',
    ],
  ])('rejects a misplaced folder: %j', (paths, message) => {
    expect(() => createLookRegistry(files(paths))).toThrow(message);
  });

  it('imports a piece when asked and checks what it exports', async () => {
    const registry = createLookRegistry(
      files({
        heroes: {
          './arcade/characters/hackerman/index.ts': hero('hackerman'),
          './arcade/characters/artsy/index.ts': hero('hackerman'),
        },
        skills: { './arcade/skills/north-star/index.ts': undefined },
      }),
    );
    await expect(registry.hero('arcade', 'hackerman')).resolves.toMatchObject({ kind: 'hero' });
    await expect(registry.hero('arcade', 'artsy')).rejects.toThrow(
      "looks/arcade/characters/artsy/index.ts must export `look = defineHeroLook('artsy', …)`",
    );
    await expect(registry.skill('arcade', 'north-star')).rejects.toThrow(
      'looks/arcade/skills/north-star/index.ts must export `look` (see docs/LOOKS.md)',
    );
    await expect(registry.customer('hibit')).rejects.toThrow('looks/hibit/customer/index.ts is not registered');
  });
});
