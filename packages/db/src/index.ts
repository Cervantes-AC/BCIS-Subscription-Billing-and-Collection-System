/**
 * BCIS Database Package - Main Entry Point
 * Database connection, client, and schema exports
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

// Load environment variables from .env file
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(__dirname, '../../../.env') });

// Global database connection (singleton pattern for serverless)
let globalDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let globalClient: ReturnType<typeof postgres> | null = null;

/**
 * Get or create database connection
 */
export function getDb() {
  if (!globalDb) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bcis_billing';
    
    globalClient = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // Disable prepared statements for better compatibility
      onnotice: () => {}, // Suppress notices
    });

    globalDb = drizzle(globalClient, { schema, logger: process.env.NODE_ENV === 'development' });
  }
  
  return globalDb;
}

/**
 * Get database client for raw queries
 */
export function getClient() {
  if (!globalClient) {
    getDb(); // This will initialize both
  }
  return globalClient!;
}

/**
 * Close database connections
 */
export async function closeDb() {
  if (globalClient) {
    await globalClient.end();
    globalClient = null;
    globalDb = null;
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

type Database = ReturnType<typeof drizzle<typeof schema>>;
type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Execute in transaction
 */
export async function transaction<T>(
  callback: (tx: DatabaseTransaction) => Promise<T>
): Promise<T> {
  return getDb().transaction(callback);
}

// Re-export schema
export { schema };

// Re-export types
export type {
  User, NewUser,
  Role, NewRole,
  Permission, NewPermission,
  RolePermission,
  UserRole,
  Session, NewSession,
  Subscriber, NewSubscriber,
  SubscriberAddress, NewSubscriberAddress,
  SubscriberContact, NewSubscriberContact,
  ServicePlan, NewServicePlan,
  ServiceAccount, NewServiceAccount,
  ServiceEvent, NewServiceEvent,
  BillingCycle, NewBillingCycle,
  Invoice, NewInvoice,
  InvoiceItem, NewInvoiceItem,
  Adjustment, NewAdjustment,
  Payment, NewPayment,
  PaymentAllocation, NewPaymentAllocation,
  PaymentProof, NewPaymentProof,
  PaymentReversal, NewPaymentReversal,
  GCashVerificationQueue, NewGCashVerificationQueue,
  CollectionArea, NewCollectionArea,
  CollectorAssignment, NewCollectorAssignment,
  CollectionBatch, NewCollectionBatch,
  CollectionBatchAccount, NewCollectionBatchAccount,
  CollectorRemittance, NewCollectorRemittance,
  SuspensionRecord, NewSuspensionRecord,
  ReconnectionRecord, NewReconnectionRecord,
  Receipt, NewReceipt,
  AuditLog, NewAuditLog,
  ApplicationSetting, NewApplicationSetting,
  BackupHistory, NewBackupHistory,
} from './schema';