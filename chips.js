export const CHIP_TYPES = [
  { value: 1, label: '1', color: '#dce5e7', ink: '#1a3949' },
  { value: 5, label: '5', color: '#b05b41', ink: '#fff8e9' },
  { value: 25, label: '25', color: '#677caa', ink: '#fff' },
  { value: 50, label: '50', color: '#f5f1df', ink: '#123847' },
  { value: 100, label: '100', color: '#138453', ink: '#fff9e9' },
  { value: 500, label: '500', color: '#bd354c', ink: '#fff4e6' },
  { value: 1000, label: '1K', color: '#bc9950', ink: '#fff9e5' },
  { value: 5000, label: '5K', color: '#173b50', ink: '#fff5dc' },
  { value: 25000, label: '25K', color: '#765394', ink: '#fff2db' },
  { value: 100000, label: '100K', color: '#1a7aa6', ink: '#fff7df' },
  { value: 1000000, label: '1M', color: '#262c34', ink: '#e7c87e' },
  { value: 10000000, label: '10M', color: '#e3d0a1', ink: '#163a48' },
];

export function splitChips(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error('칩 금액은 0 이상의 정수여야 합니다.');
  let remaining = amount;
  return [...CHIP_TYPES].reverse().flatMap(chip => {
    const count = Math.floor(remaining / chip.value);
    remaining %= chip.value;
    return count ? [{ ...chip, count }] : [];
  });
}

export const draftAmount = draft => Object.entries(draft).reduce((sum, [value, count]) => sum + Number(value) * count, 0);
export const draftForAmount = amount => Object.fromEntries(splitChips(amount).map(({ value, count }) => [value, count]));

export const mergeChips = (...bags) => bags.reduce((result, bag) => {
  Object.entries(bag).forEach(([value, count]) => { result[value] = (result[value] || 0) + count; });
  return result;
}, {});

export function addDraftChip(draft, value, capacity) {
  if (!CHIP_TYPES.some(chip => chip.value === value)) throw Error('사용할 수 없는 칩입니다.');
  if (draftAmount(draft) + value > capacity) throw Error('남은 보유 칩보다 많이 쌓을 수 없습니다.');
  return { ...draft, [value]: (draft[value] || 0) + 1 };
}

export function removeDraftChip(draft, value) {
  const result = { ...draft };
  if (result[value] > 1) result[value]--;
  else delete result[value];
  return result;
}

export function chipOptions(state, info) {
  const amounts = [state.smallBlind, state.bigBlind, state.currentBet, state.minRaise, info.player.bet, info.player.stack];
  const unit = [100, 50, 25, 5, 1].find(value => amounts.every(amount => amount % value === 0));
  const large = CHIP_TYPES.filter(chip => chip.value >= 25000 && info.player.stack >= chip.value * 5).slice(-2).map(chip => chip.value);
  const change = CHIP_TYPES.filter(chip => chip.value < 100 && chip.value >= unit && chip.value % unit === 0).map(chip => chip.value);
  const values = [...new Set([...change, 100, 500, 1000, 5000, ...large])];
  return CHIP_TYPES.filter(chip => values.includes(chip.value));
}

export function raiseDraftInfo(state, info, draft) {
  const pay = draftAmount(draft);
  const target = info.player.bet + pay;
  const minimum = Math.min(info.minTotal, info.maxTotal);
  return {
    pay, target, minimum,
    minimumPay: minimum - info.player.bet,
    remaining: info.player.stack - pay,
    allIn: pay > 0 && pay === info.player.stack,
    valid: info.canRaise && Number.isSafeInteger(pay) && pay > 0 && pay <= info.player.stack && target > state.currentBet && (target >= info.minTotal || target === info.maxTotal),
  };
}
