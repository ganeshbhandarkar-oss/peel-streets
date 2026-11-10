import { sfx, haptic } from '../audio/sfx';
import { boardKey, GameSession, starsFor } from '../engine/game';
import { applyMove, findPath, pairsOf, parseLevel, type Move } from '../engine/grid';
import { solve } from '../engine/solver';
import type { LevelData, Pos } from '../engine/types';
import { BoardInput } from '../input/pointer';
import { DISTRICTS, LEVELS, levelById, levelsOf, SOLUTIONS } from '../levels';
import { track } from '../meta/analytics';
import { districtSkyline } from '../meta/map';
import { isUnlocked, loadProgress, recordResult, resetProgress, saveProgress, totalStars, type Progress } from '../meta/progress';
import { BoardView } from '../render/board';
import { $, h, ICON, starsHtml } from './dom';

const FREE_HINTS = 1;

const car = (x: number, body: string, roof: string, rot: number) =>
  `<g transform="translate(${x} 24) rotate(${rot})"><ellipse cx="1" cy="7" rx="16" ry="6" fill="rgba(60,40,20,0.18)"/><circle cx="-9" cy="-8" r="2.5" fill="#2c2622"/><circle cx="7" cy="-8" r="2.5" fill="#2c2622"/><circle cx="-9" cy="8" r="2.5" fill="#2c2622"/><circle cx="7" cy="8" r="2.5" fill="#2c2622"/><rect x="-15" y="-8" width="30" height="16" rx="6" fill="${body}"/><rect x="-5" y="-5.5" width="11" height="11" rx="2.5" fill="${roof}"/><rect x="12" y="-6" width="3" height="3.2" rx="0.8" fill="#fff4c2"/><rect x="12" y="2.8" width="3" height="3.2" rx="0.8" fill="#fff4c2"/></g>`;
const JAM_SVG = `<svg viewBox="0 0 180 48" width="180" height="48" style="margin:0 auto">${car(30, '#e24d68', '#ffd0d8', -8)}${car(90, '#e8b84a', '#fff6d4', 6)}${car(150, '#3dbaa4', '#e7fff8', -4)}<text x="58" y="14" font-size="15" font-weight="900" fill="#e23b55">!</text><text x="118" y="14" font-size="15" font-weight="900" fill="#e23b55">!</text></svg>`;
const LEVEL_IDS = LEVELS.map((l) => l.id);

