#!/usr/bin/env pwsh
# Builds the frontend with secrets pulled from SSM, then deploys the CDK stack.
# Run with: .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)

$mapboxPublicToken = aws ssm get-parameter `
  --name "/group-chat-solver/prod/mapbox-public-token" `
  --with-decryption `
  --query "Parameter.Value" `
  --output text

Write-Host "Building frontend..."
Push-Location "$root\frontend"
try {
    $env:VITE_MAPBOX_ACCESS_TOKEN = $mapboxPublicToken
    $env:VITE_API_BASE_URL = ""
    corepack yarn build
} finally {
    Remove-Item Env:\VITE_MAPBOX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:\VITE_API_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host "Deploying CDK stack..."
Push-Location "$root\infrastructure"
try {
    npx cdk deploy --require-approval never
} finally {
    Pop-Location
}
