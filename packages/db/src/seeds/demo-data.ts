/**
 * BCIS Database Demo Seed Data
 * Seeds comprehensive demo data for testing and demonstration
 * Run AFTER the basic seed (which creates roles, permissions, users, plans, areas)
 */

import { getDb, closeDb, transaction } from '../index';
import * as schema from '@bcis/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { subDays, addDays, addMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import bcrypt from 'bcryptjs';
import { ensureDemoCollectors } from './demo-collectors';

async function seedDemoData() {
  const db = getDb();
  
  console.log('Starting demo data seed...');

  try {
    await transaction(async (tx) => {
      // ============================================
      // Get reference data
      // ============================================
      console.log('Fetching reference data...');
      
      const plans = await tx.query.servicePlans.findMany();
      const areas = await tx.query.collectionAreas.findMany();
      const collectorRole = await tx.query.roles.findFirst({ where: eq(schema.roles.name, 'field_collector') });
      const adminUser = await tx.query.users.findFirst({ where: eq(schema.users.username, 'admin') });
      
      if (!adminUser) throw new Error('Admin user not found');
      if (plans.length === 0) throw new Error('No plans found - run basic seed first');
      if (areas.length === 0) throw new Error('No areas found - run basic seed first');
      if (!collectorRole) throw new Error('Field collector role not found - run the basic seed first');

      // Demo collectors are separate, least-privilege users; do not reuse the
      // collection supervisor as a field collector in the sample dataset.
      const demoCollectorPasswordHash = await bcrypt.hash('admin123', 12);
      const collectors = await ensureDemoCollectors(tx, collectorRole.id, demoCollectorPasswordHash);

      const planMap = new Map(plans.map(p => [p.code, p]));
      const areaMap = new Map(areas.map(a => [a.code, a]));
      const batchCollector = collectors[0];

      // Assign collectors to areas
      for (const [index, areaCode] of ['AREA-01', 'AREA-02', 'AREA-03'].entries()) {
        await tx.update(schema.collectionAreas)
          .set({ collectorId: collectors[index].id })
          .where(eq(schema.collectionAreas.code, areaCode));
      }
      console.log('Created/found 3 distinct field collectors and assigned one to each demo area');

      // ============================================
      // 1. Create 50 Subscribers with addresses
      // ============================================
      console.log('Creating 50 subscribers...');
      
      const barangays = ['Poblacion', 'San Jose', 'Santa Cruz', 'Mabuhay', 'Kalayaan', 'Bagong Silang', 'Maharlika', 'Rizal', 'Quezon', 'Aquino'];
      const streets = ['Rizal St.', 'Quezon Ave.', 'Magsaysay Blvd.', 'OsmeÃ±a St.', 'Roxas Ave.', 'Garcia St.', 'Laurel St.', 'Quirino Ave.', 'Marcos Highway', 'Aguinaldo St.'];
      const cities = ['Malaybalay', 'Valencia', 'Manolo Fortich', 'Libona', 'Impasug-ong', 'Sumilao', 'Baungon', 'Talakag', 'Lantapan', 'Cabanglasan'];
      
      const firstNames = ['Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Carmen', 'Luis', 'Rosa', 'Carlos', 'Teresa', 'Miguel', 'Luz', 'Ramon', 'Gloria', 'Fernando', 'Dolores', 'Ricardo', 'Concepcion', 'Antonio', 'Esperanza'];
      const lastNames = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Vargas', 'Torres', 'Ramirez', 'Flores', 'Rivera', 'Morales', 'Castro', 'Gutierrez', 'Ramos', 'Jimenez', 'Alvarez', 'Romero', 'Herrera', 'Medina'];
      const middleNames = ['dela', 'de', 'de la', 'San', 'Santa', ''];

      const subscriberData: any[] = [];
      
      for (let i = 1; i <= 50; i++) {
        const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
        const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
        const mn = middleNames[Math.floor(Math.random() * middleNames.length)];
        const brgy = barangays[Math.floor(Math.random() * barangays.length)];
        const st = streets[Math.floor(Math.random() * streets.length)];
        const city = cities[Math.floor(Math.random() * cities.length)];
        const areaIdx = Math.floor(Math.random() * areas.length);
        const collectorIdx = Math.floor(Math.random() * Math.max(1, collectors.length));
        
        const accountNumber = `SUB-${String(i).padStart(5, '0')}`;
        const phone = `09${Math.floor(100000000 + Math.random() * 900000000)}`;
        
        const subscriber = await tx.insert(schema.subscribers).values({
          accountNumber,
          firstName: fn,
          middleName: mn || null,
          lastName: ln,
          contactNumber: phone,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@email.com`,
          status: i <= 45 ? 'active' : (i <= 48 ? 'inactive' : 'terminated'),
          billingDay: Math.floor(Math.random() * 28) + 1,
          collectionAreaId: areas[areaIdx].id,
          collectorId: collectors[collectorIdx]?.id || null,
          notes: `Demo subscriber ${i}`,
          createdBy: adminUser.id,
        }).returning();
        
        const sub = subscriber[0];
        subscriberData.push(sub);
        
        // Add addresses (billing and installation)
        const addressType = ['billing', 'installation'];
        for (let a = 0; a < addressType.length; a++) {
          await tx.insert(schema.subscriberAddresses).values({
            subscriberId: sub.id,
            type: addressType[a] as any,
            street: `${st} ${Math.floor(Math.random() * 999) + 1}`,
            barangay: brgy,
            city: city,
            province: 'Bukidnon',
            zipCode: '8700',
            isPrimary: a === 0,
            latitude: (8.15 + Math.random() * 0.5).toFixed(8),
            longitude: (125.1 + Math.random() * 0.5).toFixed(8),
          });
        }
      }

      console.log(`Created ${subscriberData.length} subscribers`);

      // ============================================
      // 2. Create 60+ Service Accounts
      // ============================================
      console.log('Creating 60+ service accounts...');
      
      const serviceAccountData: any[] = [];
      const planCodes = ['NET-BASIC', 'NET-STANDARD', 'NET-PREMIUM', 'CABLE-BASIC', 'CABLE-PREMIUM', 'COMBO-LITE', 'COMBO-PRO'];
      
      for (let i = 0; i < 60; i++) {
        const sub = subscriberData[i % subscriberData.length];
        const planCode = planCodes[i % planCodes.length];
        const plan = planMap.get(planCode);
        
        if (!plan) continue;
        
        // Get primary address
        const addresses = await tx.query.subscriberAddresses.findMany({
          where: eq(schema.subscriberAddresses.subscriberId, sub.id),
        });
        const primaryAddr = addresses.find(a => a.isPrimary) || addresses[0];
        
        if (!primaryAddr) continue;
        
        const activationDate = subDays(new Date(), Math.floor(Math.random() * 365) + 30);
        const billingStartDate = startOfMonth(addMonths(activationDate, 1));
        
        const accountNumber = `SA-${String(i + 1).padStart(6, '0')}`;
        const statuses = ['active', 'active', 'active', 'active', 'active', 'suspended', 'disconnected', 'pending_installation'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        
        const sa = await tx.insert(schema.serviceAccounts).values({
          accountNumber,
          subscriberId: sub.id,
          planId: plan.id,
          installationAddressId: primaryAddr.id,
          status: status as any,
          activationDate: format(activationDate, 'yyyy-MM-dd'),
          billingStartDate: format(billingStartDate, 'yyyy-MM-dd'),
          billingDay: sub.billingDay,
          currentRate: plan.monthlyRate,
          collectorId: sub.collectorId || collectors[Math.floor(Math.random() * collectors.length)]?.id || null,
          createdBy: adminUser.id,
        }).returning();
        
        serviceAccountData.push(sa[0]);
      }

      console.log(`Created ${serviceAccountData.length} service accounts`);

      // ============================================
      // 3. Create 3 Billing Cycles (Sep, Oct, Nov 2026)
      // ============================================
      console.log('Creating billing cycles...');
      
      const billingCyclesData: any[] = [];
      const cycleMonths = [
        { name: 'September 2026 Billing', start: '2026-09-01', end: '2026-09-30', due: '2026-10-07' },
        { name: 'October 2026 Billing', start: '2026-10-01', end: '2026-10-31', due: '2026-11-07' },
        { name: 'November 2026 Billing', start: '2026-11-01', end: '2026-11-30', due: '2026-12-07' },
      ];

      for (const cycle of cycleMonths) {
        const existing = await tx.query.billingCycles.findFirst({
          where: and(
            eq(schema.billingCycles.periodStart, cycle.start),
            eq(schema.billingCycles.periodEnd, cycle.end)
          ),
        });
        
        if (!existing) {
          const bc = await tx.insert(schema.billingCycles).values({
            name: cycle.name,
            periodStart: cycle.start,
            periodEnd: cycle.end,
            dueDate: cycle.due,
            status: cycle.name.includes('November') ? 'open' : 'finalized',
            generatedBy: adminUser.id,
            generatedAt: cycle.name.includes('November') ? null : new Date(),
            finalizedAt: cycle.name.includes('November') ? null : new Date(),
            finalizedBy: cycle.name.includes('November') ? null : adminUser.id,
          }).returning();
          billingCyclesData.push(bc[0]);
        } else {
          billingCyclesData.push(existing);
        }
      }

      console.log(`Created/found ${billingCyclesData.length} billing cycles`);

      // ============================================
      // 4. Generate Invoices for all active service accounts
      // ============================================
      console.log('Generating invoices for all billing cycles...');
      
      const activeServiceAccounts = serviceAccountData.filter(sa => sa.status === 'active');
      let invoiceCount = 0;

      for (const cycle of billingCyclesData) {
        for (const sa of activeServiceAccounts) {
          const plan = plans.find((candidate) => candidate.id === sa.planId);
          if (!plan) throw new Error(`Plan ${sa.planId} not found for service account ${sa.accountNumber}`);
          // Check if invoice already exists
          const existingInvoice = await tx.query.invoices.findFirst({
            where: and(
              eq(schema.invoices.serviceAccountId, sa.id),
              eq(schema.invoices.billingCycleId, cycle.id)
            ),
          });
          
          if (existingInvoice) continue;

          const isFirstBilling = sa.activationDate <= cycle.periodEnd && sa.billingStartDate >= cycle.periodStart;
          const subscriptionCharge = sa.currentRate || plan.monthlyRate || planMap.get('NET-BASIC')?.monthlyRate || 99900;
          const installationFee = isFirstBilling ? plan.installationFee : 0;
          const reconnectionFee = 0;
          const penalty = 0;
          const totalAmount = subscriptionCharge + installationFee + reconnectionFee + penalty;

          const invoiceNumber = `INV-${cycle.periodStart.substring(0,7).replace('-','')}-${String(invoiceCount + 1).padStart(5, '0')}`;
          
          const invoice = await tx.insert(schema.invoices).values({
            invoiceNumber,
            serviceAccountId: sa.id,
            billingCycleId: cycle.id,
            status: cycle.status === 'finalized' ? 'unpaid' : 'draft',
            periodStart: cycle.periodStart,
            periodEnd: cycle.periodEnd,
            dueDate: cycle.dueDate,
            subscriptionCharge,
            installationFee,
            reconnectionFee,
            discount: 0,
            penalty,
            adjustments: 0,
            totalAmount,
            paidAmount: 0,
            balance: totalAmount,
            generatedBy: adminUser.id,
            notes: `Auto-generated for ${cycle.name}`,
          }).returning();

          // Create invoice items
          await tx.insert(schema.invoiceItems).values([
            {
              invoiceId: invoice[0].id,
              description: `${plan.name} - ${cycle.name}`,
              quantity: 1,
              unitPrice: subscriptionCharge,
              amount: subscriptionCharge,
              type: 'subscription',
              sortOrder: 1,
            },
            ...(installationFee > 0 ? [{
              invoiceId: invoice[0].id,
              description: 'Installation Fee',
              quantity: 1,
              unitPrice: installationFee,
              amount: installationFee,
              type: 'installation' as const,
              sortOrder: 2,
            }] : []),
          ]);

          // Create service event
          await tx.insert(schema.serviceEvents).values({
            serviceAccountId: sa.id,
            type: 'billing',
            description: `Invoice ${invoiceNumber} generated for ${cycle.name}`,
            newValue: invoiceNumber,
            performedBy: adminUser.id,
            metadata: { billingCycleId: cycle.id },
          });

          invoiceCount++;
        }
      }

      console.log(`Generated ${invoiceCount} invoices`);

      // ============================================
      // 5. Create Payments (mix of Cash, GCash, partial, exact, advance)
      // ============================================
      console.log('Creating payments...');
      
      const paymentMethods = ['cash', 'gcash', 'bank_transfer', 'cheque', 'other'];
      const paymentStatuses = ['posted', 'posted', 'posted', 'verified', 'pending'];
      let paymentCount = 0;
      let receiptSeq = 1000;

      // Get all invoices that need payments
      const allInvoices = await tx.query.invoices.findMany({
        where: inArray(schema.invoices.billingCycleId, billingCyclesData.map(c => c.id)),
        with: { serviceAccount: { with: { subscriber: true } } },
      });

      // For each subscriber, create 1-3 payments across the cycles
      const subscriberIds = [...new Set(allInvoices.map(inv => inv.serviceAccount.subscriberId))];
      
      for (const subId of subscriberIds) {
        const subInvoices = allInvoices.filter(inv => inv.serviceAccount.subscriberId === subId);
        if (subInvoices.length === 0) continue;
        
        const numPayments = Math.floor(Math.random() * 3) + 1;
        const subUnpaidInvoices = subInvoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void' && inv.balance > 0);
        
        for (let p = 0; p < numPayments; p++) {
          if (subUnpaidInvoices.length === 0) break;
          
          // Pick a random invoice to pay
          const invoice = subUnpaidInvoices[Math.floor(Math.random() * subUnpaidInvoices.length)];
          const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
          const status = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
          
          // Decide payment type: exact, partial, or advance
          const paymentType = Math.random();
          let amount: number;
          if (paymentType < 0.4) {
            // Exact payment
            amount = Number(invoice.balance);
          } else if (paymentType < 0.7) {
            // Partial payment (50-90% of balance)
            amount = Math.floor(Number(invoice.balance) * (0.5 + Math.random() * 0.4));
          } else {
            // Advance payment (1-3x monthly rate)
            const monthlyRate = invoice.subscriptionCharge;
            amount = monthlyRate * (1 + Math.floor(Math.random() * 3));
          }
          
          const receiptNumber = `RCPT-${String(receiptSeq++).padStart(6, '0')}`;
          const paymentDate = addDays(new Date(invoice.dueDate), Math.floor(Math.random() * 15) - 7); // Around due date
          
          const [payment] = await tx.insert(schema.payments).values({
            receiptNumber,
            subscriberId: subId,
            amount,
            method: method as any,
            referenceNumber: method === 'gcash' ? `GCASH${Math.floor(100000 + Math.random() * 900000)}` : 
                             method === 'bank_transfer' ? `BANK${Math.floor(100000 + Math.random() * 900000)}` :
                             method === 'cheque' ? `CHQ${Math.floor(100000 + Math.random() * 900000)}` : null,
            paymentDate,
            postedBy: adminUser.id,
            status: method === 'gcash' && status === 'pending' ? 'pending' : 'posted',
            notes: `${method} payment for ${invoice.invoiceNumber}`,
          }).returning();

          // Allocate payment (oldest first)
          const subInvoicesForAlloc = allInvoices
            .filter(inv => inv.serviceAccount.subscriberId === subId && inv.balance > 0 && inv.status !== 'paid' && inv.status !== 'void')
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
          
          let remainingAmount = amount;
          for (const inv of subInvoicesForAlloc) {
            if (remainingAmount <= 0) break;
            const allocAmount = Math.min(Number(inv.balance), remainingAmount);
            if (allocAmount > 0) {
              await tx.insert(schema.paymentAllocations).values({
                paymentId: payment.id,
                invoiceId: inv.id,
                amount: allocAmount,
                allocatedBy: adminUser.id,
              });
              
              // Update invoice
              const newPaidAmount = Number(inv.paidAmount) + allocAmount;
              const newBalance = Number(inv.totalAmount) - newPaidAmount;
              let newStatus = inv.status;
              if (newBalance <= 0) newStatus = 'paid';
              else if (newPaidAmount > 0) newStatus = 'partially_paid';
              
              await tx.update(schema.invoices)
                .set({ paidAmount: newPaidAmount, balance: newBalance, status: newStatus as any, updatedAt: new Date() })
                .where(eq(schema.invoices.id, inv.id));
              
              remainingAmount -= allocAmount;
            }
          }

          // Create receipt record
          await tx.insert(schema.receipts).values({
            receiptNumber,
            paymentId: payment.id,
            template: 'standard',
            generatedBy: adminUser.id,
          });

          // Audit log
          await tx.insert(schema.auditLogs).values({
            actorId: adminUser.id,
            action: 'payment.create',
            entityType: 'payment',
            entityId: payment.id,
            newValues: { receiptNumber, amount, method, subscriberId: subId },
            reason: `Payment received via ${method}`,
            ipAddress: '127.0.0.1',
            userAgent: 'Demo Seed Script',
          });

          paymentCount++;
        }
      }

      console.log(`Created ${paymentCount} payments`);

      // ============================================
      // 6. Create Overdue Accounts (ensure 10+ across aging buckets)
      // ============================================
      console.log('Ensuring overdue accounts across aging buckets...');
      
      // For the September cycle, mark some as overdue by not paying them
      const septCycle = billingCyclesData.find(c => c.name.includes('September'));
      if (septCycle) {
        const septInvoices = allInvoices.filter(inv => inv.billingCycleId === septCycle.id);
        // Leave 15 invoices unpaid
        const toLeaveUnpaid = septInvoices.slice(0, 15);
        for (const inv of toLeaveUnpaid) {
          if (inv.status !== 'paid' && inv.status !== 'void') {
            await tx.update(schema.invoices)
              .set({ status: 'overdue', updatedAt: new Date() })
              .where(eq(schema.invoices.id, inv.id));
          }
        }
        
        // For October, leave 10 partially paid
        const octCycle = billingCyclesData.find(c => c.name.includes('October'));
        if (octCycle) {
          const octInvoices = allInvoices.filter(inv => inv.billingCycleId === octCycle.id);
          const toPartial = octInvoices.slice(0, 10);
          for (const inv of toPartial) {
            if (inv.status !== 'paid' && inv.status !== 'void' && Number(inv.balance) > 0) {
              const partialAmount = Math.floor(Number(inv.totalAmount) * 0.5);
              await tx.update(schema.invoices)
                .set({ 
                  status: 'partially_paid', 
                  paidAmount: partialAmount, 
                  balance: Number(inv.totalAmount) - partialAmount,
                  updatedAt: new Date() 
                })
                .where(eq(schema.invoices.id, inv.id));
            }
          }
        }
      }

      // ============================================
      // 7. Create Payment Reversal
      // ============================================
      console.log('Creating payment reversal...');
      
      const paymentsToReverse = await tx.query.payments.findMany({
        where: and(
          eq(schema.payments.status, 'posted'),
          eq(schema.payments.method, 'cash')
        ),
        limit: 1,
        with: { allocations: { with: { invoice: true } } },
      });
      
      if (paymentsToReverse.length > 0) {
        const payment = paymentsToReverse[0];
        const reversalReceiptNumber = `RCPT-${String(receiptSeq++).padStart(6, '0')}`;
        
        await tx.transaction(async (rtx) => {
          // Create reversal payment
          const [reversalPayment] = await rtx.insert(schema.payments).values({
            receiptNumber: reversalReceiptNumber,
            subscriberId: payment.subscriberId,
            amount: -payment.amount,
            method: payment.method,
            referenceNumber: `REV-${payment.receiptNumber}`,
            paymentDate: new Date(),
            postedBy: adminUser.id,
            status: 'posted',
            notes: `Reversal of ${payment.receiptNumber}: Incorrect amount posted`,
            reversalPaymentId: payment.id,
          }).returning();

          // Create reversal record
          await rtx.insert(schema.paymentReversals).values({
            originalPaymentId: payment.id,
            reversalPaymentId: reversalPayment.id,
            reason: 'Incorrect amount posted',
            reversedBy: adminUser.id,
            approvedBy: adminUser.id,
            approvedAt: new Date(),
          });

          // Reverse allocations
          for (const alloc of payment.allocations) {
            const invoice = alloc.invoice;
            const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - alloc.amount);
            const newBalance = Number(invoice.totalAmount) - newPaidAmount;
            let newStatus = 'unpaid';
            if (newPaidAmount > 0 && newBalance > 0) newStatus = 'partially_paid';
            else if (newPaidAmount >= Number(invoice.totalAmount)) newStatus = 'paid';

            await rtx.update(schema.invoices)
              .set({ paidAmount: newPaidAmount, balance: newBalance, status: newStatus as any, updatedAt: new Date() })
              .where(eq(schema.invoices.id, invoice.id));

            await rtx.delete(schema.paymentAllocations)
              .where(and(
                eq(schema.paymentAllocations.paymentId, payment.id),
                eq(schema.paymentAllocations.invoiceId, invoice.id)
              ));
          }

          // Update original payment
          await rtx.update(schema.payments)
            .set({
              status: 'reversed',
              reversedAt: new Date(),
              reversedBy: adminUser.id,
              reverseReason: 'Incorrect amount posted',
              reversalPaymentId: reversalPayment.id,
            })
            .where(eq(schema.payments.id, payment.id));

          // Audit log
          await rtx.insert(schema.auditLogs).values({
            actorId: adminUser.id,
            action: 'payment.reverse',
            entityType: 'payment',
            entityId: payment.id,
            oldValues: { receiptNumber: payment.receiptNumber, amount: payment.amount, status: payment.status },
            newValues: { receiptNumber: reversalReceiptNumber, amount: -payment.amount, status: 'reversed' },
            reason: 'Incorrect amount posted',
            ipAddress: '127.0.0.1',
            userAgent: 'Demo Seed Script',
          });
        });
      }

      console.log('Created payment reversal');

      // ============================================
      // 8. Create Suspension/Reconnection Records
      // ============================================
      console.log('Creating suspension/reconnection records...');
      
      // Get overdue service accounts
      const overdueSAs = await tx.query.serviceAccounts.findMany({
        where: and(
          eq(schema.serviceAccounts.status, 'active'),
          inArray(schema.serviceAccounts.id, allInvoices
            .filter(inv => inv.status === 'overdue' || inv.status === 'partially_paid')
            .map(inv => inv.serviceAccountId)
          )
        ),
        limit: 5,
        with: { subscriber: true, plan: true },
      });

      for (let i = 0; i < Math.min(2, overdueSAs.length); i++) {
        const sa = overdueSAs[i];
        const suspensionDate = addDays(new Date(), -30);
        
        // Create suspension record
        const [suspension] = await tx.insert(schema.suspensionRecords).values({
          serviceAccountId: sa.id,
          reason: 'non_payment',
          effectiveDate: format(suspensionDate, 'yyyy-MM-dd'),
          approvedBy: adminUser.id,
          notes: `Suspended for non-payment - ${sa.subscriber.accountNumber}`,
        }).returning();

        // Update service account status
        await tx.update(schema.serviceAccounts)
          .set({ 
            status: 'suspended', 
            suspendedAt: suspensionDate, 
            suspendedBy: adminUser.id,
            suspensionReason: 'Non-payment of monthly dues',
          })
          .where(eq(schema.serviceAccounts.id, sa.id));

        // Create service event
        await tx.insert(schema.serviceEvents).values({
          serviceAccountId: sa.id,
          type: 'suspension',
          description: 'Service suspended for non-payment',
          newValue: 'suspended',
          performedBy: adminUser.id,
        });

        // For one of them, create reconnection
        if (i === 0) {
          const reconDate = addDays(new Date(), -5);
          const fee = sa.plan?.reconnectionFee || 50000;
          
          // Create payment for reconnection fee
          const reconReceiptNumber = `RCPT-${String(receiptSeq++).padStart(6, '0')}`;
          const [reconPayment] = await tx.insert(schema.payments).values({
            receiptNumber: reconReceiptNumber,
            subscriberId: sa.subscriberId,
            amount: fee,
            method: 'cash',
            referenceNumber: `RECON-${sa.accountNumber}`,
            paymentDate: reconDate,
            postedBy: adminUser.id,
            status: 'posted',
            notes: `Reconnection fee for ${sa.accountNumber}`,
          }).returning();

          const [reconnection] = await tx.insert(schema.reconnectionRecords).values({
            suspensionId: suspension.id,
            serviceAccountId: sa.id,
            requestDate: reconDate,
            requestedBy: adminUser.id,
            fee,
            paymentId: reconPayment.id,
            technicianId: collectors[0]?.id,
            scheduledDate: reconDate,
            completedDate: reconDate,
            status: 'completed',
            notes: 'Reconnected after payment of outstanding balance and reconnection fee',
          }).returning();

          // Update service account back to active
          await tx.update(schema.serviceAccounts)
            .set({ 
              status: 'active', 
              disconnectedAt: null, 
              disconnectedBy: null,
            })
            .where(eq(schema.serviceAccounts.id, sa.id));

          await tx.insert(schema.serviceEvents).values({
            serviceAccountId: sa.id,
            type: 'reconnection',
            description: 'Service reconnected after payment',
            previousValue: 'suspended',
            newValue: 'active',
            performedBy: adminUser.id,
          });
        }
      }

      console.log('Created suspension/reconnection records');

      // ============================================
      // 9. Create Collection Batches
      // ============================================
      console.log('Creating collection batches...');
      
      if (areas.length > 0) {
        // Get active service accounts in the first demo collector's area
        const areaSubs = await tx.query.subscribers.findMany({
          where: and(
            eq(schema.subscribers.collectionAreaId, areas[0].id),
            eq(schema.subscribers.status, 'active')
          ),
        });
        
        const areaSAIds: string[] = [];
        for (const sub of areaSubs) {
          const sas = await tx.query.serviceAccounts.findMany({
            where: and(
              eq(schema.serviceAccounts.subscriberId, sub.id),
              eq(schema.serviceAccounts.status, 'active')
            ),
          });
          areaSAIds.push(...sas.map(sa => sa.id));
        }

        if (areaSAIds.length > 0) {
          // Create batch for yesterday
          const batchDate = subDays(new Date(), 1);
          const batchNumber = `BATCH-${format(batchDate, 'yyyyMMdd')}-${areas[0].code}`;
          
          const [batch] = await tx.insert(schema.collectionBatches).values({
            batchNumber,
            collectorId: batchCollector.id,
            areaId: areas[0].id,
            status: 'reconciled',
            collectionDate: format(batchDate, 'yyyy-MM-dd'),
            expectedCash: 5000000, // 50,000 PHP in centavos
            expectedNonCash: 1000000, // 10,000 PHP
            actualCash: 4950000,
            actualNonCash: 1000000,
            shortage: 50000,
            overage: 0,
            openedBy: adminUser.id,
            openedAt: new Date(batchDate.getTime() + 8 * 60 * 60 * 1000),
            submittedAt: new Date(batchDate.getTime() + 16 * 60 * 60 * 1000),
            submittedBy: batchCollector.id,
            remittedAt: new Date(batchDate.getTime() + 17 * 60 * 60 * 1000),
            remittedBy: batchCollector.id,
            reconciledAt: new Date(),
            reconciledBy: adminUser.id,
            notes: `Collection for ${areas[0].name} on ${format(batchDate, 'MMMM d, yyyy')}`,
          }).returning();

          // Add batch accounts
          let expectedTotal = 0;
          for (const saId of areaSAIds.slice(0, 15)) {
            const sa = await tx.query.serviceAccounts.findFirst({
              where: eq(schema.serviceAccounts.id, saId),
              with: { invoices: { where: inArray(schema.invoices.status, ['unpaid', 'partially_paid', 'overdue']) } },
            });
            if (!sa) continue;
            
            const totalDue = sa.invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
            expectedTotal += totalDue;
            
            await tx.insert(schema.collectionBatchAccounts).values({
              batchId: batch.id,
              serviceAccountId: saId,
              currentBill: sa.invoices.filter(inv => new Date(inv.periodStart) >= batchDate).reduce((sum, inv) => sum + Number(inv.balance), 0),
              arrears: sa.invoices.filter(inv => new Date(inv.periodEnd) < batchDate).reduce((sum, inv) => sum + Number(inv.balance), 0),
              totalDue,
              collectedAmount: totalDue > 0 ? Math.floor(totalDue * 0.8) : 0, // 80% collection rate
              collectedMethod: Math.random() > 0.5 ? 'cash' : 'gcash',
              collectedAt: new Date(batchDate.getTime() + 10 * 60 * 60 * 1000),
              receiptNumber: `RCPT-${String(receiptSeq++).padStart(6, '0')}`,
            });
          }

          // Update batch expected amounts
          await tx.update(schema.collectionBatches)
            .set({ expectedCash: expectedTotal })
            .where(eq(schema.collectionBatches.id, batch.id));

          // Create remittance record
          await tx.insert(schema.collectorRemittances).values({
            batchId: batch.id,
            collectorId: batchCollector.id,
            cashAmount: 4950000,
            nonCashAmount: 1000000,
            remittanceDate: format(batchDate, 'yyyy-MM-dd'),
            remittedBy: batchCollector.id,
            receivedBy: adminUser.id,
            notes: 'Remitted to office',
          });

          console.log(`Created collection batch for ${areas[0].name}`);
        }
      }

      // ============================================
      // 10. Create GCash Verification Queue Items
      // ============================================
      console.log('Creating GCash verification queue items...');
      
      for (let i = 0; i < 5; i++) {
        const sub = subscriberData[Math.floor(Math.random() * subscriberData.length)];
        const amount = (Math.floor(Math.random() * 5) + 1) * 50000; // 500-2500 PHP
        const refNumber = `GCASH${Date.now()}${i}`;
        
        // Create proof attachment first
        const [proof] = await tx.insert(schema.paymentProofs).values({
          fileName: `gcash_proof_${refNumber}.jpg`,
          filePath: `/uploads/gcash/${refNumber}.jpg`,
          fileSize: Math.floor(100000 + Math.random() * 500000),
          mimeType: 'image/jpeg',
          uploadedBy: adminUser.id,
        }).returning();

        await tx.insert(schema.gcashVerificationQueue).values({
          referenceNumber: refNumber,
          senderName: `${sub.firstName} ${sub.lastName}`,
          senderNumber: sub.contactNumber,
          amount,
          transactionDate: subDays(new Date(), Math.floor(Math.random() * 7)),
          proofAttachmentId: proof.id,
          status: i < 3 ? 'pending' : (i === 3 ? 'verified' : 'rejected'),
          subscriberId: i < 3 ? sub.id : null,
          verifiedAt: i >= 3 ? new Date() : null,
          verifiedBy: i >= 3 ? adminUser.id : null,
          rejectReason: i === 4 ? 'Screenshot does not match transaction amount' : null,
        });
      }

      console.log('Created GCash verification queue items');

      console.log('Demo data seed completed successfully!');
    });
  } catch (error) {
    console.error('Demo seed failed:', error);
    throw error;
  } finally {
    await closeDb();
  }
}

// Run when invoked as the seed script
if (process.argv[1]?.endsWith('run.ts') || process.argv[1]?.endsWith('run.js') || process.argv[1]?.endsWith('demo-data.ts') || process.argv[1]?.endsWith('demo-data.js')) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seedDemoData };
