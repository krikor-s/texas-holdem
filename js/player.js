'use strict';

class Player {
  constructor(name, index, chips, isHuman = false) {
    this.name    = name;
    this.index   = index;
    this.chips   = chips;
    this.isHuman = isHuman;

    // Hand state (reset each hand)
    this.holeCards        = [];
    this.currentBet       = 0;   // chips bet in the current betting round
    this.totalBetThisHand = 0;   // total chips committed this hand
    this.folded           = false;
    this.isAllIn          = false;
  }

  resetForNewHand() {
    this.holeCards        = [];
    this.currentBet       = 0;
    this.totalBetThisHand = 0;
    this.folded           = false;
    this.isAllIn          = false;
  }

  /**
   * Place a bet of up to `amount`.
   * Returns the actual chips placed (may be less if the player goes all-in).
   */
  placeBet(amount) {
    const actual = Math.min(amount, this.chips);
    this.chips            -= actual;
    this.currentBet       += actual;
    this.totalBetThisHand += actual;
    if (this.chips === 0) this.isAllIn = true;
    return actual;
  }
}
