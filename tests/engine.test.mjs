import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act, advanceStreet, turnInfo, getPots, settlePots } from '../engine.js';

const bank = s => s.players.reduce((sum, p) => sum + p.stack + p.total, 0);
const table = names => createGame({ names: names || ['가', '나', '다', '라'], stack: 10000, smallBlind: 50, bigBlind: 100 });

test('3–6 players only, valid integer chips and blinds', () => {
  assert.throws(() => table(['가', '나']));
  assert.throws(() => createGame({ stack: 1.5 }));
  assert.throws(() => createGame({ smallBlind: 100, bigBlind: 50 }));
  assert.throws(() => createGame({ stack: 100 }));
  assert.throws(() => table(['가', '', '다']));
});

test('posts blinds, preserves input, gives big blind its option', () => {
  const initial = table();
  let s = startHand(initial);
  assert.equal(initial.hand, 0);
  assert.equal(s.players[1].bet, 50);
  assert.equal(s.players[2].bet, 100);
  assert.equal(s.turn, 3);
  for (let i = 0; i < 3; i++) s = act(s, 'call');
  assert.equal(s.turn, 2);
  assert.equal(s.status, 'betting');
  assert.equal(turnInfo(s).call, 0);
  s = act(s, 'call');
  assert.equal(s.status, 'roundEnd');
  assert.equal(bank(s), 40000);
});

test('postflop opens left of dealer; each street ends after all checks', () => {
  let s = startHand(table());
  for (let street = 0; street < 4; street++) {
    for (let i = 0; i < 4; i++) s = act(s, 'call');
    if (street < 3) {
      assert.equal(s.status, 'roundEnd');
      s = advanceStreet(s);
      assert.equal(s.turn, 1);
      assert.equal(s.currentBet, 0);
      assert.ok(s.players.every(p => p.bet === 0));
    }
  }
  assert.equal(s.status, 'showdown');
  s = settlePots(s, [[0]]);
  assert.equal(s.players[0].stack, 10300);
  assert.equal(bank(s), 40000);
  s = startHand(s);
  assert.equal(s.dealer, 1);
  assert.equal(s.sb, 2);
  assert.equal(s.bb, 3);
});

test('folding to one player automatically awards entire pot', () => {
  let s = startHand(table());
  s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold');
  assert.equal(s.status, 'complete');
  assert.deepEqual(s.payouts, [{ id: 2, amount: 150 }]);
  assert.equal(s.players[2].stack, 10050);
  assert.equal(bank(s), 40000);
});

test('minimum raise enforced and full raise reopens action', () => {
  let s = startHand(table());
  assert.throws(() => act(s, 'raise', 199));
  s = act(s, 'raise', 300);
  assert.equal(s.currentBet, 300);
  assert.equal(s.minRaise, 200);
  assert.throws(() => act(s, 'raise', 499));
  s = act(s, 'call'); s = act(s, 'call'); s = act(s, 'raise', 500);
  assert.equal(s.turn, 3);
  assert.equal(turnInfo(s).canRaise, true);
  assert.equal(turnInfo(s).minTotal, 700);
});

test('short all-in requires a call but does not reopen a previous caller’s raise rights', () => {
  let s = table(); s.players[2].stack = 150;
  s = startHand(s);
  s = act(s, 'call'); s = act(s, 'call'); s = act(s, 'call');
  s = act(s, 'allin');
  assert.equal(s.currentBet, 150); assert.equal(s.minRaise, 100);
  assert.equal(s.turn, 3); assert.equal(turnInfo(s).call, 50);
  assert.equal(turnInfo(s).canRaise, false); assert.equal(turnInfo(s).canAllIn, false);
  assert.throws(() => act(s, 'raise', 250));
  assert.throws(() => act(s, 'allin'));
  s = act(s, 'call'); s = act(s, 'call'); s = act(s, 'call');
  assert.equal(s.status, 'roundEnd');
});

test('unacted player can raise after a short all-in', () => {
  let s = table(); s.players[0].stack = 150; s = startHand(s);
  s = act(s, 'call'); s = act(s, 'allin');
  assert.equal(s.turn, 1); assert.equal(turnInfo(s).canRaise, true);
  assert.equal(turnInfo(s).minTotal, 250);
});

