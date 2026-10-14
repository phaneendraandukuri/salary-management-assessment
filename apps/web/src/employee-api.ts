export type Employee = {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  country: string;
  currency: string;
  salaryAmount: string;
};

export type EmployeePage = {
  employees: Employee[];
  page: number;
  pageSize: number;
  total: number;
};

export async function getEmployeePage(page: number, signal: AbortSignal): Promise<EmployeePage> {
  const response = await fetch(`/api/employees?page=${page}&pageSize=25`, { signal });
  if (!response.ok) throw new Error('Unable to load employees');
  return response.json() as Promise<EmployeePage>;
}

export type EmployeeCreationResult =
  { ok: true; employeeId: string } | { ok: false; error: { code: string; field?: string } };

export async function postEmployee(employee: Employee): Promise<EmployeeCreationResult> {
  try {
    const response = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee),
    });
    if (response.status === 201) {
      const data = (await response.json()) as { employee?: { employeeId?: unknown } };
      if (typeof data?.employee?.employeeId !== 'string') {
        return { ok: false, error: { code: 'creation_uncertain' } };
      }
      return { ok: true, employeeId: data.employee.employeeId };
    }
    if (response.status === 400 || response.status === 409) {
      const data = (await response.json().catch(() => undefined)) as
        { error?: { code?: unknown; field?: unknown } } | undefined;
      if (typeof data?.error?.code === 'string') {
        return {
          ok: false,
          error: {
            code: data.error.code,
            field: typeof data.error.field === 'string' ? data.error.field : undefined,
          },
        };
      }
    }
    return { ok: false, error: { code: 'request_failed' } };
  } catch {
    return { ok: false, error: { code: 'creation_uncertain' } };
  }
}

export type SalaryUpdateResult =
  { ok: true; salaryAmount: string } | { ok: false; error: { code: string; field?: string } };

export async function patchSalary(
  employeeId: string,
  salaryAmount: string,
): Promise<SalaryUpdateResult> {
  try {
    const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/salary`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salaryAmount }),
    });
    if (response.status === 200) {
      const data = (await response.json()) as {
        employee?: { employeeId?: unknown; salaryAmount?: unknown };
      };
      if (
        data?.employee?.employeeId !== employeeId ||
        typeof data.employee.salaryAmount !== 'string' ||
        data.employee.salaryAmount === ''
      ) {
        return { ok: false, error: { code: 'update_uncertain' } };
      }
      return { ok: true, salaryAmount: data.employee.salaryAmount };
    }
    if ([400, 404, 409, 500].includes(response.status)) {
      const data = (await response.json().catch(() => undefined)) as
        { error?: { code?: unknown; field?: unknown } } | undefined;
      if (typeof data?.error?.code === 'string') {
        return {
          ok: false,
          error: {
            code: data.error.code,
            field: typeof data.error.field === 'string' ? data.error.field : undefined,
          },
        };
      }
    }
    return { ok: false, error: { code: 'request_failed' } };
  } catch {
    return { ok: false, error: { code: 'update_uncertain' } };
  }
}

export type SalaryHistoryEntry = {
  historyId: string;
  employeeId: string;
  currency: string;
  oldAmount: string;
  newAmount: string;
  changedAt: string;
};
export type SalaryHistoryPage = {
  history: SalaryHistoryEntry[];
  page: number;
  pageSize: number;
  total: number;
};
export type SalaryHistoryResult =
  | { ok: true; data: SalaryHistoryPage }
  | { ok: false; error: 'employee_not_found' | 'history_failed' };

export async function getSalaryHistory(
  employeeId: string,
  page: number,
  signal: AbortSignal,
): Promise<SalaryHistoryResult> {
  try {
    const response = await fetch(
      `/api/employees/${encodeURIComponent(employeeId)}/salary-history?page=${page}&pageSize=25`,
      { signal },
    );
    if (response.status === 404) return { ok: false, error: 'employee_not_found' };
    if (!response.ok) return { ok: false, error: 'history_failed' };
    const data = (await response.json()) as SalaryHistoryPage;
    if (
      !data ||
      data.page !== page ||
      data.pageSize !== 25 ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !Array.isArray(data.history) ||
      !data.history.every(
        (entry) =>
          entry !== null &&
          typeof entry === 'object' &&
          entry.employeeId === employeeId &&
          typeof entry.historyId === 'string' &&
          typeof entry.oldAmount === 'string' &&
          typeof entry.newAmount === 'string' &&
          typeof entry.currency === 'string' &&
          typeof entry.changedAt === 'string',
      )
    ) {
      return { ok: false, error: 'history_failed' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'history_failed' };
  }
}
