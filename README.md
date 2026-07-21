# API Lucas Camargo Arquitetura

API administrativa Fastify responsável por autenticação, autorização, rascunhos, mídia, publicação, rollback e auditoria.

## Projetos relacionados

- `../lucas-camargo-arquitetura`: site público e Worker de conteúdo.
- `../admin-lucas-camargo-arquitetura`: painel administrativo Angular.

Este serviço não empacota nem serve o painel. O roteamento de produção deve expor `/api/*` nesta API sob a mesma origem do admin, mantendo IAP, autorização no backend, origem exata e defesa CSRF.

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

## Validação

```powershell
yarn run check
```

O fixture em `test/fixtures/site-config.v1.json` mantém os testes de contrato independentes do checkout do site público. Alterações incompatíveis em `SiteConfigV1` exigem uma nova versão coordenada com o app e o admin.

As regras obrigatórias de implementação estão em `BOAS-PRATICAS.md`.
