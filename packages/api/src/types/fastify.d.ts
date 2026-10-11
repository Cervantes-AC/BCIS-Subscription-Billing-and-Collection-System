/**
 * Fastify Type Declarations
 * Extends Fastify with custom properties and methods
 */

import 'fastify';
import { User, Permission } from '@bcis/shared';
import type { Database } from '@bcis/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    transaction: <T>(callback: (tx: Database) => Promise<T>) => Promise<T>;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requestUser: User & { role?: { id: string; name: string; permissions: Permission[] } };
    requestIp: string;
    requestHeaders: Record<string, string | undefined>;
  }

  interface FastifyRequest {
    user?: User & { role?: { id: string; name: string; permissions: Permission[] } };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; username: string; roleId: string; type: 'access' | 'refresh' };
    user: User & { role?: { id: string; name: string; permissions: Permission[] } };
  }
}