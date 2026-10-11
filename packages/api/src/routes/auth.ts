/**
 * Authentication routes
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { users, sessions } from '@bcis/db/schema';
import { LoginRequestSchema, ChangePasswordRequestSchema, RefreshTokenRequestSchema, AuthResponseSchema } from '@bcis/shared';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, getAccessTokenExpiry, getRefreshTokenExpiry, validatePasswordStrength } from '../utils/auth';
import { config } from '../config';

const LoginReplySchema = z.object({ success: z.boolean(), data: AuthResponseSchema });

export async function authRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  // Login
  fastify.post<{
    Body: z.infer<typeof LoginRequestSchema>;
    Reply: z.infer<typeof LoginReplySchema> | { success: false; error: { code: string; message: string; statusCode: number } };
  }>('/auth/login', {
    schema: {
      body: LoginRequestSchema,
      response: {
        200: LoginReplySchema,
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { username, password, rememberMe } = request.body;

    // Find user
    const user = await fastify.db.query.users.findFirst({
      where: eq(users.username, username),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password', statusCode: 401 },
      });
    }

    if (user.status !== 'active') {
      return reply.code(401).send({
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled', statusCode: 401 },
      });
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Increment failed attempts
      await fastify.db
        .update(users)
        .set({ 
          failedLoginAttempts: user.failedLoginAttempts + 1,
          lockedUntil: user.failedLoginAttempts + 1 >= config.maxFailedLoginAttempts 
            ? new Date(Date.now() + config.lockoutDurationMinutes * 60 * 1000) 
            : null,
        })
        .where(eq(users.id, user.id));

      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password', statusCode: 401 },
      });
    }

    // Check if locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return reply.code(401).send({
        success: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked due to failed attempts', statusCode: 401 },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken();
    const refreshToken = generateRefreshToken();
    const accessTokenExpiresAt = getAccessTokenExpiry();
    const refreshTokenExpiresAt = getRefreshTokenExpiry();

    // Store session
    await fastify.db.insert(sessions).values({
      userId: user.id,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // Reset failed attempts and update last login
    await fastify.db
      .update(users)
      .set({ 
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Set cookies
    reply.setCookie('accessToken', accessToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 15 * 60, // 30 days or 15 minutes
      path: '/',
    });

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Prepare response
    const permissions = user.role?.rolePermissions?.map((rp: any) => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      module: rp.permission.module,
    })) || [];

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId,
          role: {
            id: user.role.id,
            name: user.role.name,
            permissions,
          },
          isActive: user.status === 'active',
        },
        accessToken,
        refreshToken,
        expiresAt: accessTokenExpiresAt.toISOString(),
      },
    };
  });

  // Logout
  app.post('/auth/logout', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const accessToken = request.cookies.accessToken || request.headers.authorization?.replace('Bearer ', '');
    
    if (accessToken) {
      await fastify.db
        .update(sessions)
        .set({ isRevoked: true })
        .where(eq(sessions.accessToken, accessToken));
    }

    reply.clearCookie('accessToken', { path: '/' });
    reply.clearCookie('refreshToken', { path: '/' });

    return { success: true, data: { message: 'Logged out successfully' } };
  });

  // Refresh token
  fastify.post<{
    Body: z.infer<typeof RefreshTokenRequestSchema>;
  }>('/auth/refresh', {
    schema: { body: RefreshTokenRequestSchema },
  }, async (request, reply) => {
    const refreshToken = request.body.refreshToken || request.cookies.refreshToken;

    if (!refreshToken) {
      return reply.code(401).send({
        success: false,
        error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token required', statusCode: 401 },
      });
    }

    const session = await fastify.db.query.sessions.findFirst({
      where: and(
        eq(sessions.refreshToken, refreshToken),
        eq(sessions.isRevoked, false),
        gt(sessions.refreshTokenExpiresAt, new Date())
      ),
      with: {
        user: {
          with: {
            role: {
              with: {
                rolePermissions: {
                  with: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token', statusCode: 401 },
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken();
    const newRefreshToken = generateRefreshToken();
    const newAccessTokenExpiresAt = getAccessTokenExpiry();
    const newRefreshTokenExpiresAt = getRefreshTokenExpiry();

    // Revoke old session
    await fastify.db
      .update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.id, session.id));

    // Create new session
    await fastify.db.insert(sessions).values({
      userId: session.userId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresAt: newAccessTokenExpiresAt,
      refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // Set new cookies
    reply.setCookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    const permissions = session.user.role?.rolePermissions?.map(rp => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      module: rp.permission.module,
    })) || [];

    return {
      success: true,
      data: {
        user: {
          id: session.user.id,
          username: session.user.username,
          email: session.user.email,
          fullName: session.user.fullName,
          roleId: session.user.roleId,
          role: {
            id: session.user.role.id,
            name: session.user.role.name,
            permissions,
          },
          isActive: session.user.status === 'active',
        },
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newAccessTokenExpiresAt.toISOString(),
      },
    };
  });

  // Get current user
  app.get('/auth/me', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const user = request.user as any;
    
    const permissions = user.role?.rolePermissions?.map((rp: any) => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      module: rp.permission.module,
    })) || [];

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId,
          role: {
            id: user.role.id,
            name: user.role.name,
            permissions,
          },
          isActive: user.status === 'active',
        },
      },
    };
  });

  // Change password
  fastify.post<{
    Body: z.infer<typeof ChangePasswordRequestSchema>;
  }>('/auth/change-password', {
    preHandler: fastify.authenticate,
    schema: { body: ChangePasswordRequestSchema },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const user = request.user as any;

    // Verify current password
    const dbUser = await fastify.db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    if (!dbUser) {
      return reply.code(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found', statusCode: 404 },
      });
    }

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect', statusCode: 400 },
      });
    }

    // Validate new password
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: 'Password does not meet requirements', details: validation.errors, statusCode: 400 },
      });
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update password
    await fastify.db
      .update(users)
      .set({ 
        passwordHash: newHash,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Revoke all sessions
    await fastify.db
      .update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.userId, user.id));

    return { success: true, data: { message: 'Password changed successfully. Please log in again.' } };
  });
}
