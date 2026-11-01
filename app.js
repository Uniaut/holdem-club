import { createGame, startHand, chooseFirstBigBlind, act, advanceStreet, turnInfo, getPots, settlePots, STREETS, clone } from './engine.js';
import { CHIP_TYPES, splitChips, draftAmount, draftForAmount, mergeChips, addDraftChip, removeDraftChip, chipOptions, raiseDraftInfo } from './chips.js';
import { maximumTip, transferTip } from './tips.js';
import { classifyBetEvent, isVictoryEvent } from './bet-events.js';
import { showBetEffect, clearBetEffect } from './bet-effects.js';

const $ = selector => document.querySelector(selector);
const fmt = value => Number(value).toLocaleString('en-US');
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'holdem-club-v1';
const wonAmount = id => (state.payouts.find(p => p.id === id)?.amount || 0) - (state.refunds?.find(p => p.id === id)?.amount || 0);
const colors = ['sage', 'peach', 'lavender', 'sky', 'rose', 'gold'];
const avatars = ['♠', '♦', '♣', '♥', '✦', '★'];
const icons = {
  settings: '<path d="m9.7 4 .7-2h3.2l.7 2 2 .9 2.1-.4 1.6 2.8-1.4 1.6.2 2.2 1.3 1.7-1.6 2.8-2.1-.4-2 .9-.7 2h-3.2l-.7-2-2-.9-2.1.4-1.6-2.8 1.3-1.7.2-2.2L3.2 7.3l1.6-2.8 2.1.4 2-.9Z"/><circle cx="12" cy="10.5" r="3"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4V4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  undo: '<path d="m8 4-5 5 5 5"/><path d="M3 9h11a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3c-1 .5-1 1-1 3m0 3h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v6m-5 1h10"/>',
  chip: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v4m0 10v4M3 12h4m10 0h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gift: '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.chip}</svg>`;
let state = createGame();
let history = [];
let sound = false;
let effectLevel = 'full';
let chipDraft = {};
let selectedTab = 'activity';
let toastTimer, audioContext;
let saveAvailable = true;
let layoutObserver;
let fitFrame;
let openingDraw = false;
let confettiFrame;

// Keep long chip amounts readable inside their enlarged, responsive slots.
function fitText() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    document.querySelectorAll('[data-fit],.seat-identity strong,#pot-number,.call-button strong,.blind-amount').forEach(element => {
      element.style.removeProperty('font-size');
      const minimum = element.matches('.call-button strong') ? 9 : 11;
      for (let attempt = 0; attempt < 3 && element.clientWidth > 0 && element.scrollWidth > element.clientWidth; attempt++) {
        const size = parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${Math.max(minimum, Math.floor(size * element.clientWidth / element.scrollWidth))}px`;
      }
    });
  });
}

document.fonts?.ready.then(fitText);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved?.state?.version === 1 && Array.isArray(saved.state.players) && saved.state.players.length >= 3 && saved.state.players.length <= 6 && saved.state.players.every((p, i) => p.id === i && Number.isSafeInteger(p.stack) && p.stack >= 0 && typeof p.name === 'string') && ['ready', 'betting', 'roundEnd', 'showdown', 'complete'].includes(saved.state.status)) {
    state = saved.state;
    history = Array.isArray(saved.history) ? saved.history.slice(-40) : [];
    sound = !!saved.sound;
    effectLevel = saved.effectLevel === 'quiet' ? 'quiet' : 'full';
  }
} catch { /* An unavailable or damaged save starts a fresh table. */ }

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ state, history, sound, effectLevel })); }
  catch { if (saveAvailable) toast('브라우저 저장 공간을 사용할 수 없습니다. 창을 닫으면 진행 상황이 사라집니다.'); saveAvailable = false; }
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
}
function commit(nextState, effect = '', placedChips = null, { preserveDraft = false } = {}) {
  const previous = state;
  const event = classifyBetEvent(previous, nextState);
  if (nextState.hand !== previous.hand || nextState.status === 'ready') stopMajorEffects();
  const previousPot = previous.players.reduce((sum, player) => sum + player.total, 0);
  if (nextState.hand !== previous.hand || nextState.status === 'ready') {
    nextState.wagerChips = Object.fromEntries(nextState.players.map(player => [player.id, draftForAmount(player.bet)]));
    nextState.handChips = mergeChips(...Object.values(nextState.wagerChips));
  } else {
    nextState.wagerChips = Object.fromEntries(previous.players.map(player => [player.id, previous.wagerChips?.[player.id] || draftForAmount(player.bet)]));
    nextState.handChips = previous.handChips || draftForAmount(previousPot);
    nextState.players.forEach(player => {
      const paid = player.total - previous.players[player.id].total;
      if (paid <= 0) return;
      const added = player.id === previous.turn && placedChips && draftAmount(placedChips) === paid ? placedChips : draftForAmount(paid);
      nextState.wagerChips[player.id] = mergeChips(nextState.wagerChips[player.id], added);
      nextState.handChips = mergeChips(nextState.handChips, added);
    });
    if (nextState.street !== previous.street) nextState.wagerChips = {};
  }
  history.push(clone(state)); history = history.slice(-40); state = nextState;
  if (!preserveDraft) chipDraft = {};
  save(); render();
  if (state.status === 'complete' && previous.status !== 'complete') celebrate(event);
  else if (effect) {
    const paid = previous.turn === null ? 0 : Math.max(0, nextState.players[previous.turn].total - previous.players[previous.turn].total);
    playEffect(effect, previous.turn, placedChips || draftForAmount(paid));
  }
  if (event) {
    if (motionAllowed()) showBetEffect(event);
    tone(event.kind);
  }
  return event;
}

function render() {
  document.body.dataset.effects = effectLevel;
  const info = turnInfo(state);
  const funded = state.players.filter(p => p.stack > 0 || (!p.folded && p.total > 0)).length;
  $('#app').innerHTML = `
    <header class="header">
      <a class="brand" href="/" aria-label="Holdem Club 홈"><span class="brand-mark">♠</span><span>holdem<span class="brand-club">CLUB</span></span></a>
      <button class="tip-launcher" data-action="tip" aria-label="팁 보내기">${icon('gift')}<span>팁 보내기</span><small>CHIPS → FRIENDS</small></button>
      <div class="header-divider"></div>
      <span class="nav-active"><span class="live-dot"></span> 라이브 테이블</span>
      <div class="header-right"><span class="local-label">HOME GAME, GOOD TIMES.</span><button class="icon-button" data-action="help" title="사용 방법" aria-label="사용 방법">${icon('help')}</button><button class="icon-button ${sound ? 'enabled' : ''}" data-action="sound" title="효과음 ${sound ? '끄기' : '켜기'}" aria-label="효과음 ${sound ? '끄기' : '켜기'}" aria-pressed="${sound}">${icon(sound ? 'sound' : 'mute')}</button><button class="icon-button" data-action="fullscreen" title="전체 화면" aria-label="전체 화면">${icon('fullscreen')}</button><button class="settings-button" data-action="setup">${icon('settings')}<span>테이블 설정</span></button></div>
    </header>
    <main class="main">
      <div class="page-heading"><div><div class="eyebrow"><span class="tiny-diamond">◆</span> YOUR PRIVATE POKER NIGHT</div><h1>오늘 밤, 한 판 더<span class="heading-dot">.</span></h1><p>카드는 손에, 칩은 화면에. 함께 즐기는 우리만의 홀덤.</p></div><div class="session-pill"><span class="live-dot"></span>${state.status === 'ready' ? '테이블 준비 완료' : state.status === 'complete' ? '핸드 종료' : '게임 진행 중'}<span class="pill-divider"></span>${state.players.length} PLAYERS</div></div>
      <div class="workspace">
        <section class="table-panel" aria-label="홀덤 테이블">
          <div class="table-toolbar"><div class="table-name"><span class="table-dot"></span> THE HOME TABLE <span class="table-number">01</span></div><div class="table-tools"><span>NO LIMIT</span><span class="toolbar-divider">/</span><span>HOLD’EM</span><button data-action="undo" class="undo-button" ${history.length ? '' : 'disabled'} title="실행 취소 (Ctrl/⌘ + Z)">${icon('undo')}<span>되돌리기</span></button></div></div>
          <div class="table-scene count-${state.players.length} ${state.status === 'complete' ? 'hand-won' : ''}" id="table-scene">
            <div class="felt"><div class="felt-line"></div><div class="felt-watermark">♠</div><span class="felt-label">GOOD HANDS. GREAT COMPANY.</span></div>
            <div class="pot-display ${state.status === 'complete' ? 'won-pot' : ''}">
              <div class="pot-eyebrow">${state.status === 'complete' ? 'HAND COMPLETE' : 'TOTAL POT'}</div>
              <div class="pot-number" id="pot-number">${fmt(state.status === 'complete' ? state.finalPot : state.players.reduce((sum, p) => sum + p.total, 0))}<span>CHIPS</span></div>
              <div class="pot-chips actual-pot-chips">${renderChipPiles(state.status === 'complete' ? state.finalPot : state.players.reduce((sum, p) => sum + p.total, 0), false, state.handChips)}</div>
              ${renderCenterStatus()}
            </div>
            ${state.players.map((p, i) => renderSeat(p, i)).join('')}
            <span class="table-corner corner-left">${icon('chip')} VIRTUAL CHIPS ONLY</span><span class="table-corner corner-right">LET THE GOOD TIMES ROLL ↗</span>
          </div>
          <div class="table-footer"><div class="chip-legend"><span class="legend-title">CHIP VALUES</span><span><i class="legend-chip mint"></i>100</span><span><i class="legend-chip rose"></i>500</span><span><i class="legend-chip gold"></i>1K</span><span><i class="legend-chip dark"></i>5K</span></div><span class="table-footer-note">${saveAvailable ? '<span class="saved-dot"></span> 이 기기에 자동 저장' : '저장 불가 · 창을 유지해 주세요'}</span></div>
        </section>
        <aside class="sidebar">
          <section class="session-card"><div class="card-heading"><h2>테이블 정보</h2><span class="subtle-tag">LIVE</span></div><div class="blind-label">SMALL / BIG BLIND</div><div class="blind-amount">${fmt(state.smallBlind)}<span>/</span>${fmt(state.bigBlind)}<span class="blind-unit">CHIPS</span></div><div class="session-stat-row"><span>${icon('users')} 플레이어</span><strong>${funded}<span> / ${state.players.length}</span></strong></div><div class="session-stat-row"><span>${icon('chip')} 핸드</span><strong>#${String(state.hand).padStart(2, '0')}</strong></div></section>
          <section class="street-card"><div class="card-heading"><h2>게임 흐름</h2><span class="subtle-note">${state.status === 'ready' ? 'READY' : state.status === 'complete' ? 'COMPLETE' : 'IN PLAY'}</span></div><div class="street-track">${STREETS.map((name, i) => `<div class="street-item ${state.hand && state.street === i && state.status !== 'complete' ? 'current' : ''} ${state.hand && (state.street > i || state.status === 'complete') ? 'passed' : ''}"><span class="street-node">${state.hand && (state.street > i || state.status === 'complete') ? icon('check') : String(i + 1).padStart(2, '0')}</span><span>${name}</span>${state.hand && state.street === i && state.status !== 'complete' ? '<span class="stage-here">NOW</span>' : ''}</div>`).join('')}</div></section>
          <section class="activity-card"><div class="activity-tabs"><button data-tab="activity" class="${selectedTab === 'activity' ? 'active' : ''}">플레이 기록</button><button data-tab="ranking" class="${selectedTab === 'ranking' ? 'active' : ''}">칩 순위</button><span>${selectedTab === 'activity' ? icon('clock') : icon('trophy')}</span></div><div class="activity-content">${selectedTab === 'activity' ? renderLog() : renderRanking()}</div></section>
        </aside>
      </div>
      ${renderDock(info)}
      <footer class="page-footer"><span><span class="footer-spade">♠</span> A LITTLE LUCK. A LOT OF GOOD COMPANY.</span><span>실물 카드와 함께 사용하는 가상 칩 테이블 <span class="footer-dot">·</span> <button data-action="help">사용 가이드 ${icon('arrow')}</button></span></footer>
    </main>`;
  layoutObserver?.disconnect();
  layoutObserver = new ResizeObserver(fitText);
  document.querySelectorAll('.table-scene,.action-dock').forEach(element => layoutObserver.observe(element));
  fitText();
}

function renderSeat(p, i) {
  const positions = {
    3: [[50, 9], [84, 72], [16, 72]],
    4: [[50, 9], [86, 50], [50, 90], [14, 50]],
    5: [[28, 10], [72, 10], [87, 66], [50, 91], [13, 66]],
    6: [[28, 10], [72, 10], [88, 50], [72, 90], [28, 90], [12, 50]],
  };
  const [x, y] = positions[state.players.length][i];
  const active = p.id === state.turn && state.status === 'betting';
  const winner = state.status === 'complete' && wonAmount(p.id) > 0;
  return `<article class="seat ${active ? 'is-turn' : ''} ${p.folded ? 'is-folded' : ''} ${p.allIn && !p.folded && state.status !== 'complete' ? 'is-allin' : ''} ${winner ? 'is-winner' : ''}" style="--x:${x}%;--y:${y}%;--seat-color:var(--${colors[i]})" data-seat="${p.id}" aria-label="${esc(p.name)} ${fmt(p.stack)}칩${active ? ', 현재 차례' : ''}">
    ${active ? '<div class="turn-ribbon"><span></span> YOUR TURN</div>' : winner ? '<div class="winner-ribbon">♛ WINNER</div>' : ''}
    <div class="seat-top"><span class="avatar ${colors[i]}">${avatars[i]}<small>${String(i + 1).padStart(2, '0')}</small></span><div class="seat-identity"><strong>${esc(p.name)}</strong><span>${state.status === 'ready' ? 'READY TO PLAY' : p.folded ? (p.stack === 0 && p.total === 0 ? '칩 소진' : 'FOLDED') : p.allIn && state.status !== 'complete' ? 'ALL IN 🔥' : winner ? `+${fmt(wonAmount(p.id))} CHIPS` : state.status === 'complete' && state.refunds?.some(a => a.id === p.id) ? `미콜 반환 +${fmt(state.refunds.find(a => a.id === p.id).amount)}` : active ? '액션을 선택하세요' : p.lastAction || '액션 대기'}</span></div><div class="seat-badges">${state.dealer === i ? '<span class="dealer-badge" title="딜러 버튼">D</span>' : ''}${state.hand > 0 && state.status !== 'complete' && state.sb === i ? '<span class="blind-badge">SB</span>' : ''}${state.hand > 0 && state.status !== 'complete' && state.bb === i ? '<span class="blind-badge">BB</span>' : ''}</div></div>
    <div class="seat-balance"><span class="stack-value" data-fit>${fmt(p.stack)}</span><span class="stack-unit">CHIPS</span></div>
    ${p.bet > 0 ? `<div class="seat-bet actual-wager ${y < 30 ? 'bet-bottom' : y > 75 ? 'bet-top' : x < 50 ? 'bet-right' : 'bet-left'}"><div class="wager-piles">${renderChipPiles(p.bet, false, state.wagerChips?.[p.id])}</div><strong>${fmt(p.bet)}</strong></div>` : ''}
  </article>`;
}

function renderCenterStatus() {
  if (state.status === 'ready') return '<div class="center-status"><span class="center-pill">THE NIGHT IS YOUNG</span><p>좋은 사람들과, 좋은 한 판.</p></div>';
  if (state.status === 'complete') return `<div class="center-status"><span class="center-pill winner-pill">${icon('trophy')} ${esc(state.payouts.filter(p => wonAmount(p.id) > 0).map(p => state.players[p.id].name).join(' · '))}</span><p>축하합니다! 다음 핸드도 행운을.</p></div>`;
  const sidePots = getPots(state).filter(p => !p.refund);
  const showSidePots = sidePots.length > 1 && (state.status === 'showdown' || (state.status === 'roundEnd' && state.players.some(p => p.allIn)));
  return `<div class="center-status"><span class="center-pill">${state.status === 'showdown' ? '✦ SHOWDOWN' : STREETS[state.street].toUpperCase()}${state.status === 'roundEnd' ? ' · 베팅 완료' : ''}</span>${showSidePots ? `<p class="side-pot-hint">메인 ${fmt(sidePots[0].amount)} <span>+</span> 사이드 ${sidePots.slice(1).map(p => fmt(p.amount)).join(' + ')}</p>` : `<p>${state.status === 'showdown' ? '카드를 공개하고 승자를 선택하세요' : `현재 베팅 <strong>${fmt(state.currentBet)}</strong>`}</p>`}</div>`;
}

function renderLog() {
  if (!state.log.length) return `<div class="empty-activity"><span class="empty-cards">♧</span><strong>첫 핸드를 기다리는 중</strong><p>플레이 기록이 여기에 쌓여요.<br>오늘의 이야기를 시작해 볼까요?</p></div>`;
  return `<ol class="log-list">${state.log.slice(0, 30).map((entry, i) => `<li class="log-entry ${entry.kind} ${i === 0 ? 'latest' : ''}"><span class="log-symbol">${entry.kind === 'win' ? '♛' : entry.kind === 'tip' ? '♥' : entry.kind === 'allin' ? '↗' : entry.kind === 'hand' ? '♠' : entry.kind === 'stage' ? '◆' : '·'}</span><div><p>${esc(entry.text)}</p><span>#${String(entry.hand).padStart(2, '0')} · ${STREETS[entry.street]}</span></div></li>`).join('')}</ol>`;
}
function renderRanking() {
  return `<ol class="ranking-list">${[...state.players].sort((a, b) => b.stack - a.stack).map((p, i) => `<li><span class="rank-no">${i === 0 ? '♛' : `0${i + 1}`}</span><span class="rank-avatar ${colors[p.id]}">${avatars[p.id]}</span><strong>${esc(p.name)}</strong><span class="rank-stack">${fmt(p.stack)}</span></li>`).join('')}</ol><div class="bankroll-total">테이블 총 칩 <strong>${fmt(state.players.reduce((s, p) => s + p.stack + p.total, 0))}</strong></div>`;
}

function renderDock(info) {
  if (!info) {
    const canContinue = state.players.filter(p => p.stack > 0).length >= 2;
    const mode = state.status;
    const data = mode === 'ready' ? { badge: 'LET’S PLAY', title: '우리의 포커 나이트, 시작할까요?', sub: `${state.players.length}명 · 시작 칩 ${fmt(state.initialStack)} · 블라인드 ${fmt(state.smallBlind)} / ${fmt(state.bigBlind)}`, button: '첫 핸드 시작', action: 'start', symbol: '♠' }
      : mode === 'roundEnd' ? { badge: 'ROUND COMPLETE', title: `${STREETS[state.street]} 베팅이 끝났습니다`, sub: `${STREETS[state.street + 1]} 카드를 펼친 다음 진행해 주세요.`, button: `${STREETS[state.street + 1]} 진행`, action: 'advance', symbol: '◆' }
        : mode === 'showdown' ? { badge: 'MOMENT OF TRUTH', title: '카드를 공개해 주세요!', sub: '각 팟의 승자를 선택하면 칩을 자동으로 나눠 드려요. 동률도 선택할 수 있어요.', button: '승자 선택 & 칩 분배', action: 'winners', symbol: '♛' }
          : { badge: 'NICE HAND!', title: canContinue ? '한 판 더? 행운은 계속됩니다.' : '오늘의 칩 리더가 정해졌습니다!', sub: canContinue ? '다음 핸드는 딜러 버튼이 자동으로 이동합니다.' : '테이블을 새로 설정하면 다시 시작할 수 있어요.', button: canContinue ? '다음 핸드 시작' : '새 테이블 만들기', action: canContinue ? 'start' : 'setup', symbol: '♛' };
    return `<section class="action-dock welcome-dock"><div class="dock-symbol">${data.symbol}</div><div class="welcome-text"><div class="eyebrow">${data.badge}</div><h2>${data.title}</h2><p>${data.sub}</p></div><button class="primary-button start-button" data-action="${data.action}">${data.button}${icon('arrow')}</button></section>`;
  }
  return `<section class="action-dock betting-dock chip-betting-dock" aria-label="베팅 컨트롤"><div class="turn-summary"><span class="turn-dot"></span><span class="eyebrow">NOW PLAYING</span><h2>${esc(info.player.name)}<span>님의 차례</span></h2><p>${info.call ? '콜 필요 금액' : '추가 베팅 없이'} <strong>${info.call ? fmt(info.callPay) : '체크 가능'}</strong>${info.call > info.player.stack ? ' (올인)' : ''}</p></div><div class="quick-actions"><button class="action-button fold-button" data-action="fold"><span>폴드</span><kbd>F</kbd></button><button class="action-button call-button" data-action="call"><span>${info.call ? '콜' : '체크'}</span><strong>${info.call ? fmt(info.callPay) : icon('check')}</strong><kbd>C</kbd></button><button class="action-button allin-button" data-action="allin" ${info.canAllIn ? '' : 'disabled'}>${icon('bolt')}<span>올인</span><kbd>A</kbd></button></div>${renderChipBuilder(info)}</section>`;
}

const chipStyle = chip => `--chip-face:${chip.color};--chip-ink:${chip.ink}`;

function renderChipPiles(amount, removable = false, composition = null) {
  const chips = composition && draftAmount(composition) === amount ? CHIP_TYPES.filter(chip => composition[chip.value] > 0).map(chip => ({ ...chip, count: composition[chip.value] })) : splitChips(amount);
  return chips.map(chip => renderPile(chip, removable)).join('');
}

function renderPile(chip, removable = false) {
  const tag = removable ? 'button' : 'span';
  return `<${tag} class="chip-pile ${removable ? 'removable-pile' : ''}" style="${chipStyle(chip)}" ${removable ? `type="button" data-chip-remove="${chip.value}" aria-label="쌓아둔 ${fmt(chip.value)}칩 1개 빼기"` : `role="img" aria-label="${fmt(chip.value)}칩 ${fmt(chip.count)}개"`}><span class="pile-discs" aria-hidden="true">${Array.from({ length: Math.min(chip.count, 6) }, (_, i) => `<i style="--level:${i}">${i === Math.min(chip.count, 6) - 1 ? `<span>${chip.label}</span>` : ''}</i>`).join('')}</span><span class="pile-count">${chip.label} <b>×${fmt(chip.count)}</b></span>${removable ? '<span class="pile-minus" aria-hidden="true">−</span>' : ''}</${tag}>`;
}

function renderChipBuilder(info) {
  const draft = raiseDraftInfo(state, info, chipDraft);
  const options = chipOptions(state, info);
  const piles = CHIP_TYPES.filter(chip => chipDraft[chip.value] > 0).map(chip => renderPile({ ...chip, count: chipDraft[chip.value] }, true)).join('');
  const message = draft.remaining < 0 ? `보유 칩보다 ${fmt(-draft.remaining)}칩 많아요 · 칩을 빼주세요` : !info.canRaise ? '현재는 콜 또는 폴드만 가능합니다.' : !draft.pay ? `최소 ${fmt(draft.minimumPay)}칩부터 쌓으세요` : draft.valid ? draft.allIn ? '남은 칩 전부 · OK를 누르면 올인' : `이미 낸 ${fmt(info.player.bet)} + 선택 ${fmt(draft.pay)} = 총 ${fmt(draft.target)}` : `최소 ${fmt(draft.minimumPay)}칩 필요 · ${fmt(draft.minimumPay - draft.pay)}칩 더 쌓으세요`;
  return `<section class="chip-builder ${info.canRaise ? '' : 'builder-locked'}" aria-label="칩으로 ${state.currentBet ? '레이즈' : '베팅'} 만들기"><div class="builder-heading"><div><span class="builder-kicker">BUILD YOUR BET</span><h3>${state.currentBet ? '칩을 쌓아 레이즈' : '칩을 쌓아 베팅'}</h3></div><div class="draft-amount"><span>이번에 낼 칩</span><strong data-fit>${fmt(draft.pay)}</strong><small>라운드 총액 <b>${fmt(draft.target)}</b></small></div></div><div class="chip-workbench"><div class="chip-rack" aria-label="추가할 칩 선택">${options.map(chip => `<div class="chip-pick"><button type="button" class="denomination-chip" style="${chipStyle(chip)}" data-chip-add="${chip.value}" aria-label="${fmt(chip.value)}칩 1개 추가" ${!info.canRaise || chip.value > draft.remaining ? 'disabled' : ''}><span class="chip-face"><span>${chip.label}</span><small>♠</small></span></button><div class="chip-counter"><button type="button" data-chip-remove="${chip.value}" aria-label="${fmt(chip.value)}칩 1개 빼기" ${!chipDraft[chip.value] ? 'disabled' : ''}>−</button><output aria-label="${fmt(chip.value)}칩 선택 개수">×${fmt(chipDraft[chip.value] || 0)}</output></div></div>`).join('')}</div><div class="wager-tray ${piles ? 'has-chips' : ''}" role="group" aria-label="쌓아둔 칩">${piles || `<div class="empty-tray">${icon('chip')}<span>칩을 눌러 쌓으세요</span><small>쌓인 칩을 누르면 1개 빼기</small></div>`}</div></div><div class="builder-footer"><p class="draft-hint ${draft.pay && !draft.valid ? 'needs-more' : ''}" role="status">${message}</p><div class="builder-buttons"><button type="button" class="draft-shortcut" data-draft="minimum" ${info.canRaise ? '' : 'disabled'}>최소 맞추기</button><button type="button" class="draft-shortcut clear-draft" data-draft="clear" ${draft.pay ? '' : 'disabled'}>${icon('undo')} 비우기</button><button type="button" class="chip-ok" data-action="raise" ${draft.valid ? '' : 'disabled'}><span>OK</span><small>${draft.allIn ? '올인' : state.currentBet ? '레이즈' : '베팅'} 확정</small>${icon('arrow')}</button></div></div></section>`;
}

function editChipDraft(button) {
  const info = turnInfo(state);
  if (!info) return;
  if (button.dataset.draft === 'clear') chipDraft = {};
  else if (button.dataset.chipRemove) chipDraft = removeDraftChip(chipDraft, Number(button.dataset.chipRemove));
  else if (!info.canRaise) return;
  else if (button.dataset.chipAdd) chipDraft = addDraftChip(chipDraft, Number(button.dataset.chipAdd), info.player.stack);
  else if (button.dataset.draft === 'minimum') chipDraft = draftForAmount(raiseDraftInfo(state, info, {}).minimumPay);
  const focusVisible = button.matches(':focus-visible');
  const focusSelector = button.dataset.chipAdd ? `[data-chip-add="${button.dataset.chipAdd}"]` : button.dataset.chipRemove ? `[data-chip-remove="${button.dataset.chipRemove}"]` : `[data-draft="${button.dataset.draft}"]`;
  $('.chip-builder').outerHTML = renderChipBuilder(info);
  if (focusVisible) {
    const next = $(focusSelector);
    (next && !next.disabled ? next : $('.chip-ok')?.disabled ? $('[data-draft="minimum"]') : $('.chip-ok'))?.focus({ preventScroll: true });
  }
  fitText();
}

$('#app').addEventListener('click', async event => {
  const chipButton = event.target.closest('[data-chip-add],[data-chip-remove],[data-draft]');
  if (chipButton && !chipButton.disabled) {
    try { editChipDraft(chipButton); } catch (error) { toast(error.message); }
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) { selectedTab = tab.dataset.tab; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  await dispatch(button.dataset.action);
});

async function dispatch(action) {
  try {
    if (action === 'start') {
      if (openingDraw) return;
      if (state.hand === 0) {
        const beforeDraw = state;
        openingDraw = true;
        let firstBigBlindId;
        try { firstBigBlindId = await drawOpeningBigBlind(); }
        finally { openingDraw = false; }
        if (firstBigBlindId === null) return;
        if (state !== beforeDraw) throw Error('테이블이 변경되었습니다. 첫 BB를 다시 뽑아 주세요.');
        commit(startHand(state, { firstBigBlindId }), 'deal');
      } else commit(startHand(state), 'deal');
      tone('deal');
    }
    else if (action === 'advance') { commit(advanceStreet(state), 'deal'); tone('deal'); }
    else if (['fold', 'call', 'raise', 'allin'].includes(action)) {
      if (action === 'allin') { openAllinConfirm(); return; }
      const info = turnInfo(state);
      const draft = action === 'raise' && info ? raiseDraftInfo(state, info, chipDraft) : null;
      if (action === 'raise' && !draft?.valid) throw Error('최소 금액에 맞게 칩을 쌓은 뒤 OK를 눌러 주세요.');
      const actorId = state.turn;
      const previousTotal = state.players[actorId].total;
      const nextState = act(state, action, draft?.target);
      const wentAllIn = action !== 'fold' && nextState.players[state.turn].allIn;
      const effect = action === 'fold' ? 'fold' : wentAllIn ? 'allin' : 'chips';
      const event = commit(nextState, effect, action === 'raise' ? chipDraft : null);
      if (!event && nextState.players[actorId].total > previousTotal) tone('chips');
    } else if (action === 'undo') {
      if (!history.length) return;
      stopMajorEffects(); state = history.pop(); chipDraft = {}; save(); render(); toast('마지막 액션을 되돌렸습니다.');
    } else if (action === 'tip') openTip();
    else if (action === 'setup') openSetup();
    else if (action === 'winners') openWinners();
    else if (action === 'help') openHelp();
    else if (action === 'sound') { sound = !sound; save(); render(); toast(`효과음 ${sound ? '켜짐' : '꺼짐'}`); }
    else if (action === 'fullscreen') {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('브라우저의 보기 메뉴에서 전체 화면을 사용해 주세요.');
    }
  } catch (error) { toast(error.message || '다시 시도해 주세요.'); }
}

function showDialog(dialog, content) { dialog.innerHTML = content; dialog.showModal(); dialog.scrollTop = 0; }
function closeButton() { return `<button type="button" class="icon-button dialog-close" data-close aria-label="닫기">${icon('close')}</button>`; }
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (dialog.id === 'bb-draw-dialog') return;
    if (event.target.closest('[data-close]')) dialog.close();
    if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); }
  });
});

function drawOpeningBigBlind() {
  const sample = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
  const winnerId = chooseFirstBigBlind(state, () => sample);
  const players = state.players.filter(player => player.stack > 0);
  const winner = players.find(player => player.id === winnerId);
  const dialog = $('#bb-draw-dialog');
  return new Promise(resolve => {
    let timer, stopped = false, step = 0;
    const finalIndex = players.findIndex(player => player.id === winnerId);
    const steps = players.length * 3 + finalIndex;
    const finish = value => { clearTimeout(timer); stopped = true; dialog.close(); resolve(value); };
    dialog.innerHTML = `<div class="bb-draw-kicker">A LITTLE LUCK TO GET US STARTED</div><h2 id="bb-draw-title">오늘의 첫 BB는 누구?</h2><p class="bb-draw-description">불빛이 멈추는 자리, 첫 빅블라인드의 주인공!</p><div class="bb-arena"><div class="bb-orbit"></div><div class="bb-orbit inner-orbit"></div><div class="bb-center"><div class="bb-coin"><span>BIG BLIND</span><strong>BB</strong><small>FIRST HAND</small></div><span class="bb-current-name" id="bb-current-name">두근두근…</span></div>${players.map((player, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / players.length;
      return `<div class="bb-candidate" data-bb-seat="${player.id}" style="--bb-x:${50 + 40 * Math.cos(angle)}%;--bb-y:${50 + 38 * Math.sin(angle)}%"><span class="avatar ${colors[player.id]}">${avatars[player.id]}</span><strong>${esc(player.name)}</strong><span class="bb-seat-label">PLAYER ${String(player.id + 1).padStart(2, '0')}</span></div>`;
    }).join('')}<div class="bb-sparks" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--spark-angle:${i * 22.5}deg;--spark-delay:${i % 4 * 35}ms"></i>`).join('')}</div></div><div class="bb-draw-result" id="bb-draw-result" role="status">칩은 아직 움직이지 않았어요. 첫 BB를 뽑는 중!</div><div class="bb-draw-footer"><button type="button" data-bb-cancel>추첨 취소</button><button type="button" class="bb-skip" data-bb-skip>바로 선정 ${icon('bolt')}</button><button type="button" class="bb-draw-confirm" data-bb-confirm hidden>BB 확정 · 핸드 시작 ${icon('arrow')}</button></div>`;
    const highlight = id => {
      dialog.querySelectorAll('[data-bb-seat]').forEach(element => element.classList.toggle('spotlight', Number(element.dataset.bbSeat) === id));
      $('#bb-current-name').textContent = players.find(player => player.id === id).name;
    };
    const showWinner = () => {
      if (stopped) return;
      clearTimeout(timer); stopped = true;
      highlight(winnerId);
      dialog.dataset.winner = String(winnerId);
      dialog.classList.add('bb-drawn');
      $('#bb-draw-result').innerHTML = `<strong>${esc(winner.name)}</strong> 님이 첫 BB! <span>SB와 딜러도 자동으로 배치됩니다.</span>`;
      dialog.querySelector('[data-bb-skip]').hidden = true;
      dialog.querySelector('[data-bb-confirm]').hidden = false;
      tone('win');
    };
    const tick = () => {
      if (stopped) return;
      highlight(players[step % players.length].id);
      if (step >= steps) { showWinner(); return; }
      tone('fold');
      step++;
      timer = setTimeout(tick, 38 + Math.round(135 * (step / steps) ** 3));
    };
    dialog.classList.remove('bb-drawn');
    delete dialog.dataset.winner;
    dialog.onclick = event => {
      if (event.target.closest('[data-bb-cancel]')) finish(null);
      else if (event.target.closest('[data-bb-skip]')) showWinner();
      else if (event.target.closest('[data-bb-confirm]') && dialog.classList.contains('bb-drawn')) finish(winnerId);
    };
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal();
    if (motionAllowed()) tick(); else showWinner();
  });
}

let tipSelection;

function openTip() {
  const donor = state.players.find(player => player.id === state.turn && maximumTip(state, player.id) > 0) || state.players.find(player => maximumTip(state, player.id) > 0) || state.players[0];
  tipSelection = { fromId: donor.id, toId: null, chips: {} };
  const dialog = $('#tip-dialog');
  drawTip();
  dialog.showModal();
  dialog.onclick = event => {
    const button = event.target.closest('[data-tip-from],[data-tip-to],[data-tip-add],[data-tip-remove],[data-tip-clear],[data-tip-send]');
    if (!button || button.disabled) return;
    try {
      if (button.hasAttribute('data-tip-send')) {
        const { fromId, toId, chips } = tipSelection;
        const amount = draftAmount(chips);
        const next = transferTip(state, { fromId, toId, chips });
        dialog.close();
        commit(next, '', null, { preserveDraft: true });
        playTipAnimation(fromId, toId, chips);
        tone('chips');
        toast(`${state.players[fromId].name} → ${state.players[toId].name} · ${fmt(amount)}칩, 고마워요!`);
        return;
      }
      if (button.dataset.tipFrom !== undefined) {
        tipSelection.fromId = Number(button.dataset.tipFrom);
        tipSelection.chips = {};
        if (tipSelection.toId === tipSelection.fromId) tipSelection.toId = null;
      } else if (button.dataset.tipTo !== undefined) tipSelection.toId = Number(button.dataset.tipTo);
      else if (button.dataset.tipAdd) {
        tipSelection.chips = addDraftChip(tipSelection.chips, Number(button.dataset.tipAdd), maximumTip(state, tipSelection.fromId));
      } else if (button.dataset.tipRemove) tipSelection.chips = removeDraftChip(tipSelection.chips, Number(button.dataset.tipRemove));
      else tipSelection.chips = {};
      const focusVisible = button.matches(':focus-visible');
      const attribute = ['data-tip-from', 'data-tip-to', 'data-tip-add', 'data-tip-remove', 'data-tip-clear'].find(name => button.hasAttribute(name));
      const selector = attribute ? `[${attribute}="${button.getAttribute(attribute)}"]` : null;
      drawTip();
      if (focusVisible && selector) dialog.querySelector(selector)?.focus({ preventScroll: true });
    } catch (error) {
      $('#tip-error').textContent = error.message;
    }
  };
}

function drawTip() {
  const { fromId, toId, chips } = tipSelection;
  const from = state.players.find(player => player.id === fromId);
  const to = state.players.find(player => player.id === toId);
  const amount = draftAmount(chips), maximum = maximumTip(state, fromId);
  const options = chipOptions(state, { player: from });
  const ready = !!to && fromId !== toId && amount > 0 && amount <= maximum;
  const playerPicker = direction => `<div class="tip-player-grid">${state.players.map(player => {
    const selected = direction === 'from' ? player.id === fromId : player.id === toId;
    const disabled = direction === 'from' ? maximumTip(state, player.id) <= 0 : player.id === fromId;
    return `<button type="button" class="tip-player ${selected ? 'selected' : ''}" data-tip-${direction}="${player.id}" aria-label="${direction === 'from' ? '보내는 사람' : '받는 사람'} ${esc(player.name)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}><span class="avatar ${colors[player.id]}">${avatars[player.id]}</span><span><strong>${esc(player.name)}</strong><small>${fmt(player.stack)}칩</small></span><i>${selected ? icon('check') : ''}</i></button>`;
  }).join('')}</div>`;
  const profile = (player, after, direction) => `<div class="tip-profile ${direction}"><span class="tip-profile-avatar ${player ? colors[player.id] : 'unselected'}">${player ? avatars[player.id] : '?'}</span><strong>${player ? esc(player.name) : '받는 사람 선택'}</strong><span>${player ? `${fmt(player.stack)} <b>→ ${fmt(after)}</b>` : '기분 좋은 한 수, 고마운 한 판'}</span></div>`;
  const selectedPiles = CHIP_TYPES.filter(chip => chips[chip.value] > 0).map(chip => `<button type="button" class="tip-selected-pile" data-tip-remove="${chip.value}" aria-label="쌓아둔 팁 ${fmt(chip.value)}칩 1개 빼기">${renderPile({ ...chip, count: chips[chip.value] })}<span class="tip-pile-minus">−</span></button>`).join('');
  $('#tip-dialog').innerHTML = `${closeButton()}<div class="dialog-kicker">PASS THE GOOD VIBES</div><h2 id="tip-title">좋은 플레이에, 작은 팁.</h2><p class="tip-description">보내는 사람과 받는 사람을 고르고, 건넬 칩을 쌓아 주세요.</p><div class="tip-people"><section class="tip-from-section"><h3><span>01</span> 보내는 사람</h3>${playerPicker('from')}</section><section class="tip-to-section"><h3><span>02</span> 받는 사람</h3>${playerPicker('to')}</section></div><div class="tip-route">${profile(from, from.stack - amount, 'sender')}<div class="tip-route-center"><span class="tip-direction">${icon('arrow')}</span><div class="tip-route-piles">${selectedPiles || '<span class="tip-empty-token">♠</span>'}</div><strong class="tip-total" data-fit>${fmt(amount)}<small>CHIPS</small></strong></div>${profile(to, to ? to.stack + amount : 0, 'receiver')}</div><div class="tip-rack-heading"><h3><span>03</span> 건넬 칩</h3><span>전달 가능 <strong>${fmt(maximum)}</strong>칩</span></div><div class="tip-chip-rack">${options.map(chip => `<div class="chip-pick"><button type="button" class="denomination-chip" style="${chipStyle(chip)}" data-tip-add="${chip.value}" aria-label="팁 ${fmt(chip.value)}칩 1개 추가" ${chip.value > maximum - amount ? 'disabled' : ''}><span class="chip-face"><span>${chip.label}</span><small>♠</small></span></button><div class="chip-counter"><button type="button" data-tip-remove="${chip.value}" aria-label="팁 ${fmt(chip.value)}칩 1개 빼기" ${chips[chip.value] ? '' : 'disabled'}>−</button><output>×${fmt(chips[chip.value] || 0)}</output></div></div>`).join('')}</div><div class="tip-footnote"><span>${from.stack > maximum ? '핸드 진행 중인 플레이어는 최소 1칩을 남깁니다.' : '보내는 사람의 보유 칩에서 받는 사람에게 그대로 이동합니다.'}</span><button type="button" data-tip-clear="true" ${amount ? '' : 'disabled'}>${icon('undo')} 비우기</button></div><p id="tip-error" class="form-error" role="alert"></p><div class="tip-footer"><button type="button" class="tip-cancel" data-close>취소</button><button type="button" class="tip-confirm" data-tip-send ${ready ? '' : 'disabled'}>${icon('gift')}<span>${to ? `${esc(to.name)}에게 팁 보내기` : '받는 사람을 선택해 주세요'}</span>${icon('arrow')}</button></div>`;
  fitText();
}

function playTipAnimation(fromId, toId, chips) {
  if (!motionAllowed()) return;
  const from = document.querySelector(`[data-seat="${fromId}"]`)?.getBoundingClientRect();
  const to = document.querySelector(`[data-seat="${toId}"]`)?.getBoundingClientRect();
  if (!from || !to) return;
  const tokens = CHIP_TYPES.flatMap(chip => Array.from({ length: Math.min(chips[chip.value] || 0, 6) }, () => chip)).slice(0, 24);
  tokens.forEach((chip, i) => {
    const token = document.createElement('span');
    token.className = 'flying-chip'; token.style.setProperty('--chip-color', chip.color); token.style.color = chip.ink; token.textContent = chip.label;
    token.style.left = `${from.x + from.width / 2}px`; token.style.top = `${from.y + from.height / 2}px`;
    $('#effects').append(token);
    const dx = to.x + to.width / 2 - from.x - from.width / 2, dy = to.y + to.height / 2 - from.y - from.height / 2;
    token.animate([{ transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 0 }, { offset: .12, opacity: 1 }, { offset: .5, transform: `translate(calc(-50% + ${dx * .5}px),calc(-50% + ${dy * .5 - 70}px)) rotate(100deg)`, opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(220deg)`, opacity: 0 }], { duration: 850, delay: i * 55, easing: 'cubic-bezier(.2,.6,.4,1)' }).finished.finally(() => token.remove());
  });
  document.querySelector(`[data-seat="${toId}"]`)?.animate([{ boxShadow: '0 0 0 0 #c9ab6040' }, { boxShadow: '0 0 0 10px #c9ab6070' }, { boxShadow: '0 0 0 0 #c9ab6000' }], { duration: 1300 });
}

