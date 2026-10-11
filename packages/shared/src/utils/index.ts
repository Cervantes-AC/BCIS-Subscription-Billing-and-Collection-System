/**
 * Shared utility functions for BCIS Billing System
 */

import { formatCurrency, centavosToPesos, pesosToCentavos, CENTAVOS_PER_PESO } from '../types';

/**
 * Generate a unique account number for subscribers
 * Format: BCIS-YYYY-XXXXX
 */
export function generateSubscriberAccountNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `BCIS-${year}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Generate a unique service account number
 * Format: SA-YYYY-XXXXX
 */
export function generateServiceAccountNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `SA-${year}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Generate a unique invoice number
 * Format: INV-YYYYMMDD-XXXXX
 */
export function generateInvoiceNumber(sequence: number): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${dateStr}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Generate a unique receipt number
 * Format: RCPT-YYYYMMDD-XXXXX
 */
export function generateReceiptNumber(sequence: number): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `RCPT-${dateStr}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Generate a unique collection batch number
 * Format: BATCH-YYYYMMDD-XXX
 */
export function generateBatchNumber(sequence: number): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `BATCH-${dateStr}-${sequence.toString().padStart(3, '0')}`;
}

/**
 * Generate a unique payment reference number
 * Format: PAY-YYYYMMDD-XXXXX
 */
export function generatePaymentReference(sequence: number): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `PAY-${dateStr}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Calculate age in days between two dates
 */
export function calculateDaysOverdue(dueDate: Date, asOfDate: Date = new Date()): number {
  const diffTime = asOfDate.getTime() - dueDate.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Determine aging bucket for a given days overdue
 */
export function getAgingBucket(daysOverdue: number): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/**
 * Calculate penalty based on overdue days and rate
 */
export function calculatePenalty(
  balance: number,
  daysOverdue: number,
  penaltyRatePerMonth: number, // e.g., 0.03 for 3% per month
  gracePeriodDays: number = 0
): number {
  if (daysOverdue <= gracePeriodDays) return 0;
  
  const penalizableDays = daysOverdue - gracePeriodDays;
  const monthlyRate = penaltyRatePerMonth / 30; // Daily rate approximation
  const penalty = Math.round(balance * monthlyRate * penalizableDays);
  return penalty;
}

/**
 * Allocate payment amount to invoices using oldest-first rule
 * Returns array of allocations and remaining unallocated amount
 */
export function allocatePaymentOldestFirst(
  paymentAmount: number,
  invoices: Array<{ id: string; balance: number }>
): { allocations: Array<{ invoiceId: string; amount: number }>; remaining: number } {
  let remaining = paymentAmount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  // Sort by due date (oldest first) - assuming invoices are already sorted
  for (const invoice of invoices) {
    if (remaining <= 0) break;
    
    const allocationAmount = Math.min(invoice.balance, remaining);
    if (allocationAmount > 0) {
      allocations.push({ invoiceId: invoice.id, amount: allocationAmount });
      remaining -= allocationAmount;
    }
  }

  return { allocations, remaining };
}

/**
 * Validate Philippine phone number format
 */
export function isValidPhilippinePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\s|-|\./g, '');
  // Accept formats: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
  return /^(\+63|63|0)9\d{9}$/.test(cleaned);
}

/**
 * Normalize Philippine phone number to +63 format
 */
export function normalizePhilippinePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\s|-|\./g, '');
  if (cleaned.startsWith('+63')) return cleaned;
  if (cleaned.startsWith('63')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+63${cleaned.slice(1)}`;
  return cleaned;
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  const normalized = normalizePhilippinePhoneNumber(phone);
  // Format as +63 9XX XXX XXXX
  if (normalized.length === 13) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
  }
  return phone;
}

/**
 * Calculate billing period start and end dates based on billing day
 */
export function calculateBillingPeriod(billingDay: number, referenceDate: Date = new Date()): { start: Date; end: Date } {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  
  // Billing period starts on billing day of current month
  const start = new Date(year, month, billingDay);
  
  // If reference date is before billing day, period started last month
  if (referenceDate.getDate() < billingDay) {
    start.setMonth(start.getMonth() - 1);
  }
  
  // End is day before next billing day
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
}

/**
 * Calculate due date from billing period end (typically 7-10 days after)
 */
export function calculateDueDate(periodEnd: Date, dueDaysAfterPeriodEnd: number = 7): Date {
  const due = new Date(periodEnd);
  due.setDate(due.getDate() + dueDaysAfterPeriodEnd);
  return due;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Omit keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
}

/**
 * Pick keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a random string for IDs, tokens, etc.
 */
export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format number with Philippine locale
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse currency string to centavos
 */
export function parseCurrencyToCentavos(value: string): number {
  const cleaned = value.replace(/[₱,\s]/g, '');
  const pesos = parseFloat(cleaned);
  if (isNaN(pesos)) return 0;
  return pesosToCentavos(pesos);
}

/**
 * Validate file type and size for uploads
 */
export function validateFileUpload(
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'application/pdf'],
  maxSizeMB: number = 5
): { valid: boolean; error?: string } {
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed. Allowed: ${allowedTypes.join(', ')}` };
  }
  
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${maxSizeMB}MB` };
  }
  
  return { valid: true };
}

/**
 * Generate initials from full name
 */
export function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Check if a date is within a range
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

/**
 * Get start and end of month for a given date
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Re-export financial utilities from types
 */
export { formatCurrency, centavosToPesos, pesosToCentavos, CENTAVOS_PER_PESO };