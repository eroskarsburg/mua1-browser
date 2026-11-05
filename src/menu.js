// Menu inicial: escolha de fase (mapas com cenário + mundo) e da equipe de 4 heróis jogáveis.
const CSS = `
#mmenu{position:fixed;inset:0;z-index:50;background:#0b0d12f2;display:none;color:#e6e8ee;font:14px system-ui,sans-serif;overflow:auto}
#mmenu .box{max-width:980px;margin:24px auto;padding:0 16px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
#mmenu h2{grid-column:1/-1;margin:0;color:#e23636}#mmenu h3{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b91a1}
#mmenu select,#mmenu input{width:100%;background:#232834;color:#e6e8ee;border:1px solid #2a2f3a;border-radius:6px;padding:7px 10px}
#mmenu .maps{height:420px;overflow:auto;background:#181b22;border:1px solid #2a2f3a;border-radius:8px}
#mmenu .act{padding:6px 10px;font-size:11px;color:#e23636;background:#12151b;position:sticky;top:0}
#mmenu .map{padding:6px 12px;cursor:pointer}#mmenu .map:hover{background:#232834}#mmenu .map.on{background:#3a1518}
#mmenu .slot{display:flex;gap:10px;align-items:center;margin-bottom:8px;background:#181b22;border:1px solid #2a2f3a;border-radius:8px;padding:6px}
#mmenu .slot img{width:52px;height:52px;border-radius:6px;background:#222;object-fit:cover}
#mmenu .go{grid-column:1/-1;padding:12px;font-size:16px;font-weight:700;background:#e23636;border:0;border-radius:8px;color:#fff;cursor:pointer}
#mmenu .x{position:absolute;right:16px;top:12px;background:none;border:0;color:#aaa;font-size:22px;cursor:pointer}`;

const DEFAULT_TEAM = ['Wolverine', 'Spiderman', 'CaptainAmerica', 'Storm'];
const label = p => { const m = /^act(\d+)\/([^/]+)\/(.+)$/.exec(p); return m ? [`Ato ${m[1]} · ${m[2]}`, m[3]] : ['Outros', p]; };

/** maps: Archive; db: Map do loadCharacterDB; portraits: Portraits|null; onStart({map, team}) */
export function createMenu({ maps, db, portraits, onStart, save = null, onContinue = () => {} }) {
  if (!document.getElementById('menu-css')) { const s = document.createElement('style'); s.id = 'menu-css'; s.textContent = CSS; document.head.append(s); }
  let root = document.getElementById('mmenu'); if (!root) { root = document.createElement('div'); root.id = 'mmenu'; document.body.append(root); }
  const names = new Set(maps.entries.map(e => e.name));
  const list = [...names].filter(n => n.endsWith('.xmlb') && names.has(n.slice(0, -5) + '.igb') && !/^(test|e3)\//.test(n)).map(n => n.slice(0, -5)).sort();
  const heroes = [...db.values()].filter(c => c.playable).sort((a, b) => a.name.localeCompare(b.name));
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('mua-menu') || '{}'); } catch { /* sem armazenamento */ }
  const state = { map: list.includes(saved.map) ? saved.map : (list.find(m => /atlantis1$/.test(m)) || list[0]), team: (saved.team || DEFAULT_TEAM).slice(0, 4) };
  while (state.team.length < 4) state.team.push(DEFAULT_TEAM[state.team.length]);

  const render = () => {
    const acts = new Map(); for (const m of list) { const [a, n] = label(m); (acts.get(a) || acts.set(a, []).get(a)).push([m, n]); }
    root.innerHTML = `<button class="x" title="fechar">×</button><div class="box"><h2>MUA Web — nova partida</h2>
      <div><h3>Fase</h3><input class="q" placeholder="filtrar fases…"><div class="maps" style="margin-top:8px">${[...acts].map(([a, ms]) => `<div class="act">${a}</div>` + ms.map(([m, n]) => `<div class="map ${m === state.map ? 'on' : ''}" data-m="${m}">${n}</div>`).join('')).join('')}</div></div>
      <div><h3>Equipe (4 heróis)</h3>${state.team.map((t, i) => `<div class="slot"><img data-i="${i}" alt=""><select data-i="${i}">${heroes.map(h => `<option ${h.name === t ? 'selected' : ''}>${h.name}</option>`).join('')}</select></div>`).join('')}</div>
      ${save ? `<button class="go cont" style="background:#2a8a4a">⟳ Continuar — ${save.map.split('/').pop()} · ${Object.keys(save.heroes || {}).length} heróis · ${new Date(save.at).toLocaleString()}</button>` : ''}
      <button class="go">▶ Nova partida</button></div>`;
    const pics = () => root.querySelectorAll('img[data-i]').forEach(img => { const h = db.get(state.team[+img.dataset.i].toLowerCase()); if (h && portraits) portraits.get(h.skin).then(u => { if (u) img.src = u; }); });
    pics();
    root.querySelector('.x').onclick = () => close();
    root.querySelectorAll('.map').forEach(el => el.onclick = () => { state.map = el.dataset.m; root.querySelectorAll('.map').forEach(x => x.classList.toggle('on', x === el)); });
    root.querySelectorAll('select').forEach(s => s.onchange = () => { state.team[+s.dataset.i] = s.value; pics(); });
    root.querySelector('.q').oninput = ev => { const q = ev.target.value.toLowerCase(); root.querySelectorAll('.map').forEach(x => x.style.display = x.dataset.m.includes(q) ? '' : 'none'); };
    const cont = root.querySelector('.cont'); if (cont) cont.onclick = () => { close(); onContinue(save); };
    root.querySelector('.go:not(.cont)').onclick = () => { try { localStorage.setItem('mua-menu', JSON.stringify(state)); } catch { /* ok */ } close(); onStart({ map: state.map, team: [...state.team] }); };
  };
  const close = () => { root.style.display = 'none'; };
  return { open() { render(); root.style.display = 'block'; }, close, state, list, heroes };
}