function openSetup() {
  const dialog = $('#setup-dialog');
  let count = state.players.length;
  let names = Array.from({ length: 6 }, (_, i) => state.players[i]?.name || `플레이어 ${i + 1}`);
  const drawNames = () => { $('#player-name-grid').innerHTML = names.slice(0, count).map((name, i) => `<label class="player-name-label"><span class="avatar ${colors[i]}">${avatars[i]}</span><span>PLAYER ${String(i + 1).padStart(2, '0')}<input name="player-${i}" data-player-name="${i}" value="${esc(name)}" maxlength="14" required aria-label="플레이어 ${i + 1} 이름"></span></label>`).join(''); };
  showDialog(dialog, `<form id="setup-form">${closeButton()}<div class="dialog-kicker">MAKE IT YOUR TABLE</div><h2 id="setup-title">오늘의 멤버를 모아볼까요?</h2><p class="dialog-description">이름과 칩을 정하고, 포커 나이트를 시작하세요.</p><div class="form-section"><label class="field-label">플레이어 수</label><div class="count-picker">${[3, 4, 5, 6].map(n => `<button type="button" data-count="${n}" class="${count === n ? 'selected' : ''}">${n}<span>명</span>${count === n ? icon('check') : ''}</button>`).join('')}</div></div><div class="player-name-grid" id="player-name-grid"></div><div class="setup-money-grid"><label class="field-label">시작 칩<input type="number" name="stack" value="${state.initialStack}" min="1" max="100000000" step="1" required></label><label class="field-label">스몰 블라인드<input type="number" name="smallBlind" value="${state.smallBlind}" min="1" max="100000000" step="1" required></label><label class="field-label">빅 블라인드<input type="number" name="bigBlind" value="${state.bigBlind}" min="2" max="100000000" step="1" required></label></div><label class="effects-toggle"><span>${icon('bolt')} 화려한 이펙트 <small>칩 이동 · 올인 · 승리 컨페티</small></span><input name="effects" type="checkbox" ${effectLevel === 'full' ? 'checked' : ''}></label>${state.hand > 0 ? '<div class="reset-note">새 테이블을 만들면 현재 게임과 칩이 초기화됩니다. 직후 실행 취소로 복구할 수 있습니다.</div>' : ''}<p class="form-error" id="setup-error" role="alert"></p><button class="primary-button dialog-submit" type="submit">${state.hand > 0 ? '새 테이블 만들기' : '테이블 준비하기'} ${icon('arrow')}</button></form>`);
  drawNames();
  $('#player-name-grid').addEventListener('input', event => { if (event.target.dataset.playerName !== undefined) names[Number(event.target.dataset.playerName)] = event.target.value; });
  dialog.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => { count = Number(button.dataset.count); dialog.querySelectorAll('[data-count]').forEach(b => { b.classList.toggle('selected', b === button); b.innerHTML = `${b.dataset.count}<span>명</span>${b === button ? icon('check') : ''}`; }); drawNames(); }));
  $('#setup-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const newState = createGame({ names: names.slice(0, count), stack: Number(data.get('stack')), smallBlind: Number(data.get('smallBlind')), bigBlind: Number(data.get('bigBlind')) });
      effectLevel = data.has('effects') ? 'full' : 'quiet';
      commit(newState); dialog.close(); toast('테이블이 준비됐습니다. 첫 핸드를 시작해 주세요!');
    } catch (error) { $('#setup-error').textContent = error.message; }
  });
}

