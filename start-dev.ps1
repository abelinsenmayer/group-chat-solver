#!/usr/bin/env pwsh
# Starts the backend and frontend dev servers from the project root.
# Run with: .\start-dev.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Start-DevServer([string]$Name, [string]$WorkingDir, [string]$Command) {
    $title = "$Name dev server"
    $arguments = @(
        "-NoExit",
        "-Command",
        "cd `"$WorkingDir`"; $Command"
    )
    Start-Process powershell -ArgumentList $arguments -WindowStyle Normal -PassThru
    Write-Host "Started $Name in a new terminal: $WorkingDir > $Command"
}

Start-DevServer -Name "Backend" -WorkingDir "$root\backend" -Command "uv run uvicorn src.api:app --reload"
Start-DevServer -Name "Frontend" -WorkingDir "$root\frontend" -Command "corepack yarn dev"

Write-Host ""
Write-Host "Servers are running in separate terminals. Close them to stop."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://127.0.0.1:8000"
