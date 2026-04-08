'use strict';

// ── Combination generator ────────────────────────────────────────
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [
    ...combinations(tail, k - 1).map(c => [head, ...c]),
    ...combinations(tail, k),
  ];
}

// ── Five-card evaluation ─────────────────────────────────────────

// Returns the high card of a straight in `descRanks`, or 0 if none.
function straightHighCard(descRanks) {
  if (new Set(descRanks).size < 5) return 0;              // duplicate ranks → no straight
  if (descRanks[0] - descRanks[4] === 4) return descRanks[0];  // normal straight
  // Wheel: A-5-4-3-2  (ace plays low)
  if (descRanks[0] === 14 && descRanks[1] === 5 &&
      descRanks[2] === 4  && descRanks[3] === 3 &&
      descRanks[4] === 2) return 5;
  return 0;
}

/**
 * Evaluate a 5-card hand.
 * Returns { rank: 0-8, tb: number[], name: string }
 *   rank 8 = Straight Flush … rank 0 = High Card
 *   tb   = tiebreaker array for comparing equal ranks
 */
function evaluateFive(cards) {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks  = sorted.map(c => c.rank);
  const suits  = sorted.map(c => c.suit);

  const flush    = suits.every(s => s === suits[0]);
  const straight = straightHighCard(ranks);

  if (flush && straight)
    return { rank: 8, tb: [straight], name: 'Straight Flush' };

  // Count rank frequencies and sort by count desc, then rank desc
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] ?? 0) + 1;
  const groups = Object.entries(freq)
    .map(([r, c]) => [+r, c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map(g => g[1]);

  if (counts[0] === 4)
    return { rank: 7, tb: [groups[0][0], groups[1][0]], name: 'Four of a Kind' };

  if (counts[0] === 3 && counts[1] === 2)
    return { rank: 6, tb: [groups[0][0], groups[1][0]], name: 'Full House' };

  if (flush)
    return { rank: 5, tb: ranks, name: 'Flush' };

  if (straight)
    return { rank: 4, tb: [straight], name: 'Straight' };

  if (counts[0] === 3) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { rank: 3, tb: [groups[0][0], ...kickers], name: 'Three of a Kind' };
  }

  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = groups.slice(0, 2).map(g => g[0]).sort((a, b) => b - a);
    return { rank: 2, tb: [...pairs, groups[2][0]], name: 'Two Pair' };
  }

  if (counts[0] === 2) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { rank: 1, tb: [groups[0][0], ...kickers], name: 'One Pair' };
  }

  return { rank: 0, tb: ranks, name: 'High Card' };
}

// ── Hand comparison ──────────────────────────────────────────────

/** Returns positive if a beats b, negative if b beats a, 0 for tie. */
function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
    const d = (a.tb[i] ?? 0) - (b.tb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Find the best 5-card hand from holeCards + communityCards.
 * Returns the same shape as evaluateFive, or null if < 5 cards total.
 */
function bestHand(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) return null;
  let best = null;
  for (const combo of combinations(all, 5)) {
    const h = evaluateFive(combo);
    if (!best || compareHands(h, best) > 0) best = h;
  }
  return best;
}

/**
 * Find the winner(s) among active players.
 * Returns array of { player, hand } objects for all tied winners.
 */
function findWinners(activePlayers, communityCards) {
  const results = activePlayers.map(p => ({
    player: p,
    hand:   bestHand(p.holeCards, communityCards),
  }));
  const best = results.reduce((b, r) => compareHands(r.hand, b.hand) > 0 ? r : b);
  return results.filter(r => compareHands(r.hand, best.hand) === 0);
}
