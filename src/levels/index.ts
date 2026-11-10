import raw from './levels.json';
import sols from './solutions.json';
import type { LevelData } from '../engine/types';
import type { Move } from '../engine/grid';

export const LEVELS: LevelData[] = raw as LevelData[];
export const SOLUTIONS: Record<string, Move[]> = sols as unknown as Record<string, Move[]>;

export interface District {
  id: number;
  name: string;
  blurb: string;
  sky: [string, string];
}

export const DISTRICTS: District[] = [
  { id: 0, name: 'Harbor Lane', blurb: 'Get the garages driving again.', sky: ['#ffe3c7', '#ffd1dc'] },
  { id: 1, name: 'Old Market', blurb: 'Trams and cars, side by side.', sky: ['#d9f2ff', '#e6dcff'] },
  { id: 2, name: 'Skyline Park', blurb: 'Water, rails and roads, all at once.', sky: ['#d8fbe9', '#cfe8ff'] },
];

export const levelsOf = (district: number) => LEVELS.filter((l) => l.district === district);
export const levelById = (id: number) => LEVELS.find((l) => l.id === id);
