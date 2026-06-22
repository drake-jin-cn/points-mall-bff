# points-mall-bff

> Unified BFF gateway — the **only entry point** for all frontend traffic. Aggregates requests to heterogeneous downstream services and encapsulates all cross-cutting concerns.

## Responsibilities

- **JWT Authentication** — issue access + refresh tokens on login; global `AuthGuard` validates every protected route
- **GitHub OAuth Relay** — redirect / callback flow proxied to ThirdPartyConnector
- **Request Aggregation** — compose responses from multiple downstream services into a single frontend-friendly payload
- **Rate Limiting** — fixed-window limiter keyed on User-ID + IP; blocks spam check-ins and duplicate order submissions
- **Unified Response Format** — `{ code, message, data, timestamp }` envelope on every response
- **Global Exception Filter** — maps all downstream errors and NestJS exceptions to standardized error codes
- **OpenAPI / Swagger** — auto-generated interactive docs at `/api-docs`
- **RabbitMQ Producer** — publishes domain events (`order_completed`, `points_issued`, `attendance_anomaly`) for async processing

## Why This Tech Stack

NestJS is the only Node.js framework that mirrors Spring Boot's architectural thinking: modules, decorators, dependency injection, and a CLI scaffold that enforces structure. For a BFF that aggregates multiple downstream services, this structure is essential — it keeps route handlers, guards, interceptors, and pipes all in their designated places without relying on team discipline.

TypeScript is non-negotiable at the BFF layer because the BFF is the contract boundary between frontend and backend. Typed request/response shapes catch mismatches at compile time rather than at 2 AM in production.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11, TypeScript 5.8 |
| Auth | Passport.js, `@nestjs/jwt`, bcrypt |
| Validation | class-validator, class-transformer, Zod (shared schema with frontend) |
| Cache | ioredis + Redis |
| Message Queue | amqplib (RabbitMQ producer) |
| HTTP Client | Axios (calls to downstream services) |
| Docs | `@nestjs/swagger` — auto-generated OpenAPI spec |
| Logging | Winston with structured JSON logs |

## Local Development

```bash
pnpm install
pnpm run start:dev
# API:     http://localhost:4000
# Swagger: http://localhost:4000/api-docs
```

## Key Environment Variables

```env
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
REDIS_URL=redis://localhost:6379
CORE_SERVICE_URL=http://localhost:8080
SHOP_SERVICE_URL=http://localhost:8081
MESSAGE_SERVICE_URL=http://localhost:8082
DATA_SERVICE_URL=http://localhost:8083
THIRDPARTY_SERVICE_URL=http://localhost:8084
RABBITMQ_URL=amqp://localhost:5672
```

## Architecture Note

All downstream services (`core`, `shop`, `message`, `data`, `thirdparty-connector`) communicate **only through this BFF**. No direct service-to-service calls exist in the system. This star topology keeps inter-service dependencies zero.
