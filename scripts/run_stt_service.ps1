# Runner for Streaming STT Microservice on Port 8001
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$VenvPython = Join-Path $ProjectDir "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Virtual environment Python not found at: $VenvPython"
    exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Starting Streaming STT Microservice (Port 8001) " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Working Directory: $ProjectDir"
Write-Host "Python: $VenvPython"

$env:PYTHONPATH = "$ProjectDir;$env:PYTHONPATH"
& $VenvPython -m services.stt_service.server

