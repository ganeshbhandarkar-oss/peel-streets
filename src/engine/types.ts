/** Direction bits. A tile mask is an OR of these. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS = [N, E, S, W] as const;
export type Dir = (typeof DIRS)[number];

export type PathType = 'road' | 'rail' | 'pipe';
export const PATH_TYPES: PathType[] = ['road', 'rail', 'pipe'];

export type Shape = 'I' | 'L' | 'T' | 'X' | 'D';

/** One path segment printed on a sticker (a sticker may carry several types, e.g. a bridge). */
export interface Segment {
  type: PathType;
  mask: number;
}

/** A sticker layer on a tile. */
export interface Sticker {
  kind: 'sticker';
  id: number;
  segments: Segment[];
  /** Rigid stickers cannot be rotated, only flipped (mirrored left/right). */
  rigid: boolean;
  /** Pinned stickers cannot be peeled at all. */
  pinned: boolean;
  /** Junk stickers (litter) carry no path; peel them away to reveal what's under. */
  junk: boolean;
}

/** An unpeelable rubble layer: the tile can never take a sticker. */
export interface Rubble {
  kind: 'rubble';
  id: number;
}

export type Layer = Sticker | Rubble;

export type CellKind = 'ground' | 'block' | 'source' | 'dest';

export interface Cell {
  kind: CellKind;
  /** Bottom -> top. Only for ground cells. */
  stack: Layer[];
  /** For source/dest. */
  type?: PathType;
  dir?: number;
  pair?: number;
}

export interface LevelData {
  id: number;
  name: string;
  district: number;
  /** Optimal number of peels, verified by the solver. */
  par: number;
  /** Peel budget before the street jams. */
  moves: number;
  tip?: string;
  /** Rows of whitespace-separated cell tokens. See src/levels/README in the main README. */
  rows: string[];
  /** Optional finger hint for the tutorial: [fromRow, fromCol, toRow, toCol]. */
  hint?: [number, number, number, number];
}

export interface Board {
  w: number;
  h: number;
  cells: Cell[]; // row-major
}

export interface Pos {
  r: number;
  c: number;
}