function openAllinConfirm() {
  const info = turnInfo(state); if (!info || !info.canAllIn) return;
  const dialog = $('#winner-dialog');
  showDialog(dialog, `${closeButton()}<div class="allin-dialog-symbol">${icon('bolt')}</div><div class="dialog-kicker">GO BIG OR GO HOME</div><h2 id="winner-title">${esc(info.player.name)}, 올인할까요?</h2><p class="dialog-description">남은 <strong>${fmt(info.player.stack)}칩</strong>을 모두 베팅합니다.<br>이번 라운드 총 베팅은 ${fmt(info.maxTotal)}칩입니다.</p><button class="allin-confirm" id="confirm-allin">ALL IN ${icon('bolt')}</button><button class="text-button cancel-allin" data-close>잠깐, 다시 생각할게요</button>`);
  $('#confirm-allin').addEventListener('click', () => { try { const nextState = act(state, 'allin'); dialog.close(); commit(nextState, 'allin'); } catch (e) { toast(e.message); } });
}

function openWinners() {
  if (state.status !== 'showdown') return;
  const dialog = $('#winner-dialog'), pots = getPots(state);
  const selections = pots.map(p => p.refund ? p.contributors : p.eligible.length === 1 ? p.eligible : []);
  showDialog(dialog, `${closeButton()}<div class="dialog-kicker">THE MOMENT OF TRUTH</div><h2 id="winner-title">이번 핸드의 주인공은?</h2><p class="dialog-description">실제 카드의 족보를 비교해 승자를 골라 주세요.<br>동률이라면 여러 명을 선택하세요. 칩을 공평하게 나눕니다.</p><form id="winners-form"><div class="winner-pots">${pots.map((pot, i) => `<section class="winner-pot"><div class="winner-pot-heading"><span>${pot.refund ? '미콜 금액 반환' : i === 0 ? '메인 팟' : `사이드 팟 ${i}`}</span><strong>${fmt(pot.amount)} <small>CHIPS</small></strong></div><div class="winner-choices">${(pot.refund ? pot.contributors : pot.eligible).map(id => `<label class="winner-choice"><input type="checkbox" data-pot="${i}" value="${id}" ${selections[i].includes(id) ? 'checked' : ''} ${pot.refund || pot.eligible.length === 1 ? 'disabled' : ''}><span class="avatar ${colors[id]}">${avatars[id]}</span><span>${esc(state.players[id].name)}</span><span class="choice-check">${icon('check')}</span></label>`).join('')}</div>${pot.refund || pot.eligible.length === 1 ? '<p class="auto-award-note">자동 분배됩니다</p>' : ''}</section>`).join('')}</div><p class="form-error" id="winner-error" role="alert"></p><button class="primary-button dialog-submit" type="submit">칩 분배 & 핸드 종료 ${icon('trophy')}</button></form>`);
  dialog.querySelectorAll('[data-pot]').forEach(box => box.addEventListener('change', () => { const i = Number(box.dataset.pot); selections[i] = [...dialog.querySelectorAll(`[data-pot="${i}"]:checked`)].map(input => Number(input.value)); }));
  $('#winners-form').addEventListener('submit', event => { event.preventDefault(); try { const nextState = settlePots(state, selections); dialog.close(); commit(nextState); } catch (e) { $('#winner-error').textContent = e.message; } });
}

