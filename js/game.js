'use strict';

const SMALL_BLIND = 10;
const BIG_BLIND   = 20;
const AI_NAMES    = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

class Game {
  constructor(numOpponents) {
    this.smallBlind = SMALL_BLIND;
    this.bigBlind   = BIG_BLIND;
    this.deck       = new Deck();

    // Index 0 = human; 1..n = AI opponents
    this.players = [new Player('You', 0, 1000, true)];
    for (let i = 0; i < numOpponents; i++)
      this.players.push(new Player(AI_NAMES[i], i + 1, 1000, false));

    this.dealerIndex = this.players.length - 1; // advances to 0 on first hand
    this.sbIndex     = -1;
    this.bbIndex     = -1;

    this.phase          = 'waiting';
    this.communityCards = [];
    this.pot            = 0;
    this.currentBet     = 0;
    this.actionQueue    = [];   // ordered list of player indices waiting to act
    this.lastAction     = '';
    this.handResult     = null;
    this.roundNumber    = 0;

    this.onStateChange  = null; // callback: (state) => {}
  }

  // ── Public API ────────────────────────────────────────────────

  startNewHand() {
    this.roundNumber++;
    this.handResult     = null;
    this.lastAction     = '';
    this.communityCards = [];
    this.pot            = 0;
    this.currentBet     = 0;
    this.deck.reset();

    // Check if the game can continue
    const human    = this.players.find(p => p.isHuman);
    const eligible = this.players.filter(p => p.chips > 0);
    if (eligible.length < 2 || human.chips === 0) {
      this.phase = 'gameover';
      this._emit();
      return;
    }

    this.players.forEach(p => p.resetForNewHand());
    // Bust-out players sit out this hand
    this.players.filter(p => p.chips === 0).forEach(p => { p.folded = true; });

    // Advance dealer button
    this.dealerIndex = this._nextEligible(this.dealerIndex);

    // Post blinds (heads-up rule: dealer = SB)
    const numActive = this.players.filter(p => !p.folded).length;
    if (numActive === 2) {
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this._nextEligible(this.dealerIndex);
    } else {
      this.sbIndex = this._nextEligible(this.dealerIndex);
      this.bbIndex = this._nextEligible(this.sbIndex);
    }

    this._postBlind(this.sbIndex, this.smallBlind);
    this._postBlind(this.bbIndex, this.bigBlind);
    this.currentBet = this.bigBlind;

    // Deal 2 hole cards to each active player
    for (let round = 0; round < 2; round++)
      for (const p of this.players)
        if (!p.folded) p.holeCards.push(this.deck.deal());

    this.phase = 'preflop';

    // Pre-flop action starts UTG (player after BB), BB acts last
    const utg = this._nextEligible(this.bbIndex);
    this.actionQueue = this._buildQueue(utg);

    this._emit();
    this._scheduleAI();
  }

  /**
   * Execute a player action.
   * `action`        : 'fold' | 'check' | 'call' | 'raise'
   * `raiseToAmount` : total amount the player will have bet this round (raise only)
   */
  playerAction(action, raiseToAmount = 0) {
    if (this.actionQueue.length === 0) return;
    if (this.phase === 'showdown' || this.phase === 'gameover') return;

    const playerIdx = this.actionQueue.shift();
    const player    = this.players[playerIdx];
    const toCall    = this.currentBet - player.currentBet;

    switch (action) {
      case 'fold':
        player.folded   = true;
        this.lastAction = `${player.name} folds`;
        break;

      case 'check':
        this.lastAction = `${player.name} checks`;
        break;

      case 'call': {
        const called    = player.placeBet(toCall);
        this.pot       += called;
        const suffix    = player.isAllIn ? ' (all-in)' : '';
        this.lastAction = called > 0
          ? `${player.name} calls $${called}${suffix}`
          : `${player.name} checks`;
        break;
      }

      case 'raise': {
        const addAmount = raiseToAmount - player.currentBet;
        const actual    = player.placeBet(addAmount);
        this.pot       += actual;
        this.currentBet = Math.max(this.currentBet, player.currentBet);
        const suffix    = player.isAllIn ? ' (all-in)' : '';
        this.lastAction = `${player.name} raises to $${player.currentBet}${suffix}`;

        // Anyone who hasn't matched the new bet must act again.
        // Walk clockwise from the raiser; include everyone below the current bet.
        const newQueue = [];
        let idx = (playerIdx + 1) % this.players.length;
        for (let i = 0; i < this.players.length - 1; i++) {
          const p = this.players[idx];
          if (!p.folded && !p.isAllIn && p.currentBet < this.currentBet)
            newQueue.push(idx);
          idx = (idx + 1) % this.players.length;
        }
        this.actionQueue = newQueue;
        break;
      }
    }

    this._afterAction();
  }

