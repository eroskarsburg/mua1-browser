// Tela de título e menus (reprodução do fluxo do jogo original):
//   "Press [1]" -> PLAY / PLAY ONLINE / OPTIONS / REVIEW -> BEGIN STORY / LOAD GAME -> EASY / NORMAL / HARD
// O logo é o modelo 3D original (ui.bin: m_logo_*), posicionado pelas transformações de menus/mlm_start.igb.
import { IGB } from './igb.js';
import { buildScene, readImage, mul } from './scene.js';
import { decodeDXT } from './dxt.js';
import { Renderer } from './renderer.js';

const CSS = `
#title{position:fixed;inset:0;z-index:60;background:#000;color:#fff;font-family:'Segoe UI','Trebuchet MS',Arial,sans-serif;overflow:hidden;user-select:none}
#title .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.38) saturate(.8) blur(1px);transform:scale(1.04);animation:tbg 24s ease-in-out infinite alternate}
@keyframes tbg{to{transform:scale(1.12) translate(-1.5%,1%)}}
#title .vig{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 45%,transparent 25%,#000c 100%)}
#title canvas{position:absolute;left:50%;top:2%;width:78%;height:56%;transform:translateX(-50%);transition:all .6s cubic-bezier(.2,.8,.2,1);pointer-events:none}
#title.menu canvas{left:2%;top:-2%;width:46%;height:42%;transform:none}
#title .press{position:absolute;left:0;right:0;bottom:21%;text-align:center;font-style:italic;font-weight:700;font-size:2.1vmin;letter-spacing:.04em;animation:blink 1.6s ease-in-out infinite}
#title .press kbd,#title .hint kbd{display:inline-block;min-width:1.6em;padding:0 .35em;background:#222c;border:1px solid #666;border-radius:3px;font-style:normal;font-size:.85em;color:#fff}
@keyframes blink{50%{opacity:.35}}
#title .items{position:absolute;left:0;top:41%;width:62%}
#title .it{position:relative;padding:1.2vmin 0 1.2vmin 9%;font-size:5.6vmin;font-style:italic;font-weight:800;letter-spacing:.01em;color:#dfe9ff;text-shadow:0 0 .9vmin #5aa0ff,0 0 2.2vmin #2a6fd8,0 .3vmin .3vmin #000;cursor:pointer;opacity:.78;transition:opacity .15s}
#title .it.on{opacity:1;color:#fff;background:linear-gradient(90deg,transparent,#2b5fa8aa 25%,#2b5fa8aa 80%,transparent);border-top:1px solid #7cb4ff;border-bottom:1px solid #7cb4ff}
#title .it.off{opacity:.3;cursor:default}
#title .hint{position:absolute;left:0;right:0;bottom:3.5%;text-align:center;font-style:italic;font-weight:700;font-size:2.2vmin;text-shadow:0 0 .6vmin #000}
#title .hint span{margin:0 1.4em}
#title .copy{position:absolute;right:1.2%;bottom:1%;font-size:1.3vmin;color:#667}
#tfade{position:fixed;inset:0;background:#000;z-index:70;opacity:0;pointer-events:none;transition:opacity .7s}
#zonetitle{position:fixed;left:0;right:0;top:20%;text-align:center;z-index:40;pointer-events:none;font:italic 800 7vmin 'Segoe UI','Trebuchet MS',Arial,sans-serif;color:#fff;text-shadow:0 0 1.2vmin #5aa0ff,0 0 3vmin #2a6fd8,0 .4vmin .4vmin #000;opacity:0;transition:opacity 1s}`;

const LOGO = ['logo_top_bar', 'logo_ultimate', 'logo_alliance', 'logo_bottom_bar'];

async function imageURL(archive, name) {
  const e = archive.byName.get(name); if (!e) return null;
  const g = new IGB(await archive.read(e)), im = g.byName('igImage').map(o => readImage(g, o)).filter(i => i.fmt).sort((a, b) => b.w - a.w)[0]; if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.w; c.height = im.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(decodeDXT(im.data, im.w, im.h, im.fmt).buffer), im.w, im.h), 0, 0);
  const f = document.createElement('canvas'); f.width = im.w; f.height = im.h; const x = f.getContext('2d'); x.scale(1, -1); x.drawImage(c, 0, -im.h); return f.toDataURL('image/jpeg', 0.9);
}

