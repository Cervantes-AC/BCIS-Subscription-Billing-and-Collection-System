/**
 * BCIS Database Seed Script
 * Seeds the database with initial data for development and testing
 */

import { getDb, closeDb, transaction } from '../index';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function seedDatabase() {
  const db = getDb();
  
  console.log('Starting database seed...');

  try {
    await transaction(async (tx) => {
      // ============================================
      // 1. Seed Permissions
      // ============================================
      console.log('Seeding permissions...');
      const permissions = [
        // Subscriber permissions
        { code: 'subscriber.view', name: 'View Subscribers', description: 'View subscriber list and details', module: 'subscribers' },
        { code: 'subscriber.create', name: 'Create Subscriber', description: 'Create new subscribers', module: 'subscribers' },
        { code: 'subscriber.update', name: 'Update Subscriber', description: 'Update subscriber information', module: 'subscribers' },
        { code: 'subscriber.delete', name: 'Delete Subscriber', description: 'Archive/delete subscribers', module: 'subscribers' },
        
        // Plan permissions
        { code: 'plan.view', name: 'View Plans', description: 'View service plans', module: 'plans' },
        { code: 'plan.create', name: 'Create Plan', description: 'Create new service plans', module: 'plans' },
        { code: 'plan.update', name: 'Update Plan', description: 'Update service plans', module: 'plans' },
        { code: 'plan.delete', name: 'Delete Plan', description: 'Archive service plans', module: 'plans' },
        
        // Billing permissions
        { code: 'billing.view', name: 'View Billing', description: 'View billing cycles and invoices', module: 'billing' },
        { code: 'billing.generate', name: 'Generate Billing', description: 'Generate monthly billing', module: 'billing' },
        { code: 'billing.finalize', name: 'Finalize Billing', description: 'Finalize billing cycles', module: 'billing' },
        { code: 'billing.void', name: 'Void Invoice', description: 'Void invoices', module: 'billing' },
        { code: 'billing.adjust', name: 'Adjust Invoice', description: 'Apply adjustments to invoices', module: 'billing' },
        
        // Payment permissions
        { code: 'payment.view', name: 'View Payments', description: 'View payment history', module: 'payments' },
        { code: 'payment.create', name: 'Receive Payment', description: 'Post new payments', module: 'payments' },
        { code: 'payment.reverse', name: 'Reverse Payment', description: 'Reverse posted payments', module: 'payments' },
        { code: 'payment.gcash_verify', name: 'Verify GCash', description: 'Verify GCash payments', module: 'payments' },
        
        // Collection permissions
        { code: 'collection.view', name: 'View Collections', description: 'View collection batches and areas', module: 'collections' },
        { code: 'collection.create', name: 'Create Collection Batch', description: 'Create collection batches', module: 'collections' },
        { code: 'collection.record', name: 'Record Collection', description: 'Record collections in batch', module: 'collections' },
        { code: 'collection.remit', name: 'Remit Collection', description: 'Submit collector remittances', module: 'collections' },
        { code: 'collection.reconcile', name: 'Reconcile Collection', description: 'Reconcile collection batches', module: 'collections' },
        
        // Receivables permissions
        { code: 'receivables.view', name: 'View Receivables', description: 'View AR aging and overdue accounts', module: 'receivables' },
        { code: 'receivables.suspend', name: 'Suspend Service', description: 'Suspend service accounts', module: 'receivables' },
        { code: 'receivables.reconnect', name: 'Reconnect Service', description: 'Process reconnections', module: 'receivables' },
        
        // Reports permissions
        { code: 'report.view', name: 'View Reports', description: 'View management reports', module: 'reports' },
        { code: 'report.export', name: 'Export Reports', description: 'Export reports to PDF/XLSX', module: 'reports' },
        
        // Administration permissions
        { code: 'admin.user.manage', name: 'Manage Users', description: 'Create, update, delete users', module: 'administration' },
        { code: 'admin.role.manage', name: 'Manage Roles', description: 'Create, update, delete roles', module: 'administration' },
        { code: 'admin.settings', name: 'Manage Settings', description: 'Manage application settings', module: 'administration' },
        { code: 'admin.backup', name: 'Backup/Restore', description: 'Create and restore backups', module: 'administration' },
        { code: 'admin.audit', name: 'View Audit Logs', description: 'View audit trail', module: 'administration' },
      ] as const;

      for (const perm of permissions) {
        await tx.insert(schema.permissions).values(perm).onConflictDoNothing({ target: schema.permissions.code });
      }

      // ============================================
      // 2. Seed Roles
      // ============================================
      console.log('Seeding roles...');
      const roles = [
        { name: 'super_admin', description: 'Super Administrator - Full system access', isSystem: true },
        { name: 'admin', description: 'Administrator - Operational management', isSystem: true },
        { name: 'cashier', description: 'Cashier - Payment processing', isSystem: true },
        { name: 'collection_supervisor', description: 'Collection Supervisor - Field collection management', isSystem: true },
        { name: 'accounting', description: 'Accounting/Auditor - Financial reporting', isSystem: true },
        { name: 'technician', description: 'Technician - Service operations', isSystem: true },
        { name: 'viewer', description: 'Read-only Viewer - Reports only', isSystem: true },
      ];

      const roleMap = new Map<string, string>();
      for (const role of roles) {
        const result = await tx.insert(schema.roles).values(role).onConflictDoNothing({ target: schema.roles.name }).returning({ id: schema.roles.id, name: schema.roles.name });
        if (result.length > 0) {
          roleMap.set(role.name, result[0].id);
        } else {
          const existing = await tx.query.roles.findFirst({ where: eq(schema.roles.name, role.name) });
          if (existing) roleMap.set(role.name, existing.id);
        }
      }

      // ============================================
      // 3. Assign Permissions to Roles
      // ============================================
      console.log('Assigning permissions to roles...');
      const rolePermissions: Record<string, string[]> = {
        super_admin: permissions.map(p => p.code),
        admin: [
          'subscriber.view', 'subscriber.create', 'subscriber.update',
          'plan.view', 'plan.create', 'plan.update',
          'billing.view', 'billing.generate', 'billing.finalize', 'billing.void', 'billing.adjust',
          'payment.view', 'payment.create', 'payment.reverse', 'payment.gcash_verify',
          'collection.view', 'collection.create', 'collection.record', 'collection.remit', 'collection.reconcile',
          'receivables.view', 'receivables.suspend', 'receivables.reconnect',
          'report.view', 'report.export',
        ],
        cashier: [
          'subscriber.view',
          'payment.view', 'payment.create', 'payment.gcash_verify',
          'report.view',
        ],
        collection_supervisor: [
          'subscriber.view',
          'collection.view', 'collection.create', 'collection.record', 'collection.remit', 'collection.reconcile',
          'receivables.view',
          'report.view',
        ],
        accounting: [
          'subscriber.view',
          'billing.view',
          'payment.view', 'payment.reverse',
          'collection.view',
          'receivables.view',
          'report.view', 'report.export',
          'admin.audit',
        ],
        technician: [
          'subscriber.view',
          'receivables.view', 'receivables.suspend', 'receivables.reconnect',
        ],
        viewer: [
          'subscriber.view',
          'plan.view',
          'billing.view',
          'payment.view',
          'collection.view',
          'receivables.view',
          'report.view',
        ],
      };

      for (const [roleName, permCodes] of Object.entries(rolePermissions)) {
        const roleId = roleMap.get(roleName);
        if (!roleId) continue;

        for (const permCode of permCodes) {
          const perm = await tx.query.permissions.findFirst({ where: eq(schema.permissions.code, permCode) });
          if (perm) {
            await tx.insert(schema.rolePermissions).values({
              roleId,
              permissionId: perm.id,
            }).onConflictDoNothing();
          }
        }
      }

      // ============================================
      // 4. Seed Default Admin User
      // ============================================
      console.log('Seeding default admin user...');
      const adminPasswordHash = await hashPassword('admin123'); // Change in production!
      const superAdminRoleId = roleMap.get('super_admin');
      
      if (superAdminRoleId) {
        await tx.insert(schema.users).values({
          username: 'admin',
          email: 'admin@bcis.local',
          passwordHash: adminPasswordHash,
          fullName: 'System Administrator',
          roleId: superAdminRoleId,
          status: 'active',
        }).onConflictDoNothing({ target: schema.users.username });

        // Also create other demo users
        const demoUsers = [
          { username: 'cashier', email: 'cashier@bcis.local', fullName: 'Cashier User', roleName: 'cashier' },
          { username: 'collector_supervisor', email: 'collector@bcis.local', fullName: 'Collection Supervisor', roleName: 'collection_supervisor' },
          { username: 'accounting', email: 'accounting@bcis.local', fullName: 'Accounting Officer', roleName: 'accounting' },
          { username: 'technician', email: 'technician@bcis.local', fullName: 'Field Technician', roleName: 'technician' },
          { username: 'viewer', email: 'viewer@bcis.local', fullName: 'Read-only Viewer', roleName: 'viewer' },
        ];

        for (const u of demoUsers) {
          const roleId = roleMap.get(u.roleName);
          if (roleId) {
            await tx.insert(schema.users).values({
              username: u.username,
              email: u.email,
              passwordHash: adminPasswordHash,
              fullName: u.fullName,
              roleId,
              status: 'active',
            }).onConflictDoNothing({ target: schema.users.username });
          }
        }
      }

      // ============================================
      // 5. Seed Application Settings
      // ============================================
      console.log('Seeding application settings...');
      const settings = [
        { key: 'company_name', value: 'Bukidnon Cable and Internet Services', description: 'Company name for reports', isPublic: true },
        { key: 'company_address', value: 'Bukidnon, Philippines', description: 'Company address', isPublic: true },
        { key: 'company_phone', value: '+63 9XX XXX XXXX', description: 'Company contact number', isPublic: true },
        { key: 'company_email', value: 'info@bcis.com.ph', description: 'Company email', isPublic: true },
        { key: 'grace_period_days', value: '7', description: 'Grace period before suspension (days)', isPublic: false },
        { key: 'suspension_threshold', value: '2', description: 'Months unpaid before suspension', isPublic: false },
        { key: 'penalty_rate_monthly', value: '0.03', description: 'Monthly penalty rate (3%)', isPublic: false },
        { key: 'billing_due_days_after_period', value: '7', description: 'Days after period end for due date', isPublic: false },
        { key: 'receipt_prefix', value: 'RCPT', description: 'Receipt number prefix', isPublic: false },
        { key: 'invoice_prefix', value: 'INV', description: 'Invoice number prefix', isPublic: false },
        { key: 'batch_prefix', value: 'BATCH', description: 'Collection batch prefix', isPublic: false },
        { key: 'max_file_upload_mb', value: '5', description: 'Maximum file upload size in MB', isPublic: false },
        { key: 'allowed_file_types', value: 'image/jpeg,image/png,application/pdf', description: 'Allowed file types for uploads', isPublic: false },
        { key: 'session_timeout_minutes', value: '30', description: 'Session timeout in minutes', isPublic: false },
        { key: 'max_failed_login_attempts', value: '5', description: 'Max failed login attempts before lockout', isPublic: false },
        { key: 'lockout_duration_minutes', value: '15', description: 'Lockout duration in minutes', isPublic: false },
      ];

      for (const setting of settings) {
        await tx.insert(schema.applicationSettings).values({
          ...setting,
          updatedBy: (await tx.query.users.findFirst({ where: eq(schema.users.username, 'admin') }))?.id || '',
        }).onConflictDoNothing({ target: schema.applicationSettings.key });
      }

      // ============================================
      // 6. Seed Sample Plans
      // ============================================
      console.log('Seeding sample plans...');
      const plans = [
        {
          code: 'NET-BASIC',
          name: 'Basic Internet 20 Mbps',
          description: 'Basic internet plan for light browsing',
          type: 'internet' as const,
          monthlyRate: 99900, // â‚±999.00
          installationFee: 150000, // â‚±1,500.00
          reconnectionFee: 50000, // â‚±500.00
          speedMbps: 20,
          dataCapGb: 100,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'NET-STANDARD',
          name: 'Standard Internet 50 Mbps',
          description: 'Standard internet plan for streaming and work',
          type: 'internet' as const,
          monthlyRate: 149900, // â‚±1,499.00
          installationFee: 150000,
          reconnectionFee: 50000,
          speedMbps: 50,
          dataCapGb: 300,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'NET-PREMIUM',
          name: 'Premium Internet 100 Mbps',
          description: 'High-speed internet for heavy usage',
          type: 'internet' as const,
          monthlyRate: 249900, // â‚±2,499.00
          installationFee: 200000,
          reconnectionFee: 50000,
          speedMbps: 100,
          dataCapGb: 500,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'CABLE-BASIC',
          name: 'Basic Cable TV',
          description: 'Basic cable package with local channels',
          type: 'cable' as const,
          monthlyRate: 49900, // â‚±499.00
          installationFee: 100000,
          reconnectionFee: 30000,
          channelCount: 80,
          hdChannelCount: 10,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'CABLE-PREMIUM',
          name: 'Premium Cable TV',
          description: 'Premium cable with HD and premium channels',
          type: 'cable' as const,
          monthlyRate: 89900, // â‚±899.00
          installationFee: 150000,
          reconnectionFee: 30000,
          channelCount: 150,
          hdChannelCount: 50,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'COMBO-LITE',
          name: 'Internet 20 Mbps + Basic Cable',
          description: 'Bundle: Basic internet + Basic cable',
          type: 'combo' as const,
          monthlyRate: 129900, // â‚±1,299.00
          installationFee: 200000,
          reconnectionFee: 50000,
          speedMbps: 20,
          dataCapGb: 100,
          channelCount: 80,
          hdChannelCount: 10,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
        {
          code: 'COMBO-PRO',
          name: 'Internet 50 Mbps + Premium Cable',
          description: 'Bundle: Standard internet + Premium cable',
          type: 'combo' as const,
          monthlyRate: 199900, // â‚±1,999.00
          installationFee: 250000,
          reconnectionFee: 50000,
          speedMbps: 50,
          dataCapGb: 300,
          channelCount: 150,
          hdChannelCount: 50,
          isActive: true,
          effectiveFrom: '2024-01-01',
        },
      ];

      for (const plan of plans) {
        await tx.insert(schema.servicePlans).values(plan).onConflictDoNothing({ target: schema.servicePlans.code });
      }

      // ============================================
      // 7. Seed Collection Areas
      // ============================================
      console.log('Seeding collection areas...');
      const areas = [
        { code: 'AREA-01', name: 'Poblacion Area', description: 'Town center and nearby barangays', isActive: true },
        { code: 'AREA-02', name: 'North District', description: 'Northern barangays', isActive: true },
        { code: 'AREA-03', name: 'South District', description: 'Southern barangays', isActive: true },
      ];

      for (const area of areas) {
        await tx.insert(schema.collectionAreas).values(area).onConflictDoNothing({ target: schema.collectionAreas.code });
      }

      console.log('Database seed completed successfully!');
    });
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await closeDb();
  }
}

// Run when invoked as the seed script.
if (process.argv[1]?.endsWith('run.ts') || process.argv[1]?.endsWith('run.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seedDatabase };
