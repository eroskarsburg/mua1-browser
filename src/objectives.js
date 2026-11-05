// Objetivos de missão: textos de data/missions/*.engb + estado (mostrar/completar/incrementar/esconder).
import { parseXmlb } from './xmlb.js';

export class Objectives {
  constructor() { this.db = new Map(); this.shown = new Map(); this.done = new Set(); this.progress = new Map(); this.onChange = null; }
  /** data = Archive de data.bin */
  static async load(data) {
    const o = new Objectives();
    for (const e of data.entries) {
      if (!/^missions\/.+\.engb$/.test(e.name)) continue;
      for (const c of parseXmlb(await data.read(e)).children) if (c.tag === 'OBJECTIVE' && c.attrs.name) o.db.set(c.attrs.name, c.attrs);
    }
    return o;
  }
  info(name) { const a = this.db.get(name) || {}; return { name, title: a.descname || name, text: a.description || '', optional: a.optional === 'true', parent: a.parentname || '' }; }
  /** EOBJCMD_SHOW / COMPLETE / INCOMPLETE / INCREMENT / HIDE */
  command(name, cmd) {
    const c = String(cmd).replace(/^EOBJCMD_/i, '').toUpperCase();
    if (c === 'SHOW') this.shown.set(name, true);
    else if (c === 'COMPLETE') { this.shown.set(name, true); this.done.add(name); }
    else if (c === 'INCOMPLETE') this.done.delete(name);
    else if (c === 'HIDE') this.shown.delete(name);
    else if (c === 'INCREMENT') this.progress.set(name, (this.progress.get(name) || 0) + 1);
    if (this.onChange) this.onChange(name, c);
  }
  /** lista para o HUD: visíveis, com estado */
  list() { return [...this.shown.keys()].map(n => ({ ...this.info(n), done: this.done.has(n), count: this.progress.get(n) || 0 })); }
}
