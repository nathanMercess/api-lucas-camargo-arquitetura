# Boas práticas obrigatórias

Este arquivo é a fonte de verdade para implementação, revisão e manutenção da API.

## Organização e TypeScript

- Organizar o código por feature e responsabilidade.
- Manter uma interface, type, enum ou classe de model por arquivo.
- Usar arquivos e pastas em `kebab-case`, UTF-8 e indentação de 2 espaços.
- Usar aspas simples e ponto e vírgula em TypeScript.
- Usar guard clauses e não usar chaves em `if` com uma única instrução.
- Manter requests, responses e conteúdo serializado estritamente tipados.
- Não criar abstrações, pastas ou exports preventivamente.

## API e segurança

- Tratar `SiteConfigV1` como contrato versionado entre app, admin, API e armazenamento.
- Validar o documento completo e suas relações antes de salvar ou publicar.
- Exigir ETag nas mutações de rascunho, publicação e rollback.
- Registrar mutações com ator, ação, recurso, request ID, resultado e ETags, sem tokens ou conteúdo integral.
- Manter buckets privados e credenciais R2 somente na API.
- Exigir IAP em produção, autorização no backend, origem exata e defesa CSRF.
- Não aceitar HTML, CSS ou JavaScript arbitrários no conteúdo.
- Publicar releases e mídias em chaves imutáveis e atualizar o manifest com escrita condicional.

## Qualidade

- Não manter código morto, dependências sem uso ou configurações obsoletas.
- Usar exclusivamente Yarn e não adicionar lockfiles de npm ou pnpm.
- Criar testes para services, validação, segurança e fluxos críticos.
- Antes de concluir, executar `yarn lint`, `yarn test` e `yarn build`, ou `yarn run check`.
