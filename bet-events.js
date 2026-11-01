const potOf = state => state.players.reduce((sum, player) => sum + player.total, 0);
const person = player => ({ id: player.id, name: player.name });
const won = (state, id) => (state.payouts.find(payout => payout.id === id)?.amount || 0) - (state.refunds?.find(refund => refund.id === id)?.amount || 0);

/** Classify committed game transitions only. UI drafts never enter this function. */
export function classifyBetEvent(before, after, actorId = before.turn) {
  if (before.hand !== after.hand) return null;
  const bb = before.bigBlind;
  if (after.status === 'complete' && before.status !== 'complete') {
    const winners = after.players.filter(player => won(after, player.id) > 0);
    const pot = after.finalPot;
    if (winners.length > 1 && pot >= bb * 12) return { kind: 'split-pot', amount: pot, participants: winners.map(person) };
    if (winners.length !== 1) return null;
    const winner = winners[0], previous = before.players.find(player => player.id === winner.id);
    const basis = previous.stack + previous.total;
    const ratio = basis > 0 ? winner.stack / basis : 0;
    const gain = won(after, winner.id) - previous.total;
    const common = { amount: won(after, winner.id), participants: [person(winner)], actorId: winner.id };
    if (previous.allIn && basis > 0 && ratio >= 1.95) {
      if (basis <= bb * 5) return { ...common, kind: 'comeback', multiple: Math.max(2, Math.round(ratio)) };
      if (ratio >= 2.95) return { ...common, kind: 'triple-up', multiple: Math.max(3, Math.round(ratio)) };
      return { ...common, kind: 'double-up', multiple: 2 };
    }
    if (pot >= Math.max(bb * 12, before.initialStack * .2) && gain >= Math.max(bb * 5, basis * .1)) return { ...common, kind: 'big-win' };
    return null;
  }
  if (before.status !== 'betting' || actorId === null) return null;
  const previous = before.players.find(player => player.id === actorId);
  const actor = after.players.find(player => player.id === actorId);
  if (!previous || !actor) return null;
  const paid = actor.total - previous.total;
  const pot = potOf(before);
  const common = { actorId, amount: paid, participants: [person(actor)] };
  if (paid > 0 && actor.allIn && !previous.allIn) {
    const opponents = before.players.filter(player => player.id !== actorId && player.allIn && !player.folded);
    return { ...common, amount: actor.bet, kind: opponents.length ? 'allin-duel' : 'allin', participants: [person(actor), ...opponents.map(person)] };
  }
  if (paid > 0 && after.currentBet > before.currentBet) {
    const increase = after.currentBet - before.currentBet;
    const aggressor = before.players.find(player => player.id !== actorId && player.bet === before.currentBet && /^(레이즈|베팅|올인)/.test(player.lastAction));
    if (aggressor && increase >= Math.max(bb * 4, pot * .4)) return { ...common, kind: 'raise-war', amount: actor.bet, participants: [person(actor), person(aggressor)] };
    if (increase >= Math.max(bb * 5, pot * .75)) return { ...common, kind: 'big-raise', amount: actor.bet };
  }
  if (paid >= bb * 8 && after.currentBet === before.currentBet && paid >= Math.max(pot * .35, previous.stack * .2)) return { ...common, kind: 'big-call' };
  if (after.status === 'showdown' && before.status !== 'showdown' && (potOf(after) >= bb * 8 || after.players.some(player => player.allIn && !player.folded))) {
    return { kind: 'showdown', amount: potOf(after), participants: after.players.filter(player => !player.folded).map(person) };
  }
  return null;
}

export const isVictoryEvent = event => !!event && ['big-win', 'double-up', 'triple-up', 'comeback', 'split-pot'].includes(event.kind);
