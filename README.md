# Grande&Gordo

> One studio session. Unlimited on-brand assets.

Grande&Gordo trains a proprietary Flux LoRA from a single product shoot, then generates unlimited photos and videos on demand — eliminating repeated, expensive studio days for mid-market ecommerce brands.

## Architecture Overview

```
Client Brief (WhatsApp/Email/Slack)
        │
        ▼
  Brief Worker ──► Stripe Checkout
                         │
                         ▼
                  LoRA Training (fal.ai)
                         │
                         ▼
              Image/Video Generation (Flux + Kling)
                         │
                         ▼
               Automated QA (GPT-4V)
                         │
                         ▼
              Asset Delivery (Cloudflare R2)
                         │
                         ▼
                Client Email (Resend)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript |
| HTTP Server | Fastify |
| Job Queue | BullMQ + Redis |
| ML Training & Inference | fal.ai (Flux LoRA, Kling) |
| Image QA | OpenAI GPT-4V |
| Payments | Stripe |
| Storage | Cloudflare R2 |
| Client Management | Airtable |
| Email | Resend |

## Prerequisites

- Node.js 20+
- npm 10+
- Redis (for job queues)
- Accounts: Stripe, fal.ai, OpenAI, Cloudflare R2, Airtable, Resend

## Setup

```bash
# 1. Clone
git clone <repo-url>
cd grande-gordo

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in all values in .env — see .env.example for docs

# 4. Start Redis (if not running)
docker run -d -p 6379:6379 redis:7-alpine

# 5. Run in development mode
npm run dev
```

The server starts at `http://localhost:3000`. Check `/health` to confirm it's up.

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm run format` | Format with Prettier |
| `npm test` | Run tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run ci` | Full CI check (typecheck + lint + test) |

## Project Structure

```
src/
├── api/
│   └── routes/       # Fastify route handlers
├── workers/          # BullMQ job processors
├── services/         # Business logic (fal.ai, R2, Airtable, etc.)
├── lib/
│   └── config.ts     # Typed env var validation
├── types/
│   └── index.ts      # Shared domain types
├── test/
│   └── setup.ts      # Vitest global setup
└── server.ts         # Entry point
```

## Environment Variables

See `.env.example` for a full list with descriptions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
