const esc = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const format = value => Number(value).toLocaleString('en-US');
const suits = ['♠', '♦', '♣', '♥', '✦', '★'];
const copies = {
  'big-raise': ['TURN UP THE PRESSURE', 'BIG RAISE', '판을 크게 올린다', 'blue'],
  'raise-war': ['YOU RAISE. I RAISE.', 'RAISE WAR', '재레이즈로 맞불!', 'red'],
  'big-call': ['CHALLENGE ACCEPTED', 'BIG CALL', '그 판돈, 받아주지.', 'green'],
  allin: ['NO CHIPS LEFT. ALL HEART.', 'ALL IN', '전부를 건 한 수', 'gold'],
  'allin-duel': ['NO TURNING BACK', 'ALL-IN DUEL', '올인 맞대결', 'purple'],
  showdown: ['THE MOMENT OF TRUTH', 'SHOWDOWN', '이제 카드를 공개할 시간', 'blue'],
  'big-win': ['THE POT IS YOURS', 'SCOOP!', '큰 팟의 주인공', 'gold'],
  'double-up': ['BACK WITH TWICE THE CHIPS', 'DOUBLE UP!', '올인 승리, 칩 두 배!', 'gold'],
  'triple-up': ['THAT IS HOW YOU PLAY IT', 'TRIPLE UP!', '한 방에 불어난 칩', 'gold'],
  comeback: ['STILL IN THE GAME', 'COMEBACK!', '짧은 스택의 반격', 'green'],
  'split-pot': ['MORE THAN ONE WINNER', 'POT PARTY!', '팟을 나눠 가진 주인공들', 'blue'],
};
let cleanup = () => {};

export function clearBetEffect() { cleanup(); cleanup = () => {}; }

export function showBetEffect(event) {
  if (!event || !copies[event.kind]) return;
  clearBetEffect();
  const stage = document.querySelector('.table-scene');
  const original = stage?.getBoundingClientRect();
  const visible = original && original.bottom > 90 && original.top < innerHeight - 100;
  const bounds = visible ? { x: original.x, y: Math.max(0, original.y), width: original.width, height: Math.max(180, Math.min(original.bottom, innerHeight) - Math.max(0, original.y)) } : { x: 6, y: 65, width: innerWidth - 12, height: Math.min(340, innerHeight * .48) };
  const [kicker, baseTitle, detail, color] = copies[event.kind];
  const title = event.kind === 'allin-duel' && event.participants.length > 2 ? `${event.participants.length}-WAY ALL IN` : event.kind === 'triple-up' && event.multiple > 3 ? `${event.multiple}× UP!` : baseTitle;
  const duel = ['allin-duel', 'raise-war'].includes(event.kind);
  const root = document.createElement('div');
  root.className = `bet-event event-${event.kind} event-color-${color} ${duel ? 'event-duel' : ''}`;
  root.dataset.event = event.kind; root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  root.innerHTML = `<div class="event-veil"></div><div class="event-orbit orbit-one"></div><div class="event-orbit orbit-two"></div><div class="event-rays">${Array.from({ length: 14 }, (_, i) => `<i style="--ray:${i};--angle:${i * 360 / 14}deg"></i>`).join('')}</div><div class="event-banner"><div class="event-kicker">${kicker}</div><div class="event-duel-line">${duel ? `<span class="event-player"><i>${suits[event.participants[0].id % suits.length]}</i><b>${esc(event.participants[0].name)}</b></span><span class="event-vs">VS</span><span class="event-player"><i>${suits[event.participants[1].id % suits.length]}</i><b>${esc(event.participants[1].name)}${event.participants.length > 2 ? ` 외 ${event.participants.length - 2}명` : ''}</b></span>` : `<span class="event-actor">${event.kind === 'showdown' ? `${event.participants.length} PLAYERS` : event.participants.map(player => esc(player.name)).join(' · ')}</span>`}</div><strong class="event-title">${title}</strong><div class="event-detail">${detail}</div><div class="event-amount"><b>${format(event.amount)}</b><span>CHIPS</span></div><span class="event-speedline speedline-left"></span><span class="event-speedline speedline-right"></span></div>`;
  document.querySelector('#effects').append(root);
  const duration = duel || ['allin', 'double-up', 'triple-up', 'comeback'].includes(event.kind) ? 2050 : 1650;
  root.style.setProperty('--event-duration', `${duration}ms`);
  const felt = stage?.querySelector('.felt');
  const impact = ['big-raise', 'raise-war', 'allin', 'allin-duel'].includes(event.kind) ? felt?.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(-2px,0)' }, { transform: 'translate(0,0)' }], { duration: 360, easing: 'ease-out' }) : null;
  const timer = setTimeout(() => { root.remove(); impact?.cancel(); }, duration + 80);
  cleanup = () => { clearTimeout(timer); root.remove(); impact?.cancel(); };
}
