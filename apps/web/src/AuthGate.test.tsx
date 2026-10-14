import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { App } from './App';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}
async function enterLogin() {
  await screen.findByRole('form', { name: 'HR login' });
  await userEvent.type(screen.getByLabelText('Username'), 'hr');
  await userEvent.type(screen.getByLabelText('Password'), 'test-only-password');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}
it('checks the session first without mounting or requesting protected workflows', () => {
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <App />
    </AuthGate>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Checking session');
  expect(screen.queryByRole('form', { name: 'Create employee' })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/session');
});

it('logs in with a submitting state, clears the password and mounts fresh workflows', async () => {
  let resolve: (response: Response) => void = () => {};
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetchMock = vi.fn().mockResolvedValueOnce(json(401, {})).mockReturnValueOnce(pending);
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  );
  await enterLogin();
  expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
  expect(screen.getByLabelText('Password')).toHaveValue('');
  resolve(json(200, { user: { username: 'hr' } }));
  expect(await screen.findByText('Protected content')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/login');
  const options = fetchMock.mock.calls[1]?.[1] as RequestInit;
  expect(options.method).toBe('POST');
  expect(JSON.parse(String(options.body)).username === 'hr').toBe(true);
});
it.each([
  [401, 'Incorrect username or password'],
  [429, 'Too many login attempts'],
  [503, 'Sign-in is busy'],
  [500, 'Unable to log in'],
])('shows appropriate login feedback for HTTP %s', async (status, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(status, {})),
  );
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  );
  await enterLogin();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
});
it('offers Check session after uncertain login without automatically retrying POST', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(401, {}))
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce(json(200, { user: { username: 'hr' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  );
  await enterLogin();
  expect(await screen.findByRole('alert')).toHaveTextContent('Login could not be confirmed');
  await userEvent.click(screen.getByRole('button', { name: 'Check session' }));
  expect(await screen.findByText('Protected content')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/auth/login').length).toBe(1);
});
it('restores authenticated workflows from the current session', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (url) =>
      url === '/api/auth/session'
        ? json(200, { user: { username: 'hr' } })
        : json(200, { employees: [], page: 1, pageSize: 25, total: 0 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <App />
    </AuthGate>,
  );
  expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/session');
});
it('shows login for an unauthenticated session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(json(401, { error: { code: 'authentication_required' } })),
  );
  render(
    <AuthGate>
      <App />
    </AuthGate>,
  );
  expect(await screen.findByRole('form', { name: 'HR login' })).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it('offers explicit session Retry for network/server failure without mounting protected content', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce(json(200, { user: { username: 'hr' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to check');
  expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry session' }));
  expect(await screen.findByText('Protected content')).toBeInTheDocument();
});

it('immediately unmounts protected state on logout before the request completes', async () => {
  let resolve: (response: Response) => void = () => {};
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json(200, { user: { username: 'hr' } }))
      .mockReturnValueOnce(pending),
  );
  render(
    <AuthGate>
      <label>
        Private draft
        <input />
      </label>
    </AuthGate>,
  );
  await screen.findByLabelText('Private draft');
  await userEvent.type(screen.getByLabelText('Private draft'), 'sensitive test draft');
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(screen.queryByLabelText('Private draft')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Logging out');
  await act(async () => resolve(new Response(null, { status: 204 })));
  expect(await screen.findByRole('form', { name: 'HR login' })).toBeInTheDocument();
});

it.each(['network', 'server'])(
  'keeps protected content unmounted after %s logout failure until explicit Retry succeeds',
  async (failure) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { user: { username: 'hr' } }));
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('connection lost'));
    else fetchMock.mockResolvedValueOnce(json(500, {}));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthGate>
        <p>Protected content</p>
      </AuthGate>,
    );
    await screen.findByText('Protected content');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server-side logout is unconfirmed');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'HR login' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Retry logout' }));
    expect(await screen.findByRole('form', { name: 'HR login' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/auth/logout').length).toBe(2);
  },
);

it('remounts fresh protected state after logout and reauthentication', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json(200, { user: { username: 'hr' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { user: { username: 'hr' } })),
  );
  render(
    <AuthGate>
      <label>
        Private draft
        <input />
      </label>
    </AuthGate>,
  );
  await screen.findByLabelText('Private draft');
  await userEvent.type(screen.getByLabelText('Private draft'), 'discard this');
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await enterLogin();
  expect(await screen.findByLabelText('Private draft')).toHaveValue('');
});
