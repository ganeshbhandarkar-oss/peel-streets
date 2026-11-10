/** Afternoon-diorama palette. Paths stay the same in every district so connections read at a glance. */

export const PAL = {
  bg: '#f3e6d4',
  ground: '#f4e6d2',
  groundLine: '#e0cdb4',
  lot: '#f7f1e6',
  lotDash: '#b08960',
  paper: '#fffaf3',
  paperEdge: '#e4d3bf',
  paperBack: ['#f4efe6', '#b9c6d4'] as [string, string],
  shadow: 'rgba(62, 42, 28, 0.28)',
  /** Dark asphalt, yellow dash: reads as a road in grayscale. */
  road: '#3a4154',
  roadEdge: '#232836',
  roadHi: '#6a738c',
  roadLine: '#f0c84a',
  /** Light ballast + dark ties + twin rails: the opposite value pattern from asphalt. */
  railBed: '#e7cba8',
  railBedEdge: '#a06a3e',
  railTie: '#6e4128',
  railSteel: '#f5f8fc',
  railSteelDark: '#3e4c60',
  /** Cyan tube with a white highlight and a dark outline. */
  pipe: '#0e7eab',
  pipeHi: '#e7f7ff',
  pipeDark: '#064e6c',
  junk: '#f29ab0',
  junkDark: '#d45d78',
  junkDeep: '#a84360',
  rubble: '#b7aea3',
  rubbleDark: '#6f675f',
  rubbleHi: '#e4ddd4',
  rigid: '#e8a317',
  rigidDark: '#a86812',
  pin: '#e23b55',
  valid: '#1faf78',
  text: '#3a2e24',
  tree: '#6eaf62',
  treeDark: '#3f7d45',
};

export const TYPE_COLOR = { road: PAL.road, rail: PAL.railTie, pipe: PAL.pipe } as const;

export interface DistrictTheme {
  ground: string;
  groundDeep: string;
  grout: string;
  grass: string;
  grassDark: string;
  soil: string;
  leaf: string;
  leafDark: string;
  leafHi: string;
  pine: string;
  pineDark: string;
  bloom: string;
  bloomDark: string;
  water: string;
  waterDeep: string;
  wall: [string, string, string];
  wallSide: [string, string, string];
  roof: [string, string, string];
  roofDark: [string, string, string];
  trim: string;
  awning: [string, string];
  stone: string;
  stoneDark: string;
  ink: string;
}

export const THEMES: DistrictTheme[] = [
  {
    // Harbor Lane: sand, terracotta, sea-glass
    ground: '#f6e7d4',
    groundDeep: '#e7d2b6',
    grout: '#e0cdb4',
    grass: '#d5e7c2',
    grassDark: '#bdd6a4',
    soil: '#e2c39a',
    leaf: '#7fba62',
    leafDark: '#4c8642',
    leafHi: '#d2e7ae',
    pine: '#3f7a55',
    pineDark: '#2a5640',
    bloom: '#f2a3b5',
    bloomDark: '#d46b86',
    water: '#8fd0d2',
    waterDeep: '#2f8f9e',
    wall: ['#f7efe4', '#f3c7a8', '#fffaf3'],
    wallSide: ['#e4cbb0', '#e0a882', '#e7d9c6'],
    roof: ['#d4654a', '#2c4e6d', '#e3a06a'],
    roofDark: ['#a33c28', '#1b3348', '#b8743e'],
    trim: '#1f6f78',
    awning: ['#e07a4a', '#f6e1c8'],
    stone: '#f0e2d0',
    stoneDark: '#dcc4a8',
    ink: '#5a4034',
  },
  {
    // Old Market: plaster, brick, striped awnings
    ground: '#f1dec8',
    groundDeep: '#e2c7a4',
    grout: '#dcc3a4',
    grass: '#d7e0b2',
    grassDark: '#c0cc96',
    soil: '#d7b48a',
    leaf: '#6aa84f',
    leafDark: '#3d7636',
    leafHi: '#d7e7a6',
    pine: '#3d6b48',
    pineDark: '#274833',
    bloom: '#f0b3c4',
    bloomDark: '#d47890',
    water: '#7ec8c8',
    waterDeep: '#2f8f9a',
    wall: ['#f6e6cf', '#e7b89a', '#f8f0e4'],
    wallSide: ['#e0c4a4', '#cc9478', '#e6d4be'],
    roof: ['#a33b32', '#6e4632', '#c46a3a'],
    roofDark: ['#7a2822', '#4a2e22', '#944820'],
    trim: '#8a3e2b',
    awning: ['#e07a3d', '#2f6f62'],
    stone: '#e8d4ba',
    stoneDark: '#d2b48e',
    ink: '#4e3428',
  },
  {
    // Skyline Park: fog glass, slate, deep park green
    ground: '#e5f0ea',
    groundDeep: '#d2e3db',
    grout: '#c9dbd4',
    grass: '#cfe3c4',
    grassDark: '#b3cfa6',
    soil: '#d5c4a8',
    leaf: '#63a874',
    leafDark: '#3a7a50',
    leafHi: '#d4efc8',
    pine: '#2f6b58',
    pineDark: '#1d4c40',
    bloom: '#f2c1d0',
    bloomDark: '#d4899e',
    water: '#9fd4ea',
    waterDeep: '#3a8fbf',
    wall: ['#f5f8f8', '#d5e6f0', '#e7e3f3'],
    wallSide: ['#d5e0e8', '#b5cedc', '#d0cbe2'],
    roof: ['#4d6275', '#7d8d9c', '#3d6e88'],
    roofDark: ['#303e4c', '#596878', '#28485c'],
    trim: '#3d6e88',
    awning: ['#e8b84a', '#f7f3ea'],
    stone: '#e4eef2',
    stoneDark: '#c5d5de',
    ink: '#3c4650',
  },
];

export function themeFor(d: number): DistrictTheme {
  const n = THEMES.length;
  return THEMES[((d % n) + n) % n];
}
