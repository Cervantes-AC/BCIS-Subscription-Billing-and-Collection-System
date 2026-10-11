/**
 * Suspension/Reconnection Service - Service control workflows
 */

import { 
  suspensionRecords, 
  reconnectionRecords, 
  serviceAccounts, 
  serviceEvents,
  users,
  payments,
  auditLogs,
} from '@bcis/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export interface SuspensionRequest {
  serviceAccountId: string;
  reason: 'non_payment' | 'request' | 'violation' | 'technical' | 'other';
  customReason?: string;
  effectiveDate: Date;
  notes?: string;
}

export interface ReconnectionRequest {
  suspensionId: string;
  fee: number; // in centavos
  paymentId?: string;
  technicianId?: string;
  scheduledDate?: Date;
  notes?: string;
}

/**
 * Suspend a service account
 */
export async function suspendServiceAccount(
  fastify: FastifyInstance,
  data: SuspensionRequest
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // Verify service account exists and is active
  const sa = await db.query.serviceAccounts.findFirst({
    where: eq(serviceAccounts.id, data.serviceAccountId),
    with: { subscriber: true },
  });

  if (!sa) throw new Error('Service account not found');
  if (sa.status !== 'active') {
    throw new Error(`Cannot suspend service account with status: ${sa.status}`);
  }

  // Create suspension record
  const [suspension] = await db.transaction(async (tx) => {
    const [newSuspension] = await tx.insert(suspensionRecords).values({
      serviceAccountId: data.serviceAccountId,
      reason: data.reason,
      customReason: data.customReason,
      effectiveDate: data.effectiveDate,
      approvedBy: actorId,
      notes: data.notes,
    }).returning();

    // Update service account status
    await tx.update(serviceAccounts)
      .set({
        status: 'suspended',
        suspensionReason: data.customReason || data.reason,
        suspendedAt: new Date(),
        suspendedBy: actorId,
      })
      .where(eq(serviceAccounts.id, data.serviceAccountId));

    // Create service event
    await tx.insert(serviceEvents).values({
      serviceAccountId: data.serviceAccountId,
      type: 'suspension',
      description: `Service suspended: ${data.reason}${data.customReason ? ` - ${data.customReason}` : ''}`,
      previousValue: 'active',
      newValue: 'suspended',
      performedBy: actorId,
      metadata: { suspensionId: newSuspension.id, reason: data.reason },
    });

    // Audit log
    await tx.insert(auditLogs).values({
      actorId,
      action: 'service_account.suspend',
      entityType: 'service_account',
      entityId: data.serviceAccountId,
      newValues: { status: 'suspended', suspensionId: newSuspension.id, reason: data.reason },
      reason: data.notes || `Service suspended for ${data.reason}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return [newSuspension];
  });

  return suspension;
}

/**
 * Reconnect a suspended service account
 */
export async function reconnectServiceAccount(
  fastify: FastifyInstance,
  data: ReconnectionRequest
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // Verify suspension exists
  const suspension = await db.query.suspensionRecords.findFirst({
    where: eq(suspensionRecords.id, data.suspensionId),
    with: { serviceAccount: true },
  });

  if (!suspension) throw new Error('Suspension record not found');
  if (suspension.liftedAt) throw new Error('Suspension already lifted');

  // Verify payment if provided
  if (data.paymentId) {
    const payment = await db.query.payments.findFirst({
      where: and(
        eq(payments.id, data.paymentId),
        eq(payments.status, 'posted')
      ),
    });
    if (!payment) throw new Error('Payment not found or not posted');
  }

  const [reconnection] = await db.transaction(async (tx) => {
    // Create reconnection record
    const [newReconnection] = await tx.insert(reconnectionRecords).values({
      suspensionId: data.suspensionId,
      serviceAccountId: suspension.serviceAccountId,
      requestDate: new Date(),
      requestedBy: actorId,
      fee: data.fee,
      paymentId: data.paymentId,
      technicianId: data.technicianId,
      scheduledDate: data.scheduledDate,
      status: data.scheduledDate ? 'scheduled' : 'pending',
      notes: data.notes,
    }).returning();

    // If no scheduled date or scheduled date is now/past, mark as completed
    if (!data.scheduledDate || data.scheduledDate <= new Date()) {
      await tx.update(reconnectionRecords)
        .set({ status: 'completed', completedDate: new Date() })
        .where(eq(reconnectionRecords.id, newReconnection.id));
    }

    // Update suspension record
    await tx.update(suspensionRecords)
      .set({
        liftedAt: new Date(),
        liftedBy: actorId,
        liftReason: 'Reconnection processed',
      })
      .where(eq(suspensionRecords.id, data.suspensionId));

    // Update service account status back to active
    await tx.update(serviceAccounts)
      .set({
        status: 'active',
        suspensionReason: null,
        suspendedAt: null,
        suspendedBy: null,
      })
      .where(eq(serviceAccounts.id, suspension.serviceAccountId));

    // Create service event
    await tx.insert(serviceEvents).values({
      serviceAccountId: suspension.serviceAccountId,
      type: 'reconnection',
      description: `Service reconnected${data.paymentId ? ' after payment' : ''}`,
      previousValue: 'suspended',
      newValue: 'active',
      performedBy: actorId,
      metadata: { 
        reconnectionId: newReconnection.id, 
        fee: data.fee,
        paymentId: data.paymentId,
      },
    });

    // Audit log
    await tx.insert(auditLogs).values({
      actorId,
      action: 'service_account.reconnect',
      entityType: 'service_account',
      entityId: suspension.serviceAccountId,
      newValues: { status: 'active', reconnectionId: newReconnection.id, fee: data.fee },
      reason: data.notes || 'Service reconnected',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return [newReconnection];
  });

  return reconnection;
}

/**
 * Get suspension history for a service account
 */
export async function getSuspensionHistory(
  fastify: FastifyInstance,
  serviceAccountId: string
) {
  const db = fastify.db;
  
  return db.query.suspensionRecords.findMany({
    where: eq(suspensionRecords.serviceAccountId, serviceAccountId),
    with: {
      reconnectionRecords: true,
      approver: true,
      lifter: true,
    },
    orderBy: desc(suspensionRecords.createdAt),
  });
}

/**
 * Lift a suspension (mark as lifted without reconnection workflow)
 */
export async function liftSuspension(
  fastify: FastifyInstance,
  suspensionId: string,
  reason: string
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const suspension = await db.query.suspensionRecords.findFirst({
    where: eq(suspensionRecords.id, suspensionId),
    with: { serviceAccount: true },
  });

  if (!suspension) throw new Error('Suspension record not found');
  if (suspension.liftedAt) throw new Error('Suspension already lifted');

  await db.transaction(async (tx) => {
    // Update suspension record
    await tx.update(suspensionRecords)
      .set({
        liftedAt: new Date(),
        liftedBy: actorId,
        liftReason: reason,
      })
      .where(eq(suspensionRecords.id, suspensionId));

    // Update service account
    await tx.update(serviceAccounts)
      .set({
        status: 'active',
        suspensionReason: null,
        suspendedAt: null,
        suspendedBy: null,
      })
      .where(eq(serviceAccounts.id, suspension.serviceAccountId));

    // Create service event
    await tx.insert(serviceEvents).values({
      serviceAccountId: suspension.serviceAccountId,
      type: 'reconnection',
      description: `Suspension lifted: ${reason}`,
      previousValue: 'suspended',
      newValue: 'active',
      performedBy: actorId,
    });

    // Audit log
    await tx.insert(auditLogs).values({
      actorId,
      action: 'suspension.lift',
      entityType: 'suspension_record',
      entityId: suspensionId,
      newValues: { liftedAt: new Date(), liftReason: reason },
      reason,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });
}

/**
 * Get pending reconnections for a technician
 */
export async function getPendingReconnections(
  fastify: FastifyInstance,
  technicianId: string
) {
  const db = fastify.db;
  
  return db.query.reconnectionRecords.findMany({
    where: and(
      eq(reconnectionRecords.technicianId, technicianId),
      eq(reconnectionRecords.status, 'pending')
    ),
    with: {
      suspension: {
        with: { serviceAccount: { with: { subscriber: true, plan: true } } },
      },
    },
    orderBy: asc(reconnectionRecords.scheduledDate),
  });
}

/**
 * Update reconnection status
 */
export async function updateReconnectionStatus(
  fastify: FastifyInstance,
  reconnectionId: string,
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled',
  data?: { scheduledDate?: Date; completedDate?: Date; notes?: string; technicianId?: string }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const reconnection = await db.query.reconnectionRecords.findFirst({
    where: eq(reconnectionRecords.id, reconnectionId),
    with: { serviceAccount: true },
  });

  if (!reconnection) throw new Error('Reconnection record not found');

  await db.transaction(async (tx) => {
    const updates: any = { status, updatedAt: new Date() };
    
    if (data?.scheduledDate) updates.scheduledDate = data.scheduledDate;
    if (data?.completedDate) updates.completedDate = data.completedDate;
    if (data?.notes) updates.notes = data.notes;
    if (data?.technicianId) updates.technicianId = data.technicianId;

    await tx.update(reconnectionRecords)
      .set(updates)
      .where(eq(reconnectionRecords.id, reconnectionId));

    // If completed, update suspension and service account
    if (status === 'completed') {
      await tx.update(suspensionRecords)
        .set({ liftedAt: new Date(), liftedBy: actorId, liftReason: data?.notes || 'Reconnection completed' })
        .where(eq(suspensionRecords.id, reconnection.suspensionId));

      await tx.update(serviceAccounts)
        .set({ status: 'active', suspensionReason: null, suspendedAt: null, suspendedBy: null })
        .where(eq(serviceAccounts.id, reconnection.serviceAccountId));

      await tx.insert(serviceEvents).values({
        serviceAccountId: reconnection.serviceAccountId,
        type: 'reconnection',
        description: `Reconnection completed${data?.notes ? `: ${data.notes}` : ''}`,
        previousValue: 'suspended',
        newValue: 'active',
        performedBy: actorId,
      });
    }

    // Audit log
    await tx.insert(auditLogs).values({
      actorId,
      action: 'reconnection.update',
      entityType: 'reconnection_record',
      entityId: reconnectionId,
      newValues: updates,
      reason: data?.notes || `Reconnection status changed to ${status}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });
}