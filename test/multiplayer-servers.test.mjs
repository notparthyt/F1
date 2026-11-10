import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMultiplayerServer, normalizeMultiplayerServerStore } from '../src/multiplayer-servers.mjs';

test('server definitions trim names and normalize websocket origins', () => {
  assert.deepEqual(normalizeMultiplayerServer('  Main server  ', 'wss://race.example.com/'), {
    name: 'Main server',
    url: 'wss://race.example.com',
  });
});

test('server definitions reject invalid protocols and non-origin URLs', () => {
  assert.throws(() => normalizeMultiplayerServer('Server', 'https://race.example.com'), /ws:\/\/ or wss:\/\//);
  assert.throws(() => normalizeMultiplayerServer('Server', 'wss://race.example.com/match'), /origin only/);
  assert.throws(() => normalizeMultiplayerServer('Server', 'wss://user:pass@race.example.com'), /origin only/);
  assert.throws(() => normalizeMultiplayerServer('', 'wss://race.example.com'), /Server name/);
});

test('saved server store validates IDs and falls back to a configured server', () => {
  const store = normalizeMultiplayerServerStore({
    servers: [
      { id: 'one', name: 'One', url: 'wss://one.example.com' },
      { id: 'two', name: 'Two', url: 'wss://two.example.com' },
    ],
    selectedId: 'two',
  });
  assert.equal(store.selectedId, 'two');
  assert.equal(normalizeMultiplayerServerStore({ servers: store.servers, selectedId: 'missing' }).selectedId, 'one');
  assert.throws(() => normalizeMultiplayerServerStore({
    servers: [store.servers[0], store.servers[0]],
  }), /unique/);
});
