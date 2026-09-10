# API Lucas Camargo Arquitetura

API administrativa Fastify responsável por autenticação, autorização, rascunhos, mídia, publicação, rollback e auditoria.

## Projetos relacionados

- `../lucas-camargo-arquitetura`: site público e Worker de conteúdo.
- `../admin-lucas-camargo-arquitetura`: painel administrativo Angular.

Este serviço não empacota nem serve o painel. O roteamento de produção expõe `/api/*` nesta API sob a mesma origem do admin. Temporariamente, a autenticação usa um JSON interno mantido no Secret Manager, nunca no frontend ou no Git. As senhas são armazenadas apenas como hash Argon2id e a sessão usa cookie `HttpOnly`, `Secure` e `SameSite=Strict`. O modo IAP permanece disponível para uma migração futura.

## Desenvolvimento

```powershell
yarn install --frozen-lockfile
yarn build
$env:NODE_ENV='development'
$env:AUTH_MODE='development'
$env:STORAGE_DRIVER='memory'
yarn start
```

A API escuta em `http://127.0.0.1:8080` e o health check fica em `/healthz`.

Para exercitar o login local em vez do acesso simplificado de desenvolvimento, gere o arquivo de credenciais e inicie a API em modo `credentials`:

```powershell
yarn credentials:create --output admin-credentials.json
$env:NODE_ENV='development'
$env:AUTH_MODE='credentials'
$env:STORAGE_DRIVER='memory'
$env:ADMIN_CREDENTIALS_JSON=Get-Content -Raw admin-credentials.json
yarn build
yarn start
```

O gerador sugere `nathanMercess` e `nathan66merces@gmail.com`, solicita e confirma a senha sem exibi-la e grava somente o hash. `admin-credentials.json` é ignorado pelo Git.

## Segredo de produção

Depois de gerar `admin-credentials.json`, crie o segredo usado pelo deploy na primeira configuração:

```powershell
gcloud secrets create lucas-admin-credentials --project=lucas-camargo-arq-prod --data-file=admin-credentials.json
```

Para trocar a senha posteriormente, gere outro arquivo e adicione uma versão:

```powershell
gcloud secrets versions add lucas-admin-credentials --project=lucas-camargo-arq-prod --data-file=admin-credentials.json
```

A conta de execução `lucas-admin-runtime@lucas-camargo-arq-prod.iam.gserviceaccount.com` precisa do papel `roles/secretmanager.secretAccessor` nesse segredo. Apague a cópia local quando não precisar mais dela.

## Validação

```powershell
yarn run check
```

O fixture em `test/fixtures/site-config.v1.json` mantém os testes de contrato independentes do checkout do site público. Alterações incompatíveis em `SiteConfigV1` exigem uma nova versão coordenada com o app e o admin.

As regras obrigatórias de implementação estão em `BOAS-PRATICAS.md`.
