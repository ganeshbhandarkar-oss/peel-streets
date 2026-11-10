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
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="currentColor"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4.9a7.4 7.4 0 0 0-1.7-1L15 3.4h-4L10.6 6a7.4 7.4 0 0 0-1.7 1l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-.9c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4.9 2-3.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2.5"/><path d="M9 6L3 18h6z" fill="currentColor"/><path d="M15 6l6 12h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ad: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};
