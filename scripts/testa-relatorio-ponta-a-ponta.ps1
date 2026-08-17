# =============================================================
# O relatório chega, e chega com a marca certa?
#
# Percorre o CAMINHO REAL, do jeito que o formulário faz:
#   1. acha o evento pelo slug
#   2. cria um respondente com token gerado no cliente, mandando o cabeçalho
#      x-sessao — o que também exercita a RLS por sessão
#   3. chama a edge function gate-and-send, que gera o PDF e envia o e-mail
#
# ⚠️ ISTO ENVIA UM E-MAIL DE VERDADE e grava um respondente de verdade no
#    evento. O respondente nasce com nome "TESTE ..." para ser reconhecível, e
#    o -Limpar apaga tudo depois (respostas e relatório vão junto, por cascade).
#
# Uso:
#   .\testa-relatorio-ponta-a-ponta.ps1
#   .\testa-relatorio-ponta-a-ponta.ps1 -Email outra@boomit.com.br
#   .\testa-relatorio-ponta-a-ponta.ps1 -Evento ibmec-junho-2026
#
# O que conferir no e-mail que chegar (evento da Boomit):
#   remetente  Diagnostico Boomit
#   assunto    Diagnostico Boomit · TESTE ...
#   anexo      diagnostico-boomit-teste-....pdf
#   o PDF      verde #545E54 e creme, fonte Inter, sem nada de IBMEC
# =============================================================

param(
  [string]$Email  = "miriam@boomit.com.br",
  [string]$Evento = "boomit-degustacao",
  [ValidateSet("integrado","latente","evolutivo","fluido")]
  [string]$Perfil = "integrado",
  [switch]$Limpar
)

$ErrorActionPreference = "Stop"

$raiz  = Split-Path -Parent $PSScriptRoot
$front = Join-Path $raiz "frontend\index.html"
$html  = Get-Content $front -Raw
if ($html -notmatch "SUPABASE_URL:\s*'([^']+)'")      { throw "Nao achei SUPABASE_URL" }
$url = $Matches[1]
if ($html -notmatch "SUPABASE_ANON_KEY:\s*'([^']+)'") { throw "Nao achei SUPABASE_ANON_KEY" }
$anon = $Matches[1]

$token = [guid]::NewGuid().ToString()
$carimbo = Get-Date -Format "HHmm"
$nome  = "TESTE $carimbo $Perfil"

$hAnon = @{ "apikey" = $anon; "Authorization" = "Bearer $anon"; "Content-Type" = "application/json" }

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Teste ponta a ponta do relatorio" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Evento:  $Evento"
Write-Host " E-mail:  $Email   (vai receber de verdade)"
Write-Host " Sessao:  $token"
Write-Host ""

