export const STREETS = ['프리플랍', '플랍', '턴', '리버'];
export const clone = value => structuredClone(value);
const live = s => s.players.filter(p => !p.folded);
const actionable = s => live(s).filter(p => !p.allIn);
const totalPot = s => s.players.reduce((sum, p) => sum + p.total, 0);
const next = (s, index, predicate) => {
  for (let n = 1; n <= s.players.length; n++) {
    const i = (index + n) % s.players.length;
    if (predicate(s.players[i])) return i;
  }
  return -1;
};
const ordered = (s, after, predicate) => Array.from({ length: s.players.length }, (_, n) => s.players[(after + n + 1) % s.players.length]).filter(predicate).map(p => p.id);
function log(s, text, kind = 'action') { s.log.unshift({ text, kind, hand: s.hand, street: s.street }); s.log = s.log.slice(0, 120); }
function pay(s, p, amount) { const actual = Math.min(p.stack, amount); p.stack -= actual; p.bet += actual; p.total += actual; p.allIn = p.stack === 0; return actual; }

export function createGame({ names = ['민준', '서연', '지호', '수빈'], stack = 10000, smallBlind = 50, bigBlind = 100 } = {}) {
  if (names.length < 3 || names.length > 6 || names.some(n => !String(n).trim() || String(n).length > 14)) throw Error('3~6명의 이름을 14자 이내로 입력해 주세요.');
  if (![stack, smallBlind, bigBlind].every(n => Number.isSafeInteger(n) && n > 0 && n <= 100000000) || smallBlind >= bigBlind || stack < bigBlind * 2) throw Error('시작 칩은 빅 블라인드의 2배 이상, 블라인드는 SB < BB로 설정해 주세요.');
  return { version: 1, players: names.map((name, i) => ({ id: i, name: name.trim(), stack, bet: 0, total: 0, folded: false, allIn: false, actedAtBet: null, lastAction: '' })), smallBlind, bigBlind, initialStack: stack, dealer: 0, hand: 0, street: 0, currentBet: 0, minRaise: bigBlind, pending: [], turn: null, status: 'ready', log: [], payouts: [], finalPot: 0 };
}

export function chooseFirstBigBlind(state, random = Math.random) {
  const eligible = state.players.filter(player => player.stack > 0);
  if (eligible.length < 2) throw Error('칩이 남은 플레이어가 2명 이상이어야 합니다.');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('BB 추첨을 다시 시작해 주세요.');
  return eligible[Math.floor(value * eligible.length)].id;
}

export function startHand(input, { firstBigBlindId } = {}) {
  const s = clone(input);
  if (!['ready', 'complete'].includes(s.status)) throw Error('현재 핸드를 먼저 마무리해 주세요.');
  if (s.players.filter(p => p.stack > 0).length < 2) throw Error('칩이 남은 플레이어가 2명 이상이어야 합니다. 새 테이블을 만들어 주세요.');
  if (s.hand === 0 && firstBigBlindId !== undefined) {
    const funded = s.players.filter(player => player.stack > 0).map(player => player.id);
    const bigBlindIndex = funded.indexOf(firstBigBlindId);
    if (bigBlindIndex < 0) throw Error('칩이 남은 플레이어 중 첫 BB를 선택해 주세요.');
    s.dealer = funded[(bigBlindIndex - (funded.length === 2 ? 1 : 2) + funded.length) % funded.length];
    s.initialBigBlindId = firstBigBlindId;
  }
  if (s.hand > 0 || s.players[s.dealer].stack === 0) s.dealer = next(s, s.dealer, p => p.stack > 0);
  s.hand++; s.street = 0; s.status = 'betting'; s.currentBet = s.bigBlind; s.minRaise = s.bigBlind; s.payouts = []; s.refunds = []; s.finalPot = 0;
  s.players.forEach(p => { p.bet = 0; p.total = 0; p.folded = p.stack === 0; p.allIn = false; p.actedAtBet = null; p.lastAction = p.folded ? '칩 소진' : ''; });
  const headsUp = live(s).length === 2;
  const sb = headsUp ? s.dealer : next(s, s.dealer, p => !p.folded);
  const bb = next(s, sb, p => !p.folded);
  s.sb = sb; s.bb = bb;
  log(s, `핸드 #${s.hand} · 딜러 ${s.players[s.dealer].name}`, 'hand');
  const sbPaid = pay(s, s.players[sb], s.smallBlind), bbPaid = pay(s, s.players[bb], s.bigBlind);
  s.players[sb].lastAction = `SB ${sbPaid.toLocaleString()}`; s.players[bb].lastAction = `BB ${bbPaid.toLocaleString()}`;
  log(s, `블라인드 ${sbPaid.toLocaleString()} / ${bbPaid.toLocaleString()} 게시`);
  if (s.hand === 1 && firstBigBlindId !== undefined) log(s, `첫 BB 추첨 · ${s.players[bb].name}`, 'draw');
  s.pending = ordered(s, bb, p => !p.folded && !p.allIn);
  return progress(s);
}

