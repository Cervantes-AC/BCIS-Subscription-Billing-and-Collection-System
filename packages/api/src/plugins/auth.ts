/**
 * JWT Authentication plugin for Fastify
 * Registers JWT authentication and authorization
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import { and, eq, gt } from 'drizzle-orm';
import { sessions } from '@bcis/db/schema';
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

  // Decorate fastify with auth helpers
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies?.accessToken || request.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 } });
      return;
    }

    const session = await fastify.db.query.sessions.findFirst({
      where: and(eq(sessions.accessToken, token), gt(sessions.accessTokenExpiresAt, new Date())),
      with: {
        user: {
          with: { role: { with: { rolePermissions: { with: { permission: true } } } } },
        },
      },
    });
    if (!session || session.user.status !== 'active') {
      reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired or user is inactive', statusCode: 401 } });
      return;
    }
    request.user = {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      fullName: session.user.fullName,
      roleId: session.user.roleId,
      role: {
        id: session.user.role.id,
        name: session.user.role.name,
        permissions: session.user.role.rolePermissions.map((rp: any) => rp.permission),
      },
    } as any;
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

export default fp(authPlugin);
