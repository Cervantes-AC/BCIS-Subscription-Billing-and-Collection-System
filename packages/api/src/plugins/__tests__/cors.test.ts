import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import corsPlugin from '../cors';

describe('CORS development origins', () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('allows a local Vite origin on a fallback port', async () => {
    app = Fastify();
    await app.register(corsPlugin);
    app.get('/health', async () => ({ status: 'ok' }));

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5174' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });
});
