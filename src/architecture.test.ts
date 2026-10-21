import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the import-boundary table in docs/ARCHITECTURE.md › Layers.
 * Each layer may import only from the layers listed for it; `room` may take
 * only *types* from `engine` (the GameSurface contract).
 */
type Layer = 'content' | 'engine' | 'game' | 'room' | 'app';

const ALLOWED: Readonly<Record<Layer, readonly Layer[]>> = {
  content: ['content'],
  engine: ['engine'],
  game: ['content', 'engine', 'game'],
  room: ['room'],
  app: ['content', 'engine', 'game', 'room', 'app'],
};
const TYPE_ONLY: Readonly<Partial<Record<Layer, readonly Layer[]>>> = { room: ['engine'] };

const SRC = resolve(import.meta.dirname);
const LAYERS = Object.keys(ALLOWED) as Layer[];

interface ImportSite {
  readonly file: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const IMPORT = /^\s*(?:import|export)\b(?:[^'";]*?\bfrom)?\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file: string): ImportSite[] {
  const source = readFileSync(file, 'utf8');
  const sites: ImportSite[] = [];
  for (const match of source.matchAll(IMPORT)) {
    sites.push({ file, specifier: match[1] as string, typeOnly: isTypeOnly(match[0]) });
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT))
    sites.push({ file, specifier: match[1] as string, typeOnly: false });
  return sites;
}

/** `import type …`, `export type …`, or `import { type A, type B } from …` erase at compile time. */
function isTypeOnly(statement: string): boolean {
  if (/^\s*(?:import|export)\s+type\s/.test(statement)) return true;
  const named = /^\s*import\s*\{([^}]*)\}\s*from/.exec(statement)?.[1];
  if (named === undefined) return false;
  const specifiers = named.split(',').filter((part) => part.trim());
  return specifiers.length > 0 && specifiers.every((part) => /^\s*type\s/.test(part));
}

function layerOfPath(path: string): Layer | null {
  const top = relative(SRC, path).split(sep)[0];
  return LAYERS.includes(top as Layer) ? (top as Layer) : null;
}

function targetLayer(site: ImportSite): Layer | null {
  if (site.specifier.startsWith('@/')) return layerOfPath(join(SRC, site.specifier.slice(2)));
  if (site.specifier.startsWith('.')) return layerOfPath(resolve(site.file, '..', site.specifier));
  return null; // npm package
}

describe('architecture boundaries', () => {
  const sites = LAYERS.flatMap((layer) => {
    try {
      return sourceFiles(join(SRC, layer)).flatMap(importsOf);
    } catch {
      return []; // the layer does not exist yet (e.g. room before the room crew lands)
    }
  });

  it('finds source files to check', () => {
    expect(sites.length).toBeGreaterThan(50);
  });

  it.each(LAYERS)('%s imports only from allowed layers', (layer) => {
    const violations = sites
      .filter((site) => layerOfPath(site.file) === layer)
      .flatMap((site) => {
        const target = targetLayer(site);
        if (target === null || ALLOWED[layer].includes(target)) return [];
        if (site.typeOnly && TYPE_ONLY[layer]?.includes(target)) return [];
        return [`${relative(SRC, site.file)} → ${site.specifier}`];
      });
    expect(violations).toEqual([]);
  });

  it('recognises type-only imports', () => {
    expect(isTypeOnly("import type { GameSurface } from '@/engine/core/GameSurface';")).toBe(true);
    expect(isTypeOnly("import { type A, type B } from './x';")).toBe(true);
    expect(isTypeOnly("import { type A, B } from './x';")).toBe(false);
    expect(isTypeOnly("import Default, { type A } from './x';")).toBe(false);
    expect(isTypeOnly("import './side-effect';")).toBe(false);
  });

  it('resolves aliases and relative paths to layers', () => {
    const file = join(SRC, 'engine', 'core', 'Game.ts');
    expect(targetLayer({ file, specifier: '@/game/createGame', typeOnly: false })).toBe('game');
    expect(targetLayer({ file, specifier: '../../content', typeOnly: false })).toBe('content');
    expect(targetLayer({ file, specifier: './Scene', typeOnly: false })).toBe('engine');
    expect(targetLayer({ file, specifier: 'three', typeOnly: false })).toBeNull();
  });

  it('keeps engine free of React, three.js and portfolio knowledge', () => {
    const engineSites = sites.filter((site) => layerOfPath(site.file) === 'engine');
    const forbidden = engineSites.filter((site) => /^(react|react-dom|three)(\/|$)/.test(site.specifier));
    expect(forbidden.map((site) => `${relative(SRC, site.file)} → ${site.specifier}`)).toEqual([]);
  });
});
