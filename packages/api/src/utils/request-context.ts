import type { FastifyInstance, FastifyRequest } from 'fastify';

/** Build an immutable, per-request context for services without storing user data on the shared server. */
export function requestContext(fastify: FastifyInstance, request: FastifyRequest): FastifyInstance {
  return {
    db: fastify.db,
    transaction: fastify.transaction,
    requestUser: request.user,
    requestIp: request.ip,
    requestHeaders: request.headers,
  } as unknown as FastifyInstance;
}
