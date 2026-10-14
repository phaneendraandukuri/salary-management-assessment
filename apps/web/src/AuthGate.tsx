import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSession, logout } from './auth-api';
import './App.css';
import { LoginForm } from './LoginForm';
import { ApiContext } from './api-context';

type State =
  | {
      status: 'checking' | 'check-error' | 'unauthenticated' | 'logging-out' | 'logout-error';
      message?: string;
    }
  | { status: 'authenticated'; username: string; generation: object };

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const active = useRef<object | null>(null);
  const authenticate = useCallback((username: string) => {
    const generation = {};
    active.current = generation;
    setState({ status: 'authenticated', username, generation });
  }, []);
  const apiRequest = useMemo<typeof fetch>(() => {
    const generation = state.status === 'authenticated' ? state.generation : null;
    return async (...args) => {
      const response = await fetch(...args);
      if (
        response.status === 401 &&
        generation !== null &&
        active.current === generation &&
        !args[1]?.signal?.aborted
      ) {
        active.current = null;
        setState({
          status: 'unauthenticated',
          message:
            'Your session expired. Log in again. Check the directory before resubmitting any interrupted employee creation or salary update.',
        });
      }
      return response;
    };
  }, [state]);
  function checkSession() {
    active.current = null;
    setState({ status: 'checking' });
    setAttempt((current) => current + 1);
  }
  async function logOut() {
    active.current = null;
    setState({ status: 'logging-out' });
    try {
      await logout();
      setState({ status: 'unauthenticated' });
    } catch {
      setState({ status: 'logout-error' });
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result.authenticated) authenticate(result.username);
          else setState({ status: 'unauthenticated' });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'check-error' });
      });
    return () => {
      controller.abort();
      active.current = null;
    };
  }, [attempt, authenticate]);
  if (state.status === 'authenticated')
    return (
      <ApiContext.Provider value={apiRequest}>
        <header className="auth-bar">
          <span>HR session</span>
          <button onClick={() => void logOut()}>Log out</button>
        </header>
        {children}
      </ApiContext.Provider>
    );
  return (
    <main className="auth-panel">
      <h1>ACME Salary Management</h1>
      {state.status === 'checking' && <p role="status">Checking session…</p>}
      {state.status === 'logging-out' && <p role="status">Logging out…</p>}
      {state.status === 'logout-error' && (
        <>
          <p role="alert">
            Server-side logout is unconfirmed. Protected data has been cleared. Please retry logout.
          </p>
          <button onClick={() => void logOut()}>Retry logout</button>
        </>
      )}
      {state.status === 'check-error' && (
        <>
          <p role="alert">Unable to check your session. Please try again.</p>
          <button onClick={checkSession}>Retry session</button>
        </>
      )}
      {state.status === 'unauthenticated' && (
        <>
          {state.message && <p role="alert">{state.message}</p>}
          <LoginForm onAuthenticated={authenticate} onCheckSession={checkSession} />
        </>
      )}
    </main>
  );
}
