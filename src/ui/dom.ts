export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  return el;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export function starsHtml(n: number, max = 3, cls = '') {
  let s = '';
  for (let i = 0; i < max; i++) s += `<span class="star ${i < n ? 'on' : ''} ${cls}" style="--i:${i}">★</span>`;
  return s;
}

export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M14.8 5.2L8 12l6.8 6.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3.2l1.1 2.2a6.8 6.8 0 0 1 1.7.7l2.3-.8 1.6 2.7-1.6 1.6a6.9 6.9 0 0 1 0 1.8l1.6 1.6-1.6 2.7-2.3-.8a6.8 6.8 0 0 1-1.7.7L12 20.8l-1.1-2.2a6.8 6.8 0 0 1-1.7-.7l-2.3.8-1.6-2.7 1.6-1.6a6.9 6.9 0 0 1 0-1.8L5.3 8l1.6-2.7 2.3.8a6.8 6.8 0 0 1 1.7-.7L12 3.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19.6 3.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M12 3.5v17" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 2.4" stroke-linecap="round"/><path d="M9.2 6.2L3.4 17.2h5.8z" fill="currentColor"/><path d="M14.8 6.2l5.8 11h-5.8z" fill="currentColor" opacity="0.35" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M8.5 14.2L4 9.2l4.5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9.2h9.2a5.6 5.6 0 0 1 0 11.2H11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M12 3.2a5.5 5.5 0 0 0-3.2 10c.55.45.95 1.05.95 1.8h4.5c0-.75.4-1.35.95-1.8A5.5 5.5 0 0 0 12 3.2z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.4 17.4h5.2M10.2 19.8h3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ad: '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2"/><path d="M10.2 9.2l4.6 2.8-4.6 2.8z" fill="currentColor"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4.4 3.8v4.6h4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2.4" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
