<# 
.SYNOPSIS
    BCIS Database Setup Script for Windows PowerShell
.DESCRIPTION
    Sets up PostgreSQL database, runs migrations, and seeds demo data
#>

param(
    [switch]$UseDocker,
    [string]$DbPassword = "postgres"
)

Write-Host "🔧 BCIS Database Setup" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
$envPath = Join-Path $PSScriptRoot "..\.env"
$envExamplePath = Join-Path $PSScriptRoot "..\.env.example"

if (-not (Test-Path $envPath)) {
    Write-Host "📝 Creating .env from template..." -ForegroundColor Yellow
    Copy-Item $envExamplePath $envPath
    Write-Host "✅ .env created" -ForegroundColor Green
}

# Start Docker if requested
if ($UseDocker) {
    Write-Host "🐳 Starting PostgreSQL via Docker..." -ForegroundColor Cyan
    $composePath = Join-Path $PSScriptRoot "..\docker-compose.yml"
    if (Test-Path $composePath) {
        docker-compose -f $composePath up -d
        Write-Host "⏳ Waiting for PostgreSQL to be ready..."
        Start-Sleep -Seconds 5
    } else {
        Write-Host "❌ docker-compose.yml not found" -ForegroundColor Red
        exit 1
    }
}

# Check PostgreSQL
Write-Host "🔌 Checking PostgreSQL..." -ForegroundColor Cyan
try {
    $version = psql --version 2>$null
    Write-Host "✅ PostgreSQL client: $version" -ForegroundColor Green
} catch {
    Write-Host "❌ PostgreSQL not found in PATH" -ForegroundColor Red
    Write-Host "   Please install PostgreSQL and add bin folder to PATH" -ForegroundColor Yellow
    Write-Host "   Or run with -UseDocker switch" -ForegroundColor Yellow
    exit 1
}

# Load DATABASE_URL from .env
$envContent = Get-Content $envPath -Raw
$dbUrlMatch = [regex]::Match($envContent, 'DATABASE_URL=(.+)')
$dbUrl = if ($dbUrlMatch.Success) { $dbUrlMatch.Groups[1].Value } else { "postgresql://postgres:postgres@localhost:5432/bcis_billing" }
Write-Host "📊 Database: $($dbUrl -replace '//.*:.*@', '//***:***@')" -ForegroundColor Cyan

# Test connection
Write-Host "🔍 Testing connection..." -ForegroundColor Cyan
try {
    $result = psql $dbUrl -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database connection successful" -ForegroundColor Green
    } else {
        throw "Connection failed"
    }
} catch {
    Write-Host "❌ Cannot connect to database" -ForegroundColor Red
    Write-Host "   Make sure PostgreSQL is running" -ForegroundColor Yellow
    Write-Host "   Database URL: $dbUrl" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if needed
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
pnpm install

# Run migrations
Write-Host "📦 Running migrations..." -ForegroundColor Cyan
pnpm --filter @bcis/db run generate
pnpm --filter @bcis/db run migrate

# Run seeds
Write-Host "🌱 Seeding demo data..." -ForegroundColor Cyan
pnpm --filter @bcis/db run seed

Write-Host ""
Write-Host "🎉 Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start API:      pnpm --filter @bcis/api run dev"
Write-Host "  2. Start Desktop:  pnpm --filter @bcis/desktop run dev"
Write-Host "  3. Run both:       pnpm dev"