export function leaderboardWindow(entries, playerIndex) {
  if (!Array.isArray(entries) || !Number.isInteger(playerIndex)
    || playerIndex < 0 || playerIndex >= entries.length) {
    throw new RangeError('Leaderboard player index must point to an entry.');
  }
  const start = Math.max(0, Math.min(playerIndex - 1, entries.length - 3));
  return entries.slice(start, start + 3);
}
