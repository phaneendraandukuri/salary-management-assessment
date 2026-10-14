import { useState, type FormEvent } from 'react';
import { login } from './auth-api';

const messages = {
  invalid: 'Incorrect username or password.',
  limited: 'Too many login attempts. Please wait before trying again.',
  busy: 'Sign-in is busy. Please try again shortly.',
  failed: 'Unable to log in. Please try again.',
  uncertain: 'Login could not be confirmed. Check your session before trying again.',
};
type State = { status: 'idle' | 'submitting' } | { status: 'error'; error: keyof typeof messages };
export function LoginForm({
  onAuthenticated,
  onCheckSession,
}: {
  onAuthenticated: (username: string) => void;
  onCheckSession: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const submitting = state.status === 'submitting';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const input = form.elements.namedItem('password');
    if (input instanceof HTMLInputElement) input.value = '';
    setState({ status: 'submitting' });
    const result = await login(username, password);
    if (result.ok) onAuthenticated(result.username);
    else setState({ status: 'error', error: result.error });
  }
  return (
    <form aria-label="HR login" onSubmit={submit} className="employee-form">
      <h2>HR login</h2>
      <label>
        Username
        <input
          name="username"
          required
          maxLength={100}
          autoComplete="username"
          disabled={submitting}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          disabled={submitting}
        />
      </label>
      {state.status === 'error' && <p role="alert">{messages[state.error]}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>
      {state.status === 'error' && state.error === 'uncertain' && (
        <button type="button" onClick={onCheckSession}>
          Check session
        </button>
      )}
    </form>
  );
}
