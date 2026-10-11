/**
 * Global error handler for Fastify
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from '../config';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error
  request.log.error({ err: error, url: request.url, method: request.method }, 'Request error');

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        statusCode: 400,
      },
    });
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
        statusCode: 400,
      },
    });
  }

  // JWT errors
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' || error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token expired or invalid',
        statusCode: 401,
      },
    });
  }

  // Database errors
  if (error.code === '23505') { // Unique violation
    return reply.code(409).send({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this value already exists',
        statusCode: 409,
      },
    });
  }

  if (error.code === '23503') { // Foreign key violation
    return reply.code(400).send({
      success: false,
      error: {
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced record does not exist',
        statusCode: 400,
      },
    });
  }

  // Rate limit
  if (error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
        statusCode: 429,
      },
    });
  }

  // Default error
  const statusCode = error.statusCode || 500;
  const message = config.nodeEnv === 'production' && statusCode === 500
    ? 'Internal server error'
    : error.message;

  return reply.code(statusCode).send({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message,
      statusCode,
      ...(config.nodeEnv !== 'production' && { stack: error.stack }),
    },
  });
}

// 404 handler
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.code(404).send({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    },
  });
}