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
