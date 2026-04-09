'use strict';

// ── Helpers ──────────────────────────────────────────────────────

const $   = id => document.getElementById(id);
const esc = s  => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderCard(card, small = false) {
  const el = document.createElement('div');
  el.className = 'card' + (small ? ' small' : '');
  if (!card) {
    el.classList.add('face-down');
    return el;
  }
  el.classList.add(card.isRed ? 'red' : 'black');
  el.innerHTML = `<span class="rank">${esc(card.label)}</span>`
               + `<span class="suit">${card.symbol}</span>`;
  return el;
}

// ── Seat layout ──────────────────────────────────────────────────

// Map: number of AI opponents → positions for each AI seat
const AI_SEAT_POSITIONS = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['top', 'top-left', 'top-right'],
  4: ['top-left', 'top-right', 'left', 'right'],
  5: ['top', 'top-left', 'top-right', 'left', 'right'],
};

// ── Game instance & shared UI state ─────────────────────────────

let game       = null;
let raiseValue = 0;

// ── Element references ───────────────────────────────────────────

const startScreen    = $('start-screen');
const resultScreen   = $('result-screen');
const gameoverScreen = $('gameover-screen');
const seatsEl        = $('seats');
const communityEl    = $('community-cards');
const potAmountEl    = $('pot-amount');
const actionLogEl    = $('action-log');
const roundNumberEl  = $('round-number');
const controlsEl     = $('controls');
const toCallLabelEl  = $('to-call-label');
const btnFold        = $('btn-fold');
const btnCheck       = $('btn-check');
const btnCall        = $('btn-call');
const btnRaise       = $('btn-raise');
const raiseSlider    = $('raise-slider');
const raiseLabelEl   = $('raise-label');
const raiseGroupEl   = $('raise-group');

// ── Event listeners ──────────────────────────────────────────────

$('btn-start').addEventListener('click', () => {
  const numOpponents = parseInt($('num-opponents').value, 10);
  game = new Game(numOpponents);
  game.onStateChange = render;
  startScreen.classList.add('hidden');
  game.startNewHand();
});

$('btn-next-hand').addEventListener('click', () => {
  resultScreen.classList.add('hidden');
  game.startNewHand();
});

$('btn-play-again').addEventListener('click', () => {
  gameoverScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  game = null;
});

btnFold.addEventListener('click',  () => game.playerAction('fold'));
btnCheck.addEventListener('click', () => game.playerAction('check'));
btnCall.addEventListener('click',  () => game.playerAction('call'));

btnRaise.addEventListener('click', () => {
  game.playerAction('raise', raiseValue);
});

raiseSlider.addEventListener('input', () => {
  raiseValue = parseInt(raiseSlider.value, 10);
  raiseLabelEl.textContent = `$${raiseValue}`;
});

raiseSlider.addEventListener('focus', () => {
  controlsEl.classList.add('raising');
  btnRaise.style.display = 'none';
  btnCall.style.display  = 'none';
  $('kbd-raise-hint').classList.add('hidden');
  $('kbd-call-hint').classList.add('hidden');
  $('kbd-arrows').classList.remove('hidden');
});

raiseSlider.addEventListener('blur', () => {
  controlsEl.classList.remove('raising');
  btnRaise.style.display = '';
  btnCall.style.display  = '';
  $('kbd-raise-hint').classList.remove('hidden');
  $('kbd-call-hint').classList.remove('hidden');
  $('kbd-arrows').classList.add('hidden');
});

raiseSlider.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnRaise.click();
  }
  if (e.key === 'Escape') {
    raiseSlider.blur();
  }
});

document.addEventListener('keydown', (e) => {
  if (controlsEl.classList.contains('hidden')) return;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

  switch (e.key.toLowerCase()) {
    case 'f':
      btnFold.click();
      break;
    case ' ':
      e.preventDefault();
      if (!btnCheck.classList.contains('hidden')) btnCheck.click();
      else if (!btnCall.classList.contains('hidden')) btnCall.click();
      break;
    case 'r':
      if (raiseGroupEl.style.display !== 'none') raiseSlider.focus();
      break;
  }
});

// ── Main render ──────────────────────────────────────────────────

function render(state) {
  renderBoard(state);
  renderSeats(state);
  renderControls(state);
  renderOverlays(state);
}

// ── Board ─────────────────────────────────────────────────────────

function renderBoard(state) {
  roundNumberEl.textContent = state.roundNumber;
  potAmountEl.textContent   = `$${state.pot}`;

  // Community card slots (always show 5 slots)
  communityEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    if (state.communityCards[i]) {
      communityEl.appendChild(renderCard(state.communityCards[i]));
    } else {
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      communityEl.appendChild(slot);
    }
  }

  // Action log: show "waiting for X" when an AI is thinking
  if (state.waitingFor) {
    actionLogEl.innerHTML =
      `<span class="thinking">Waiting for ${esc(state.waitingFor)}…</span>`;
  } else {
    actionLogEl.textContent = state.lastAction;
  }
}

