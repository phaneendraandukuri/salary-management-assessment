import express from 'express';
import { posix } from 'node:path';
import type { ErrorRequestHandler } from 'express';
import type { CreateEmployeeResult } from './create-employee.js';
import type { EmployeePage } from './list-employees.js';
import type { Pagination } from './pagination.js';
import { parsePagination } from './pagination.js';
import type { DirectoryCriteria } from './directory-query.js';
import { parseDirectoryQuery } from './directory-query.js';
import type { UpdateSalaryResult } from './update-salary.js';
import type { SalaryHistoryResult } from './list-salary-history.js';

export type EmployeeOperations = {
  createEmployee: (input: unknown) => Promise<CreateEmployeeResult>;
  listEmployees: (query: Pagination & DirectoryCriteria) => Promise<EmployeePage>;
  updateSalary: (employeeId: string, amount: unknown) => Promise<UpdateSalaryResult>;
  listSalaryHistory: (employeeId: string, pagination: Pagination) => Promise<SalaryHistoryResult>;
};

export function createApp(operations?: EmployeeOperations, frontendDirectory?: string) {
  const app = express();
  app.set('query parser', 'extended');
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  if (operations) {
    app.use(express.json({ limit: '1mb' }));
    app.get('/api/employees', async (request, response) => {
      const pagination = parsePagination(request.query.page, request.query.pageSize);
      if (!pagination.ok) {
        response.status(400).json({ error: pagination.error });
        return;
      }
      const directory = parseDirectoryQuery(request.query);
      if (!directory.ok) {
        response.status(400).json({ error: directory.error });
        return;
      }
      response.json(
        await operations.listEmployees({ ...pagination.pagination, ...directory.criteria }),
      );
    });
    app.post('/api/employees', async (request, response) => {
      const result = await operations.createEmployee(request.body);
      if (result.ok) {
        response.status(201).json({ employee: result.employee });
      } else {
        let status = 400;
        if (result.error.code === 'duplicate_employee_id') status = 409;
        else if (result.error.code === 'persistence_failed') status = 500;
        response.status(status).json({ error: result.error });
      }
    });
    app.patch('/api/employees/:employeeId/salary', async (request, response) => {
      const body: unknown = request.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('salaryAmount' in body) ||
        typeof body.salaryAmount !== 'string'
      ) {
        response.status(400).json({ error: { field: 'salaryAmount', code: 'invalid_amount' } });
        return;
      }
      const result = await operations.updateSalary(request.params.employeeId, body.salaryAmount);
      if (result.ok) response.json({ employee: result.employee });
      else {
        let status = 400;
        if (result.error.code === 'salary_unchanged') status = 409;
        else if (result.error.code === 'employee_not_found') status = 404;
        else if (result.error.code === 'persistence_failed') status = 500;
        response.status(status).json({ error: result.error });
      }
    });
    app.get('/api/employees/:employeeId/salary-history', async (request, response) => {
      const pagination = parsePagination(request.query.page, request.query.pageSize);
      if (!pagination.ok) {
        response.status(400).json({ error: pagination.error });
        return;
      }
      const result = await operations.listSalaryHistory(
        request.params.employeeId,
        pagination.pagination,
      );
      if (result.ok) response.json(result.historyPage);
      else response.status(404).json({ error: result.error });
    });
  }

  if (frontendDirectory) {
    app.use((request, response, next) => {
      let path: string;
      try {
        path = posix.normalize(decodeURIComponent(request.path));
      } catch {
        next();
        return;
      }
      if (/^\/api(?:\/|$)/i.test(path)) response.sendStatus(404);
      else next();
    });
    app.use(express.static(frontendDirectory, { dotfiles: 'ignore', redirect: false }));
  }

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'body_too_large' } });
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'invalid_json' } });
    } else {
      response.status(500).json({ error: { code: 'persistence_failed' } });
    }
  };
  app.use(errorHandler);
  return app;
}

export const app = createApp();