export function turnInfo(s) {
  const p = s.players.find(p => p.id === s.turn);
  if (!p || s.status !== 'betting') return null;
  const call = Math.max(0, s.currentBet - p.bet);
  const mayRaise = p.actedAtBet === null || s.currentBet - p.actedAtBet >= s.minRaise;
  const othersCanBet = actionable(s).some(other => other.id !== p.id);
  return { player: p, call, callPay: Math.min(p.stack, call), minTotal: s.currentBet + s.minRaise, maxTotal: p.bet + p.stack, canRaise: mayRaise && othersCanBet && p.stack > call, canAllIn: p.stack <= call || (mayRaise && othersCanBet) };
}

export function act(input, type, target) {
  const s = clone(input), info = turnInfo(s);
  if (!info) throw Error('지금은 베팅할 차례가 아닙니다.');
  const p = info.player;
  let raised = false, text = '';
  if (type === 'fold') { p.folded = true; p.lastAction = '폴드'; text = `${p.name} 폴드`; }
  else if (type === 'call') {
    const amount = pay(s, p, info.callPay);
    p.lastAction = amount ? (p.allIn ? `올인 ${amount.toLocaleString()}` : `콜 ${amount.toLocaleString()}`) : '체크';
    text = `${p.name} ${p.lastAction}`;
  } else if (type === 'raise' || type === 'allin') {
    const amount = type === 'allin' ? info.maxTotal : Number(target);
    if (type === 'allin' && !info.canAllIn) throw Error('현재는 레이즈가 다시 열리지 않았습니다. 콜 또는 폴드를 선택해 주세요.');
    if (amount <= s.currentBet) {
      if (type !== 'allin') throw Error('현재 베팅보다 큰 금액을 입력해 주세요.');
      pay(s, p, p.stack); p.lastAction = `올인 ${p.bet.toLocaleString()}`;
    } else {
      if (!info.canRaise) throw Error('현재는 레이즈할 수 없습니다.');
      if (!Number.isSafeInteger(amount) || amount > info.maxTotal || (amount < info.minTotal && amount !== info.maxTotal)) throw Error(`최소 ${info.minTotal.toLocaleString()}까지 레이즈하거나 올인해 주세요.`);
      const increase = amount - s.currentBet;
      pay(s, p, amount - p.bet);
      if (increase >= s.minRaise) { s.minRaise = increase; raised = true; }
      s.currentBet = amount;
      p.lastAction = `${p.allIn ? '올인' : '레이즈'} ${amount.toLocaleString()}`;
    }
    text = `${p.name} ${p.lastAction}`;
  } else throw Error('알 수 없는 액션입니다.');
  p.actedAtBet = s.currentBet;
  log(s, text, p.allIn ? 'allin' : 'action');
  s.pending = raised ? ordered(s, p.id, q => !q.folded && !q.allIn && q.id !== p.id) : ordered(s, p.id, q => !q.folded && !q.allIn && q.id !== p.id && (s.pending.includes(q.id) || q.bet < s.currentBet));
  return progress(s);
}

