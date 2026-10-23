import type { LevelId } from '@/content';

/**
 * The `layers.json` contract written by the art pipeline (tools/art/README.md).
 * Parsed and validated at startup so a malformed export fails loudly in one
 * place instead of drawing garbage somewhere in a level.
 */
export interface LevelArtManifest {
  readonly levelId: LevelId;
  /** Screen y of the play plane's ground top. */
  readonly groundY: number;
  /** Back to front. */
  readonly layers: readonly LayerSpec[];
  readonly tileset: TilesetSpec;
  readonly props: Readonly<Record<string, PropSpec>>;
  /** The play plane's palette (tiles, props), for UI accents that should match the stage. */
  readonly palette: readonly string[];
}

export interface LayerSpec {
  readonly id: string;
  readonly file: string;
  readonly factor: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly repeatX: boolean;
  readonly opaque: boolean;
  /** Drawn in front of the play plane. */
  readonly foreground: boolean;
}

export interface TilesetSpec {
  readonly file: string;
  readonly tileSize: number;
  /** Tile name → [column, row] in the tileset grid. */
  readonly tiles: Readonly<Record<string, readonly [number, number]>>;
}

export interface PropSpec {
  readonly file: string;
  readonly w: number;
  readonly h: number;
  /** Frames are laid out left to right. */
  readonly frames: number;
}

export function parseLevelArtManifest(raw: unknown, source: string): LevelArtManifest {
  const fail = (message: string): never => {
    throw new Error(`Invalid level art manifest ${source}: ${message}`);
  };
  const json = asRecord(raw) ?? fail('expected an object');
  const levelId = json.levelId;
  if (levelId !== 'luna' && levelId !== 'scripe') fail(`unknown levelId ${String(levelId)}`);

  const layers = (Array.isArray(json.layers) ? json.layers : fail('layers must be an array')).map((value, index) => {
    const layer = asRecord(value) ?? fail(`layers[${index}] must be an object`);
    return {
      id: str(layer.id) ?? fail(`layers[${index}].id`),
      file: str(layer.file) ?? fail(`layers[${index}].file`),
      factor: num(layer.factor) ?? fail(`layers[${index}].factor`),
      y: num(layer.y) ?? fail(`layers[${index}].y`),
      width: num(layer.width) ?? fail(`layers[${index}].width`),
      height: num(layer.height) ?? fail(`layers[${index}].height`),
      repeatX: layer.repeatX === true,
      opaque: layer.opaque === true,
      foreground: layer.foreground === true,
    } satisfies LayerSpec;
  });

  const tilesetJson = asRecord(json.tileset) ?? fail('tileset must be an object');
  const tilesJson = asRecord(tilesetJson.tiles) ?? fail('tileset.tiles must be an object');
  const tiles: Record<string, readonly [number, number]> = {};
  for (const [name, cell] of Object.entries(tilesJson)) {
    tiles[name] = gridCell(cell) ?? fail(`tileset.tiles.${name} must be [column, row]`);
  }

  const propsJson = asRecord(json.props) ?? fail('props must be an object');
  const props: Record<string, PropSpec> = {};
  for (const [name, value] of Object.entries(propsJson)) {
    const prop = asRecord(value) ?? fail(`props.${name} must be an object`);
    props[name] = {
      file: str(prop.file) ?? fail(`props.${name}.file`),
      w: num(prop.w) ?? fail(`props.${name}.w`),
      h: num(prop.h) ?? fail(`props.${name}.h`),
      frames: num(prop.frames) ?? fail(`props.${name}.frames`),
    };
  }

  return {
    levelId: levelId as LevelId,
    groundY: num(json.groundY) ?? fail('groundY'),
    layers,
    tileset: {
      file: str(tilesetJson.file) ?? fail('tileset.file'),
      tileSize: num(tilesetJson.tileSize) ?? fail('tileset.tileSize'),
      tiles,
    },
    props,
    palette: Array.isArray(json.palette)
      ? json.palette.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function gridCell(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [column, row]: unknown[] = value;
  return Number.isInteger(column) && Number.isInteger(row) ? [column as number, row as number] : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
