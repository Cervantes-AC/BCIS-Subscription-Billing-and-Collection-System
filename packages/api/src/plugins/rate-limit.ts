/**
 * Rate limiting plugin for Fastify
 */

import { FastifyPluginAsync } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from '../config';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        statusCode: 429,
      },
    }),
    keyGenerator: (request) => request.ip,
    skipOnError: true,
  });

  fastify.log.info('Rate limit plugin registered');
};

export default rateLimitPlugin;