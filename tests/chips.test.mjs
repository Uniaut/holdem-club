import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act, turnInfo } from '../engine.js';
import { splitChips, draftAmount, draftForAmount, mergeChips, addDraftChip, removeDraftChip, chipOptions, raiseDraftInfo } from '../chips.js';

test('exact chip decomposition for blinds, odd chips, and large pots', () => {
  for (const amount of [0, 1, 7, 25, 50, 150, 225, 777, 10000, 600000000]) {
    const chips = splitChips(amount);
    assert.equal(chips.reduce((sum, chip) => sum + chip.value * chip.count, 0), amount);
    assert.ok(chips.every(chip => Number.isSafeInteger(chip.count) && chip.count > 0));
  }
  assert.throws(() => splitChips(-1));
  assert.throws(() => splitChips(.5));
});

test('draft picks preserve denominations and never spend real player chips', () => {
  const state = startHand(createGame());
  const before = structuredClone(state);
  let draft = {};
  for (let n = 0; n < 5; n++) draft = addDraftChip(draft, 100, 10000);
  assert.deepEqual(draft, { 100: 5 });
  assert.equal(draftAmount(draft), 500);
  assert.deepEqual(state, before);
  assert.deepEqual(mergeChips({ 50: 1, 100: 1 }, draft), { 50: 1, 100: 6 });
});

test('removing chips and exceeding available stack cannot change committed money', () => {
  const draft = { 100: 2, 500: 1 };
  assert.deepEqual(removeDraftChip(draft, 100), { 100: 1, 500: 1 });
  assert.deepEqual(removeDraftChip(draft, 500), { 100: 2 });
  assert.deepEqual(draft, { 100: 2, 500: 1 });
  assert.throws(() => addDraftChip(draft, 500, 1000));
  assert.throws(() => addDraftChip(draft, 123, 10000));
});

test('OK requires a full minimum raise; draft amount means new chips paid now', () => {
  const state = startHand(createGame());
  const info = turnInfo(state);
  assert.equal(raiseDraftInfo(state, info, {}).valid, false);
  assert.equal(raiseDraftInfo(state, info, { 100: 1 }).valid, false);
  const draft = raiseDraftInfo(state, info, { 100: 2 });
  assert.equal(draft.valid, true);
  assert.equal(draft.pay, 200);
  assert.equal(draft.target, 200);
  assert.equal(draft.minimumPay, 200);
  const next = act(state, 'raise', draft.target);
  assert.equal(next.players[info.player.id].stack, info.player.stack - draft.pay);
});

test('small blind previously paid chips are included exactly once in total', () => {
  let state = startHand(createGame());
  state = act(state, 'call'); state = act(state, 'call');
  const info = turnInfo(state);
  assert.equal(info.player.bet, 50);
  const draft = raiseDraftInfo(state, info, { 50: 1, 100: 1 });
  assert.equal(draft.minimumPay, 150);
  assert.equal(draft.target, 200);
  assert.equal(draft.valid, true);
  const next = act(state, 'raise', draft.target);
  assert.equal(next.players[info.player.id].bet, 200);
  assert.equal(next.players[info.player.id].stack, info.player.stack - 150);
});

test('short all-in is valid, but exceeding capacity or reopening closed action is not', () => {
  let state = createGame(); state.players[3].stack = 150; state = startHand(state);
  const info = turnInfo(state);
  const short = raiseDraftInfo(state, info, draftForAmount(150));
  assert.equal(short.valid, true); assert.equal(short.allIn, true);
  assert.equal(raiseDraftInfo(state, info, draftForAmount(200)).valid, false);
  state = act(state, 'allin'); state = act(state, 'call'); state = act(state, 'call'); state = act(state, 'call');
  assert.equal(state.status, 'roundEnd');
});

test('chip selection includes exact change for custom blinds and contextual large chips', () => {
  for (const [smallBlind, bigBlind] of [[50, 100], [25, 75], [3, 7]]) {
    const state = startHand(createGame({ smallBlind, bigBlind })), info = turnInfo(state);
    const options = chipOptions(state, info);
    const draft = draftForAmount(raiseDraftInfo(state, info, {}).minimumPay);
    assert.ok(Object.keys(draft).every(value => options.some(chip => chip.value === Number(value))));
  }
  const state = startHand(createGame({ stack: 100000000 }));
  assert.ok(chipOptions(state, turnInfo(state)).some(chip => chip.value === 10000000));
});
