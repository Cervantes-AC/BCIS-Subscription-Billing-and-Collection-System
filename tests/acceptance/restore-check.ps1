param(
  [string]$PostgresBin = $env:POSTGRES_BIN
)

$ErrorActionPreference = 'Stop'

$sourceUrl = $env:BCIS_DISPOSABLE_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($sourceUrl)) {
  throw 'Set BCIS_DISPOSABLE_DATABASE_URL to a disposable synthetic database before running this script.'
}

$sourceUri = [uri]$sourceUrl
$sourceName = $sourceUri.AbsolutePath.TrimStart('/')
if ($sourceName -notmatch '(?i)(test|acceptance|disposable)') {
  throw 'Refusing to dump/restore a database whose name does not clearly identify it as disposable.'
}

if ([string]::IsNullOrWhiteSpace($PostgresBin)) {
  $PostgresBin = 'C:\Program Files\PostgreSQL\17\bin'
}
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
foreach ($tool in @($pgDump, $pgRestore, $psql)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "PostgreSQL utility not found: $tool" }
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$restoreName = "${sourceName}_restorecheck_${stamp}"
$dumpPath = Join-Path $env:TEMP "${sourceName}_${stamp}.dump"
$adminBuilder = [System.UriBuilder]::new($sourceUri)
$adminBuilder.Path = '/postgres'
$adminUrl = $adminBuilder.Uri.AbsoluteUri
$restoreBuilder = [System.UriBuilder]::new($sourceUri)
$restoreBuilder.Path = "/$restoreName"
$restoreUrl = $restoreBuilder.Uri.AbsoluteUri

$dbExists = & $psql $adminUrl -X -tAc "SELECT 1 FROM pg_database WHERE datname = '$restoreName'"
if ($LASTEXITCODE -ne 0) { throw 'Could not connect to PostgreSQL maintenance database.' }
if (-not [string]::IsNullOrWhiteSpace(($dbExists -join '').Trim())) { throw "Restore target already exists: $restoreName" }

& $pgDump '--format=custom' "--file=$dumpPath" "--dbname=$sourceUrl"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
if ((Get-Item -LiteralPath $dumpPath).Length -le 0) { throw 'pg_dump produced an empty backup.' }
& $psql $adminUrl -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$restoreName`""
if ($LASTEXITCODE -ne 0) { throw 'Could not create disposable restore database.' }
& $pgRestore '--no-owner' '--no-privileges' "--dbname=$restoreUrl" $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed.' }

$sampleQuery = @"
SELECT json_build_object(
  'invoiceCount', (SELECT count(*) FROM invoices),
  'paymentCount', (SELECT count(*) FROM payments),
  'allocationCount', (SELECT count(*) FROM payment_allocations),
  'auditCount', (SELECT count(*) FROM audit_logs),
  'invoiceSample', (SELECT json_build_object('invoiceNumber', invoice_number, 'totalAmount', total_amount, 'balance', balance, 'status', status) FROM invoices ORDER BY invoice_number LIMIT 1),
  'paymentSample', (SELECT json_build_object('receiptNumber', receipt_number, 'amount', amount, 'status', status) FROM payments ORDER BY receipt_number LIMIT 1),
  'auditSample', (SELECT json_build_object('action', action, 'entityType', entity_type) FROM audit_logs ORDER BY created_at LIMIT 1)
)::text
"@
$sourceState = (& $psql $sourceUrl -X -tA -v ON_ERROR_STOP=1 -c $sampleQuery | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read source comparison samples.' }
$restoredState = (& $psql $restoreUrl -X -tA -v ON_ERROR_STOP=1 -c $sampleQuery | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read restored comparison samples.' }
if ($sourceState -ne $restoredState) { throw "Backup/restore comparison failed. Source: $sourceState`nRestored: $restoredState" }

$evidencePath = Join-Path $PSScriptRoot "evidence-restore-$stamp.md"
$evidence = @"
# AT-12 Backup and Restore Evidence

- Date/time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
- Source: $sourceName (disposable synthetic database)
- Restore target: $restoreName
- Dump size: $((Get-Item -LiteralPath $dumpPath).Length) bytes
- Result: PASS; row counts and invoice, payment, and audit samples matched exactly.
- Comparison JSON: $sourceState

The target database and dump are intentionally retained for review. Both contain synthetic acceptance data only.
"@
Set-Content -LiteralPath $evidencePath -Value $evidence -Encoding utf8
Write-Output "PASS: backup restored and key data matched. Evidence: $evidencePath"
