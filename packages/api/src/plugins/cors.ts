/**
 * CORS plugin for Fastify
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import { config } from '../config';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const allowedOrigins = new Set(config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean));
  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      // Native Electron file:// requests use the serialized "null" origin.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);

      // Vite moves to the next available port when its default port is busy.
      // Allow only local HTTP origins on those dynamic ports during development.
      if (config.nodeEnv !== 'production') {
        try {
          const parsedOrigin = new URL(origin);
          const isLocalDevOrigin =
            parsedOrigin.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
          if (isLocalDevOrigin) return callback(null, true);
        } catch {
          // Continue to the rejection below for malformed origins.
        }
      }

      return callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: config.corsCredentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  fastify.log.info('CORS plugin registered');
};

// CORS hooks must apply to routes registered by the API after this plugin.
// Fastify plugins are otherwise encapsulated in their own scope.
export default fp(corsPlugin);