# --- 1. o evento ---
$ev = Invoke-RestMethod -Method GET -Headers $hAnon `
  -Uri "$url/rest/v1/eventos?slug=eq.$Evento&ativo=eq.true&select=id,cliente"
if (-not $ev) { throw "Evento '$Evento' nao encontrado ou inativo." }
$eventoId = $ev[0].id
Write-Host "[1/3] Evento encontrado: $($ev[0].cliente)  ($eventoId)" -ForegroundColor Green

# --- 2. o respondente, com o cabecalho da sessao (mesma coisa que o front faz) ---
$hSessao = $hAnon.Clone()
$hSessao["x-sessao"] = $token
$hSessao["Prefer"]   = "return=representation"

$corpoResp = @{
  evento_id = $eventoId; token_sessao = $token; nome = $nome; empresa = "Boomit"
  cargo = "Teste automatizado"; persona = "G"; tamanho = "S3"; segmento = "V5"
  consentimento_lgpd = $true; versao_questionario = "q-v1.0"
} | ConvertTo-Json -Compress

$novo = Invoke-RestMethod -Method POST -Headers $hSessao -Body $corpoResp -Uri "$url/rest/v1/respondentes"
if (-not $novo) { throw "O RETURNING veio vazio — a policy de SELECT nao reconheceu o cabecalho x-sessao." }
$respondenteId = $novo[0].id
Write-Host "[2/3] Respondente criado e devolvido pelo RETURNING: $respondenteId" -ForegroundColor Green
Write-Host "      (isso prova que a RLS por token esta funcionando)" -ForegroundColor DarkGray

# --- os scores que produzem cada arquetipo ---
# gap = pessoa - empresa. A classificacao conta gaps acima de +0.7 e abaixo de
# -0.7: 3 ou mais positivos -> Potencial Latente; 3 ou mais negativos -> Perfil
# Evolutivo; no maximo 1 no total -> Integrado; o resto -> Perfil Fluido.
function dim([double]$pessoa, [double]$empresa) {
  @{ pessoa = $pessoa; empresa = $empresa; media = [math]::Round(($pessoa + $empresa) / 2, 2); gap = [math]::Round($pessoa - $empresa, 2) }
}
$conjuntos = @{
  # autoimagem acima da leitura da empresa em 4 dimensoes
  latente   = @{ D1 = (dim 4.4 3.0); D2 = (dim 4.2 2.8); D3 = (dim 4.0 2.9); D4 = (dim 4.2 3.1); D5 = (dim 3.4 3.2) }
  # autoimagem abaixo do que os cenarios mediram em 4 dimensoes
  evolutivo = @{ D1 = (dim 2.8 4.2); D2 = (dim 2.6 4.0); D3 = (dim 3.0 4.1); D4 = (dim 2.9 4.0); D5 = (dim 3.3 3.5) }
  # tudo colado: nenhum gap significativo
  integrado = @{ D1 = (dim 3.6 3.5); D2 = (dim 3.2 3.3); D3 = (dim 3.8 3.7); D4 = (dim 4.0 3.9); D5 = (dim 3.0 3.2) }
  # alterna de direcao: dois acima, dois abaixo
  fluido    = @{ D1 = (dim 4.3 3.0); D2 = (dim 2.7 4.0); D3 = (dim 4.2 3.1); D4 = (dim 2.8 4.1); D5 = (dim 3.5 3.4) }
}
$scores = $conjuntos[$Perfil]
$esperado = @{ latente = 'Potencial Latente'; evolutivo = 'Perfil Evolutivo'; integrado = 'Integrado'; fluido = 'Perfil Fluido' }[$Perfil]
Write-Host " Perfil:  $Perfil  ->  o relatorio deve dizer '$esperado'" -ForegroundColor Cyan
Write-Host ""

# --- 3. a funcao: gera PDF e envia ---
$corpoGate = @{
  token = $token; email = $Email; consentimento_marketing = $false
  maturidade_letra = "B"; maturidade_score = 64; risco_estrategico = 48
  cdl_min = 180000; cdl_max = 780000
  scores_json = @{
    scoreGeral = 3.2
    scores = $scores
    identificacao = @{ nome = $nome; empresa = "Boomit" }
  }
} | ConvertTo-Json -Depth 6 -Compress

Write-Host "[3/3] Chamando gate-and-send (gera PDF no Browserless e envia)..." -ForegroundColor Yellow
$inicio = Get-Date
$r = Invoke-RestMethod -Method POST -Headers $hAnon -Body $corpoGate -Uri "$url/functions/v1/gate-and-send"
$seg = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)

Write-Host ""
if ($r.ok -and $r.email_enviado) {
  Write-Host " PASSOU em ${seg}s — PDF gerado e e-mail enviado para $Email" -ForegroundColor Green
  if ($r.pdf_url) { Write-Host " PDF tambem disponivel por link assinado (90 dias)." -ForegroundColor DarkGray }
  Write-Host ""
  Write-Host " Confira na caixa de entrada:" -ForegroundColor Cyan
  Write-Host "   remetente  Diagnostico $($ev[0].cliente)"
  Write-Host "   anexo      diagnostico-$($ev[0].cliente.ToLower())-*.pdf"
  Write-Host "   o PDF      na paleta do cliente, sem mencao ao outro"
} elseif ($r.ok) {
  Write-Host " PARCIAL em ${seg}s — relatorio gravado, mas o E-MAIL NAO SAIU." -ForegroundColor Yellow
  Write-Host " Veja os logs da funcao: erro no Brevo ou no Browserless." -ForegroundColor Yellow
} else {
  Write-Host " FALHOU: $($r.error)" -ForegroundColor Red
}

Write-Host ""
Write-Host " respondente_id: $respondenteId"
if ($Limpar) {
  $hAdmin = $hAnon.Clone()
  $hAdmin["x-sessao"] = $token
  Invoke-RestMethod -Method DELETE -Headers $hAdmin -Uri "$url/rest/v1/respondentes?id=eq.$respondenteId" | Out-Null
  Write-Host " -Limpar: tentativa de remocao enviada." -ForegroundColor DarkGray
  Write-Host " (anon nao tem DELETE por design — se sobrar, apague pelo painel do Supabase)" -ForegroundColor DarkGray
} else {
  Write-Host " Para remover depois: rode de novo com -Limpar, ou apague pelo painel." -ForegroundColor DarkGray
}
Write-Host ""
