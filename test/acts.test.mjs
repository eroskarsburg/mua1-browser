import assert from 'node:assert/strict';
import { World, createSim } from '../src/world.js';
import { inBox, touches } from '../src/acts.js';

const ent = (name, attrs) => ({ tag: 'entity', attrs: { name, ...attrs }, children: [] });
const inst = (type, attrs) => ({ tag: 'entinst', attrs: { type }, children: [{ tag: 'inst', attrs: { name: attrs.name || type, ...attrs } }] });
const box = '-50 -50 0 50 50 100';
const root = { children: [
  ent('world', { zonescript: 'zone' }),
  ent('start_b', { classname: 'playerstartent', prevzone: 'heli2', prevlink: 'link_heli1', allinone: 'true' }),
  ent('start_a', { classname: 'playerstartent', default: 'true', allinone: 'true' }),
  ent('touch', { classname: 'gameent', actontouch: 'true', actcountremove: '1', actscript: 'touched', acttargets: 'relay fire', boxcollision: 'true', team: 'hero' }),
  ent('relay', { classname: 'actionent', actdelay: '0.5', actscript: 'relayed' }),
  ent('fire', { classname: 'actionent', loopfx: 'map/fire', loopfxstarton: 'true', acttogglesloopfx: 'true', acteffect: 'fx/boom', actsound: 'snd/boom' }),
  ent('hint', { classname: 'scripttriggerent', actleader: 'true', boxcollision: 'true', tipid: '11', actscript: 'gun_on', deactscript: 'gun_off' }),
  ent('door', { classname: 'doorent', actonuse: 'true', toggleonact: 'true', actcountdisable: '1' }),
  ent('link', { classname: 'zonelinkent', actonuse: 'true', nextzone: 'heli2', startenabled: 'false', actleader: 'true' }),
  ent('gun', { classname: 'physent', actrescheduledelay: '4', actrescheduledelaymin: '2', actscript: 'gun_fire' }),
  ent('spawner', { classname: 'monsterspawnerent', character: 'Bot', actcountremove: '1' }),
  inst('start_b', { pos: '2700 0 0' }), inst('start_a', { pos: '-1880 -188 -118' }),
  inst('touch', { pos: '0 0 0', extents: box }), inst('relay', { pos: '0 0 0' }), inst('fire', { pos: '5 5 5' }),
  inst('hint', { pos: '500 0 0', extents: box }), inst('door', { pos: '900 0 0' }), inst('link', { pos: '1200 0 0', extents: box }),
  inst('gun', { pos: '0 900 0' }), inst('spawner', { pos: '0 -900 0' }),
] };
const programs = new Map();
const mk = (prevZone, rng = () => 0.5) => {
  const w = new World(root), ran = [];
  const { host, runner } = createSim(w, { loadScript: p => { ran.push(p); return { body: [] }; }, rng, prevZone });
  host.runScript = (p, e) => { if (p) ran.push(p); return !!p; };
  return { w, host, runner, ran, acts: host.acts };
};

