# Contributing to Grande&Gordo

## Branch Strategy

- `main` — production-ready code; protected, merge via PR only
- `develop` — integration branch for features
- Feature branches: `feat/short-description`
- Bug fixes: `fix/short-description`

## Workflow

1. Branch from `develop` (or `main` for hotfixes)
2. Make changes with focused commits
3. Open a PR to `develop`
4. CI must pass (typecheck + lint + tests)
5. One approval required before merge

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Kling video generation worker
fix: handle fal.ai timeout on LoRA training
chore: update stripe SDK to v14
```

## Code Standards

- TypeScript strict mode — no `any`, no unchecked index access
- All async code must handle errors explicitly
- New services need at least one integration test
- Env vars go through `src/lib/config.ts` — never `process.env` directly

## Running Checks Locally

```bash
npm run ci       # typecheck + lint + tests (same as CI)
npm test         # tests only
npm run lint:fix # auto-fix lint issues
```

## Secrets & Credentials

- Never commit `.env` files or real credentials
- Use `.env.example` to document new variables
- Rotate any secrets accidentally committed immediately
