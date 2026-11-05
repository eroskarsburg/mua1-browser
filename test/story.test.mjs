import { openAsBlob } from 'node:fs';
import assert from 'node:assert/strict';
import { Archive } from '../src/archive.js';
import { parseXmlb } from '../src/xmlb.js';
import { Director, orbitFrom } from '../src/director.js';
import { parseConversation, Conversation, loadConversation } from '../src/conversation.js';
import { Objectives } from '../src/objectives.js';
import { World, createSim } from '../src/world.js';
import { parse } from '../src/behaved.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);

// ---- diretor
{
  const cam = { target: [0, 0, 0], yaw: 0, pitch: 0.5, dist: 100 }, d = new Director(() => cam);
  const o = orbitFrom([100, 0, 0], [0, 0, 0]); assert.ok(Math.abs(o.dist - 100) < 1e-9 && Math.abs(o.yaw) < 1e-9 && Math.abs(o.pitch) < 1e-9);
  d.lockControls(0.1); assert.ok(d.locked); d.update(0.2); assert.ok(!d.locked);
  d.lockControls(-1); assert.ok(d.locked); d.lockControls(0); assert.ok(!d.locked);
  d.startCutScene(); assert.ok(d.locked && d.hudHidden); d.endCutScene(); assert.ok(!d.locked);
  d.cameraFade(1, 0.5); d.update(0.25); assert.ok(Math.abs(d.alpha - 0.5) < 1e-9); d.update(0.5); assert.equal(d.alpha, 1);
  d.cameraToLocationAngles(' 0 -200 0 ', ' 0 0 0 ', 1); assert.ok(d.active);
  d.update(0.5); d.update(0.6); assert.ok(Math.abs(cam.dist - 200) < 1e-6, 'câmera chegou: ' + cam.dist);
  d.cameraReset(); assert.ok(!d.active);
  d.cameraFOV(90, 0); d.update(0.01); assert.ok(Math.abs(cam.fov - Math.PI / 2) < 1e-9);
}

// ---- conversas: todas parseiam e terminam
{
  const conv = await open('conversations'); let n = 0, bad = 0, lines = 0, branch = 0;
  for (const e of conv.entries) {
    if (!e.name.endsWith('.engb')) continue;
    let first; try { first = parseConversation(parseXmlb(await conv.read(e))); } catch { bad++; continue; }
    if (!first) { continue; }
    n++; const c = new Conversation(first, { hero: 'Wolverine' }); let guard = 0;
    while (!c.done && guard++ < 200) { lines++; if (c.choices.length > 1) branch++; c.advance(0); }
    assert.ok(c.done, 'termina: ' + e.name);
  }
  console.log(`conversas com falas: ${n}, falhas de parse ${bad}, linhas percorridas ${lines}, com escolhas ${branch}`);
  assert.equal(bad, 0); assert.ok(n > 1000);
  const c = await loadConversation(conv, 'act1/atlantis/atlantis1/1_atlantis1_010', { hero: 'Wolverine' });
  assert.equal(c.speaker, 'Wolverine'); assert.ok(c.text.includes('S.H.I.E.L.D.'));
  const ran = []; const c2 = await loadConversation(conv, 'act1/atlantis/atlantis1/1_atlantis1_010', { onScript: p => ran.push(p) });
  c2.advance(); assert.equal(c2.speaker, 'Nickfury'); c2.advance(); assert.ok(c2.done); assert.deepEqual(ran, ['act1/atlantis/atlantis1/start_conv_done']);
}

// ---- objetivos
{
  const data = await open('data'), ob = await Objectives.load(data);
  console.log('objetivos no banco:', ob.db.size);
  assert.ok(ob.db.size > 50); assert.ok(ob.info('asgard_obj10').title.includes('Balder'));
  ob.command('asgard_obj10', 'EOBJCMD_SHOW'); ob.command('asgard_obj20', 'EOBJCMD_COMPLETE');
  assert.equal(ob.list().length, 2); assert.ok(ob.list().find(x => x.name === 'asgard_obj20').done);
}

// ---- nativas ligadas ao mundo
{
  const w = new World({ tag: 'world', attrs: {}, children: [] });
  const { host, runner } = createSim(w, { rng: () => 0.5 });
  const cam = { target: [0, 0, 0], yaw: 0, pitch: 0.5, dist: 100 }; host.director = new Director(() => cam);
  host.obj = new Objectives(); const convs = []; host.onConversation = p => convs.push(p);
  runner.start(parse(`startCutScene("FALSE", "FALSE")\ncameraFade(1.0, 0.5)\nlockControls(-1.0)\nobjective("o1", "EOBJCMD_SHOW")\ndisplay("oi")\nstartConversation("a/b/c")\nallowConversation("FALSE")\nstartConversation("x/y")\nendCutScene("FALSE", "TRUE")`));
  assert.ok(host.director.alpha === 0 && host.director.fadeTo === 1); assert.ok(host.obj.shown.has('o1'));
  assert.deepEqual(convs, ['a/b/c']); assert.equal(host.director.toasts.length, 1); assert.ok(!host.director.cut && host.director.lockInf);
}
console.log('story ok');
