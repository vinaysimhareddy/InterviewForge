# ==============================================================================
# InterviewForge - Database Backup & Restore Script (PowerShell)
# Supports MongoDB Atlas URIs and Local Docker MongoDB Instances
# ==============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("backup", "restore")]
    [string]$Action = "backup",

    [Parameter(Position=1)]
    [string]$ArchivePath = ""
)

$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }
$Timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$TargetFile = Join-Path $BackupDir "interviewforge_backup_${Timestamp}.archive.gz"
$MongoUri = if ($env:MONGODB_URI) { $env:MONGODB_URI } else { "mongodb://localhost:27017" }
$DbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "ai-mock-interview" }

# Mask password for safe console logging
$MaskedUri = $MongoUri -replace "://([^:]+):([^@]+)@", "://$1:*****@"

if ($Action -eq "backup") {
    Write-Host "[Backup] Starting backup for database '$DbName'..." -ForegroundColor Cyan
    Write-Host "[Backup] Connecting to: $MaskedUri" -ForegroundColor Gray
    
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
    }

    & mongodump --uri="$MongoUri" --db="$DbName" --archive="$TargetFile" --gzip
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[Backup] Backup completed successfully!" -ForegroundColor Green
        Write-Host "[Backup] Archive created at: $TargetFile" -ForegroundColor Green
        Get-Item $TargetFile | Select-Object Name, Length, LastWriteTime
    } else {
        Write-Host "[Backup] mongodump failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
elseif ($Action -eq "restore") {
    if (-not $ArchivePath -or -not (Test-Path $ArchivePath)) {
        Write-Host "[Error] Please provide a valid archive file path to restore." -ForegroundColor Red
        Write-Host "Usage: .\scripts\backup_restore.ps1 -Action restore -ArchivePath .\backups\your_archive.archive.gz"
        exit 1
    }

    Write-Host "[Restore] WARNING: Restoring will overwrite existing collections in '$DbName'!" -ForegroundColor Yellow
    Write-Host "[Restore] Target Archive: $ArchivePath" -ForegroundColor Gray
    Write-Host "[Restore] Connecting to: $MaskedUri" -ForegroundColor Gray
    
    $confirm = Read-Host "Are you sure you want to proceed? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "[Restore] Restoration cancelled by user." -ForegroundColor Gray
        exit 0
    }

    & mongorestore --uri="$MongoUri" --nsInclude="${DbName}.*" --archive="$ArchivePath" --gzip --drop
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[Restore] Database '$DbName' restored successfully from $ArchivePath." -ForegroundColor Green
    } else {
        Write-Host "[Restore] mongorestore failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

