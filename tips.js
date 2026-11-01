import { clone } from './engine.js';
import { CHIP_TYPES, draftAmount } from './chips.js';

export function maximumTip(state, playerId) {
  const player = state.players.find(player => player.id === playerId);
  if (!player) return 0;
  const stillPlaying = !['ready', 'complete'].includes(state.status) && !player.folded && !player.allIn;
  return Math.max(0, player.stack - (stillPlaying ? 1 : 0));
}

export function transferTip(input, { fromId, toId, chips, at = Date.now() }) {
  const from = input.players.find(player => player.id === fromId);
  const to = input.players.find(player => player.id === toId);
  if (!from || !to) throw Error('팁을 주고받을 플레이어를 선택해 주세요.');
  if (fromId === toId) throw Error('다른 플레이어를 받는 사람으로 선택해 주세요.');
  if (!chips || !Object.entries(chips).every(([value, count]) => CHIP_TYPES.some(chip => chip.value === Number(value)) && Number.isSafeInteger(count) && count > 0)) throw Error('보낼 칩을 다시 선택해 주세요.');
  const amount = draftAmount(chips);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('보낼 칩을 1개 이상 선택해 주세요.');
  if (amount > maximumTip(input, fromId)) {
    if (amount <= from.stack) throw Error('진행 중인 플레이어는 최소 1칩을 남겨 주세요.');
    throw Error('보내는 사람의 보유 칩을 초과했습니다.');
  }
  if (!Number.isSafeInteger(to.stack + amount)) throw Error('받는 사람의 칩 한도를 초과했습니다.');
  const state = clone(input);
  state.players.find(player => player.id === fromId).stack -= amount;
  state.players.find(player => player.id === toId).stack += amount;
  const entry = { fromId, toId, amount, chips: clone(chips), hand: state.hand, street: state.street, at };
  state.tipTransfers = [...(state.tipTransfers || []), entry].slice(-200);
  state.log.unshift({ text: `${from.name} → ${to.name} · 팁 ${amount.toLocaleString('en-US')}`, kind: 'tip', hand: state.hand, street: state.street });
  state.log = state.log.slice(0, 120);
  return state;
}
