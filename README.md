# BPMA App

Estrutura inicial de sistema web para controle de Boas Praticas em Manipulacao de Alimentos.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL

## Modulos criados

- Higienizacao de Hortifruti
- Controle de Temperatura de Equipamentos
- Controle de Oleo de Fritura
- Controle de Buffet / Amostras
- Plano de Limpeza

## Como rodar

```bash
npm install
cp .env.example .env
npm run prisma:generate
npx prisma migrate dev --name higienizacao_hortifruti
npm run dev
```

## Migration (Prisma + PostgreSQL)

Se preferir criar/aplicar a migration manualmente:

```bash
npx prisma migrate dev --name higienizacao_hortifruti
```

Para ambientes locais de teste rapido sem historico de migration:

```bash
npx prisma db push
```
# Projeto-BPMA 

## Autenticação - DEV Definitivo (Fase 1)

Para criar ou atualizar o usuário DEV administrativo definitivo (sem depender de seed), defina:

```bash
BPMA_DEV_ADMIN_NOME="Administrador BPMA"
BPMA_DEV_ADMIN_USUARIO="admin.bpma"
BPMA_DEV_ADMIN_SENHA="SuaSenhaSegura123"
```

Depois execute:

```bash
npm run auth:bootstrap-dev
```

Observações:
- o usuário criado/atualizado por esse comando é marcado como DEV definitivo
- DEV definitivo não pode ser inativado nem removido pela tela de usuários
- o seed padrão não cria mais usuários de teste automaticamente