// início: default, ou o da zona de onde se veio; equipe inteira em formação
{
  const a = mk(''); assert.deepEqual(a.host.heroes[0].pos, [-1880, -188, -118]); assert.ok(Math.hypot(a.host.heroes[3].pos[0] + 1880, a.host.heroes[3].pos[1] + 188) < 90, 'equipe junta');
  const b = mk('Heli2'); assert.deepEqual(b.host.heroes[0].pos, [2700, 0, 0]);
  const lk = a.w.find('link')[0]; assert.equal(lk.actEnabled, false, 'startenabled=false: não ativa'); assert.equal(lk.enabled, true, '...mas continua desenhado'); assert.equal(a.w.find('fire')[0].loopOn, true, 'loopfxstarton');
}
// caixa girada
{
  const e = { pos: [0, 0, 0], orient: [0, 0, Math.PI / 2], ext: [-10, -100, 0, 10, 100, 50] };
  assert.ok(inBox(e, [90, 0, 10])); assert.ok(!inBox(e, [0, 90, 10])); assert.ok(!inBox(e, [90, 0, 90])); assert.ok(!inBox({ ...e, ext: [0, 0, 0, 0, 0, 0] }, [0, 0, 0]));
}
// toque: ativa uma vez, alvos em cascata, actdelay, efeito/som, toggle do loop, actcountremove
{
  const { w, host, ran, acts } = mk(''), fx = [], snd = []; host.onEffect = n => fx.push(n); host.onSound = n => snd.push(n);
  const h = host.heroes[0]; h.pos = [0, 0, 0]; acts.update(0.1, h);
  assert.deepEqual(ran, ['touched']); assert.deepEqual(fx, ['fx/boom']); assert.deepEqual(snd, ['snd/boom']); assert.equal(w.find('fire')[0].loopOn, false, 'alterna o fogo');
  assert.equal(w.find('touch')[0].alive, false, 'actcountremove');
  acts.update(0.3, h); assert.equal(ran.length, 1, 'relay espera actdelay'); acts.update(0.3, h); assert.deepEqual(ran, ['touched', 'relayed']);
  acts.update(0.1, h); assert.equal(ran.length, 2, 'não repete');
}
// scripttrigger: entrar ativa e mostra a dica uma vez; sair desativa; só o líder conta
{
  const { host, ran, acts } = mk(''), tips = []; host.onTip = t => tips.push(t);
  const [l, o] = host.heroes; o.pos = [500, 0, 0]; l.pos = [0, 5000, 0]; acts.update(0.1, l); assert.deepEqual(ran, [], 'aliado não ativa actleader');
  l.pos = [500, 0, 0]; acts.update(0.1, l); assert.deepEqual(ran, ['gun_on']); assert.deepEqual(tips, ['11']);
  l.pos = [0, 5000, 0]; acts.update(0.1, l); assert.deepEqual(ran, ['gun_on', 'gun_off']);
  l.pos = [500, 0, 0]; acts.update(0.1, l); assert.deepEqual(tips, ['11'], 'dica só uma vez');
}
// uso: porta alterna colisão/visual e desabilita; ligação de zona só depois de habilitada
{
  const { w, host, acts } = mk(''), links = []; host.onZoneLink = e => links.push(e.def.nextzone);
  const h = host.heroes[0], d = w.find('door')[0], k = w.find('link')[0]; acts.leader = h;
  h.pos = [850, 0, 0]; assert.equal(acts.usableBy(h), d); acts.use(h);
  assert.equal(d.noCollide, true); assert.equal(d.invisible, true); assert.equal(d.actEnabled, false, 'actcountdisable'); assert.equal(acts.usableBy(h), null);
  h.pos = [1200, 0, 0]; assert.equal(acts.use(h), null, 'saída fechada'); host.call('setEnable', ['link', 'TRUE'], {}); assert.equal(acts.use(h), k); assert.deepEqual(links, ['heli2']);
  h.pos = [0, 0, 0]; assert.equal(acts.usableBy(h), null);
}
// script `act`: spawner cria o personagem; reagenda até deact
{
  const { w, host, ran, acts } = mk(''), sp = []; host.onSpawn = (e, c) => sp.push(c);
  host.call('act', ['spawner'], {}); assert.deepEqual(sp, ['Bot']); assert.equal(w.find('spawner')[0].alive, false);
  const h = host.heroes[0]; h.pos = [0, 5000, 0]; host.call('act', ['gun'], {}); assert.equal(ran.filter(r => r === 'gun_fire').length, 1);
  acts.update(3.1, h); acts.update(0.01, h); assert.equal(ran.filter(r => r === 'gun_fire').length, 2, 'repete em 2..4 s');
  host.call('deact', ['gun'], {}); acts.update(9, h); acts.update(9, h); assert.equal(ran.filter(r => r === 'gun_fire').length, 2, 'deact para');
  host.call('actSilent', ['fire'], {}); void programs;
}
// prevzone com caminho completo; toque sem caixa; morte de objeto; repetição fora do limite de scripts
{
  const r2 = { children: [ent('s', { classname: 'playerstartent', prevzone: 'act5/doom/doom4' }), ent('d', { classname: 'playerstartent', default: 'true' }), inst('s', { pos: '10 0 0' }), inst('d', { pos: '20 0 0' })] };
  assert.equal(new World(r2).startFor('doom4').name, 's'); assert.equal(new World(r2).startFor('act5/doom/doom4').name, 's'); assert.equal(new World(r2).startFor('').name, 'd');
  const card = { pos: [0, 0, 0], ext: [0, 0, 0, 0, 0, 0], orient: [0, 0, 0], def: {} }; assert.ok(touches(card, [30, 0, 0])); assert.ok(!touches(card, [80, 0, 0]));
  const r3 = { children: [ent('tower', { classname: 'physent', deathscript: 'dead', deathtargets: 'gen', actondeath: 'true', actscript: 'boom' }), ent('gen', { classname: 'actionent', actscript: 'gen_on' }), ent('loop', { classname: 'physent', actscript: 'loop_s', actrescheduledelay: '1' }), inst('tower', {}), inst('gen', {}), inst('loop', {})] };
  const w3 = new World(r3), started = []; const { host, runner, } = createSim(w3, { loadScript: p => ({ path: p, body: [] }), rng: () => 0 });
  runner.start = (prog) => { started.push(prog.path); }; host.acts.death(w3.find('tower')[0], null); assert.deepEqual(started, ['dead', 'gen_on', 'boom']);
  started.length = 0; const h = host.heroes[0]; h.pos = [0, 9000, 0]; host.acts.act(w3.find('loop')[0], h); for (let i = 0; i < 30; i++) host.acts.update(1.01, h);
  assert.ok(started.length > 20, 'reagendamento não para no limite de 8: ' + started.length);
}
console.log('acts ok');
