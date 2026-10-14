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
