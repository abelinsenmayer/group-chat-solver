#!/usr/bin/env pwsh
# Sets the backend Lambda's reserved concurrency to 0, throttling every invocation before it's
# billed. Use this to shut off the backend (e.g. between work sessions, so the publicly-reachable
# CloudFront URL can't be abused) without destroying the stack. The frontend (S3 + CloudFront)
# keeps serving; requests to /api/* will 429 until you run resume-backend.ps1.
# Run with: .\scripts\pause-backend.ps1

$ErrorActionPreference = "Stop"

$functionName = aws cloudformation list-stack-resources `
  --stack-name group-chat-solver `
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function' && starts_with(LogicalResourceId, 'BackendFunction')].PhysicalResourceId | [0]" `
  --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($functionName) -or $functionName -eq "None") {
    throw "Could not resolve the backend Lambda's physical name from stack 'group-chat-solver'."
}

Write-Host "Pausing backend Lambda '$functionName' (reserved concurrency -> 0)..."
aws lambda put-function-concurrency `
  --function-name $functionName `
  --reserved-concurrent-executions 0 | Out-Null

Write-Host "Backend paused. All /api/* requests will be throttled until you run .\scripts\resume-backend.ps1."
