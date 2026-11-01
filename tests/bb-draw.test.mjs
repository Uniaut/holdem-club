import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, chooseFirstBigBlind, startHand, act } from '../engine.js';

test('first-BB selection can reach every funded player and skips empty seats', () => {
  const state = createGame({ names: ['A', 'B', 'C', 'D', 'E', 'F'] });
  state.players[1].stack = 0;
  state.players[4].stack = 0;
  assert.deepEqual([.01, .26, .51, .99].map(value => chooseFirstBigBlind(state, () => value)), [0, 2, 3, 5]);
  assert.throws(() => chooseFirstBigBlind(state, () => 1));
  assert.throws(() => chooseFirstBigBlind(state, () => -1));
  assert.throws(() => chooseFirstBigBlind(state, () => NaN));
});

test('every chosen first BB gets correct dealer, SB, blinds, and action order for 3–6 players', () => {
  for (let count = 3; count <= 6; count++) {
    for (let winner = 0; winner < count; winner++) {
      const initial = createGame({ names: Array.from({ length: count }, (_, i) => `P${i}`) });
      const state = startHand(initial, { firstBigBlindId: winner });
      assert.equal(initial.hand, 0);
      assert.equal(state.bb, winner);
      assert.equal(state.sb, (winner - 1 + count) % count);
      assert.equal(state.dealer, (winner - 2 + count) % count);
      assert.equal(state.turn, (winner + 1) % count);
      assert.equal(state.players[state.bb].bet, 100);
      assert.equal(state.players[state.sb].bet, 50);
      assert.equal(state.initialBigBlindId, winner);
      assert.equal(state.players.reduce((sum, p) => sum + p.stack + p.total, 0), count * 10000);
      assert.equal(state.log.filter(entry => entry.kind === 'draw').length, 1);
    }
  }
});

test('heads-up first BB puts dealer/SB at the other funded seat', () => {
  const initial = createGame({ names: ['A', 'B', 'C', 'D'] });
  initial.players[1].stack = 0; initial.players[3].stack = 0;
  const state = startHand(initial, { firstBigBlindId: 2 });
  assert.equal(state.bb, 2);
  assert.equal(state.sb, 0);
  assert.equal(state.dealer, 0);
  assert.equal(state.turn, 0);
});

test('unfunded or unknown first-BB choices cannot start or mutate a game', () => {
  const initial = createGame(); initial.players[1].stack = 0;
  const before = structuredClone(initial);
  assert.throws(() => startHand(initial, { firstBigBlindId: 1 }));
  assert.throws(() => startHand(initial, { firstBigBlindId: 99 }));
  assert.deepEqual(initial, before);
  initial.players[0].stack = 0; initial.players[2].stack = 0;
  assert.throws(() => chooseFirstBigBlind(initial));
});

test('later hands rotate the button normally and never redraw the first BB', () => {
  let state = startHand(createGame(), { firstBigBlindId: 0 });
  const dealer = state.dealer;
  while (state.status === 'betting') state = act(state, 'fold');
  assert.equal(state.status, 'complete');
  state = startHand(state, { firstBigBlindId: 3 });
  assert.equal(state.dealer, (dealer + 1) % 4);
  assert.equal(state.bb, 1);
  assert.equal(state.initialBigBlindId, 0);
  assert.equal(state.log.filter(entry => entry.kind === 'draw').length, 1);
});
