/**
 * BCIS API Server - Main Entry Point
 * Fastify server with all plugins and routes
 */

// Load environment variables FIRST, before any other imports
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import { z } from 'zod';
import { config } from './config';
import databasePlugin from './plugins/database';
import corsPlugin from './plugins/cors';
import authPlugin from './plugins/auth';
import rateLimitPlugin from './plugins/rate-limit';
import swaggerPlugin from './plugins/swagger';
import multipartPlugin from './plugins/multipart';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { registerRoutes } from './routes';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.prettyLogs ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // The routes use Zod schemas directly; adapt them for Fastify's validator and serializer.
  fastify.setValidatorCompiler(({ schema }) => (data) => {
    const parsed = (schema as z.ZodType).safeParse(data);
    return parsed.success ? { value: parsed.data } : { error: parsed.error };
  });
  fastify.setSerializerCompiler(({ schema }) => (data) => JSON.stringify((schema as z.ZodType).parse(data)));

  // Register plugins
  await fastify.register(corsPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(databasePlugin);
  await fastify.register(authPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(swaggerPlugin);

  // Error handling
  fastify.setErrorHandler(errorHandler);
  fastify.setNotFoundHandler(notFoundHandler);

  // Register routes
  await registerRoutes(fastify);

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv,
  }));

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();
    
    await fastify.listen({ port: config.port, host: config.host });
    
    fastify.log.info(`🚀 BCIS API Server running on http://${config.host}:${config.port}`);
    fastify.log.info(`📚 API Documentation: http://${config.host}:${config.port}/documentation`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

start();
