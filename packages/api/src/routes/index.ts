/**
 * Route registration for BCIS API
 */

import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { subscriberRoutes } from './subscribers';
import { planRoutes } from './plans';
import { serviceAccountRoutes } from './service-accounts';
import { billingRoutes } from './billing';
import { paymentRoutes } from './payments';
import { collectionRoutes } from './collections';
import { receivablesRoutes } from './receivables';
import { reportRoutes } from './reports';
import { adminRoutes } from './admin';

export async function registerRoutes(fastify: FastifyInstance) {
  // API version prefix
  const api = fastify.withTypeProvider().prefix('/api/v1');

  // Public routes
  await api.register(authRoutes);

  // Protected routes (require authentication)
  await api.register(async (protectedApi) => {
    protectedApi.addHook('preHandler', fastify.authenticate);
    
    await protectedApi.register(userRoutes);
    await protectedApi.register(subscriberRoutes);
    await protectedApi.register(planRoutes);
    await protectedApi.register(serviceAccountRoutes);
    await protectedApi.register(billingRoutes);
    await protectedApi.register(paymentRoutes);
    await protectedApi.register(collectionRoutes);
    await protectedApi.register(receivablesRoutes);
    await protectedApi.register(reportRoutes);
    await protectedApi.register(adminRoutes);
  });
}