function openHelp() {
  showDialog($('#help-dialog'), `${closeButton()}<div class="dialog-kicker">A SEAT AT THE TABLE</div><h2 id="help-title">카드는 손에, 칩은 화면에.</h2><p class="dialog-description">3~6명이 실제 카드로 홀덤을 할 때, 이 화면 하나로 가상 칩을 관리하세요.</p><ol class="help-steps"><li><span>01</span><div><strong>멤버와 블라인드 정하기</strong><p>테이블 설정에서 이름, 시작 칩, 블라인드를 정하세요. 화면은 모두가 잘 보이는 곳에 놓아 주세요.</p></div></li><li><span>02</span><div><strong>카드를 나눠 주고 핸드 시작</strong><p>실물 카드 2장씩을 나눠 주세요. 스몰·빅 블라인드와 액션 순서는 자동으로 진행됩니다.</p></div></li><li><span>03</span><div><strong>화면에서 차례대로 베팅</strong><p>폴드, 체크/콜, 올인을 선택하거나, 칩을 눌러 쌓고 OK로 레이즈를 확정하세요. 이번에 낼 칩과 기존 베팅을 합친 총액을 함께 표시합니다. − 버튼이나 쌓인 칩을 누르면 1개를 뺄 수 있어요. 라운드가 끝나면 실제 커뮤니티 카드를 펼치고 다음 단계로 이동하세요.</p></div></li><li><span>04</span><div><strong>승자를 고르면 자동 정산</strong><p>카드 족보는 직접 확인하고 승자를 선택하세요. 사이드 팟과 동률 분배는 자동 계산됩니다. 나머지 1칩은 딜러 왼쪽부터 배분됩니다.</p></div></li></ol><div class="help-keyboard"><span><kbd>F</kbd> 폴드</span><span><kbd>C</kbd> 체크/콜</span><span><kbd>A</kbd> 올인 확인</span><span><kbd>⌘/Ctrl Z</kbd> 되돌리기</span></div><div class="help-note">진행 상황은 현재 브라우저에 자동 저장됩니다. 새로고침해도 이어서 할 수 있어요. 칩은 가상 점수이며, 카드 배분이나 족보 판정은 제공하지 않습니다.</div><button class="primary-button dialog-submit" data-close>좋아요, 시작해 볼까요 ${icon('arrow')}</button>`);
}

