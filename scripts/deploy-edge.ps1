# =============================================
# Deploy da Edge Function gate-and-send
# IBMEC Assessment · PowerShell
# =============================================
#
# Uso:
#   1. Abra PowerShell na raiz do repo
#   2. .\scripts\deploy-edge.ps1
#
# Pré-requisitos:
#   - Node.js 18+ instalado (https://nodejs.org)
#   - Supabase CLI instalada (npm install -g supabase)
#   - Login feito (supabase login)
#   - Project linkado (supabase link --project-ref SEU-REF)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Deploy Edge Function · gate-and-send ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica Supabase CLI
try {
    $version = supabase --version 2>$null
    Write-Host "Supabase CLI: $version" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Supabase CLI não encontrada." -ForegroundColor Red
    Write-Host "Instale com: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# 2. Verifica se está logado
$loginStatus = supabase projects list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Você não está logado no Supabase." -ForegroundColor Red
    Write-Host "Execute: supabase login" -ForegroundColor Yellow
    exit 1
}
Write-Host "Login OK" -ForegroundColor Green

# 3. Verifica se o projeto está linkado
if (-not (Test-Path ".\supabase\.temp\project-ref")) {
    Write-Host "AVISO: Projeto não linkado." -ForegroundColor Yellow
    Write-Host "Execute primeiro:" -ForegroundColor Yellow
    Write-Host "  supabase link --project-ref SEU-PROJECT-REF" -ForegroundColor White
    Write-Host ""
    $ref = Read-Host "Cole seu Project Ref agora (ou Enter para abortar)"
    if ([string]::IsNullOrWhiteSpace($ref)) { exit 1 }
    supabase link --project-ref $ref
}

# 4. Deploy
Write-Host ""
Write-Host "Deployando gate-and-send..." -ForegroundColor Cyan
supabase functions deploy gate-and-send --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Deploy concluído com sucesso ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Cyan
    Write-Host "  1. Configure os secrets em Supabase Dashboard > Edge Functions > Manage Secrets"
    Write-Host "     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_NAME, FROM_EMAIL, BROWSERLESS_TOKEN"
    Write-Host "  2. Teste a função com curl ou Postman"
    Write-Host "  3. Edite frontend/index.html com Project URL + anon key"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=== Deploy falhou ===" -ForegroundColor Red
    Write-Host "Verifique mensagens acima e tente novamente." -ForegroundColor Yellow
    exit 1
}
