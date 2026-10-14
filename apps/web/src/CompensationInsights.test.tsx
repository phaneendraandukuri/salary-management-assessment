import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { CompensationInsights } from './CompensationInsights';
import { getInsights } from './insights-api';

const group = {
  currency: 'USD',
  groupValue: null as string | null,
  headcount: 2,
  total: '18014398509481986.03',
  average: '9007199254740993.02',
  median: '9007199254740993.02',
  minimum: '9007199254740993.01',
  maximum: '9007199254740993.02',
};
function response(
  groups = [group],
  groupBy = 'currency',
  headcount = groups.reduce((sum, row) => sum + row.headcount, 0),
) {
  return new Response(JSON.stringify({ groupBy, headcount, groups }));
}
function panel() {
  return within(screen.getByRole('region', { name: 'Compensation insights' }));
}
it('encodes grouping/trimmed filters and preserves exact monetary strings', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(response([{ ...group, groupValue: 'India' }], 'country'));
  vi.stubGlobal('fetch', fetchMock);
  const data = await getInsights(
    { country: ' India ', department: ' R&D ', groupBy: 'country' },
    new AbortController().signal,
  );
  const params = new URL(fetchMock.mock.calls[0]?.[0] ?? '/no-fetch', 'http://localhost')
    .searchParams;
  expect(Object.fromEntries(params)).toEqual({
    groupBy: 'country',
    country: 'India',
    department: 'R&D',
  });
  expect(data.groups[0].total).toBe(group.total);
});
it('requests currency summary on opening and shows loading', () => {
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  render(<CompensationInsights />);
  expect(panel().getByRole('status')).toHaveTextContent('Loading compensation insights');
  expect(fetchMock).toHaveBeenCalledWith('/api/compensation-insights?groupBy=currency', {
    signal: expect.any(AbortSignal),
  });
});

it('renders headcounts and all exact monetary statistics in separate currency rows', async () => {
  const other = {
    currency: 'INR',
    groupValue: null,
    headcount: 1,
    total: '5.00',
    average: '5.00',
    median: '5.00',
    minimum: '5.00',
    maximum: '5.00',
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([other, group])));
  render(<CompensationInsights />);
  expect(await panel().findByRole('table')).toBeInTheDocument();
  expect(panel().getByText('3 matching employees')).toBeInTheDocument();
  for (const label of ['Currency', 'Headcount', 'Total', 'Average', 'Median', 'Minimum', 'Maximum'])
    expect(panel().getByRole('columnheader', { name: label })).toBeInTheDocument();
  const row = within(panel().getAllByRole('row')[2]);
  expect(row.getByRole('cell', { name: 'USD' })).toBeInTheDocument();
  expect(row.getByRole('cell', { name: group.total })).toBeInTheDocument();
  expect(row.getAllByRole('cell', { name: group.average })).toHaveLength(3);
  expect(row.getByRole('cell', { name: group.minimum })).toBeInTheDocument();
  expect(panel().getByText(/rounded/)).toHaveTextContent('currency');
});
it('shows a clear empty result without statistics', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
  render(<CompensationInsights />);
  expect(await panel().findByText('No employees match these criteria.')).toBeInTheDocument();
  expect(panel().queryByRole('table')).not.toBeInTheDocument();
  expect(panel().getByText('0 matching employees')).toBeInTheDocument();
});

it.each(['country', 'department'] as const)(
  'keeps drafts separate, applies %s breakdown with exact filters, and resets during loading',
  async (groupBy) => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calls++;
      if (calls === 3) return new Promise(() => {});
      const mode = new URL(url, 'http://localhost').searchParams.get('groupBy') ?? 'currency';
      return Promise.resolve(
        response(
          [
            {
              ...group,
              groupValue: mode === 'currency' ? null : mode === 'country' ? 'India' : 'Engineering',
            },
          ],
          mode,
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CompensationInsights />);
    const user = userEvent.setup();
    await panel().findByRole('table');
    await user.type(panel().getByRole('textbox', { name: 'Insights country' }), ' India ');
    await user.type(panel().getByRole('textbox', { name: 'Insights department' }), ' Engineering ');
    await user.selectOptions(panel().getByRole('combobox', { name: 'Insights grouping' }), groupBy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(panel().getByText(/Applied insights:/)).not.toHaveTextContent('India');
    await user.click(panel().getByRole('button', { name: 'Apply insights' }));
    await panel().findByRole('columnheader', {
      name: groupBy === 'country' ? 'Country' : 'Department',
    });
    expect(
      Object.fromEntries(new URL(fetchMock.mock.calls[1][0], 'http://localhost').searchParams),
    ).toEqual({ groupBy, country: 'India', department: 'Engineering' });
    expect(
      panel().getByRole('cell', { name: groupBy === 'country' ? 'India' : 'Engineering' }),
    ).toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: 'Apply insights' }));
    expect(panel().getByRole('status')).toHaveTextContent('Loading');
    expect(panel().queryByRole('table')).not.toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: 'Reset insights' }));
    await panel().findByRole('table');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/compensation-insights?groupBy=currency');
    expect(fetchMock.mock.calls[2][1].signal.aborted).toBe(true);
    expect(panel().getByRole('textbox', { name: 'Insights country' })).toHaveValue('');
    expect(panel().getByRole('combobox', { name: 'Insights grouping' })).toHaveValue('currency');
  },
);

