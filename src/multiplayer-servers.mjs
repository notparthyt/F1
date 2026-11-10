export function normalizeMultiplayerServer(name, address) {
  const normalizedName = String(name ?? '').trim();
  if (!normalizedName || normalizedName.length > 40) {
    throw new TypeError('Server name must be between 1 and 40 characters.');
  }

  const value = String(address ?? '').trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Enter a valid server URL, such as wss://racing.example.com.');
  }
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new TypeError('Server URL must start with ws:// or wss://.');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new TypeError('Use the server origin only; paths, credentials, query strings, and fragments are not supported.');
  }

  return { name: normalizedName, url: `${url.origin}` };
}

export function normalizeMultiplayerServerStore(value) {
  if (!value || !Array.isArray(value.servers)) {
    throw new TypeError('Saved multiplayer server settings are invalid.');
  }
  const ids = new Set();
  const servers = value.servers.map(server => {
    if (!server || typeof server.id !== 'string' || !server.id.trim() || ids.has(server.id)) {
      throw new TypeError('Saved multiplayer server IDs must be unique.');
    }
    ids.add(server.id);
    return { id: server.id, ...normalizeMultiplayerServer(server.name, server.url) };
  });
  const selectedId = typeof value.selectedId === 'string' && ids.has(value.selectedId)
    ? value.selectedId
    : servers[0]?.id ?? '';
  return { servers, selectedId };
}
