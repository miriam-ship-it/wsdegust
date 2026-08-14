# Setup do repositório no GitHub · PowerShell

Passo-a-passo para criar o repo no GitHub e fazer o primeiro push via PowerShell.

## Pré-requisitos

1. **Git instalado** (https://git-scm.com/download/win — Next, Next, Finish)
2. **Conta GitHub** (você já tem)
3. **PowerShell** (já vem no Windows)

Confira o Git:

```powershell
git --version
# deve mostrar algo como: git version 2.42.0.windows.1
```

## Passo 1 · Criar o repo vazio no GitHub

1. Vá em https://github.com/new
2. **Repository name:** `ibmec-assessment`
3. **Description:** `Diagnóstico Estratégico de Liderança IBMEC · Junho 2026`
4. **Visibility:** Private (recomendado — contém docs internas)
5. **NÃO marcar** "Add a README", "Add .gitignore" ou "Choose a license" — vamos subir tudo da pasta local
6. **Create repository**
7. Na tela seguinte, copie a URL HTTPS (algo como `https://github.com/seu-usuario/ibmec-assessment.git`)

## Passo 2 · Configurar Git (uma vez só)

No PowerShell:

```powershell
git config --global user.name "Miriam"
git config --global user.email "miriam@boomit.com.br"
```

## Passo 3 · Baixar a pasta do projeto

A pasta `repo-ibmec-assessment` está nas saídas desta sessão Cowork. Você precisa:

1. Salvar a pasta inteira no seu PC (ex: `C:\Projetos\ibmec-assessment\`)
2. Abrir PowerShell nesse diretório:

```powershell
cd C:\Projetos\ibmec-assessment
```

## Passo 4 · Inicializar Git e fazer primeiro push

```powershell
# Inicializa repo local
git init
git branch -M main

# Adiciona todos os arquivos (respeitando .gitignore)
git add .

# Primeiro commit
git commit -m "feat: initial scaffold (frontend + supabase + brand ibmec)"

# Conecta com o repo remoto do GitHub
git remote add origin https://github.com/SEU-USUARIO/ibmec-assessment.git

# Push inicial
git push -u origin main
```

Na primeira vez vai pedir login no GitHub — abre uma janela do browser; aceite e está conectado.

## Passo 5 · Verificar no GitHub

Recarregue a página do repo no GitHub. Você deve ver toda a estrutura:

```
ibmec-assessment/
├── README.md
├── SETUP.md
├── frontend/
├── supabase/
├── brand-ibmec/
├── docs/
└── scripts/
```

## Daqui em diante · fluxo de trabalho

Sempre que mudar algum arquivo:

```powershell
git add .
git commit -m "fix: descreva o que mudou"
git push
```

Para baixar mudanças que eu (ou outra pessoa) fez no repo:

```powershell
git pull
```

## Branches (opcional, para mudanças experimentais)

```powershell
# Cria branch nova
git checkout -b feature/admin-csv

# trabalha, faz commits...
git push -u origin feature/admin-csv

# Abre Pull Request no GitHub para revisar antes de mergear
```

## Conectar Netlify ao repo (opcional, mas recomendado)

Depois do push inicial:

1. Em [app.netlify.com](https://app.netlify.com) → **Add new site > Import from Git**
2. Selecione GitHub → autorize → escolha `ibmec-assessment`
3. **Base directory:** `frontend`
4. **Build command:** (deixe vazio)
5. **Publish directory:** `frontend`
6. Deploy

A partir daí, todo `git push` na main faz redeploy automático no Netlify. Você nunca mais precisa arrastar arquivo no Netlify Drop.

---

## Problemas comuns

**Erro de autenticação no push:**
GitHub não aceita mais senha — só Personal Access Token (PAT) ou GitHub Desktop. Se aparecer erro, use GitHub Desktop ou crie um PAT em Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new.

**Pasta `node_modules` ou `.env` aparecendo no commit:**
Verifique se `.gitignore` está na raiz do repo (não dentro de subpasta). Se já commitou por engano:
```powershell
git rm -r --cached node_modules
git commit -m "chore: remove node_modules from tracking"
```

**Push gigante (>100MB):**
Algum arquivo muito grande passou. Veja com `git ls-files | xargs ls -la` e adicione no `.gitignore`.
