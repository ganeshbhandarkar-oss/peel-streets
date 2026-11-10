import type { District } from '../levels';
import type { LevelData } from '../engine/types';

/**
 * District skyline as inline SVG: one building per level. Unsolved buildings are grey with
 * scaffolding; solving a level restores colour, lit windows and a rooftop flourish.
 */
const COLORS = ['#ffb4a2', '#ffd166', '#9be7c4', '#8fd3ff', '#c3b1ff', '#ff9fcf', '#ffc98b', '#a7e8ff'];
const ROOFS = ['#f07167', '#f4a261', '#2a9d8f', '#3a86ff', '#8b5cf6', '#e5579c', '#e9893b', '#22a6d6'];

export function districtSkyline(d: District, levels: LevelData[], stars: Record<number, number>): string {
  const W = 340;
  const H = 128;
  const n = levels.length;
  const bw = W / n;
  let parts = '';
  levels.forEach((lv, i) => {
    const solved = (stars[lv.id] ?? 0) > 0;
    const seed = (lv.id * 37 + d.id * 11) % 7;
    const h = 52 + ((seed * 13) % 46);
    const x = i * bw + 3;
    const w = bw - 6;
    const y = H - 14 - h;
    const body = solved ? COLORS[(i + d.id * 3) % COLORS.length] : '#d9d3cc';
    const roof = solved ? ROOFS[(i + d.id * 3) % ROOFS.length] : '#bfb7ae';
    parts += `<g class="bld ${solved ? 'on' : 'off'}" style="--d:${i * 60}ms">`;
    parts += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${body}"/>`;
    // roof variants
    if (seed % 3 === 0) parts += `<path d="M${x - 2} ${y + 2} L${x + w / 2} ${y - 14} L${x + w + 2} ${y + 2} Z" fill="${roof}"/>`;
    else if (seed % 3 === 1) parts += `<rect x="${x - 2}" y="${y - 6}" width="${w + 4}" height="9" rx="3" fill="${roof}"/>`;
    else parts += `<circle cx="${x + w / 2}" cy="${y}" r="${w / 3}" fill="${roof}"/>`;
    // windows
    for (let r = 0; r < Math.floor((h - 16) / 14); r++) {
      for (let c = 0; c < 2; c++) {
        const lit = solved && (r + c + seed) % 3 !== 0;
        parts += `<rect x="${x + 6 + c * (w / 2 - 2)}" y="${y + 10 + r * 14}" width="${w / 2 - 10}" height="7" rx="2" fill="${lit ? '#fff4b8' : solved ? 'rgba(255,255,255,0.55)' : '#bcb4ab'}"/>`;
      }
    }
    if (!solved) {
      // scaffolding lines
      parts += `<path d="M${x} ${y + h} L${x + w} ${y + 10} M${x + w} ${y + h} L${x} ${y + 10}" stroke="#a89f95" stroke-width="1.5" opacity="0.6"/>`;
    } else {
      parts += `<path d="M${x + w - 6} ${y - 4} v-12 l9 4 l-9 4" fill="#ff5d73" stroke="#a63c4c" stroke-width="1"/>`;
    }
    parts += `<text x="${x + w / 2}" y="${H - 2}" text-anchor="middle" class="bld-num">${lv.id}</text>`;
    parts += `</g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="skyline" role="img" aria-label="${d.name} skyline">
    <defs><linearGradient id="sky${d.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d.sky[0]}"/><stop offset="1" stop-color="${d.sky[1]}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="16" fill="url(#sky${d.id})"/>
    <circle cx="${W - 40}" cy="30" r="16" fill="#fff6c9" opacity="0.9"/>
    <rect y="${H - 16}" width="${W}" height="16" fill="#e8dccb"/>
    ${parts}
  </svg>`;
}
