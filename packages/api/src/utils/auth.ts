/**
 * Authentication utilities for BCIS API
 * Password hashing, JWT tokens, and session management
 */

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// Password hashing
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Token generation
export function generateAccessToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

// Token expiry
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';

export function getAccessTokenExpiry(): Date {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 15);
  return date;
}

export function getRefreshTokenExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

// Password validation
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Session constants
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;
export const SESSION_TIMEOUT_MINUTES = 30;