  /** Returns a plain-object snapshot of the current game state. */
  getState() {
    const humanIdx    = this.players.findIndex(p => p.isHuman);
    const human       = this.players[humanIdx];
    const isHumanTurn = this.actionQueue.length > 0 && this.actionQueue[0] === humanIdx;

    // Determine who's currently being waited on (for the action log)
    const actorIdx    = this.actionQueue[0];
    const waitingFor  = actorIdx !== undefined && !this.players[actorIdx].isHuman
      ? this.players[actorIdx].name : null;

    return {
      phase:          this.phase,
      pot:            this.pot,
      communityCards: [...this.communityCards],
      currentBet:     this.currentBet,
      roundNumber:    this.roundNumber,
      dealerIndex:    this.dealerIndex,
      sbIndex:        this.sbIndex,
      bbIndex:        this.bbIndex,
      lastAction:     this.lastAction,
      waitingFor,
      handResult:     this.handResult,
      isHumanTurn,
      callAmount:     isHumanTurn
                        ? Math.min(this.currentBet - human.currentBet, human.chips)
                        : 0,
      minRaise:       isHumanTurn ? this._minRaise() : 0,
      maxRaise:       isHumanTurn ? human.chips + human.currentBet : 0,
      canCheck:       isHumanTurn && human.currentBet >= this.currentBet,
      canCall:        isHumanTurn && human.currentBet  < this.currentBet && human.chips > 0,
      canRaise:       isHumanTurn && human.chips > (this.currentBet - human.currentBet),
      players: this.players.map((p, i) => ({
        name:       p.name,
        index:      p.index,
        chips:      p.chips,
        currentBet: p.currentBet,
        folded:     p.folded,
        isAllIn:    p.isAllIn,
        isHuman:    p.isHuman,
        isDealer:   i === this.dealerIndex,
        isSB:       i === this.sbIndex,
        isBB:       i === this.bbIndex,
        isActing:   this.actionQueue.length > 0 && this.actionQueue[0] === i,
        // Hole cards: always visible for human; AI cards revealed at showdown only
        holeCards:  (p.isHuman || this.phase === 'showdown')
                      ? [...p.holeCards]
                      : p.holeCards.map(() => null),
      })),
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  _emit() {
    if (this.onStateChange) this.onStateChange(this.getState());
  }

  /** Next player index with chips > 0, searching clockwise from fromIdx. */
  _nextEligible(fromIdx) {
    let idx = (fromIdx + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].chips > 0) return idx;
      idx = (idx + 1) % this.players.length;
    }
    return fromIdx; // fallback (single player remaining)
  }