export class Title {
  /** archives: Map de Archives; opts: onStart(diff), onLoad(), onReview(), hasSave(), audio() -> {volume,setVolume} */
  constructor(archives, opts) {
    this.ar = archives; this.o = opts; this.stack = []; this.screen = 'start'; this.sel = 0; this.alive = false;
    if (!document.getElementById('title-css')) { const s = document.createElement('style'); s.id = 'title-css'; s.textContent = CSS; document.head.append(s); }
    this.root = document.getElementById('title') || Object.assign(document.createElement('div'), { id: 'title' }); document.body.append(this.root);
    this.fade = document.getElementById('tfade') || Object.assign(document.createElement('div'), { id: 'tfade' }); document.body.append(this.fade);
    this.key = ev => this.onKey(ev);
  }
  menus() {
    const o = this.o, diff = d => ({ label: d.toUpperCase(), act: () => this.begin(d) });
    return {
      main: { items: [{ label: 'PLAY', go: 'play' }, { label: 'PLAY ONLINE', off: true }, { label: 'OPTIONS', go: 'options' }, { label: 'REVIEW', act: () => o.onReview && this.hide(o.onReview) }], back: 'Exit Game' },
      play: { items: [{ label: 'BEGIN STORY', go: 'diff' }, { label: 'LOAD GAME', off: !(o.hasSave && o.hasSave()), act: () => this.begin(null) }] },
      diff: { items: [diff('easy'), diff('normal'), diff('hard')], start: 1 },
      options: { items: [{ label: () => `VOLUME   ◄ ${Math.round(((o.audio && o.audio().volume) ?? 0.7) * 100)}% ►`, adj: d => { const a = o.audio && o.audio(); if (a) a.setVolume(Math.max(0, Math.min(1, a.volume + d * 0.1))); } }, { label: 'BACK', back: true }] },
    };
  }
  async show() {
    this.alive = true; this.root.style.display = 'block'; this.root.className = ''; this.screen = 'start'; this.stack = [];
    const bgs = ['loading/0301.igb', 'loading/0101.igb', 'loading/0901.igb', 'loading/0401.igb'], tex = this.ar.get('textures');
    this.root.innerHTML = '<div class="bg"></div><div class="vig"></div><canvas></canvas><div class="press">Press <kbd>1</kbd></div><div class="items"></div><div class="hint"></div><div class="copy">MUA Web — reimplementação com os arquivos do jogo do usuário</div>';
    if (tex) imageURL(tex, bgs[Math.floor(Math.random() * bgs.length)]).then(u => { if (u) this.root.querySelector('.bg').style.backgroundImage = `url(${u})`; });
    window.addEventListener('keydown', this.key);
    this.root.onclick = ev => { const it = ev.target.closest('.it'); if (this.screen === 'start') this.select(); else if (it) { this.sel = +it.dataset.i; this.select(); } };
    this.root.onmousemove = ev => { const it = ev.target.closest('.it'); if (it && !it.classList.contains('off')) { this.sel = +it.dataset.i; this.paint(); } };
    this.logo().catch(err => console.warn('logo', err.message));
    this.paint();
  }
  async logo() {                                                   // logo 3D original, posicionado como em mlm_start.igb
    const ui = this.ar.get('ui'); if (!ui) return;
    const canvas = this.root.querySelector('canvas'), r = this.renderer = new Renderer(canvas);
    r.clearColor = [0, 0, 0, 0]; r.tint = [1.55, 1.5, 1.45];
    const start = new IGB(await ui.read(ui.byName.get('menus/mlm_start.igb'))), at = {};
    for (const o of start.objects) if (o.name === 'igTransform') at[start.strings[o.v[0].v]] = o.v[4].v;
    const draws = [];
    for (const n of LOGO) {
      const e = ui.byName.get(`models/m_${n}.igb`), m = at[n]; if (!e || !m) continue;
      for (const d of buildScene(new IGB(await ui.read(e))).draws) draws.push({ ...d, m: mul(m, d.m), st: { ...d.st } });
    }
    r.setScene({ draws }); Object.assign(r.cam, { target: [256, -209, 245], yaw: -Math.PI / 2, pitch: 0, dist: 790, fov: 0.62 }); r.canvas.style.pointerEvents = 'none'; r.draw();
  }
  paint() {
    const m = this.menus()[this.screen], items = this.root.querySelector('.items'), hint = this.root.querySelector('.hint'), press = this.root.querySelector('.press');
    this.root.classList.toggle('menu', this.screen !== 'start'); press.style.display = this.screen === 'start' ? '' : 'none';
    if (this.screen === 'start') { items.innerHTML = ''; hint.innerHTML = ''; return; }
    items.innerHTML = m.items.map((it, i) => `<div class="it ${i === this.sel ? 'on' : ''} ${it.off ? 'off' : ''}" data-i="${i}">${typeof it.label === 'function' ? it.label() : it.label}</div>`).join('');
    hint.innerHTML = `<span><kbd>1</kbd> Select</span><span><kbd>2</kbd> ${m.back || 'Back'}</span>`;
    if (this.renderer) { this.renderer.draw(); clearTimeout(this._rd); this._rd = setTimeout(() => this.renderer && this.renderer.draw(), 700); }   // redesenha após a transição de tamanho do canvas
  }
  go(name) { this.stack.push([this.screen, this.sel]); this.screen = name; this.sel = this.menus()[name].start || 0; this.paint(); }
  back() { if (!this.stack.length) return; [this.screen, this.sel] = this.stack.pop(); this.paint(); }
  select() {
    if (this.screen === 'start') { this.go('main'); this.stack = []; return; }
    const it = this.menus()[this.screen].items[this.sel]; if (!it || it.off) return;
    if (it.back) this.back(); else if (it.go) this.go(it.go); else if (it.act) it.act();
  }
  onKey(ev) {
    if (!this.alive) return; const m = this.screen === 'start' ? null : this.menus()[this.screen], n = m ? m.items.length : 0;
    const k = ev.code; let used = true;
    if (k === 'Enter' || k === 'NumpadEnter' || k === 'Digit1' || k === 'Space') this.select();
    else if (k === 'Escape' || k === 'Digit2' || k === 'Backspace') this.back();
    else if (m && (k === 'ArrowDown' || k === 'KeyS')) { do this.sel = (this.sel + 1) % n; while (m.items[this.sel].off && n > 1); this.paint(); }
    else if (m && (k === 'ArrowUp' || k === 'KeyW')) { do this.sel = (this.sel + n - 1) % n; while (m.items[this.sel].off && n > 1); this.paint(); }
    else if (m && (k === 'ArrowLeft' || k === 'ArrowRight') && m.items[this.sel].adj) { m.items[this.sel].adj(k === 'ArrowLeft' ? -1 : 1); this.paint(); }
    else used = false;
    if (used) ev.preventDefault();
  }
  /** fade para preto, esconde o título e executa fn */
  hide(fn) {
    this.alive = false; window.removeEventListener('keydown', this.key); this.fade.style.opacity = 1;
    setTimeout(() => { this.root.style.display = 'none'; if (this.renderer) this.renderer = null; if (fn) fn(); setTimeout(() => { this.fade.style.opacity = 0; }, 150); }, 750);
  }
  begin(diff) { this.hide(() => (diff ? this.o.onStart(diff) : this.o.onLoad())); }
}

/** Texto grande de nome da zona ("FLIGHT DECK") ao entrar no mapa. */
export function showZoneTitle(text, ms = 3200) {
  if (!document.getElementById('title-css')) { const s = document.createElement('style'); s.id = 'title-css'; s.textContent = CSS; document.head.append(s); }
  let el = document.getElementById('zonetitle'); if (!el) { el = document.createElement('div'); el.id = 'zonetitle'; document.body.append(el); }
  el.textContent = text; requestAnimationFrame(() => { el.style.opacity = 1; setTimeout(() => { el.style.opacity = 0; }, ms); });
}
export const ZONE_NAMES = { 'act1/heli/heli1': 'FLIGHT DECK' };
export const zoneName = stem => ZONE_NAMES[stem] || stem.split('/').pop().replace(/(\D+)(\d+)/, (_, a, b) => `${a} ${b}`).toUpperCase();
