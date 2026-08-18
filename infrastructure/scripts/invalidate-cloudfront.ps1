#!/usr/bin/env pwsh
# Manually invalidates the group-chat-solver CloudFront distribution.
# Useful during development when you want to clear the cache without redeploying.
# Run with: .\scripts\invalidate-cloudfront.ps1
# Or:       .\scripts\invalidate-cloudfront.ps1 -Paths "/api/*", "/index.html"
# Or:       .\scripts\invalidate-cloudfront.ps1 -NoWait

param(
    [string]$StackName = "group-chat-solver",

    [string[]]$Paths = @("/*"),

    [switch]$NoWait
)

$ErrorActionPreference = "Stop"

$distributionId = aws cloudformation list-stack-resources `
    --stack-name $StackName `
    --query "StackResourceSummaries[?ResourceType=='AWS::CloudFront::Distribution' && starts_with(LogicalResourceId, 'Distribution')].PhysicalResourceId | [0]" `
    --output text

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($distributionId) -or $distributionId -eq "None") {
    throw "Could not resolve the CloudFront distribution ID from stack '$StackName'."
}

Write-Host "Creating invalidation for distribution $distributionId with paths: $($Paths -join ', ')"

$invalidation = aws cloudfront create-invalidation `
    --distribution-id $distributionId `
    --paths $Paths `
    --query "Invalidation.{Id: Id, Status: Status, CreateTime: CreateTime}" `
    --output json | ConvertFrom-Json

Write-Host "Invalidation created: $($invalidation.Id) (status: $($invalidation.Status))"

if ($NoWait) {
    Write-Host "Skipping wait. Check progress in the AWS console or with: aws cloudfront get-invalidation --distribution-id $distributionId --id $($invalidation.Id)"
    exit 0
}

Write-Host "Waiting for invalidation to complete..."
do {
    Start-Sleep -Seconds 10
    $status = aws cloudfront get-invalidation `
        --distribution-id $distributionId `
        --id $invalidation.Id `
        --query "Invalidation.Status" `
        --output text
    Write-Host "Status: $status"
} while ($status -ne "Completed")

Write-Host "Invalidation complete."
