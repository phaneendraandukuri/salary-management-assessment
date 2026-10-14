import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';

const employee = {
  employeeId: 'ACME-001',
  name: 'Alex Example',
  email: 'alex@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'INR',
  salaryAmount: '9007199254740993.01',
};

function jsonResponse(employees = [employee], total = employees.length, page = 1) {
  return new Response(JSON.stringify({ employees, total, page, pageSize: 25 }), { status: 200 });
}

describe('employee directory', () => {
  it('shows loading and requests the first page without allowing pagination', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading employees');
    expect(fetchMock).toHaveBeenCalledWith('/api/employees?page=1&pageSize=25', {
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('renders required employee fields and the exact salary string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse()));
    render(<App />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    for (const value of [
      'ACME-001',
      'Alex Example',
      'Engineering',
      'Developer',
      'India',
      'INR',
      '9007199254740993.01',
    ]) {
      expect(screen.getByRole('cell', { name: value })).toBeInTheDocument();
    }
    expect(screen.getByText('1 employee')).toBeInTheDocument();
    expect(screen.queryByText('Loading employees…')).not.toBeInTheDocument();
  });

  it('shows an empty-directory message for zero employees', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([], 0)));
    render(<App />);
    expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('0 employees')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it.each(['network', 'http', 'json'])(
    'shows a friendly error and retries after a %s failure',
    async (failure) => {
      const fetchMock = vi.fn();
      if (failure === 'network')
        fetchMock.mockRejectedValueOnce(new Error('private network details'));
      else if (failure === 'http')
        fetchMock.mockResolvedValueOnce(new Response('private SQL details', { status: 500 }));
      else fetchMock.mockResolvedValueOnce(new Response('{', { status: 200 }));
      fetchMock.mockResolvedValueOnce(jsonResponse());
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      render(<App />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to load employees. Please try again.',
      );
      expect(screen.queryByText(/private.*details/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('/api/employees?page=1&pageSize=25');
    },
  );

  it('loads next/previous pages and disables controls during requests and at boundaries', async () => {
    let resolveSecond!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([employee], 26))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        }),
      )
      .mockResolvedValueOnce(jsonResponse([employee], 26));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading employees');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/employees?page=2&pageSize=25');
    const second = { ...employee, employeeId: 'ACME-026', name: 'Second Page' };
    resolveSecond(jsonResponse([second], 26, 2));
    await screen.findByRole('cell', { name: 'Second Page' });
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByRole('cell', { name: 'Alex Example' });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/employees?page=1&pageSize=25');
    expect(screen.getByText('Page 1')).toBeInTheDocument();
  });

  it('distinguishes an empty page from an empty directory and permits going back', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([employee], 26))
        .mockResolvedValueOnce(jsonResponse([], 1, 2)),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No employees on this page.')).toBeInTheDocument();
    expect(screen.queryByText('No employees yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('ignores a late response from an aborted StrictMode request', async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('cell', { name: 'Alex Example' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      resolveOld(jsonResponse([{ ...employee, name: 'Stale Employee' }]));
    });
    expect(screen.getByRole('cell', { name: 'Alex Example' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Stale Employee' })).not.toBeInTheDocument();
  });

  it('ignores a late failure from an aborted StrictMode request', async () => {
    let rejectOld!: (error: Error) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((_resolve, reject) => {
          rejectOld = reject;
        }),
      )
      .mockResolvedValueOnce(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('table');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      rejectOld(new Error('Old request failed'));
    });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it.each([false, true])(
  'refreshes the current page after creation; refresh failure=%s',
  async (refreshFails) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([employee], 26))
      .mockResolvedValueOnce(jsonResponse([employee], 26, 2))
      .mockResolvedValueOnce(new Response(JSON.stringify({ employee }), { status: 201 }));
    if (refreshFails) fetchMock.mockRejectedValueOnce(new Error('Refresh failed'));
    else fetchMock.mockResolvedValueOnce(jsonResponse([employee], 27, 2));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('table');
    for (const [label, value] of [
      ['Employee ID', employee.employeeId],
      ['Name', employee.name],
      ['Email', employee.email],
      ['Department', employee.department],
      ['Role', employee.role],
      ['Country', employee.country],
      ['Annual salary', employee.salaryAmount],
    ])
      await user.type(screen.getByRole('textbox', { name: label }), value);
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByText('Employee ACME-001 created.')).toBeInTheDocument();
    if (refreshFails) {
      expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load employees');
      expect(screen.getByText('Employee ACME-001 created.')).toBeInTheDocument();
    } else {
      expect(await screen.findByText('27 employees')).toBeInTheDocument();
    }
    expect(fetchMock.mock.calls[3][0]).toBe('/api/employees?page=2&pageSize=25');
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  },
);
