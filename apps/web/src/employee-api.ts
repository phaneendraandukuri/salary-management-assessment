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
