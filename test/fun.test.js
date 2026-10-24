import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATALOG_ORDER, dims, spotsOf } from '../public/shared/catalog.js';
import { canPlace, centredOn, rectOf, roomAt, BLOCKED } from '../public/shared/placement.js';
import { DEFAULT_PLACED, ROOMS } from '../public/shared/layout.js';
import { levelOf, moodOf, energyOf, applyInteraction, dueEvents, EVENTS, visitorQuip, VISITORS, favoriteOf } from '../public/shared/life.js';

test('every catalog item is well formed', () => {
  assert.ok(CATALOG_ORDER.length >= 15);
  for (const id of CATALOG_ORDER) {
    const c = CATALOG[id];
    assert.ok(c.name && c.emoji && c.w > 0 && c.d > 0, id);
    assert.ok(['pair', 'solo', 'deco'].includes(c.kind), id);
    if (c.kind === 'pair') assert.equal(c.spots.length, 2, `${id} needs two spots`);
    if (c.kind === 'deco') assert.equal(c.spots.length, 0, id);
  }
});

test('rotation swaps the footprint and moves the spots with it', () => {
  const it = { id: 'pingpong', x: 10, y: 14, rot: 0 };
  assert.deepEqual(dims(it), [2.6, 1.4]);
  assert.deepEqual(dims({ ...it, rot: 1 }), [1.4, 2.6]);
  const a = spotsOf(it), b = spotsOf({ ...it, rot: 1 });
  assert.equal(a.length, 2);
  // unrotated players stand left and right of the table; rotated, above and below it
  assert.ok(a[0].x < it.x && a[1].x > it.x + 2.6);
  assert.ok(b[0].y < it.y || b[0].y > it.y + 2.6 || b[1].y > it.y + 2.6);
  for (let r = 0; r < 4; r++) for (const s of spotsOf({ ...it, rot: r })) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
});

test('the default ping-pong table is a legal placement in the rec room', () => {
  for (const it of DEFAULT_PLACED) {
    assert.deepEqual(canPlace(it, DEFAULT_PLACED, it.uid), { ok: true });
    assert.equal(roomAt(it.x + 1, it.y + 0.5), 'rec');
  }
});

test('placement rules: desks, walls, other furniture and room borders are respected', () => {
  const free = { uid: 'n', id: 'arcade', x: 3, y: 18.5, rot: 0 };
  assert.equal(canPlace(free, DEFAULT_PLACED).ok, true);
  assert.equal(canPlace({ ...free, x: 11.5, y: 3.2 }, []).ok, false, 'on a desk');
  assert.equal(canPlace({ ...free, x: -1 }, []).ok, false, 'off the floor');
  assert.equal(canPlace({ ...free, x: 8.6, y: 15 }, []).ok, false, 'crosses from kitchen into the rec room');
  assert.equal(canPlace({ ...free, x: 12, y: 15.2 }, DEFAULT_PLACED).ok, false, 'on the ping-pong table');
  assert.equal(canPlace({ ...free, x: 12, y: 15.2 }, []).ok, true, 'same spot is fine when the table is not there');
  assert.equal(canPlace({ ...free, y: 10.5 }, []).ok, false, 'in the corridor');
  assert.ok(BLOCKED.length > 20);
});

test('moving an item ignores itself when checking for overlaps', () => {
  const it = DEFAULT_PLACED[0];
  assert.equal(canPlace({ ...it, x: it.x + 0.5 }, DEFAULT_PLACED, it.uid).ok, true);
  assert.equal(canPlace({ ...it, x: it.x + 0.5 }, DEFAULT_PLACED).ok, false);
});

test('centredOn snaps to the half-tile grid', () => {
  const r = rectOf(centredOn({ id: 'sofa', rot: 0 }, 18.37, 17.9));
  assert.equal(r.x % 0.5, 0);
  assert.equal(r.y % 0.5, 0);
});

test('friendship levels, cooldown and level-ups', () => {
  assert.equal(levelOf(0).label, 'Stranger');
  assert.equal(levelOf(5).label, 'Friend');
  assert.equal(levelOf(30).label, 'Soulmate');
  assert.equal(levelOf(30).next, null);
  let rec, r = applyInteraction(undefined, 'cake', 1000);
  assert.equal(r.rec.affection, 2);
  assert.equal(applyInteraction(r.rec, 'pet', 1100).changed, false, 'cooldown');
  r = applyInteraction(r.rec, 'snack', 5000);
  assert.equal(r.rec.affection, 6);
  assert.equal(r.leveledUp, true);
  assert.equal(applyInteraction(r.rec, 'nonsense', 9000).changed, false);
});

test('mood and energy are derived from real agent state but never alter it', () => {
  const a = { id: 'x', status: 'blocked', toolCalls: 10, tasksDone: 1 };
  const before = JSON.stringify(a);
  assert.equal(moodOf(a).label, 'stressed');
  assert.equal(moodOf({ status: 'bench' }).label, 'sleepy');
  assert.ok(energyOf(a) < 100 && energyOf(a) >= 12);
  assert.equal(JSON.stringify(a), before);
  assert.equal(favoriteOf('juniper'), favoriteOf('juniper'));
});

test('the calendar fires each event once per hour', () => {
  const fri3pm = new Date(2026, 9, 23, 15, 5);            // a Friday
  const due = dueEvents(fri3pm);
  assert.ok(due.some((d) => d.event.id === 'cake'));
  const fired = new Set(due.map((d) => d.key));
  assert.equal(dueEvents(fri3pm, fired).length, 0);
  assert.equal(dueEvents(new Date(2026, 9, 24, 15, 5)).some((d) => d.event.id === 'cake'), false, 'Saturday: no cake');
  assert.ok(EVENTS.some((e) => e.random));
});

test('visitors have a quip for every kind of agent mood', () => {
  for (const v of VISITORS) for (const s of ['working', 'blocked', 'ready', 'dark', 'idle', 'asking', 'thinking', 'done']) assert.ok(visitorQuip(v, s), `${v.name}/${s}`);
});
