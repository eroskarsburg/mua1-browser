// Conversas (conversations.bin): árvore <conversation><startCondition><participant><line><response><line>...
// .engb = textos em inglês (com tags %FALANTE%: ...), .xmlb = chaves de localização, .itab = italiano.
import { parseXmlb } from './xmlb.js';

const kids = (n, tag) => n.children.filter(c => c.tag === tag);
const pretty = tag => tag.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function parseLine(n) {
  const raw = n.attrs.text || '', m = /^%([A-Z0-9_]+)%:\s*(.*)$/s.exec(raw);
  const responses = kids(n, 'response').map(r => ({
    text: r.attrs.text && r.attrs.text !== '%BLANK%' ? r.attrs.text : '', script: r.attrs.chosenscriptfile || '', end: r.attrs.conversationend === 'true',
    line: kids(r, 'line')[0] ? parseLine(kids(r, 'line')[0]) : null,
  }));
  return { speaker: m ? m[1] : '', text: m ? m[2] : raw, voice: n.attrs.soundtoplay || '', responses };
}

/** root = árvore de parseXmlb de um .engb -> primeira linha da conversa (ou null) */
export function parseConversation(root) {
  const walk = n => { for (const c of n.children) { if (c.tag === 'line') return parseLine(c); const f = walk(c); if (f) return f; } return null; };
  return walk(root);
}

export class Conversation {
  /** first: linha inicial; opts.hero: nome do herói ativo (para %PLAYER%); opts.onScript(path) ao escolher resposta com script. */
  constructor(first, { hero = 'Herói', onScript = () => {}, onEnd = () => {} } = {}) {
    this.cur = first; this.hero = hero; this.onScript = onScript; this.onEnd = onEnd; this.done = !first; this.age = 0;
  }
  get speaker() { const s = this.cur && this.cur.speaker; return !s ? '' : s === 'PLAYER' ? this.hero : pretty(s); }
  get text() { return this.cur ? this.cur.text : ''; }
  /** respostas com texto (escolhas do jogador); vazio = avanço automático */
  get choices() { return this.cur ? this.cur.responses.filter(r => r.text) : []; }
  advance(choice = 0) {
    if (this.done) return;
    const rs = this.cur.responses, pick = this.choices.length ? this.choices[Math.min(choice, this.choices.length - 1)] : rs[0];
    this.age = 0;
    if (!pick) return this.finish();
    if (pick.script) this.onScript(pick.script);
    if (pick.end || !pick.line) return this.finish();
    this.cur = pick.line;
  }
  finish() { this.done = true; this.cur = null; this.onEnd(); }
  /** tempo sugerido de leitura (s) para avançar sozinho */
  get readTime() { return 2.2 + this.text.length * 0.045; }
}

/** Carrega uma conversa pelo caminho de script ("act1/atlantis/atlantis1/1_atlantis1_010") no arquivo conversations.bin. */
export async function loadConversation(archive, path, opts) {
  const key = path.toLowerCase().replace(/\\/g, '/');
  const e = archive.entries.find(x => x.name.toLowerCase() === key + '.engb') || archive.entries.find(x => x.name.toLowerCase() === key + '.xmlb');
  if (!e) return null;
  const first = parseConversation(parseXmlb(await archive.read(e)));
  return first ? new Conversation(first, opts) : null;
}
