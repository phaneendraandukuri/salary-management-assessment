import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { CreateEmployeeResult } from './create-employee.js';
import type { EmployeePage } from './list-employees.js';
import type { Pagination } from './pagination.js';
import { parsePagination } from './pagination.js';

export type EmployeeOperations = {
  createEmployee: (input: unknown) => Promise<CreateEmployeeResult>;
  listEmployees: (pagination: Pagination) => Promise<EmployeePage>;
};

export function createApp(operations?: EmployeeOperations) {
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
      response.json(await operations.listEmployees(pagination.pagination));
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
