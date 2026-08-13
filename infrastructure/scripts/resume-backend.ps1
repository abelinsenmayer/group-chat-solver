#!/usr/bin/env pwsh
# Removes the reserved-concurrency override set by pause-backend.ps1, restoring normal
# (unreserved/on-demand) invocation for the backend Lambda.
# Run with: .\scripts\resume-backend.ps1

$ErrorActionPreference = "Stop"

$functionName = aws cloudformation list-stack-resources `
  --stack-name group-chat-solver `
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function' && starts_with(LogicalResourceId, 'BackendFunction')].PhysicalResourceId | [0]" `
  --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($functionName) -or $functionName -eq "None") {
    throw "Could not resolve the backend Lambda's physical name from stack 'group-chat-solver'."
}

Write-Host "Resuming backend Lambda '$functionName' (removing reserved concurrency override)..."
aws lambda delete-function-concurrency --function-name $functionName | Out-Null

Write-Host "Backend resumed."