// ── Seats ─────────────────────────────────────────────────────────

function renderSeats(state) {
  seatsEl.innerHTML = '';

  const aiPlayers    = state.players.filter(p => !p.isHuman);
  const humanPlayer  = state.players.find(p => p.isHuman);
  const positions    = AI_SEAT_POSITIONS[Math.min(aiPlayers.length, 5)];

  aiPlayers.forEach((p, i) => {
    seatsEl.appendChild(buildSeat(p, positions[i] ?? 'top', true));
  });

  seatsEl.appendChild(buildSeat(humanPlayer, 'bottom', false));
}

function buildSeat(player, position, smallCards) {
  const seat = document.createElement('div');
  seat.className   = 'seat';
  seat.dataset.pos = position;

  if (player.isActing) seat.classList.add('active-turn');
  if (player.folded)   seat.classList.add('folded');
  if (player.isDealer) seat.classList.add('dealer');

  // Badges
  const badges = [];
  if (player.isDealer) badges.push('<span class="badge dealer">D</span>');
  if (player.isSB)     badges.push('<span class="badge sb">SB</span>');
  if (player.isBB)     badges.push('<span class="badge bb">BB</span>');
  if (player.isAllIn)  badges.push('<span class="badge allin">ALL IN</span>');

  const betHtml      = player.currentBet > 0
    ? `<div class="seat-bet">Bet: $${player.currentBet}</div>` : '';
  const thinkingHtml = player.isActing && !player.isHuman
    ? '<span class="thinking"> •••</span>' : '';

  seat.innerHTML = `
    <div class="seat-info">
      <div class="seat-name">${esc(player.name)}${thinkingHtml}</div>
      <div class="seat-chips">$${player.chips}</div>
      ${betHtml}
      <div class="seat-badges">${badges.join('')}</div>
    </div>
    <div class="hole-cards"></div>
  `;

  // Hole cards
  if (!player.folded && player.holeCards.length > 0) {
    const holeCardsEl = seat.querySelector('.hole-cards');
    for (const card of player.holeCards)
      holeCardsEl.appendChild(renderCard(card, smallCards));
  }

  return seat;
}

// ── Controls ──────────────────────────────────────────────────────

function renderControls(state) {
  if (!state.isHumanTurn || state.phase === 'showdown' || state.phase === 'gameover') {
    controlsEl.classList.add('hidden');
    return;
  }
  controlsEl.classList.remove('hidden');

  // To-call info
  toCallLabelEl.textContent = state.callAmount > 0
    ? `To call: $${state.callAmount}` : '';

  // Show / hide buttons based on what's legal
  btnCheck.classList.toggle('hidden', !state.canCheck);
  btnCall.classList.toggle('hidden',  !state.canCall);
  btnCall.textContent = `Call $${state.callAmount}`;

  // Raise slider
  if (state.canRaise) {
    raiseGroupEl.style.display = '';
    raiseSlider.min = state.minRaise;
    raiseSlider.max = state.maxRaise;
    // Clamp current raiseValue to the new valid range
    if (raiseValue < state.minRaise || raiseValue > state.maxRaise)
      raiseValue = state.minRaise;
    raiseSlider.value        = raiseValue;
    raiseLabelEl.textContent = `$${raiseValue}`;
  } else {
    raiseGroupEl.style.display = 'none';
    $('kbd-arrows').classList.add('hidden');
  }
}

// ── Overlays ──────────────────────────────────────────────────────

function renderOverlays(state) {
  if (state.phase === 'gameover') {
    const human = state.players.find(p => p.isHuman);
    $('gameover-msg').textContent = human.chips > 0
      ? `You won! Final chips: $${human.chips}`
      : 'You ran out of chips. Better luck next time!';
    gameoverScreen.classList.remove('hidden');
    return;
  }

  if (state.phase === 'showdown' && state.handResult) {
    showResult(state);
  }
}

function showResult(state) {
  const result = state.handResult;

  // Heading: "Alice wins $120 with Full House"
  const winnerStr = result.winners
    .map(w => `${w.name} (${w.handName})`).join(' & ');
  $('result-heading').textContent = `$${result.pot} → ${winnerStr}`;

  // Per-player hand rows
  const handsEl = $('result-hands');
  handsEl.innerHTML = '';

  if (result.playerHands.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'All opponents folded.';
    p.style.color = '#aaa';
    handsEl.appendChild(p);
  } else {
    const isWinner = name => result.winners.some(w => w.name === name);
    for (const ph of result.playerHands) {
      const row = document.createElement('div');
      row.className = 'result-row' + (isWinner(ph.name) ? ' winner' : '');

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'cards';
      for (const card of ph.cards)
        cardsDiv.appendChild(renderCard(card, true));

      const label       = document.createElement('span');
      label.textContent = `${ph.name}: ${ph.hand ? ph.hand.name : '—'}`;

      row.appendChild(cardsDiv);
      row.appendChild(label);
      handsEl.appendChild(row);
    }
  }

  resultScreen.classList.remove('hidden');
}
