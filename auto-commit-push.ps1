# Auto commit and push script for Windows (PowerShell)
# Place this file in the repository root. Test by running it manually before scheduling.

Param(
    [string]$Branch = "main",
    [string]$Message = ""
)

$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $Repo

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not available in PATH. Install Git or ensure it's on PATH."
    exit 2
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "Auto-commit: $(Get-Date -Format o)"
}

Write-Output "Repository: $Repo"
Write-Output "Branch: $Branch"
Write-Output "Checking for changes..."

$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Output "Current branch: $currentBranch"
if ($currentBranch -ne $Branch) {
    Write-Output "Switching to branch $Branch"
    git checkout $Branch
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to checkout $Branch"; exit 3 }
}

git add -A
if ($LASTEXITCODE -ne 0) { Write-Error "git add failed"; exit 4 }

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Output "No changes to commit."
    exit 0
}

git -c user.name="Auto Bot" -c user.email="bot@example.com" commit -m "$Message"
if ($LASTEXITCODE -ne 0) { Write-Error "git commit failed"; exit 5 }

git push origin $Branch
if ($LASTEXITCODE -ne 0) { Write-Error "git push failed"; exit 6 }

Write-Output "Changes committed and pushed to origin/$Branch"
exit 0
