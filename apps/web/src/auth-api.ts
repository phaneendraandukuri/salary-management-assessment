export type SessionResult = { authenticated: true; username: string } | { authenticated: false };

export async function getSession(signal: AbortSignal): Promise<SessionResult> {
  const response = await fetch('/api/auth/session', { signal });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) throw new Error('Session check failed');
  const data = (await response.json()) as { user?: { username?: unknown } };
  if (typeof data?.user?.username !== 'string' || !data.user.username)
    throw new Error('Invalid session response');
  return { authenticated: true, username: data.user.username };
}

export type LoginResult =
  | { ok: true; username: string }
  | { ok: false; error: 'invalid' | 'limited' | 'busy' | 'failed' | 'uncertain' };
export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.status === 401) return { ok: false, error: 'invalid' };
    if (response.status === 429) return { ok: false, error: 'limited' };
    if (response.status === 503) return { ok: false, error: 'busy' };
    if (response.status !== 200) return { ok: false, error: 'failed' };
    const data = (await response.json()) as { user?: { username?: unknown } };
    if (typeof data?.user?.username !== 'string' || !data.user.username)
      return { ok: false, error: 'uncertain' };
    return { ok: true, username: data.user.username };
  } catch {
    return { ok: false, error: 'uncertain' };
  }
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (response.status !== 204) throw new Error('Logout unconfirmed');
}
