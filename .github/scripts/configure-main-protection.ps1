[CmdletBinding()]
param(
    [string]$Repository = "playzzin/propig",
    [string]$Branch = "main"
)

$token = $env:GITHUB_TOKEN
if (-not $token) {
    $token = $env:GH_TOKEN
}

if (-not $token) {
    throw "Set GITHUB_TOKEN or GH_TOKEN to a GitHub token with repository administration permission."
}

$parts = $Repository.Split("/")
if ($parts.Count -ne 2) {
    throw "Repository must be in owner/name form."
}

$owner = $parts[0]
$repo = $parts[1]
$uri = "https://api.github.com/repos/$owner/$repo/branches/$Branch/protection"

$headers = @{
    Accept = "application/vnd.github+json"
    Authorization = "Bearer $token"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$body = @{
    required_status_checks = @{
        strict = $true
        contexts = @(
            "Web app",
            "Firebase Functions"
        )
    }
    enforce_admins = $false
    required_pull_request_reviews = $null
    restrictions = $null
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Configured branch protection for ${Repository}:$Branch"