document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.repeat) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch('undo'); return; }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const keys = { f: 'fold', c: 'call', a: 'allin' };
  if (keys[event.key.toLowerCase()] && state.status === 'betting') { event.preventDefault(); dispatch(keys[event.key.toLowerCase()]); }
});

function tone(kind) {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const themes = {
      win: [523.25, 659.25, 783.99, 1046.5], allin: [110, 165, 220, 440, 660],
      'allin-duel': [110, 155.56, 220, 311.13, 440, 622.25],
      'big-raise': [130.81, 196, 261.63, 392], 'raise-war': [146.83, 220, 293.66, 440, 587.33],
      'big-call': [196, 293.66, 392], showdown: [164.81, 246.94, 329.63],
      'big-win': [392, 493.88, 587.33, 783.99], 'double-up': [261.63, 392, 523.25, 659.25, 783.99],
      'triple-up': [261.63, 329.63, 392, 523.25, 659.25, 1046.5], comeback: [196, 246.94, 293.66, 392, 587.33, 783.99],
      'split-pot': [392, 523.25, 493.88, 659.25], fold: [220, 165], deal: [392, 523], chips: [1000, 1400, 1800],
    };
    const major = !!themes[kind] && !['fold', 'deal', 'chips'].includes(kind);
    const notes = themes[kind] || themes.chips;
    notes.forEach((frequency, i) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + i * (major ? .085 : .055);
      const length = major ? .28 : .17;
      osc.type = kind === 'chips' || ['allin-duel', 'raise-war', 'big-raise'].includes(kind) ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(major ? .075 : .07, start + .008); gain.gain.exponentialRampToValueAtTime(.001, start + length);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(start); osc.stop(start + length + .03);
    });
  } catch { /* Sound is an optional enhancement. */ }
}

