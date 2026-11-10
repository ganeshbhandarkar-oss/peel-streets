import type { District } from '../levels';
import type { LevelData } from '../engine/types';
import { themeFor } from '../render/palette';

/**
 * District skyline as inline SVG: one building per level, in the same afternoon-diorama
 * language as the board (house, shop, tower, factory, station). Unsolved plots stay
 * grey under scaffolding. Solving a level restores colour, lit windows and a roof detail.
 */
const KINDS = ['house', 'shop', 'tower', 'factory', 'station'] as const;

export function districtSkyline(d: District, levels: LevelData[], stars: Record<number, number>): string {
  const W = 340;
  const H = 132;
  const n = levels.length;
  const bw = W / n;
  const base = H - 28;
  const th = themeFor(d.id);
  let back = '';
  if (d.id === 0) {
    back += `<rect x="0" y="${base - 10}" width="${W}" height="16" fill="${th.water}" opacity="0.95"/>`;
    back += `<path d="M0 ${base - 4} q 20 -4 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.55"/>`;
  } else if (d.id === 2) {
    back += `<path d="M0 ${base} Q 90 ${base - 22} 180 ${base} T ${W} ${base} V ${base} Z" fill="${th.grass}" opacity="0.85"/>`;
  }
  let parts = '';
  levels.forEach((lv, i) => {
    const solved = (stars[lv.id] ?? 0) > 0;
    const kind = KINDS[(i + d.id * 2) % KINDS.length];
    const wi = (i + d.id) % 3;
    const wall = solved ? th.wall[wi] : '#d5d0c8';
    const side = solved ? th.wallSide[wi] : '#c4beb4';
    const roof = solved ? th.roof[wi] : '#b7b0a6';
    const roofD = solved ? th.roofDark[wi] : '#9c958c';
    const baseH = kind === 'tower' ? 76 : kind === 'station' ? 54 : kind === 'factory' ? 46 : kind === 'shop' ? 44 : 52;
    const h = baseH + ((lv.id * 5) % 8) - 3;
    const x = i * bw + 5;
    const w = bw - 10;
    const y = base - h;
    const win = (rx: number, ry: number, rw: number, rh: number, lit: boolean) => {
      const delay = `${(i * 0.17 + rx * 0.01) % 2}s`;
      const fill = !solved ? '#b7b0a6' : lit ? '#ffe7a3' : 'rgba(255,255,255,0.7)';
      const cls = solved && lit ? 'lit' : '';
      return `<rect class="${cls}" style="--w:${delay}" x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="1.4" fill="${fill}"/>`;
    };
    parts += `<g class="bld ${solved ? 'on' : 'off'}" style="--d:${i * 60}ms">`;
    parts += `<rect x="${x + w * 0.72}" y="${y + 4}" width="${w * 0.28}" height="${h - 2}" fill="${side}"/>`;
    parts += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${wall}" stroke="${roofD}" stroke-width="0.6"/>`;
    if (kind === 'house') {
      parts += `<path d="M${x - 2} ${y + 3} L${x + w / 2} ${y - 12} L${x + w + 2} ${y + 3} Z" fill="${roof}" stroke="${roofD}" stroke-width="0.6"/>`;
      parts += `<rect x="${x + w * 0.68}" y="${y - 10}" width="4" height="12" fill="${roofD}"/>`;
      if (solved) parts += `<circle class="smoke" cx="${x + w * 0.7}" cy="${y - 14}" r="2.2" fill="#fff" opacity="0.8"/>`;
    } else if (kind === 'shop') {
      parts += `<rect x="${x - 1}" y="${y - 4}" width="${w + 2}" height="6" rx="1" fill="${roof}"/>`;
      const aw = th.awning;
      for (let k = 0; k < 4; k++) {
        parts += `<rect x="${x + (w / 4) * k}" y="${y + 8}" width="${w / 4 + 0.4}" height="7" fill="${solved ? (k % 2 ? aw[0] : aw[1]) : '#c8c2b8'}"/>`;
      }
    } else if (kind === 'tower') {
      parts += `<rect x="${x - 1}" y="${y - 4}" width="${w + 4}" height="6" fill="${roof}"/>`;
      parts += `<rect x="${x + w * 0.42}" y="${y - 16}" width="3" height="14" fill="${roofD}"/>`;
      if (solved) parts += `<circle class="lit" cx="${x + w * 0.45}" cy="${y - 18}" r="2" fill="#ffe7a3"/>`;
    } else if (kind === 'factory') {
      parts += `<rect x="${x - 1}" y="${y - 4}" width="${w + 2}" height="6" fill="${roofD}"/>`;
      parts += `<rect x="${x + w - 8}" y="${y - 18}" width="6" height="16" fill="${solved ? '#8d8a86' : '#b0aaa2'}"/>`;
      if (solved) {
        parts += `<circle class="smoke" style="animation-delay:.2s" cx="${x + w - 5}" cy="${y - 22}" r="2.4" fill="#fff"/>`;
        parts += `<circle class="smoke" style="animation-delay:.9s" cx="${x + w - 2}" cy="${y - 26}" r="1.8" fill="#fff"/>`;
      }
    } else {
      parts += `<path d="M${x - 2} ${y + 10} Q ${x + w / 2} ${y - 14} ${x + w + 2} ${y + 10} Z" fill="${roof}"/>`;
      parts += `<circle cx="${x + w / 2}" cy="${y + 16}" r="4.5" fill="#fff" stroke="${roofD}" stroke-width="0.7"/>`;
    }
    const rows = Math.max(1, Math.min(4, Math.floor((h - 18) / 12)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        const lit = solved && (r + c + lv.id) % 3 !== 0;
        parts += win(x + 4 + c * (w / 2 - 1), y + 12 + r * 12, Math.max(4, w / 2 - 8), 6, lit);
      }
    }
    if (!solved) {
      parts += `<path d="M${x} ${y + h} L${x + w} ${y + 8} M${x + w} ${y + h} L${x} ${y + 8}" stroke="#9a9186" stroke-width="1.3" opacity="0.7"/>`;
    } else if (kind !== 'factory') {
      parts += `<path d="M${x + w - 5} ${y - 2} v-9 l7 3.2 l-7 3.2" fill="#e23b55"/>`;
    }
    parts += `<text x="${x + w / 2}" y="${base + 11}" text-anchor="middle" class="bld-num">${lv.id}</text>`;
    parts += `</g>`;
  });
  const ground = `<rect x="0" y="${base}" width="${W}" height="12" fill="${th.stone}"/>`;
  const street = `<rect x="0" y="${base + 12}" width="${W}" height="16" fill="#3a4154"/>
    <line x1="10" y1="${base + 20}" x2="${W - 10}" y2="${base + 20}" stroke="#f0c84a" stroke-width="2" stroke-dasharray="7 6"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="skyline" role="img" aria-label="${d.name} skyline">
    <defs><linearGradient id="sky${d.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d.sky[0]}"/><stop offset="1" stop-color="${d.sky[1]}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="16" fill="url(#sky${d.id})"/>
    <circle cx="${W - 36}" cy="24" r="18" fill="#ffe7a3" opacity="0.35"/>
    <circle cx="${W - 36}" cy="24" r="11" fill="#ffe7a3"/>
    <g class="cloud"><ellipse cx="48" cy="30" rx="16" ry="7" fill="#fff" opacity="0.9"/><ellipse cx="60" cy="27" rx="10" ry="6" fill="#fff"/></g>
    ${back}
    ${ground}
    ${street}
    ${parts}
  </svg>`;
}
