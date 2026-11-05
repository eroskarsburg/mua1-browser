// HUD: retratos (hud.bin: hud_head_<skin>.igb, 128x128 DXT) como data URLs, com cache.
import { IGB } from './igb.js';
import { readImage } from './scene.js';
import { decodeDXT } from './dxt.js';

export class Portraits {
  constructor(hudArchive) { this.ar = hudArchive; this.cache = new Map(); this.index = new Map(hudArchive.entries.map(e => [e.name.toLowerCase(), e])); }
  /** skin "0301" -> Promise<dataURL|null> */
  get(skin) {
    if (!this.cache.has(skin)) this.cache.set(skin, (async () => {
      const e = this.index.get(`hud_head_${skin}.igb`.toLowerCase()); if (!e) return null;
      const g = new IGB(await this.ar.read(e)), img = g.byName('igImage').map(o => readImage(g, o)).filter(i => i.fmt).sort((a, b) => b.w - a.w)[0];
      if (!img) return null;
      const px = decodeDXT(img.data, img.w, img.h, img.fmt), c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
      const ctx = c.getContext('2d'); ctx.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), img.w, img.h), 0, 0);
      const f = document.createElement('canvas'); f.width = img.w; f.height = img.h; const fx = f.getContext('2d'); fx.scale(1, -1); fx.drawImage(c, 0, -img.h);   // texturas bottom-up
      return f.toDataURL();
    })().catch(() => null));
    return this.cache.get(skin);
  }
}

const CSS = `
#team{position:absolute;left:14px;bottom:12px;z-index:3;display:block;transform:none}
#team .main{position:relative;width:104px;height:104px;cursor:pointer}
#team .main img{position:absolute;left:11px;top:11px;width:82px;height:82px;border-radius:50%;object-fit:cover;background:#222;border:2px solid #cfe4ff;box-shadow:0 0 10px #000}
#team .main svg{position:absolute;inset:0}
#team .mini{position:absolute;width:46px;height:46px;border-radius:50%;border:3px solid #cfe4ff;background:#111;object-fit:cover;cursor:pointer;box-shadow:0 0 6px #000}
#team .mini.dead{filter:grayscale(1) brightness(.5)}
#team .nm{position:absolute;left:112px;bottom:4px;font:italic 700 12px 'Segoe UI',Arial,sans-serif;color:#fff;text-shadow:0 0 4px #000,0 0 8px #3a7bd5;white-space:nowrap}
#slots{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:10px;z-index:3}
#slots .sl{position:relative;width:62px;height:62px;border-radius:50%;border:3px solid #cfe4ff;background:#0b1320cc;box-shadow:0 0 8px #000,inset 0 0 10px #2a6fd855;overflow:hidden}
#slots .sl img{width:100%;height:100%;object-fit:cover;border-radius:50%}
#slots .sl.lock{border-color:#678;border-style:dashed;opacity:.55}#slots .sl.low img{filter:grayscale(.8) brightness(.6)}
#slots .sl.ready{border-color:#7fd0ff;box-shadow:0 0 12px #5ab4ff,inset 0 0 10px #5ab4ff88}
#slots .sl b{position:absolute;right:2px;bottom:0;font:700 12px 'Segoe UI',Arial,sans-serif;background:#000b;border-radius:3px;padding:0 4px;color:#fff}
#slots .sl em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:20px;color:#9ab}`;
const R = 46, C = 52, PATH_L = `M ${C},${C + R} A ${R},${R} 0 0 1 ${C},${C - R}`, PATH_R = `M ${C},${C + R} A ${R},${R} 0 0 0 ${C},${C - R}`, LEN = Math.PI * R;
export const POWER_UNLOCK = [1, 3, 5, 7];                         // nível mínimo de cada poder (1-4)

/** Painel da equipe: ativo grande com arcos de vida/energia, três minis e os 4 slots de poder. */
export class TeamHud {
  constructor(root, portraits, onPick) {
    root.innerHTML = ''; this.root = root; this.portraits = portraits; this.onPick = onPick; this.cards = new Map(); this.shown = null;
    if (!document.getElementById('team-css')) { const st = document.createElement('style'); st.id = 'team-css'; st.textContent = CSS; document.head.append(st); }
    root.insertAdjacentHTML('beforeend', `<div class="main"><svg viewBox="0 0 104 104"><path d="${PATH_L}" fill="none" stroke="#0007" stroke-width="7"/><path d="${PATH_R}" fill="none" stroke="#0007" stroke-width="7"/><path class="hp" d="${PATH_L}" fill="none" stroke="#e8352e" stroke-width="7" stroke-linecap="round" stroke-dasharray="${LEN}" stroke-dashoffset="0"/><path class="en" d="${PATH_R}" fill="none" stroke="#3aa0ff" stroke-width="7" stroke-linecap="round" stroke-dasharray="${LEN}" stroke-dashoffset="0"/></svg><img alt=""></div><div class="nm"></div>`);
    this.stage = root.parentElement; this.slots = document.getElementById('slots') || Object.assign(document.createElement('div'), { id: 'slots' }); this.stage.append(this.slots);
    this.slots.innerHTML = [1, 2, 3, 4].map(n => `<div class="sl lock" data-n="${n}"><img alt="" style="display:none"><em>🔒</em><b>${n}</b></div>`).join('');
    this.minis = [105, 70, 35].map((b, i) => { const m = document.createElement('img'); m.className = 'mini'; m.style.left = (86 + i * 0) + 'px'; m.style.bottom = b + 'px'; m.style.display = 'none'; root.append(m); return m; });
    root.querySelector('.main').onclick = () => {};
  }
  pic(el, f) { const sk = f.inst.p.info.skin; if (el._skin === sk) return; el._skin = sk; this.portraits && this.portraits.get(sk).then(u => { if (u) el.src = u; }); }
  update(heroes, active) {
    const act = active || heroes[0]; if (!act) return;
    const main = this.root.querySelector('.main'); this.pic(main.querySelector('img'), act);
    main.querySelector('.hp').style.strokeDashoffset = LEN * (1 - Math.max(0, act.hp / act.maxhp)); main.querySelector('.en').style.strokeDashoffset = LEN * (1 - Math.max(0, act.energy / 100));
    this.root.querySelector('.nm').textContent = `${(act.inst.p.info.name || '').toUpperCase()}  ·  NÍVEL ${act.level || 1}`;
    const others = heroes.filter(h => h !== act);
    this.minis.forEach((m, i) => {
      const f = others[i]; m.style.display = f ? 'block' : 'none'; if (!f) return; this.pic(m, f); m.classList.toggle('dead', !f.alive);
      m.style.borderColor = f.hp / f.maxhp > 0.5 ? '#cfe4ff' : f.hp / f.maxhp > 0.25 ? '#ffd24a' : '#ff5a4a'; m.onclick = () => this.onPick && this.onPick(f);
    });
    this.slots.querySelectorAll('.sl').forEach(sl => {
      const n = +sl.dataset.n, ok = (act.level || 1) >= ((act.powerReq || POWER_UNLOCK)[n - 1] ?? 99), img = sl.querySelector('img'), em = sl.querySelector('em');
      sl.classList.toggle('lock', !ok); sl.classList.toggle('ready', ok && act.energy >= 30); sl.classList.toggle('low', ok && act.energy < 30);
      img.style.display = ok ? '' : 'none'; em.style.display = ok ? 'none' : ''; if (ok) this.pic(img, act);
    });
  }
}