function progress(s) {
  const remaining = live(s);
  if (remaining.length === 1) return finish(s, [{ id: remaining[0].id, amount: totalPot(s) }]);
  const canAct = actionable(s);
  if (canAct.length === 0 || (canAct.length === 1 && canAct[0].bet >= s.currentBet)) s.pending = [];
  s.pending = s.pending.filter(id => canAct.some(p => p.id === id));
  if (!s.pending.length) {
    s.turn = null;
    s.status = s.street === 3 || canAct.length < 2 ? 'showdown' : 'roundEnd';
    if (s.status === 'showdown') log(s, '쇼다운 · 카드를 공개하고 각 팟의 승자를 선택하세요.', 'stage');
    else log(s, `${STREETS[s.street]} 베팅 종료`, 'stage');
  } else s.turn = s.pending[0];
  return s;
}

export function advanceStreet(input) {
  const s = clone(input);
  if (s.status !== 'roundEnd') throw Error('모든 플레이어의 액션을 먼저 마쳐 주세요.');
  s.street++; s.status = 'betting'; s.currentBet = 0; s.minRaise = s.bigBlind;
  s.players.forEach(p => { p.bet = 0; p.actedAtBet = null; if (!p.folded && !p.allIn) p.lastAction = ''; });
  s.pending = ordered(s, s.dealer, p => !p.folded && !p.allIn);
  log(s, `${STREETS[s.street]} · 실제 카드를 펼쳐 주세요`, 'stage');
  return progress(s);
}

export function getPots(s) {
  const levels = [...new Set(s.players.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
  let previous = 0;
  const layers = levels.map(level => {
    const contributors = s.players.filter(p => p.total >= level);
    const amount = (level - previous) * contributors.length; previous = level;
    return { amount, eligible: contributors.filter(p => !p.folded).map(p => p.id), contributors: contributors.map(p => p.id), refund: contributors.length === 1 };
  });
  return layers.reduce((pots, pot) => {
    const previousPot = pots.at(-1);
    if (previousPot && !previousPot.refund && !pot.refund && previousPot.eligible.join(',') === pot.eligible.join(',')) {
      previousPot.amount += pot.amount;
      previousPot.contributors = [...new Set([...previousPot.contributors, ...pot.contributors])];
    } else pots.push(pot);
    return pots;
  }, []);
}

export function settlePots(input, selections) {
  if (input.status !== 'showdown') throw Error('쇼다운에서 승자를 선택해 주세요.');
  const s = clone(input), pots = getPots(s), awards = new Map(), refunds = [];
  pots.forEach((pot, i) => {
    let ids = pot.refund ? pot.contributors : pot.eligible.length === 1 ? pot.eligible : selections[i];
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !pot.eligible.includes(id) && !pot.refund)) throw Error(`${i + 1}번 팟의 승자를 선택해 주세요.`);
    const order = ordered(s, s.dealer, p => ids.includes(p.id));
    const share = Math.floor(pot.amount / ids.length), odd = pot.amount % ids.length;
    order.forEach((id, n) => awards.set(id, (awards.get(id) || 0) + share + (n < odd ? 1 : 0)));
    if (pot.refund) refunds.push({ id: ids[0], amount: pot.amount });
  });
  return finish(s, [...awards].map(([id, amount]) => ({ id, amount })), refunds);
}

function finish(s, payouts, refunds = []) {
  s.finalPot = totalPot(s); s.payouts = payouts; s.refunds = refunds; s.status = 'complete'; s.turn = null; s.pending = [];
  payouts.forEach(({ id, amount }) => { s.players[id].stack += amount; });
  log(s, payouts.map(({ id, amount }) => {
    const refund = refunds.find(p => p.id === id)?.amount || 0;
    return `${s.players[id].name}${amount > refund ? ` +${(amount - refund).toLocaleString()}` : ''}${refund ? ` (반환 +${refund.toLocaleString()})` : ''}`;
  }).join(' · '), 'win');
  s.players.forEach(p => { p.bet = 0; p.total = 0; });
  return s;
}
