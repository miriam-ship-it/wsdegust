# =============================================================
# O e-mail do Auth vai sair, ou vai tomar 429?
#
# Este teste exercita o CAMINHO REAL — o endpoint /auth/v1/recover do
# Supabase, o mesmo serviço de e-mail que o convite usa e o mesmo contador de
# rate limit. Não simula nada.
#
# DOIS MODOS:
#
#   .\testa-envio-de-email.ps1
#       Modo SONDA (padrão). Bate no endpoint com um endereço que NÃO existe
#       em auth.users. O Supabase responde 200 sem mandar e-mail nenhum (ele
#       não revela se a conta existe), e responde 429 se estiver bloqueado.
#       Ou seja: descobre se está liberado sem gastar e-mail com ninguém.
#
#   .\testa-envio-de-email.ps1 -Enviar miriam@boomit.com.br
#       Modo REAL. Manda de verdade um e-mail de recuperação para esse
#       endereço. Use quando quiser a prova completa, lembrando que o SMTP
#       embutido do Supabase tem teto de 2 e-mails por hora.
#
# ⚠️ Sobre a sonda: ela não entrega e-mail (não há usuário), mas a requisição
#    em si pode contar no rate limit do projeto. Se você está com a cota
#    apertada, use com parcimônia — é uma requisição, não um envio.
#
# A chave usada é a anon, lida do próprio frontend/index.html para não existir
# uma segunda cópia dela por aqui. É a chave pública, a mesma que o formulário
# usa no navegador — nenhum segredo entra neste arquivo.
# =============================================================

param(
  [string]$Enviar = ""
)

$ErrorActionPreference = "Stop"

$raiz  = Split-Path -Parent $PSScriptRoot
$front = Join-Path $raiz "frontend\index.html"
if (-not (Test-Path $front)) { throw "Não achei $front — rode este script de dentro do repo." }

$html = Get-Content $front -Raw
if ($html -notmatch "SUPABASE_URL:\s*'([^']+)'")      { throw "Não achei SUPABASE_URL no frontend." }
$url = $Matches[1]
if ($html -notmatch "SUPABASE_ANON_KEY:\s*'([^']+)'") { throw "Não achei SUPABASE_ANON_KEY no frontend." }
$anon = $Matches[1]

if ($url -like "*SEU-PROJETO*") { throw "O frontend está com credencial de placeholder — nada para testar." }

if ($Enviar -ne "") {
  $alvo = $Enviar
  $modo = "REAL — vai mandar e-mail de verdade para $alvo"
} else {
  # endereço que não existe em auth.users: o Supabase responde 200 e não envia
  $alvo = "sonda-nao-existe-$(Get-Random)@boomit.com.br"
  $modo = "SONDA — nenhum e-mail é entregue (não há usuário com este endereço)"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Teste de envio de e-mail do Supabase Auth" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Projeto: $url"
Write-Host " Modo:    $modo"
Write-Host ""

$corpo = @{ email = $alvo } | ConvertTo-Json -Compress
$inicio = Get-Date

try {
  $resposta = Invoke-WebRequest -Method POST -Uri "$url/auth/v1/recover" `
    -Headers @{ "apikey" = $anon; "Authorization" = "Bearer $anon"; "Content-Type" = "application/json" } `
    -Body $corpo -UseBasicParsing
  $status = [int]$resposta.StatusCode
  $texto  = $resposta.Content
} catch {
  $r = $_.Exception.Response
  if ($null -eq $r) { throw }
  $status = [int]$r.StatusCode
  $leitor = New-Object System.IO.StreamReader($r.GetResponseStream())
  $texto  = $leitor.ReadToEnd()
}

$ms = [int]((Get-Date) - $inicio).TotalMilliseconds
Write-Host " HTTP $status  (${ms}ms)"
if ($texto) { Write-Host " Resposta: $texto" -ForegroundColor DarkGray }
Write-Host ""

switch ($status) {
  200 {
    if ($Enviar -ne "") {
      Write-Host " PASSOU: o e-mail foi aceito e disparado para $alvo." -ForegroundColor Green
      Write-Host " Confira a caixa (e o spam). Se nao chegar, o problema e a"    -ForegroundColor Green
      Write-Host " entrega do SMTP, nao o Supabase — ele aceitou." -ForegroundColor Green
    } else {
      Write-Host " PASSOU: o servico de e-mail esta liberado agora." -ForegroundColor Green
      Write-Host " Nenhum e-mail foi entregue: o endereco da sonda nao existe." -ForegroundColor Green
      Write-Host " Um convite feito agora deve sair." -ForegroundColor Green
    }
    exit 0
  }
  429 {
    Write-Host " FALHOU: rate limit. O servico de e-mail esta bloqueado agora." -ForegroundColor Red
    Write-Host ""
    Write-Host " O SMTP embutido do Supabase e para teste: teto de 2 e-mails por" -ForegroundColor Yellow
    Write-Host " hora, em janela deslizante — nao zera na virada da hora." -ForegroundColor Yellow
    Write-Host " Saidas: esperar, ou configurar SMTP proprio (a caixa" -ForegroundColor Yellow
    Write-Host " envio@boomit.com.br, que a edge function ja usa) em:" -ForegroundColor Yellow
    Write-Host " $url  ->  Authentication  ->  Emails  ->  SMTP Settings" -ForegroundColor Yellow
    exit 1
  }
  422 {
    Write-Host " FALHOU: o Supabase recusou o endereco (422)." -ForegroundColor Red
    Write-Host " Costuma ser e-mail malformado ou provedor de e-mail desligado." -ForegroundColor Yellow
    exit 1
  }
  default {
    Write-Host " INESPERADO: HTTP $status. Veja a resposta acima e os logs de" -ForegroundColor Red
    Write-Host " Authentication no painel do Supabase." -ForegroundColor Red
    exit 1
  }
}