const motionAllowed = () => effectLevel === 'full' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function playEffect(kind, playerId, movedChips = {}) {
  if (!motionAllowed()) return;
  if (kind === 'chips' || kind === 'allin') {
    const seat = document.querySelector(`[data-seat="${playerId}"]`), pot = $('.pot-display');
    if (!seat || !pot) return;
    const start = seat.getBoundingClientRect(), end = pot.getBoundingClientRect();
    const flying = CHIP_TYPES.flatMap(chip => Array.from({ length: Math.min(movedChips[chip.value] || 0, 6) }, () => chip)).slice(0, 24);
    for (let i = 0; i < flying.length; i++) {
      const chip = document.createElement('span'); chip.className = 'flying-chip';
      chip.style.setProperty('--chip-color', flying[i].color); chip.style.color = flying[i].ink; chip.textContent = flying[i].label;
      chip.style.left = `${start.x + start.width / 2}px`; chip.style.top = `${start.y + start.height / 2}px`;
      $('#effects').append(chip);
      const dx = end.x + end.width / 2 - start.x - start.width / 2 + (Math.random() - .5) * 60;
      const dy = end.y + end.height / 2 - start.y - start.height / 2 + (Math.random() - .5) * 25;
      const animation = chip.animate([{ transform: 'translate(-50%, -50%) scale(.6) rotate(0deg)', opacity: 0 }, { offset: .12, opacity: 1 }, { offset: .6, transform: `translate(calc(-50% + ${dx * .55}px), calc(-50% + ${dy * .55 - 65}px)) scale(1.1) rotate(140deg)`, opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55) rotate(300deg)`, opacity: 0 }], { duration: 700 + i * 16, delay: i * 25, easing: 'cubic-bezier(.2,.6,.4,1)' });
      animation.finished.finally(() => chip.remove());
    }
    if (flying.length) $('#pot-number')?.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-3px) scale(1.045)' }, { transform: 'translateY(0) scale(1)' }], { duration: 420, easing: 'ease-out' });
  }
  if (kind === 'deal') { const el = $('.felt'); el?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.12)' }, { filter: 'brightness(1)' }], { duration: 600 }); }
}

function stopMajorEffects() {
  clearBetEffect();
  cancelAnimationFrame(confettiFrame);
  const canvas = $('#confetti');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function celebrate(event) {
  if (!motionAllowed()) return;
  const pot = $('.pot-display')?.getBoundingClientRect();
  if (pot) state.payouts.forEach(payout => {
    const destination = document.querySelector(`[data-seat="${payout.id}"]`)?.getBoundingClientRect();
    if (!destination) return;
    const tokens = splitChips(payout.amount).flatMap(chip => Array.from({ length: Math.min(chip.count, 5) }, () => chip)).slice(0, 18);
    tokens.forEach((chip, i) => {
      const token = document.createElement('span'); token.className = 'flying-chip'; token.style.setProperty('--chip-color', chip.color); token.style.color = chip.ink; token.textContent = chip.label;
      token.style.left = `${pot.x + pot.width / 2}px`; token.style.top = `${pot.y + pot.height / 2}px`; $('#effects').append(token);
      const dx = destination.x + destination.width / 2 - pot.x - pot.width / 2, dy = destination.y + destination.height / 2 - pot.y - pot.height / 2;
      token.animate([{ transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 }, { offset: .12, opacity: 1 }, { offset: .55, transform: `translate(calc(-50% + ${dx * .5}px),calc(-50% + ${dy * .5 - 45}px)) scale(1.15)`, opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.7)`, opacity: 0 }], { duration: 950, delay: i * 45, easing: 'ease-out' }).finished.finally(() => token.remove());
    });
  });
  if (!isVictoryEvent(event)) return;
  cancelAnimationFrame(confettiFrame);
  const canvas = $('#confetti'), ctx = canvas.getContext('2d');
  const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio; canvas.height = height * ratio; ctx.scale(ratio, ratio);
  const palette = ['#075d35', '#168349', '#c0a05f', '#be3549', '#0878cb', '#ffffff'];
  const particleCount = event.kind === 'triple-up' ? 250 : event.kind === 'split-pot' ? 120 : 190;
  const particles = Array.from({ length: particleCount }, (_, i) => ({ x: i % 2 ? width * .15 : width * .85, y: height * .68, vx: (Math.random() - .5) * 18, vy: -8 - Math.random() * 15, gravity: .12 + Math.random() * .13, size: 4 + Math.random() * 8, rot: Math.random() * Math.PI, spin: (Math.random() - .5) * .2, color: palette[i % palette.length] }));
  let start, previousFrame;
  const frame = time => {
    start ??= time; const elapsed = time - start;
    const dt = Math.min(2, previousFrame ? (time - previousFrame) / 16.667 : 1); previousFrame = time;
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.vx *= .993 ** dt; p.rot += p.spin * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, Math.max(0, (3600 - elapsed) / 800)); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .55); ctx.restore(); });
    if (elapsed < 3600) confettiFrame = requestAnimationFrame(frame); else ctx.clearRect(0, 0, width, height);
  };
  confettiFrame = requestAnimationFrame(frame);
}

render();
if (state.hand > 0) setTimeout(() => toast(`핸드 #${state.hand} · 저장된 테이블을 불러왔습니다.`), 450);
