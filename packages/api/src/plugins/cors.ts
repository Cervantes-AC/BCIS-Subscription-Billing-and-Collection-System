/**
 * CORS plugin for Fastify
 */

import { FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from '../config';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: config.corsOrigin,
    credentials: config.corsCredentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  fastify.log.info('CORS plugin registered');
};

export default corsPlugin;