// Camadas de UI da história: fade, avisos, objetivos e diálogo (DOM sobre o palco 3D).
const CSS = `
#sfade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5}
#stoast{position:absolute;top:44px;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;display:flex;flex-direction:column;gap:6px;align-items:center}
#stoast div{background:#000c;border:1px solid #e23636;padding:6px 14px;border-radius:6px;font-size:14px}
#sobj{position:absolute;right:8px;top:46px;z-index:4;max-width:300px;display:none;background:#000a;border-radius:6px;padding:8px 10px;font-size:12px}
#sobj h4{margin:0 0 4px;font-size:11px;color:#e23636;letter-spacing:.08em;text-transform:uppercase}
#sobj .o{margin:4px 0}#sobj .o b{display:block}#sobj .o small{color:#9aa}#sobj .o.done b{text-decoration:line-through;color:#6c6}
#sdlg{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);width:min(760px,92%);z-index:6;background:#000d;border:2px solid #e23636;border-radius:8px;padding:10px 14px;display:none;cursor:pointer}
#sdlg .who{color:#e23636;font-weight:700;margin-bottom:4px}#sdlg .txt{font-size:15px;line-height:1.35}
#sdlg .hint{font-size:10px;color:#889;margin-top:6px}#sdlg .ch{display:block;width:100%;text-align:left;margin:6px 0 0;padding:6px 10px;background:#223;border:1px solid #446;border-radius:6px}`;

export class StoryUI {
  constructor(stage) {
    if (!document.getElementById('story-css')) { const s = document.createElement('style'); s.id = 'story-css'; s.textContent = CSS; document.head.append(s); }
    const mk = (id, cls) => { let e = stage.querySelector('#' + id); if (!e) { e = document.createElement('div'); e.id = id; stage.append(e); } return e; };
    this.fade = mk('sfade'); this.toast = mk('stoast'); this.obj = mk('sobj'); this.dlg = mk('sdlg');
    this.shownText = null; this.toastKey = '';
  }
  /** estado por quadro: fade, avisos, HUD escondido em cutscene */
  frame(director) {
    this.fade.style.opacity = director.alpha;
    const key = director.toasts.map(t => t.text).join('|');
    if (key !== this.toastKey) { this.toastKey = key; this.toast.innerHTML = ''; for (const t of director.toasts) { const d = document.createElement('div'); d.textContent = t.text; this.toast.append(d); } }
  }
  objectives(list) {
    this.obj.style.display = list.length ? 'block' : 'none';
    this.obj.innerHTML = '<h4>Objetivos</h4>' + list.map(o => `<div class="o ${o.done ? 'done' : ''}"><b>${esc(o.title)}${o.count ? ` (${o.count})` : ''}</b>${o.text ? `<small>${esc(o.text)}</small>` : ''}</div>`).join('');
  }
  /** conv = Conversation ativa (ou null para fechar); onPick(i) ao clicar/escolher */
  dialog(conv, onPick) {
    if (!conv) { this.dlg.style.display = 'none'; this.shownText = null; return; }
    const key = conv.speaker + '|' + conv.text + '|' + conv.choices.map(c => c.text).join('/'); if (key === this.shownText) return; this.shownText = key;
    const ch = conv.choices;
    this.dlg.innerHTML = `<div class="who">${esc(conv.speaker)}</div><div class="txt">${esc(conv.text)}</div>` +
      (ch.length > 1 ? ch.map((c, i) => `<button class="ch" data-i="${i}">${i + 1}. ${esc(c.text)}</button>`).join('') : '<div class="hint">Espaço / Enter / clique para continuar</div>');
    this.dlg.style.display = 'block';
    this.dlg.onclick = ev => { const b = ev.target.closest('.ch'); if (onPick) onPick(b ? +b.dataset.i : 0); };
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