it.each([
  'network',
  'http',
  'json',
  'shape',
  'grouping',
  'currency',
  'money',
  'group-value',
  'counts',
  'duplicate',
])('handles %s failure and Retry uses applied criteria despite draft edits', async (failure) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response());
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('private network'));
  else if (failure === 'http')
    fetchMock.mockResolvedValueOnce(new Response('private SQL', { status: 500 }));
  else if (failure === 'json') fetchMock.mockResolvedValueOnce(new Response('{'));
  else {
    const row = { ...group, groupValue: 'India' };
    let data: unknown = { groupBy: 'country', headcount: 2, groups: [row] };
    if (failure === 'shape') data = {};
    else if (failure === 'grouping') data = { groupBy: 'department', headcount: 2, groups: [row] };
    else if (failure === 'currency')
      data = { groupBy: 'country', headcount: 2, groups: [{ ...row, currency: 'JPY' }] };
    else if (failure === 'money')
      data = { groupBy: 'country', headcount: 2, groups: [{ ...row, total: 100 }] };
    else if (failure === 'group-value')
      data = { groupBy: 'country', headcount: 2, groups: [{ ...row, groupValue: null }] };
    else if (failure === 'counts') data = { groupBy: 'country', headcount: 3, groups: [row] };
    else if (failure === 'duplicate')
      data = { groupBy: 'country', headcount: 4, groups: [row, row] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  }
  fetchMock.mockResolvedValueOnce(response([{ ...group, groupValue: 'India' }], 'country'));
  vi.stubGlobal('fetch', fetchMock);
  render(<CompensationInsights />);
  const user = userEvent.setup();
  await panel().findByRole('table');
  await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'India');
  await user.selectOptions(panel().getByRole('combobox', { name: 'Insights grouping' }), 'country');
  await user.click(panel().getByRole('button', { name: 'Apply insights' }));
  expect(await panel().findByRole('alert')).toHaveTextContent(
    'Unable to load compensation insights. Please try again.',
  );
  expect(panel().queryByRole('table')).not.toBeInTheDocument();
  expect(panel().queryByText(/private/)).not.toBeInTheDocument();
  await user.clear(panel().getByRole('textbox', { name: 'Insights country' }));
  await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'unapplied');
  await user.selectOptions(
    panel().getByRole('combobox', { name: 'Insights grouping' }),
    'department',
  );
  await user.click(panel().getByRole('button', { name: 'Retry insights' }));
  await panel().findByRole('columnheader', { name: 'Country' });
  expect(
    Object.fromEntries(new URL(fetchMock.mock.calls[2][0], 'http://localhost').searchParams),
  ).toEqual({ groupBy: 'country', country: 'India' });
});

it.each(['success', 'failure'])('ignores obsolete StrictMode %s', async (outcome) => {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StrictMode>
      <CompensationInsights />
    </StrictMode>,
  );
  await panel().findByRole('table');
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    if (outcome === 'success') resolve(response([{ ...group, total: '999.00' }]));
    else reject(new Error('Obsolete failure'));
  });
  expect(panel().getByRole('cell', { name: group.total })).toBeInTheDocument();
  expect(panel().queryByRole('alert')).not.toBeInTheDocument();
});
it.each(['apply', 'reset', 'refresh'])(
  'ignores obsolete responses after %s and displays current results',
  async (action) => {
    let resolve!: (value: Response) => void;
    let reject!: (reason: Error) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((_done, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<CompensationInsights refreshVersion={0} />);
    const user = userEvent.setup();
    if (action === 'refresh') {
      view.rerender(<CompensationInsights refreshVersion={1} />);
      view.rerender(<CompensationInsights refreshVersion={2} />);
    } else {
      if (action === 'apply') {
        await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'India');
        await user.click(panel().getByRole('button', { name: 'Apply insights' }));
      } else await user.click(panel().getByRole('button', { name: 'Reset insights' }));
      await user.click(panel().getByRole('button', { name: 'Reset insights' }));
    }
    await panel().findByRole('table');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      resolve(response([{ ...group, total: '999.00' }]));
      reject(new Error('Obsolete failure'));
    });
    expect(panel().getByRole('cell', { name: group.total })).toBeInTheDocument();
    expect(panel().queryByRole('alert')).not.toBeInTheDocument();
  },
);
