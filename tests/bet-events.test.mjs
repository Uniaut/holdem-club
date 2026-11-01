import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act, settlePots, getPots, clone } from '../engine.js';
import { transferTip } from '../tips.js';
import { classifyBetEvent, isVictoryEvent } from '../bet-events.js';

test('draft-like rerenders, minimum raises, ordinary calls and tips have no dramatic cue', () => {
  const state = startHand(createGame());
  assert.equal(classifyBetEvent(state, clone(state)), null);
  assert.equal(classifyBetEvent(state, act(state, 'raise', 200)), null);
  assert.equal(classifyBetEvent(state, act(state, 'call')), null);
  assert.equal(classifyBetEvent(state, transferTip(state, { fromId: 0, toId: 1, chips: { 100: 1 } })), null);
  assert.equal(classifyBetEvent(createGame(), state), null);
});

test('large committed raises get pressure; substantial reraises get the duel cue', () => {
  const state = startHand(createGame());
  const raised = act(state, 'raise', 1000);
  assert.equal(classifyBetEvent(state, raised).kind, 'big-raise');
  const reraised = act(raised, 'raise', 3000);
  const event = classifyBetEvent(raised, reraised);
  assert.equal(event.kind, 'raise-war');
  assert.equal(event.amount, 3000);
  assert.deepEqual(event.participants.map(player => player.id), [0, 3]);
});

test('big calls are distinct from ordinary chip payments', () => {
  const before = act(startHand(createGame()), 'raise', 3000);
  const event = classifyBetEvent(before, act(before, 'call'));
  assert.equal(event.kind, 'big-call');
  assert.equal(event.amount, 3000);
});

test('a second all-in becomes an all-in duel, including an all-in call', () => {
  const state = startHand(createGame());
  const first = act(state, 'allin');
  assert.equal(classifyBetEvent(state, first).kind, 'allin');
  const second = act(first, 'call');
  const event = classifyBetEvent(first, second);
  assert.equal(event.kind, 'allin-duel');
  assert.equal(event.amount, 10000);
  assert.deepEqual(event.participants.map(player => player.id), [0, 3]);
});

test('folding a tiny pot or returning a giant uncalled bet does not trigger a victory show', () => {
  let state = startHand(createGame());
  for (let i = 0; i < 2; i++) state = act(state, 'fold');
  assert.equal(classifyBetEvent(state, act(state, 'fold')), null);
  state = act(startHand(createGame()), 'allin');
  state = act(state, 'fold'); state = act(state, 'fold');
  assert.equal(classifyBetEvent(state, act(state, 'fold')), null);
});

function showdown({ count = 3, stake = 10000, allIn = true } = {}) {
  const state = createGame({ names: Array.from({ length: count }, (_, i) => `P${i}`) });
  state.hand = 1; state.status = 'showdown';
  state.players.forEach(player => { player.total = stake; player.stack = allIn ? 0 : 10000 - stake; player.allIn = allIn; });
  return state;
}

test('all-in doubling, tripling and a short-stack comeback receive different celebrations', () => {
  const double = showdown({ count: 3 });
  double.players[2].total = 0; double.players[2].stack = 10000; double.players[2].folded = true;
  assert.equal(classifyBetEvent(double, settlePots(double, [[0]])).kind, 'double-up');
  const triple = showdown();
  const event = classifyBetEvent(triple, settlePots(triple, [[0]]));
  assert.equal(event.kind, 'triple-up'); assert.equal(event.multiple, 3);
  const short = showdown({ stake: 300 });
  assert.equal(classifyBetEvent(short, settlePots(short, [[0]])).kind, 'comeback');
});

test('large won pots and multiple winners celebrate without treating a refund as a winner', () => {
  const single = showdown({ stake: 1000, allIn: false });
  assert.equal(classifyBetEvent(single, settlePots(single, [[0]])).kind, 'big-win');
  const shared = showdown({ count: 4, stake: 2000, allIn: false });
  assert.equal(classifyBetEvent(shared, settlePots(shared, [[0, 1]])).kind, 'split-pot');
  const refund = showdown({ allIn: false });
  [3000, 1000, 2000].forEach((amount, i) => { refund.players[i].total = amount; refund.players[i].stack = 10000 - amount; });
  const settled = settlePots(refund, [[1], [2], []]);
  assert.equal(getPots(refund).at(-1).refund, true);
  const event = classifyBetEvent(refund, settled);
  assert.deepEqual(event.participants.map(player => player.id), [1, 2]);
});

test('only a meaningful showdown gets a reveal cue; routine checks in small pots stay quiet', () => {
  for (const [stake, expected] of [[100, null], [1000, 'showdown']]) {
    const state = showdown({ count: 4, stake, allIn: false });
    state.status = 'betting'; state.street = 3; state.turn = 0; state.pending = [0]; state.currentBet = 0;
    const event = classifyBetEvent(state, act(state, 'call'));
    assert.equal(event?.kind || null, expected);
  }
});

test('event detection never modifies money, participants or the game state', () => {
  const before = startHand(createGame()), after = act(before, 'allin');
  const snapshots = [clone(before), clone(after)];
  const event = classifyBetEvent(before, after);
  assert.deepEqual([before, after], snapshots);
  assert.equal(isVictoryEvent(event), false);
  assert.equal(isVictoryEvent({ kind: 'double-up' }), true);
  assert.equal(isVictoryEvent(null), false);
});