export class App {
  root: HTMLElement;
  progress: Progress;
  qaUnlock = false;
  session: GameSession | null = null;
  view!: BoardView;
  input!: BoardInput;
  hintsLeft = FREE_HINTS;
  busy = false;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.progress = loadProgress();
    sfx.enabled = this.progress.sound;
    const params = new URLSearchParams(location.search);
    this.qaUnlock = params.has('unlock');
    this.root.innerHTML = this.shell();
    this.view = new BoardView($('#board') as HTMLCanvasElement);
    this.input = new BoardInput(this.view, {
      board: () => this.session!.board,
      enabled: () => !!this.session && this.session.status === 'playing' && !this.busy && !this.modalOpen(),
      onPeelStart: () => {
        this.view.hint = null;
        this.view.tutorialHint = null;
        sfx.play('peel');
        haptic(8);
      },
      onLift: () => {
        sfx.play('lift');
        const hd = this.view.held;
        if (hd) this.view.burst(hd.x, hd.y + this.view.cell * 0.3, 8, 'dust');
      },
      onPlace: (m, fx, fy) => this.place(m, fx, fy),
      onCancel: () => sfx.play('snap'),
      onDeny: (p, why) => this.deny(p, why),
      onHeldChange: () => this.syncHud(),
    });
    this.bind();
    window.addEventListener('resize', () => this.view.resize());
    new ResizeObserver(() => this.view.resize()).observe($('.board-wrap'));
    const lv = Number(params.get('level'));
    if (lv && levelById(lv)) this.play(lv);
    else this.showMap();
    this.exposeDebug();
    (window as any).__app = this;
    (window as any).__view = this.view;
  }

  syncHudPublic() {
    this.syncHud();
  }

  private shell() {
    return `
    <section id="screen-map" class="screen"></section>
    <section id="screen-game" class="screen hidden">
      <header class="topbar">
        <button class="icon-btn" data-act="map" aria-label="Back to map">${ICON.back}</button>
        <div class="title"><div class="lvl-num" id="lvl-num"></div><div class="lvl-name" id="lvl-name"></div></div>
        <div class="peels" id="peels" title="Peels left"><svg class="peel-ico" viewBox="0 0 24 24"><path d="M4 4h14a2 2 0 0 1 2 2v8l-6 6H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fffaf3" stroke="#e4d3bf" stroke-width="1.4"/><path d="M20 14h-5a2 2 0 0 0-2 2v5" fill="#d5e0ea" stroke="#b7c4d2" stroke-width="1"/><path d="M3 12h12" stroke="#3a4154" stroke-width="3.2" stroke-linecap="round"/><path d="M5 12h8" stroke="#f0c84a" stroke-width="1" stroke-dasharray="1.6 1.4" stroke-linecap="round"/></svg><b id="peels-n">0</b></div>
      </header>
      <div class="tip hidden" id="tip"></div>
      <div class="board-wrap"><canvas id="board"></canvas><div class="toast" id="toast"></div></div>
      <div class="status-line" id="status-line">Tap or drag a sticker to peel it</div>
      <div class="dock">
      <div class="heldbar hidden" id="heldbar">
        <button class="tool" data-act="rotate">${ICON.rotate}<span>Rotate</span></button>
        <button class="tool" data-act="flip">${ICON.flip}<span>Flip</span></button>
        <button class="tool ghost" data-act="cancel">${ICON.close}<span>Put back</span></button>
      </div>
      <footer class="bottombar" id="bottombar">
        <button class="pill" data-act="undo">${ICON.undo}<span>Undo</span><i class="badge" id="undo-n"></i></button>
        <button class="pill" data-act="hint">${ICON.hint}<span>Hint</span><i class="badge" id="hint-n"></i></button>
        <button class="pill ad" data-act="ad-peels">${ICON.ad}<span>+3 Peels</span><i class="mock">MOCK AD</i></button>
        <button class="pill" data-act="restart">${ICON.restart}<span>Retry</span></button>
      </footer>
      </div>
    </section>
    <div id="modal-root"></div>`;
  }

  private bind() {
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act!;
      const id = Number(t.dataset.id);
      sfx.play('click');
      this.action(act, id);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.session || $('#screen-game').classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === 'r') this.action('rotate');
      else if (k === 'f') this.action('flip');
      else if (k === 'escape') this.modalOpen() ? this.closeModal() : this.action('cancel');
      else if (k === 'z') this.action('undo');
      else if (k === 'h') this.action('hint');
    });
  }

  private action(act: string, id = 0) {
    switch (act) {
      case 'map':
        this.closeModal();
        this.showMap();
        break;
      case 'play':
        this.closeModal();
        this.play(id);
        break;
      case 'next': {
        this.closeModal();
        const i = LEVEL_IDS.indexOf(this.session!.level.id);
        if (i + 1 < LEVEL_IDS.length) this.play(LEVEL_IDS[i + 1]);
        else this.showMap();
        break;
      }
      case 'rotate':
        if (this.input.rotate()) sfx.play('rotate');
        break;
      case 'flip':
        if (this.input.flip()) {
          sfx.play('flip');
          haptic(6);
        }
        break;
      case 'cancel':
        this.input.cancel();
        break;
      case 'undo':
        this.undo();
        break;
      case 'hint':
        this.hint();
        break;
      case 'ad-peels':
        this.mockAd('+3 peels', () => {
          this.session?.addPeels();
          track('ad_rewarded_mock', { reward: 'peels', level: this.session?.level.id });
          this.toast('+3 peels!');
          sfx.play('coin');
          this.syncHud();
        });
        break;
      case 'jam-ad':
        this.closeModal();
        this.action('ad-peels');
        break;
      case 'jam-undo':
        this.closeModal();
        this.undo();
        break;
      case 'restart':
        this.closeModal();
        if (this.session) this.play(this.session.level.id);
        break;
      case 'settings':
        this.settings();
        break;
      case 'close':
        this.closeModal();
        break;
      case 'sound':
        this.progress.sound = !this.progress.sound;
        sfx.enabled = this.progress.sound;
        saveProgress(this.progress);
        this.settings();
        break;
      case 'qa-unlock':
        this.qaUnlock = !this.qaUnlock;
        this.settings();
        this.renderMap();
        break;
      case 'reset':
        this.confirmReset();
        break;
      case 'reset-yes':
        this.progress = resetProgress();
        this.closeModal();
        this.toast('Progress reset');
        this.showMap();
        break;
    }
  }

  // ---------- map ----------
  showMap() {
    this.view.stop();
    this.session = null;
    $('#screen-game').classList.add('hidden');
    $('#screen-map').classList.remove('hidden');
    this.renderMap();
  }

  private unlocked(id: number) {
    return this.qaUnlock || isUnlocked(this.progress, LEVEL_IDS, id);
  }

  private nextLevelId(): number {
    for (const id of LEVEL_IDS) if (!(this.progress.stars[id] > 0)) return id;
    return LEVEL_IDS[LEVEL_IDS.length - 1];
  }

  renderMap() {
    const el = $('#screen-map');
    const stars = totalStars(this.progress);
    const next = this.nextLevelId();
    const cards = DISTRICTS.map((d) => {
      const lvls = levelsOf(d.id);
      const done = lvls.filter((l) => this.progress.stars[l.id] > 0).length;
      const locked = !this.unlocked(lvls[0].id);
      const nodes = lvls
        .map((l) => {
          const st = this.progress.stars[l.id] ?? 0;
          const open = this.unlocked(l.id);
          return `<button class="node ${st ? 'done' : ''} ${open ? '' : 'locked'} ${l.id === next ? 'current' : ''}" data-act="${open ? 'play' : ''}" data-id="${l.id}" aria-label="Level ${l.id}">
            ${open ? `<b>${l.id}</b>` : ICON.lock}<span class="mini-stars">${starsHtml(st)}</span></button>`;
        })
        .join('');
      return `<article class="district d-${d.id} ${locked ? 'locked' : ''} ${done === lvls.length ? 'complete' : ''}">
        <div class="d-head"><div><h2>${d.name}</h2><p>${d.blurb}</p></div><div class="d-prog">${done}/${lvls.length}<small>restored</small></div></div>
        ${districtSkyline(d, lvls, this.progress.stars)}
        <div class="nodes">${nodes}</div>
      </article>`;
    }).join('');
    el.innerHTML = `
      <header class="map-top">
        <div class="logo"><span class="logo-peel">Peel</span><span class="logo-streets">Streets</span></div>
        <div class="map-right"><div class="star-total">★ ${stars}<small>/${LEVELS.length * 3}</small></div>
        <button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
      </header>
      <button class="play-big" data-act="play" data-id="${next}">Play level ${next}<small>${levelById(next)!.name}</small></button>
      <div class="districts">${cards}</div>
      <p class="foot">Prototype build · all art & sound generated in code · ads are mocked</p>`;
  }

  // ---------- game ----------
  play(id: number) {
    const lv = levelById(id);
    if (!lv) return;
    this.session = new GameSession(lv);
    this.hintsLeft = FREE_HINTS;
    this.busy = false;
    $('#screen-map').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    this.view.resetFx();
    this.input.reset();
    this.view.setScene(lv.id, lv.district);
    this.view.setBoard(this.session.board);
    this.view.resize();
    this.view.start();
    this.view.tutorialHint = lv.hint ? { from: { r: lv.hint[0], c: lv.hint[1] }, to: { r: lv.hint[2], c: lv.hint[3] } } : null;
    $('#lvl-num').textContent = `Level ${lv.id} · ${DISTRICTS[lv.district].name}`;
    $('#lvl-name').textContent = lv.name;
    const tip = $('#tip');
    if (lv.tip) {
      tip.textContent = lv.tip;
      tip.classList.remove('hidden');
    } else tip.classList.add('hidden');
    this.syncHud();
    track('level_start', { level: lv.id, par: lv.par, budget: lv.moves });
  }

  private syncHud() {
    const s = this.session;
    if (!s) return;
    $('#peels-n').textContent = String(s.movesLeft);
    const peels = $('#peels');
    peels.classList.toggle('low', s.movesLeft <= 1);
    $('#undo-n').textContent = s.undosLeft > 0 ? String(s.undosLeft) : 'AD';
    $('#hint-n').textContent = this.hintsLeft > 0 ? String(this.hintsLeft) : 'AD';
    const holding = !!this.view.held;
    $('#heldbar').classList.toggle('hidden', !holding);
    $('#bottombar').classList.toggle('hidden', holding);
    const rigid = holding && this.view.held!.sticker.rigid;
    ($('[data-act="rotate"]', $('#heldbar')) as HTMLButtonElement).classList.toggle('disabled', rigid);
    $('#status-line').textContent = holding
      ? rigid
        ? 'Stiff sticker: flip it, then tap a glowing spot'
        : 'Rotate or flip, then tap a glowing spot (or drag it there)'
      : `Par ${s.level.par} · ${s.movesUsed} peel${s.movesUsed === 1 ? '' : 's'} used`;
  }

  place(m: Move, fx: number, fy: number) {
    const s = this.session!;
    const res = s.place(m);
    this.view.setBoard(s.board);
    if (res.kind === 'noop') {
      this.view.land(m.to, fx, fy);
      sfx.play('snap');
      this.syncHud();
      return;
    }
    this.view.land(m.to, fx, fy);
    sfx.play('snap');
    haptic(15);
    this.view.shake(2.5);
    const [cx, cy] = this.view.center(m.to);
    this.view.burst(cx, cy + this.view.cell * 0.3, 10, 'dust');
    this.syncHud();
    if (res.solved) this.onSolved();
    else if (res.jammed) this.onJam();
  }

  private onSolved() {
    const s = this.session!;
    this.busy = true;
    const paths = pairsOf(s.board).map((p) => ({ type: p.type, cells: findPath(s.board, p)! }));
    this.view.startSolve(paths);
    sfx.play('solve');
    haptic([20, 40, 30]);
    this.view.shake(5);
    for (const p of pairsOf(s.board)) {
      const [x, y] = this.view.center(p.dest);
      setTimeout(() => this.view.burst(x, y, 46), 1250);
    }
    const stars = s.stars();
    const improved = recordResult(this.progress, s.level.id, stars);
    saveProgress(this.progress);
    track('level_complete', { level: s.level.id, moves: s.movesUsed, par: s.level.par, stars, improved });
    setTimeout(() => this.winModal(stars), 1900);
  }

  private onJam() {
    const s = this.session!;
    sfx.play('jam');
    haptic([40, 30, 40]);
    this.view.shake(9);
    track('level_fail', { level: s.level.id, moves: s.movesUsed, reason: 'out_of_peels' });
    setTimeout(() => this.jamModal(), 450);
  }

  private undo() {
    const s = this.session;
    if (!s) return;
    if (this.view.held) this.input.cancel();
    if (!s.canUndo()) {
      this.toast('Nothing to undo');
      return;
    }
    const doUndo = (viaAd: boolean) => {
      s.undo(viaAd);
      this.view.setBoard(s.board);
      this.view.shake(1.5);
      sfx.play('flip');
      track('undo', { level: s.level.id, viaAd });
      this.syncHud();
    };
    if (s.undosLeft > 0) doUndo(false);
    else this.mockAd('an undo', () => doUndo(true));
  }

  /** Hint: use the stored optimal line if we're on it, else ask the solver in a worker (capped). */
  private async hint() {
    const s = this.session;
    if (!s || this.busy) return;
    if (this.view.held) this.input.cancel();
    const give = async () => {
      const mv = await this.findHint();
      if (this.session !== s) return false;
      if (!mv) {
        this.toast('No quick hint from here. Try Undo or Retry.');
        return false;
      }
      this.view.hint = { from: mv.from, to: mv.to, segments: mv.segments, t0: performance.now() };
      track('hint_used', { level: s.level.id });
      return true;
    };
    if (this.hintsLeft > 0) {
      if (await give()) this.hintsLeft--;
      this.syncHud();
    } else this.mockAd('a hint', () => void give());
  }

  /** Next move on the stored optimal line, if the board is on it. */
  lineHint(): Move | null {
    const s = this.session!;
    const sol = SOLUTIONS[s.level.id] ?? [];
    let b = parseLevel(s.level);
    const cur = boardKey(s.board);
    for (let i = 0; i < sol.length; i++) {
      if (boardKey(b) === cur) return sol[i];
      b = applyMove(b, sol[i]);
    }
    return null;
  }

  async findHint(): Promise<Move | null> {
    const line = this.lineHint();
    if (line) return line;
    const board = this.session!.board;
    this.toast('Thinking…');
    try {
      const w = new Worker(new URL('../engine/hint.worker.ts', import.meta.url), { type: 'module' });
      const res = await new Promise<Move | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 8000);
        w.onmessage = (e) => {
          clearTimeout(timer);
          resolve(e.data);
        };
        w.onerror = () => resolve(null);
        w.postMessage({ board, maxStates: 150_000 });
      });
      w.terminate();
      return res;
    } catch {
      const r = solve(board, { maxStates: 30_000 });
      return r.solvable && r.moves.length ? r.moves[0] : null;
    }
  }

  private deny(p: Pos | null, why: string) {
    sfx.play('deny');
    haptic(25);
    this.view.shake(3);
    if (p) this.view.deny(p);
    this.toast(why);
  }

  toast(msg: string) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1700);
  }

  // ---------- modals ----------
  private modalOpen() {
    return !!$('#modal-root').firstElementChild;
  }

  private openModal(html: string, cls = '') {
    const root = $('#modal-root');
    root.innerHTML = '';
    const m = h('div', { class: `modal-back ${cls}` }, `<div class="modal">${html}</div>`);
    root.appendChild(m);
    return m;
  }

  closeModal() {
    $('#modal-root').innerHTML = '';
  }

  private winModal(stars: number) {
    const s = this.session!;
    const lv = s.level;
    const dl = levelsOf(lv.district);
    const lastInDistrict = dl[dl.length - 1].id === lv.id;
    const isLast = lv.id === LEVEL_IDS[LEVEL_IDS.length - 1];
    this.openModal(
      `<div class="ribbon">Street restored!</div>
       <div class="big-stars">${starsHtml(stars, 3, 'pop')}</div>
       <p class="sub">${s.movesUsed} peel${s.movesUsed === 1 ? '' : 's'} · par ${lv.par}${stars < 3 ? ` · solve in ${lv.par} for ★★★` : ''}</p>
       ${lastInDistrict ? `<p class="unlock">★ ${DISTRICTS[lv.district].name} is fully restored!</p>` : `<p class="unlock">A building in ${DISTRICTS[lv.district].name} lights up.</p>`}
       <div class="row">
         <button class="btn ghost" data-act="map">Map</button>
         <button class="btn ghost" data-act="restart">Replay</button>
         ${isLast ? '' : `<button class="btn primary" data-act="next">Next ▸</button>`}
       </div>`,
      'win',
    );
    for (let i = 0; i < stars; i++) setTimeout(() => sfx.play('star'), 250 + i * 220);
  }

  private jamModal() {
    const s = this.session!;
    this.openModal(
      `<div class="ribbon red">Traffic jam!</div>
       <div class="jam-art">${JAM_SVG}</div>
       <p class="sub">You're out of peels. The street needs a little more.</p>
       <button class="btn ad-offer" data-act="jam-ad">${ICON.ad}<span>Watch ad · +3 peels</span><i class="mock">MOCK</i></button>
       <div class="row">
         ${s.canUndo() ? `<button class="btn ghost" data-act="jam-undo">Undo last${s.undosLeft > 0 ? '' : ' (ad)'}</button>` : ''}
         <button class="btn primary" data-act="restart">Retry</button>
       </div>
       <button class="link" data-act="map">Back to map</button>`,
      'jam',
    );
  }

  /** Mock rewarded video: a 3s countdown with a clear "no SDK" label, then the reward callback. */
  private mockAd(reward: string, onReward: () => void) {
    if (this.view.held) this.input.cancel();
    const m = this.openModal(
      `<div class="mock-ad">
        <div class="mock-label">MOCK REWARDED AD · demo only · no ad SDK</div>
        <div class="mock-screen"><div class="mock-brand">Your ad here</div><div class="mock-bar"><i></i></div><div class="mock-count">3</div></div>
        <p class="sub">Reward: ${reward}</p>
        <button class="link" data-act="close">Skip (no reward)</button>
      </div>`,
      'ad',
    );
    track('ad_shown_mock', { reward });
    let n = 3;
    const timer = setInterval(() => {
      n--;
      const c = m.querySelector('.mock-count');
      if (!c || !m.isConnected) return clearInterval(timer);
      c.textContent = String(n);
      if (n <= 0) {
        clearInterval(timer);
        this.closeModal();
        onReward();
      }
    }, 800);
  }

  private settings() {
    const grid = LEVELS.map((l) => {
      const open = this.unlocked(l.id);
      const st = this.progress.stars[l.id] ?? 0;
      return `<button class="ls ${open ? '' : 'locked'} ${st ? 'done' : ''}" data-act="${open ? 'play' : ''}" data-id="${l.id}">${open ? l.id : ICON.lock}<span>${starsHtml(st)}</span></button>`;
    }).join('');
    this.openModal(
      `<div class="modal-head"><h3>Settings</h3><button class="icon-btn" data-act="close" aria-label="Close">${ICON.close}</button></div>
       <div class="setting"><span>Sound</span><button class="toggle ${this.progress.sound ? 'on' : ''}" data-act="sound"><i></i></button></div>
       <div class="setting"><span>QA: unlock all levels</span><button class="toggle ${this.qaUnlock ? 'on' : ''}" data-act="qa-unlock"><i></i></button></div>
       <h4>Level select</h4>
       <div class="level-grid">${grid}</div>
       <button class="btn danger" data-act="reset">Reset progress</button>
       <p class="fine">Ads, hints-for-ads and analytics are mocked for demo/QA. Events are logged to <code>window.__peelEvents</code>.</p>`,
      'settings',
    );
  }

  private confirmReset() {
    this.openModal(
      `<h3>Reset all progress?</h3><p class="sub">Stars and restored buildings will be cleared.</p>
       <div class="row"><button class="btn ghost" data-act="settings">Cancel</button><button class="btn danger" data-act="reset-yes">Reset</button></div>`,
    );
  }

  // ---------- QA / automation hooks ----------
  private exposeDebug() {
    const app = this;
    (window as any).peelDebug = {
      play: (id: number) => app.play(id),
      map: () => app.showMap(),
      levels: () => LEVELS.map((l: LevelData) => ({ id: l.id, name: l.name, par: l.par, budget: l.moves })),
      /** Apply the next stored-solution move through the real placement path. */
      step: () => {
        const mv = app.session && app.lineHint();
        if (mv) {
          const [x, y] = app.view.center(mv.from);
          app.place(mv, x, y);
        }
        return !!mv;
      },
      solve: async (delay = 350) => {
        while (app.session && app.session.status === 'playing') {
          if (!(window as any).peelDebug.step()) break;
          await new Promise((r) => setTimeout(r, delay));
        }
      },
      state: () => app.session && { level: app.session.level.id, used: app.session.movesUsed, left: app.session.movesLeft, status: app.session.status },
      stars: (moves: number, par: number) => starsFor(moves, par),
    };
  }
}
