import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act } from '../engine.js';
import { maximumTip, transferTip } from '../tips.js';

const bank = state => state.players.reduce((sum, player) => sum + player.stack + player.total, 0);
const send = (state, fromId = 0, toId = 1, chips = { 100: 2, 500: 1 }) => transferTip(state, { fromId, toId, chips, at: 12345 });

test('tip moves only existing chips and preserves the selected denominations', () => {
  const initial = createGame(), before = structuredClone(initial);
  const next = send(initial);
  assert.equal(next.players[0].stack, 9300);
  assert.equal(next.players[1].stack, 10700);
  assert.equal(bank(next), bank(initial));
  assert.deepEqual(initial, before);
  assert.deepEqual(next.tipTransfers[0].chips, { 100: 2, 500: 1 });
  assert.equal(next.log[0].kind, 'tip');
});

test('tip during a hand preserves pot, turn, betting rights, and all committed chips', () => {
  const initial = startHand(createGame());
  initial.wagerChips = { 1: { 50: 1 }, 2: { 100: 1 } };
  initial.handChips = { 50: 1, 100: 1 };
  const next = send(initial, 3, 2);
  for (const key of ['status', 'turn', 'pending', 'currentBet', 'minRaise', 'street', 'hand', 'dealer', 'sb', 'bb', 'wagerChips', 'handChips']) assert.deepEqual(next[key], initial[key]);
  next.players.forEach((player, i) => {
    const { stack, ...unchanged } = player;
    const { stack: previousStack, ...previous } = initial.players[i];
    assert.deepEqual(unchanged, previous);
  });
  assert.equal(bank(next), bank(initial));
});

test('rejects self transfers, unknown players, empty chips, and unsupported or negative counts', () => {
  const state = createGame();
  assert.throws(() => send(state, 0, 0));
  assert.throws(() => send(state, 99, 1));
  assert.throws(() => send(state, 0, 99));
  assert.throws(() => send(state, 0, 1, {}));
  assert.throws(() => send(state, 0, 1, { 100: -1 }));
  assert.throws(() => send(state, 0, 1, { 100: 1.5 }));
  assert.throws(() => send(state, 0, 1, { 123: 1 }));
  assert.throws(() => send(state, 0, 1, { 1000: 11 }));
});

test('an active player keeps one chip so tipping cannot silently change the action order', () => {
  const state = startHand(createGame());
  assert.equal(maximumTip(state, 3), 9999);
  assert.throws(() => send(state, 3, 0, { 5000: 2 }));
  const next = send(state, 3, 0, { 5000: 1, 1000: 4, 500: 1, 100: 4, 50: 1 });
  assert.equal(next.players[3].stack, 50);
  assert.equal(next.turn, 3);
  assert.equal(next.players[3].allIn, false);
});

test('folded and between-hand players can transfer their full uncommitted balance', () => {
  const ready = send(createGame(), 0, 1, { 5000: 2 });
  assert.equal(ready.players[0].stack, 0);
  let folded = startHand(createGame());
  folded = act(folded, 'fold');
  const next = send(folded, 3, 0, { 5000: 2 });
  assert.equal(next.players[3].stack, 0);
  assert.equal(next.players[3].folded, true);
  assert.equal(next.turn, folded.turn);
  assert.equal(bank(next), bank(folded));
});

test('receiving a tip does not reopen an all-in player’s betting this hand', () => {
  let state = startHand(createGame());
  state = act(state, 'allin');
  const next = send(state, 0, 3, { 500: 1 });
  assert.equal(next.players[3].stack, 500);
  assert.equal(next.players[3].allIn, true);
  assert.deepEqual(next.pending, state.pending);
  assert.equal(next.currentBet, state.currentBet);
});

test('a previous state snapshot exactly reverses a tip without changing total chips', () => {
  const state = startHand(createGame()), snapshot = structuredClone(state);
  const tipped = send(state, 0, 1);
  assert.equal(bank(tipped), bank(snapshot));
  assert.notDeepEqual(tipped.players, snapshot.players);
  assert.deepEqual(state, snapshot);
});
