/**
 * Database plugin for Fastify
 * Registers database connection and makes it available via fastify.db
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { getDb, closeDb, healthCheck, transaction } from '@bcis/db';

export let db: ReturnType<typeof getDb>;

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  // Initialize database connection
  const database = getDb();
  db = database;
  
  // Decorate fastify with database instance
  fastify.decorate('db', database);
  
  // Add transaction helper
  fastify.decorate('transaction', transaction);
  
  // Health check endpoint
  fastify.get('/health/db', async () => {
    const healthy = await healthCheck();
    return { healthy, timestamp: new Date().toISOString() };
  });

  // Close connection on server close
  fastify.addHook('onClose', async () => {
    await closeDb();
  });

  fastify.log.info('Database plugin registered');
};

export default fp(databasePlugin);
