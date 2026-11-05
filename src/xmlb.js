// Decodificador do XML binário da Raven (.xmlb).
export function parseXmlb(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x11b1) throw new Error('xmlb: magic inválido');
  const td = new TextDecoder('latin1');
  const str = o => { let e = o; while (u8[e]) e++; return td.decode(u8.subarray(o, e)); };
  const node = o => {
    const n = { tag: str(dv.getUint32(o, true)), attrs: {}, children: [] };
    const child = dv.getInt32(o + 8, true), na = dv.getUint32(o + 12, true);
    for (let i = 0, p = o + 16; i < na; i++, p += 8) n.attrs[str(dv.getUint32(p, true))] = str(dv.getUint32(p + 4, true));
    for (let c = child; c !== -1; c = dv.getInt32(c + 4, true)) n.children.push(node(c));
    return n;
  };
  return node(8);
}
export function toXml(n, ind = 0) {
  const pad = '  '.repeat(ind), a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  if (!n.children.length) return `${pad}<${n.tag}${a}/>\n`;
  return `${pad}<${n.tag}${a}>\n${n.children.map(c => toXml(c, ind + 1)).join('')}${pad}</${n.tag}>\n`;
}
