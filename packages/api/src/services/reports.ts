/**
 * Reports Service - PDF/XLSX report generation
 */

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { 
  invoices, 
  payments, 
  serviceAccounts, 
  subscribers, 
  servicePlans,
  collectionBatches,
  collectionBatchAccounts,
  collectorRemittances,
  collectionAreas,
  users,
  billingCycles,
  auditLogs,
  paymentAllocations,
} from '@bcis/db/schema';
import { eq, and, or, gte, lte, inArray, sql, desc, asc, sum, count } from 'drizzle-orm';
import { formatCurrency, centavosToPesos } from '@bcis/shared';
import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

interface ReportOptions {
  title: string;
  subtitle?: string;
  dateFrom?: Date;
  dateTo?: Date;
  generatedBy: string;
  generatedAt: Date;
}

/**
 * Generate Monthly Collection Report (XLSX)
 */
export async function generateMonthlyCollectionReportXLSX(
  fastify: FastifyInstance,
  period: Date,
  options: { collectorId?: string; areaId?: string }
): Promise<Buffer> {
  const db = fastify.db;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BCIS Billing System';
  workbook.created = new Date();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  
  // Title rows
  summarySheet.mergeCells('A1:F1');
  summarySheet.getCell('A1').value = 'Bukidnon Cable and Internet Services';
  summarySheet.getCell('A1').font = { size: 16, bold: true };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.mergeCells('A2:F2');
  summarySheet.getCell('A2').value = 'Monthly Collection Report';
  summarySheet.getCell('A2').font = { size: 14, bold: true };
  summarySheet.getCell('A2').alignment = { horizontal: 'center' };

  const periodStr = period.toISOString().split('T')[0].substring(0, 7); // YYYY-MM
  summarySheet.mergeCells('A3:F3');
  summarySheet.getCell('A3').value = `Period: ${periodStr}`;
  summarySheet.getCell('A3').font = { size: 12 };
  summarySheet.getCell('A3').alignment = { horizontal: 'center' };

  summarySheet.mergeCells('A4:F4');
  summarySheet.getCell('A4').value = `Generated: ${new Date().toLocaleString()}`;
  summarySheet.getCell('A4').font = { size: 10, italic: true };
  summarySheet.getCell('A4').alignment = { horizontal: 'center' };

  // Headers
  const headerRow = 6;
  ['Metric', 'Cash', 'GCash', 'Bank Transfer', 'Cheque', 'Total'].forEach((h, i) => {
    const cell = summarySheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Get data
  const startOfMonth = new Date(period.getFullYear(), period.getMonth(), 1);
  const endOfMonth = new Date(period.getFullYear(), period.getMonth() + 1, 0, 23, 59, 59);

  const paymentConditions = [
    gte(payments.paymentDate, startOfMonth),
    lte(payments.paymentDate, endOfMonth),
    or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
  ];

  if (options.collectorId) {
    const saIds = await db.select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.collectorId, options.collectorId));
    const subIds = await db.select({ subscriberId: serviceAccounts.subscriberId })
      .from(serviceAccounts)
      .where(inArray(serviceAccounts.id, saIds.map(s => s.id)));
    paymentConditions.push(inArray(payments.subscriberId, subIds.map(s => s.subscriberId)));
  }

  const paymentList = await db.query.payments.findMany({
    where: and(...paymentConditions),
  });

  const methods = ['cash', 'gcash', 'bank_transfer', 'cheque', 'other'];
  const totals: Record<string, number> = { cash: 0, gcash: 0, bank_transfer: 0, cheque: 0, other: 0, total: 0 };

  for (const p of paymentList) {
    const amount = Number(p.amount);
    totals[p.method] += amount;
    totals.total += amount;
  }

  const dataRows = [
    ['Total Collection', totals.cash, totals.gcash, totals.bank_transfer, totals.cheque, totals.total],
    ['Transaction Count', 
      paymentList.filter(p => p.method === 'cash').length,
      paymentList.filter(p => p.method === 'gcash').length,
      paymentList.filter(p => p.method === 'bank_transfer').length,
      paymentList.filter(p => p.method === 'cheque').length,
      paymentList.length
    ],
  ];

  dataRows.forEach((row, rowIdx) => {
    row.forEach((val, colIdx) => {
      const cell = summarySheet.getCell(headerRow + 1 + rowIdx, colIdx + 1);
      cell.value = val;
      if (colIdx > 0 && typeof val === 'number') {
        cell.numFmt = '#,##0.00';
        cell.value = centavosToPesos(val);
      }
      cell.alignment = { horizontal: colIdx === 0 ? 'left' : 'right' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Detail Sheet
  const detailSheet = workbook.addWorksheet('Detail');
  const detailHeaders = ['Receipt No.', 'Date', 'Subscriber', 'Account No.', 'Method', 'Reference', 'Amount', 'Status'];
  detailHeaders.forEach((h, i) => {
    const cell = detailSheet.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const paymentsWithDetails = await db.query.payments.findMany({
    where: and(...paymentConditions),
    with: { subscriber: true },
    orderBy: asc(payments.paymentDate),
  });

  paymentsWithDetails.forEach((p, idx) => {
    const row = idx + 2;
    detailSheet.getCell(row, 1).value = p.receiptNumber;
    detailSheet.getCell(row, 2).value = p.paymentDate.toLocaleDateString();
    detailSheet.getCell(row, 3).value = `${p.subscriber?.firstName} ${p.subscriber?.lastName}`;
    detailSheet.getCell(row, 4).value = p.subscriber?.accountNumber;
    detailSheet.getCell(row, 5).value = p.method.toUpperCase();
    detailSheet.getCell(row, 6).value = p.referenceNumber || '';
    detailSheet.getCell(row, 7).value = centavosToPesos(Number(p.amount));
    detailSheet.getCell(row, 7).numFmt = '#,##0.00';
    detailSheet.getCell(row, 8).value = p.status;
    
    for (let i = 1; i <= 8; i++) {
      detailSheet.getCell(row, i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (i === 7) detailSheet.getCell(row, i).alignment = { horizontal: 'right' };
    }
  });

  // Auto-fit columns
  detailSheet.columns.forEach(col => {
    col.width = 20;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate AR Aging Report (XLSX)
 */
export async function generateARAgingReportXLSX(
  fastify: FastifyInstance,
  asOfDate: Date,
  options: { collectorId?: string; areaId?: string }
): Promise<Buffer> {
  const db = fastify.db;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BCIS Billing System';

  const sheet = workbook.addWorksheet('AR Aging');
  
  // Title
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'Bukidnon Cable and Internet Services';
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = 'Accounts Receivable Aging Report';
  sheet.getCell('A2').font = { size: 14, bold: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('A3:H3');
  sheet.getCell('A3').value = `As of: ${asOfDate.toLocaleDateString()}`;
  sheet.getCell('A3').font = { size: 12 };
  sheet.getCell('A3').alignment = { horizontal: 'center' };

  // Headers
  const headers = ['Account No.', 'Subscriber', 'Service Account', 'Plan', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(5, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Get aging data using receivables service
  const { calculateAging } = await import('./receivables.js');
  const { details } = await calculateAging(fastify, asOfDate, options);

  details.forEach((d, idx) => {
    const row = idx + 6;
    sheet.getCell(row, 1).value = d.subscriber.accountNumber;
    sheet.getCell(row, 2).value = `${d.subscriber.firstName} ${d.subscriber.lastName}`;
    sheet.getCell(row, 3).value = d.serviceAccount.accountNumber;
    sheet.getCell(row, 4).value = d.serviceAccount.plan.name;
    
    const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const;
    buckets.forEach((b, bi) => {
      const bucket = d.agingBuckets.find(x => x.bucket === b);
      const cell = sheet.getCell(row, 5 + bi);
      cell.value = centavosToPesos(bucket?.amount || 0);
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right' };
    });
    
    const totalCell = sheet.getCell(row, 10);
    totalCell.value = centavosToPesos(d.totalArrears);
    totalCell.numFmt = '#,##0.00';
    totalCell.font = { bold: true };
    totalCell.alignment = { horizontal: 'right' };

    for (let i = 1; i <= 10; i++) {
      sheet.getCell(row, i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }
  });

  // Totals row
  const totalRow = details.length + 6;
  sheet.getCell(totalRow, 1).value = 'TOTAL';
  sheet.getCell(totalRow, 1).font = { bold: true };
  
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const;
  buckets.forEach((b, bi) => {
    const total = details.reduce((sum, d) => {
      const bucket = d.agingBuckets.find(x => x.bucket === b);
      return sum + (bucket?.amount || 0);
    }, 0);
    const cell = sheet.getCell(totalRow, 5 + bi);
    cell.value = centavosToPesos(total);
    cell.numFmt = '#,##0.00';
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'right' };
    cell.border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const grandTotal = details.reduce((sum, d) => sum + d.totalArrears, 0);
  const gtCell = sheet.getCell(totalRow, 10);
  gtCell.value = centavosToPesos(grandTotal);
  gtCell.numFmt = '#,##0.00';
  gtCell.font = { bold: true };
  gtCell.alignment = { horizontal: 'right' };
  gtCell.border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };

  sheet.columns.forEach(col => { col.width = 18; });
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 20;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate Statement of Account (PDF)
 */
export async function generateStatementOfAccountPDF(
  fastify: FastifyInstance,
  subscriberId: string,
  serviceAccountId?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<Buffer> {
  const db = fastify.db;
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Fetch data
      const subscriber = await db.query.subscribers.findFirst({
        where: eq(subscribers.id, subscriberId),
        with: {
          addresses: true,
          serviceAccounts: {
            where: serviceAccountId ? eq(serviceAccounts.id, serviceAccountId) : undefined,
            with: {
              plan: true,
              invoices: {
                where: and(
                  dateFrom ? gte(invoices.generatedAt, dateFrom) : undefined,
                  dateTo ? lte(invoices.generatedAt, dateTo) : undefined,
                ),
                orderBy: desc(invoices.generatedAt),
                with: {
                  items: true,
                  allocations: { with: { payment: true } },
                },
              },
              payments: {
                where: and(
                  dateFrom ? gte(payments.paymentDate, dateFrom) : undefined,
                  dateTo ? lte(payments.paymentDate, dateTo) : undefined,
                  or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
                ),
                orderBy: desc(payments.paymentDate),
              },
            },
          },
        },
      });

      if (!subscriber) throw new Error('Subscriber not found');

      const primaryAddress = subscriber.addresses.find(a => a.isPrimary) || subscriber.addresses[0];
      const addressStr = primaryAddress 
        ? `${primaryAddress.street}, ${primaryAddress.barangay}, ${primaryAddress.city} ${primaryAddress.zipCode}`
        : 'N/A';

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Bukidnon Cable and Internet Services', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica-Bold').text('STATEMENT OF ACCOUNT', { align: 'center' });
      doc.moveDown(1);

      // Subscriber Info
      doc.fontSize(10).font('Helvetica');
      const infoX = 50;
      let y = doc.y;
      
      doc.text(`Account Number: ${subscriber.accountNumber}`, infoX, y);
      doc.text(`Name: ${subscriber.firstName} ${subscriber.middleName ? subscriber.middleName + ' ' : ''}${subscriber.lastName}`, infoX, y += 15);
      doc.text(`Contact: ${subscriber.contactNumber}`, infoX, y += 15);
      doc.text(`Address: ${addressStr}`, infoX, y += 15);
      doc.text(`Statement Period: ${dateFrom ? dateFrom.toLocaleDateString() : 'Beginning'} to ${dateTo ? dateTo.toLocaleDateString() : 'Present'}`, infoX, y += 15);
      doc.text(`Generated: ${new Date().toLocaleString()}`, infoX, y += 15);
      doc.moveDown(1);

      // Process each service account
      for (const sa of subscriber.serviceAccounts) {
        doc.fontSize(12).font('Helvetica-Bold').text(`Service: ${sa.plan.name} (${sa.accountNumber})`, { underline: true });
        doc.moveDown(0.5);

        // Ledger table
        const tableTop = doc.y;
        const colWidths = [70, 80, 180, 70, 70, 70];
        const colPositions = [50, 120, 200, 380, 450, 520];
        const headers = ['Date', 'Ref No.', 'Description', 'Debit', 'Credit', 'Balance'];

        // Draw header
        doc.fontSize(8).font('Helvetica-Bold');
        doc.rect(50, tableTop, 540, 20).fill('#0F2747');
        doc.fillColor('white');
        headers.forEach((h, i) => {
          doc.text(h, colPositions[i], tableTop + 5, { width: colWidths[i], align: i >= 3 ? 'right' : 'left' });
        });
        doc.fillColor('black');

        // Build ledger entries
        const ledgerEntries: Array<{
          date: Date;
          ref: string;
          description: string;
          debit: number;
          credit: number;
          balance: number;
        }> = [];

        // Opening balance (from earliest invoice before period)
        let runningBalance = 0;

        // Add invoices as debits
        for (const inv of sa.invoices) {
          ledgerEntries.push({
            date: inv.generatedAt,
            ref: inv.invoiceNumber,
            description: `${inv.periodStart.toLocaleDateString()} - ${inv.periodEnd.toLocaleDateString()} Billing`,
            debit: Number(inv.totalAmount),
            credit: 0,
            balance: runningBalance + Number(inv.totalAmount),
          });
          runningBalance += Number(inv.totalAmount);
        }

        // Add payments as credits
        for (const pmt of sa.payments) {
          ledgerEntries.push({
            date: pmt.paymentDate,
            ref: pmt.receiptNumber,
            description: `${pmt.method.toUpperCase()} Payment`,
            debit: 0,
            credit: Number(pmt.amount),
            balance: runningBalance - Number(pmt.amount),
          });
          runningBalance -= Number(pmt.amount);
        }

        // Sort by date
        ledgerEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Recalculate running balance
        let balance = 0;
        ledgerEntries.forEach(e => {
          balance += e.debit - e.credit;
          e.balance = balance;
        });

        // Draw rows
        let rowY = tableTop + 20;
        doc.fontSize(7).font('Helvetica');
        
        for (const entry of ledgerEntries) {
          if (rowY > 750) {
            doc.addPage();
            rowY = 50;
          }

          const isEven = ledgerEntries.indexOf(entry) % 2 === 0;
          if (isEven) {
            doc.rect(50, rowY, 540, 18).fill('#F6F8FB');
          }

          doc.text(entry.date.toLocaleDateString(), colPositions[0], rowY + 2, { width: colWidths[0], align: 'left' });
          doc.text(entry.ref, colPositions[1], rowY + 2, { width: colWidths[1], align: 'left' });
          doc.text(entry.description, colPositions[2], rowY + 2, { width: colWidths[2], align: 'left' });
          doc.text(entry.debit > 0 ? formatCurrency(entry.debit) : '', colPositions[3], rowY + 2, { width: colWidths[3], align: 'right' });
          doc.text(entry.credit > 0 ? formatCurrency(entry.credit) : '', colPositions[4], rowY + 2, { width: colWidths[4], align: 'right' });
          doc.text(formatCurrency(entry.balance), colPositions[5], rowY + 2, { width: colWidths[5], align: 'right' });

          rowY += 18;
        }

        // Final balance
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Current Balance: ${formatCurrency(Math.max(0, runningBalance))}`, 50, rowY + 10);
        doc.moveDown(2);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Collector Remittance Report (XLSX)
 */
export async function generateCollectorRemittanceReportXLSX(
  fastify: FastifyInstance,
  dateFrom: Date,
  dateTo: Date,
  collectorId?: string
): Promise<Buffer> {
  const db = fastify.db;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BCIS Billing System';

  const sheet = workbook.addWorksheet('Collector Remittance');
  
  // Title
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Bukidnon Cable and Internet Services';
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = 'Collector Remittance Report';
  sheet.getCell('A2').font = { size: 14, bold: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('A3:G3');
  sheet.getCell('A3').value = `Period: ${dateFrom.toLocaleDateString()} to ${dateTo.toLocaleDateString()}`;
  sheet.getCell('A3').font = { size: 12 };
  sheet.getCell('A3').alignment = { horizontal: 'center' };

  // Headers
  const headers = ['Collector', 'Batch No.', 'Date', 'Expected Cash', 'Remitted Cash', 'Shortage', 'Overage'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(5, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const batchConditions = [
    gte(collectionBatches.collectionDate, dateFrom.toISOString().split('T')[0]),
    lte(collectionBatches.collectionDate, dateTo.toISOString().split('T')[0]),
  ];
  if (collectorId) batchConditions.push(eq(collectionBatches.collectorId, collectorId));

  const batches = await db.query.collectionBatches.findMany({
    where: and(...batchConditions),
    with: {
      collector: true,
      remittances: true,
    },
    orderBy: asc(collectionBatches.collectionDate),
  });

  batches.forEach((batch, idx) => {
    const row = idx + 6;
    const totalRemitted = batch.remittances.reduce((sum, r) => sum + Number(r.cashAmount) + Number(r.nonCashAmount), 0);
    const remittedCash = batch.remittances.reduce((sum, r) => sum + Number(r.cashAmount), 0);
    
    sheet.getCell(row, 1).value = batch.collector?.fullName || 'Unknown';
    sheet.getCell(row, 2).value = batch.batchNumber;
    sheet.getCell(row, 3).value = batch.collectionDate.toLocaleDateString();
    sheet.getCell(row, 4).value = centavosToPesos(Number(batch.expectedCash));
    sheet.getCell(row, 4).numFmt = '#,##0.00';
    sheet.getCell(row, 5).value = centavosToPesos(remittedCash);
    sheet.getCell(row, 5).numFmt = '#,##0.00';
    sheet.getCell(row, 6).value = centavosToPesos(Number(batch.shortage));
    sheet.getCell(row, 6).numFmt = '#,##0.00';
    sheet.getCell(row, 7).value = centavosToPesos(Number(batch.overage));
    sheet.getCell(row, 7).numFmt = '#,##0.00';

    for (let i = 1; i <= 7; i++) {
      sheet.getCell(row, i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (i >= 4) sheet.getCell(row, i).alignment = { horizontal: 'right' };
    }
  });

  sheet.columns.forEach(col => { col.width = 18; });
  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 20;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate Billing vs Collection Report (XLSX)
 */
export async function generateBillingVsCollectionReportXLSX(
  fastify: FastifyInstance,
  dateFrom: Date,
  dateTo: Date
): Promise<Buffer> {
  const db = fastify.db;
  const workbook = new ExcelJS.Workbook();
  
  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Billing vs Collection');
  
  summarySheet.mergeCells('A1:E1');
  summarySheet.getCell('A1').value = 'Bukidnon Cable and Internet Services';
  summarySheet.getCell('A1').font = { size: 16, bold: true };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.mergeCells('A2:E2');
  summarySheet.getCell('A2').value = 'Billing vs Collection Report';
  summarySheet.getCell('A2').font = { size: 14, bold: true };
  summarySheet.getCell('A2').alignment = { horizontal: 'center' };

  summarySheet.mergeCells('A3:E3');
  summarySheet.getCell('A3').value = `Period: ${dateFrom.toLocaleDateString()} to ${dateTo.toLocaleDateString()}`;
  summarySheet.getCell('A3').font = { size: 12 };
  summarySheet.getCell('A3').alignment = { horizontal: 'center' };

  // Get billing total
  const billingInvoices = await db.query.invoices.findMany({
    where: and(
      gte(invoices.generatedAt, dateFrom),
      lte(invoices.generatedAt, dateTo),
    ),
  });

  const totalBilled = billingInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // Get collection total
  const collectedPayments = await db.query.payments.findMany({
    where: and(
      gte(payments.paymentDate, dateFrom),
      lte(payments.paymentDate, dateTo),
      or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
    ),
  });

  const totalCollected = collectedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const headers = ['Metric', 'Amount'];
  headers.forEach((h, i) => {
    const cell = summarySheet.getCell(5, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const rows = [
    ['Total Billed', totalBilled],
    ['Total Collected', totalCollected],
    ['Collection Rate', totalBilled > 0 ? (totalCollected / totalBilled * 100).toFixed(2) + '%' : 'N/A'],
    ['Outstanding', totalBilled - totalCollected],
  ];

  rows.forEach((row, idx) => {
    summarySheet.getCell(6 + idx, 1).value = row[0];
    summarySheet.getCell(6 + idx, 1).font = { bold: true };
    summarySheet.getCell(6 + idx, 1).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    
    const cell = summarySheet.getCell(6 + idx, 2);
    if (typeof row[1] === 'number') {
      cell.value = centavosToPesos(row[1]);
      cell.numFmt = '#,##0.00';
    } else {
      cell.value = row[1];
    }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'right' };
  });

  // Monthly breakdown sheet
  const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
  const monthlyHeaders = ['Month', 'Billed', 'Collected', 'Rate %', 'Outstanding'];
  monthlyHeaders.forEach((h, i) => {
    const cell = monthlySheet.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2747' } };
    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Group by month
  const monthlyData = new Map<string, { billed: number; collected: number }>();
  
  for (const inv of billingInvoices) {
    const key = `${inv.periodStart.getFullYear()}-${String(inv.periodStart.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData.has(key)) monthlyData.set(key, { billed: 0, collected: 0 });
    monthlyData.get(key)!.billed += Number(inv.totalAmount);
  }

  for (const pmt of collectedPayments) {
    const key = `${pmt.paymentDate.getFullYear()}-${String(pmt.paymentDate.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData.has(key)) monthlyData.set(key, { billed: 0, collected: 0 });
    monthlyData.get(key)!.collected += Number(pmt.amount);
  }

  const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  sortedMonths.forEach(([month, data], idx) => {
    const row = idx + 2;
    monthlySheet.getCell(row, 1).value = month;
    monthlySheet.getCell(row, 2).value = centavosToPesos(data.billed);
    monthlySheet.getCell(row, 2).numFmt = '#,##0.00';
    monthlySheet.getCell(row, 3).value = centavosToPesos(data.collected);
    monthlySheet.getCell(row, 3).numFmt = '#,##0.00';
    monthlySheet.getCell(row, 4).value = data.billed > 0 ? (data.collected / data.billed * 100).toFixed(2) : 'N/A';
    monthlySheet.getCell(row, 5).value = centavosToPesos(data.billed - data.collected);
    monthlySheet.getCell(row, 5).numFmt = '#,##0.00';
    
    for (let i = 1; i <= 5; i++) {
      monthlySheet.getCell(row, i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (i >= 2) monthlySheet.getCell(row, i).alignment = { horizontal: 'right' };
    }
  });

  monthlySheet.columns.forEach(col => { col.width = 18; });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}