/**
 * Analytics stub. No SDK: events go to window.__peelEvents and console.debug so QA can verify
 * the funnel (level_start -> level_complete / level_fail, ad + hint usage) in DevTools.
 */
export interface PeelEvent {
  name: string;
  t: number;
  [k: string]: unknown;
}

export function track(name: string, data: Record<string, unknown> = {}) {
  const ev: PeelEvent = { name, t: Date.now(), ...data };
  const w = globalThis as any;
  (w.__peelEvents ??= []).push(ev);
  if (typeof console !== 'undefined') console.debug('[peel-analytics]', name, data);
}