test('all-ins create main, side, and uncalled refund pots; chips are conserved', () => {
  let s = table(['가', '나', '다']);
  s.players[0].stack = 3000; s.players[1].stack = 1000; s.players[2].stack = 2000;
  s = startHand(s);
  s = act(s, 'allin'); s = act(s, 'allin'); s = act(s, 'allin');
  assert.equal(s.status, 'showdown');
  const pots = getPots(s);
  assert.deepEqual(pots.map(p => p.amount), [3000, 2000, 1000]);
  assert.deepEqual(pots.map(p => p.eligible), [[0, 1, 2], [0, 2], [0]]);
  assert.equal(pots[2].refund, true);
  assert.throws(() => settlePots(s, [[1], [1], []]));
  s = settlePots(s, [[1], [2], []]);
  assert.deepEqual(s.players.map(p => p.stack), [1000, 3000, 2000]);
  assert.deepEqual(s.refunds, [{ id: 0, amount: 1000 }]);
  assert.equal(bank(s), 6000);
});

test('folded chips remain in pots but folded players cannot win', () => {
  let s = startHand(table(['가', '나', '다']));
  s = act(s, 'raise', 300); s = act(s, 'fold'); s = act(s, 'call');
  while (s.status !== 'showdown') {
    if (s.status === 'roundEnd') s = advanceStreet(s); else s = act(s, 'call');
  }
  const pots = getPots(s);
  assert.equal(pots.length, 1, 'folded dead money does not create a separate side pot');
  assert.equal(pots.reduce((sum, p) => sum + p.amount, 0), 650);
  assert.ok(pots.every(p => !p.eligible.includes(1)));
  assert.throws(() => settlePots(s, pots.map(() => [1])));
  s = settlePots(s, pots.map(() => [0]));
  assert.equal(bank(s), 30000);
});

test('odd chips go clockwise from left of dealer and duplicate winners are rejected', () => {
  let s = table(['가', '나', '다']);
  s.status = 'showdown'; s.players.forEach(p => { p.stack -= 101; p.total = 101; });
  assert.throws(() => settlePots(s, [[1, 1]]));
  assert.throws(() => settlePots(s, [[]]));
  s = settlePots(s, [[0, 1]]);
  assert.equal(s.players[1].stack, 10051);
  assert.equal(s.players[0].stack, 10050);
  assert.equal(bank(s), 30000);
});

test('heads-up dealer is small blind and acts first preflop, last postflop', () => {
  let s = table(['가', '나', '다']); s.players[2].stack = 0;
  s = startHand(s);
  assert.equal(s.sb, s.dealer); assert.equal(s.bb, 1); assert.equal(s.turn, s.dealer);
  s = act(s, 'call'); s = act(s, 'call'); s = advanceStreet(s);
  assert.equal(s.turn, s.bb);
});

test('one active player cannot bet into all-in opponents', () => {
  let s = table(['가', '나', '다']); s.players[0].stack = 200;
  s = startHand(s); s = act(s, 'allin'); s = act(s, 'fold');
  assert.equal(turnInfo(s).canRaise, false);
  s = act(s, 'call');
  assert.equal(s.status, 'showdown');
});

test('deterministic randomized games maintain chip conservation and always terminate', () => {
  let seed = 731;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let count = 3; count <= 6; count++) {
    let s = table(Array.from({ length: count }, (_, i) => `P${i}`));
    for (let hand = 0; hand < 60 && s.players.filter(p => p.stack > 0).length > 1; hand++) {
      s = startHand(s);
      let actions = 0;
      while (!['showdown', 'complete'].includes(s.status)) {
        assert.ok(++actions < 300, 'hand must terminate');
        if (s.status === 'roundEnd') s = advanceStreet(s);
        else {
          const info = turnInfo(s), roll = random();
          if (roll < .13) s = act(s, 'fold');
          else if (roll < .2 && info.canAllIn) s = act(s, 'allin');
          else if (roll < .4 && info.canRaise) s = act(s, 'raise', Math.min(info.minTotal, info.maxTotal));
          else s = act(s, 'call');
        }
        assert.equal(bank(s), count * 10000);
        assert.ok(s.players.every(p => Number.isSafeInteger(p.stack) && p.stack >= 0));
      }
      if (s.status === 'showdown') s = settlePots(s, getPots(s).map(p => p.refund ? p.contributors : [p.eligible[Math.floor(random() * p.eligible.length)]]));
      assert.equal(bank(s), count * 10000);
    }
  }
});
