#!/usr/bin/env node
/**
 * BCIS Database Setup Script
 * Run this after PostgreSQL is running to initialize the database
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(__dirname);
const envPath = resolve(projectRoot, '.env');

console.log('🔧 BCIS Database Setup\n');

// Check if .env exists
if (!existsSync(envPath)) {
  console.log('📝 Creating .env from template...');
  const example = readFileSync(resolve(projectRoot, '.env.example'), 'utf-8');
  writeFileSync(envPath, example);
  console.log('✅ .env created. Please edit with your database credentials if different.');
}

// Check PostgreSQL connection
console.log('\n🔌 Checking PostgreSQL connection...');
try {
  execSync('psql --version', { stdio: 'pipe' });
  console.log('✅ PostgreSQL client found');
} catch {
  console.log('❌ PostgreSQL client not found in PATH');
  console.log('   Options:');
  console.log('   1. Install PostgreSQL and add to PATH');
  console.log('   2. Use Docker: docker-compose up -d');
  process.exit(1);
}

// Check if Docker is running (if using Docker)
try {
  execSync('docker ps --filter name=bcis-postgres --format "{{.Status}}"', { stdio: 'pipe' });
  console.log('✅ Docker PostgreSQL container running');
} catch {
  console.log('ℹ️  Docker container not running (OK if using local PostgreSQL)');
}

// Load environment
require('dotenv').config({ path: envPath });

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bcis_billing';
console.log(`\n📊 Database URL: ${dbUrl.replace(/\/\/.*:.*@/, '//***:***@')}`);

// Test connection
console.log('\n🔍 Testing database connection...');
try {
  execSync(`psql "${dbUrl}" -c "SELECT version();"`, { stdio: 'pipe' });
  console.log('✅ Database connection successful');
} catch (e) {
  console.log('❌ Cannot connect to database');
  console.log('   Make sure PostgreSQL is running and accessible');
  console.log('   If using Docker: docker-compose up -d');
  process.exit(1);
}

// Run migrations
console.log('\n📦 Running database migrations...');
try {
  execSync('pnpm --filter @bcis/db run generate', { stdio: 'inherit', cwd: projectRoot });
  execSync('pnpm --filter @bcis/db run migrate', { stdio: 'inherit', cwd: projectRoot });
  console.log('✅ Migrations completed');
} catch (e) {
  console.log('❌ Migration failed');
  process.exit(1);
}

// Run seeds
console.log('\n🌱 Seeding demo data...');
try {
  execSync('pnpm --filter @bcis/db run seed', { stdio: 'inherit', cwd: projectRoot });
  console.log('✅ Seed data inserted');
} catch (e) {
  console.log('❌ Seeding failed');
  process.exit(1);
}

console.log('\n🎉 Database setup complete!');
console.log('\nNext steps:');
console.log('  1. Start API:    pnpm --filter @bcis/api run dev');
console.log('  2. Start Desktop: pnpm --filter @bcis/desktop run dev');
console.log('  3. Or run both:  pnpm dev');