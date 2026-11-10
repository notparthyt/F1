import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardWindow } from '../src/leaderboard.mjs';

const entries = Array.from({ length: 5 }, (_, index) => ({ position: index + 1 }));

test('leaderboard window shows the leader and two positions behind', () => {
  assert.deepEqual(leaderboardWindow(entries, 0), entries.slice(0, 3));
});

test('leaderboard window keeps the player centered when possible', () => {
  assert.deepEqual(leaderboardWindow(entries, 2), entries.slice(1, 4));
});

test('leaderboard window shows two positions ahead of the last place driver', () => {
  assert.deepEqual(leaderboardWindow(entries, 4), entries.slice(2, 5));
});

test('leaderboard window supports small grids and rejects invalid player indexes', () => {
  assert.deepEqual(leaderboardWindow(entries.slice(0, 2), 1), entries.slice(0, 2));
  assert.throws(() => leaderboardWindow(entries, 5), RangeError);
});
