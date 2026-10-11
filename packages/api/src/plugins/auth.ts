/**
 * JWT Authentication plugin for Fastify
 * Registers JWT authentication and authorization
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { config } from '../config';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Register cookie parser
  await fastify.register(fastifyCookie, {
    secret: config.jwtSecret,
    parseOptions: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
    },
  });

  // Register JWT
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtAccessExpiry,
    },
    cookie: {
      cookieName: 'accessToken',
      signed: false,
    },
  });

  // Decorate request with user
  fastify.decorateRequest('user', null);

  // Authentication hook
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for public routes
    const publicPaths = ['/health', '/health/db', '/auth/login', '/auth/refresh', '/documentation', '/docs'];
    if (publicPaths.some(p => request.url.startsWith(p))) {
      return;
    }

    try {
      await request.jwtVerify();
      request.user = request.user;
    } catch (err) {
      // Don't throw here, let individual routes handle auth
    }
  });

  // Decorate fastify with auth helpers
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      request.user = request.user;
    } catch (err) {
      reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 } });
    }
  });

  fastify.decorate('authorize', (permissions: string | string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;

      const user = request.user as any;
      if (!user) {
        reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found', statusCode: 401 } });
        return;
      }

      const userPermissions = user.role?.permissions?.map((p: any) => p.code) || [];
      const required = Array.isArray(permissions) ? permissions : [permissions];
      
      const hasPermission = required.some(p => userPermissions.includes(p));
      if (!hasPermission) {
        reply.code(403).send({ 
          success: false, 
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions', statusCode: 403 } 
        });
      }
    };
  });

  fastify.log.info('Auth plugin registered');
};

export default authPlugin;