  /**
   * Build an ordered action queue starting at startIdx, going clockwise.
   * Excludes folded and all-in players.
   */
  _buildQueue(startIdx) {
    const queue = [];
    let idx = startIdx;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[idx];
      if (!p.folded && !p.isAllIn) queue.push(idx);
      idx = (idx + 1) % this.players.length;
    }
    return queue;
  }

  _postBlind(playerIdx, amount) {
    const actual = this.players[playerIdx].placeBet(amount);
    this.pot    += actual;
  }

  /** Called after every action to advance the game state. */
  _afterAction() {
    // Remove players who can no longer act from the queue
    this.actionQueue = this.actionQueue.filter(
      i => !this.players[i].folded && !this.players[i].isAllIn
    );

    const active = this.players.filter(p => !p.folded);

    if (active.length === 1) {
      this._awardPot();
      return;
    }

    if (this.actionQueue.length === 0) {
      this._advancePhase();
    } else {
      this._emit();
      this._scheduleAI();
    }
  }

  /** Move to the next street (flop → turn → river → showdown). */
  _advancePhase() {
    if (this.phase === 'showdown') return;

    // Reset per-round bets
    this.players.forEach(p => { p.currentBet = 0; });

    const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    this.phase = order[order.indexOf(this.phase) + 1];

    if (this.phase === 'flop') {
      this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
    } else if (this.phase === 'turn' || this.phase === 'river') {
      this.communityCards.push(this.deck.deal());
    } else if (this.phase === 'showdown') {
      this._doShowdown();
      return;
    }

    // Post-flop: first active player left of the dealer acts first
    const first = this._firstPostFlopActor();
    this.actionQueue = this._buildQueue(first);

    // If all remaining players are all-in, skip straight to showdown
    if (this.actionQueue.length === 0) {
      this._advancePhase();
      return;
    }

    this._emit();
    this._scheduleAI();
  }

  _firstPostFlopActor() {
    let idx = (this.dealerIndex + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (!this.players[idx].folded && !this.players[idx].isAllIn) return idx;
      idx = (idx + 1) % this.players.length;
    }
    return this.dealerIndex;
  }

  _doShowdown() {
    const active  = this.players.filter(p => !p.folded);
    const winners = findWinners(active, this.communityCards);
    const share   = Math.floor(this.pot / winners.length);

    winners.forEach(w => { w.player.chips += share; });
    // Give any indivisible remainder to the first winner
    const remainder = this.pot - share * winners.length;
    if (remainder > 0) winners[0].player.chips += remainder;

    this.handResult = {
      winners:     winners.map(w => ({ name: w.player.name, handName: w.hand.name })),
      pot:         this.pot,
      playerHands: active.map(p => ({
        name:  p.name,
        hand:  bestHand(p.holeCards, this.communityCards),
        cards: [...p.holeCards],
      })),
    };

    this._emit();
  }

  /** Award the pot to the sole remaining player (everyone else folded). */
  _awardPot() {
    this.phase = 'showdown';
    const winner = this.players.find(p => !p.folded);
    winner.chips += this.pot;
    this.handResult = {
      winners:     [{ name: winner.name, handName: 'everyone else folded' }],
      pot:         this.pot,
      playerHands: [],
    };
    this._emit();
  }

  _minRaise() {
    const human = this.players.find(p => p.isHuman);
    return Math.min(this.currentBet + this.bigBlind, human.chips + human.currentBet);
  }

  // ── AI ────────────────────────────────────────────────────────

  _scheduleAI() {
    if (this.actionQueue.length === 0) return;
    const idx = this.actionQueue[0];
    if (!this.players[idx].isHuman) {
      setTimeout(() => this._doAIAction(idx), 700);
    }
  }

  _doAIAction(expectedIdx) {
    if (this.actionQueue.length === 0 || this.actionQueue[0] !== expectedIdx) return;
    if (this.phase === 'showdown' || this.phase === 'gameover') return;

    const player   = this.players[expectedIdx];
    const toCall   = this.currentBet - player.currentBet;
    const strength = this._handStrength(expectedIdx);

    let action, raiseToAmount;

    if (strength >= 0.72) {
      // Strong hand: raise
      const target = Math.min(
        player.currentBet + toCall + this.bigBlind * 3,
        player.chips + player.currentBet
      );
      if (player.chips > toCall && target > this.currentBet) {
        action        = 'raise';
        raiseToAmount = target;
      } else {
        action = 'call';
      }
    } else if (strength >= 0.42) {
      // Medium hand: call or check
      action = toCall === 0 ? 'check' : 'call';
    } else {
      // Weak hand: fold, or occasionally call as a bluff
      if (toCall === 0) {
        action = 'check';
      } else if (Math.random() < 0.12) {
        action = 'call';
      } else {
        action = 'fold';
      }
    }

    this.playerAction(action, raiseToAmount);
  }

  _handStrength(playerIdx) {
    const player   = this.players[playerIdx];
    const allCards = [...player.holeCards, ...this.communityCards];
    if (allCards.length < 5) return this._preflopStrength(player.holeCards);
    const result = bestHand(player.holeCards, this.communityCards);
    return result ? result.rank / 8 : 0;
  }

  _preflopStrength(holeCards) {
    if (holeCards.length < 2) return 0;
    const [a, b] = [...holeCards].sort((x, y) => y.rank - x.rank);
    if (a.rank === b.rank) return 0.5 + a.rank / 30;           // pocket pair
    const base      = (a.rank + b.rank - 4) / 24;              // normalised high-card value
    const suited    = a.suit === b.suit ? 0.08 : 0;
    const connected = a.rank - b.rank <= 2  ? 0.05 : 0;
    return Math.min(Math.max(base + suited + connected, 0.05), 0.95);
  }
}
