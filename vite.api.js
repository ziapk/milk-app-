// Where the Vite dev servers forward /api (and /admin): the API server's PORT from server/.env,
// so the same config works locally (8000) and on the live server (8010). Override with API_TARGET.
import fs from 'node:fs';
import path from 'node:path';

function serverPort() {
  try {
    const env = fs.readFileSync(path.join(import.meta.dirname, 'server/.env'), 'utf8');
    return env.match(/^\s*PORT\s*=\s*(\d+)/m)?.[1];
  } catch {
    return undefined;
  }
}

export const apiTarget = process.env.API_TARGET || `http://localhost:${serverPort() || 8000}`;
