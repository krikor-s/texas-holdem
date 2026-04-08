'use strict';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_LABELS  = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_SYMBOLS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };

class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
  }

  get label()  { return RANK_LABELS[this.rank] ?? String(this.rank); }
  get symbol() { return SUIT_SYMBOLS[this.suit]; }
  get isRed()  { return this.suit === 'hearts' || this.suit === 'diamonds'; }
}

class Deck {
  constructor() { this.reset(); }

  reset() {
    this.cards = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        this.cards.push(new Card(rank, suit));
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() {
    if (!this.cards.length) throw new Error('Deck is empty');
    return this.cards.pop();
  }
}
