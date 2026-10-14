import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('GET /health', () => {
  it('returns a successful JSON response when the API is running', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
