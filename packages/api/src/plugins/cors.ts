/**
 * CORS plugin for Fastify
 */

import { FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from '../config';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const allowedOrigins = new Set(config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean));
  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      // Native Electron file:// requests use the serialized "null" origin.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: config.corsCredentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  fastify.log.info('CORS plugin registered');
};

export default corsPlugin;
