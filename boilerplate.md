# Architecture Reference Boilerplate

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Go + Echo | Lightweight, performant, simple deployment |
| Frontend | Next.js 15 App Router + TailwindCSS | SSR, App Router, PWA-capable |
| Database | PostgreSQL | Relational, reliable, indexed queries |
| Message Queue | RabbitMQ (`rabbitmq:3-management-alpine`) | Burst handling, durable queues, dead-letter |
| Distributed Tracing | Jaeger | Span per layer, OTLP/UDP export |
| ORM | `jmoiron/sqlx` | Thin wrapper, parameterized queries |
| Auth | JWT + bcrypt (cost=12) + per-user salt | Stateless, secure password storage |
| Deployment | rsync + pm2 + ngrok | Home server, no cloud needed |
| Dev infra | docker-compose | Local PostgreSQL + RabbitMQ + Jaeger |

---

## Communication Architecture

| Protocol | Used | Reason |
|----------|------|--------|
| REST | ✅ | Standard, browser-native |
| SSE | ✅ | Real-time push to staff, simpler than WebSocket |
| RabbitMQ | ✅ | Burst traffic → processed serially via durable queue |
| Web Push | ✅ | OS-level notifications (mobile + desktop); requires PWA on iOS |
| gRPC | ❌ | Browser cannot call gRPC directly |
| GraphQL | ❌ | Overkill for well-defined domain |
| WebSocket | ❌ | SSE sufficient; push is unidirectional |
| Kafka | ❌ | Overkill for single-tenant |

---

## Monorepo Structure

```
<project>/
├── backend/                    # Go + Echo
│   ├── cmd/server/main.go
│   ├── cmd/migrate/main.go
│   ├── internal/
│   │   ├── config/config.go
│   │   ├── domain/             # Pure entities + enums + interfaces
│   │   ├── resource/           # Data access (sqlx + RabbitMQ)
│   │   ├── usecase/            # Business logic + worker + SSE notifier
│   │   ├── handler/            # HTTP + SSE handlers
│   │   ├── middleware/         # request_id, JWT, rate-limiter, CORS, tracing
│   │   └── router/router.go
│   ├── util/
│   │   ├── logger.go                    # LoggerStruct pattern
│   │   ├── error_wrapper/
│   │   │   └── error_wrapper.go         # ErrorWrapper + NewError + captureStack
│   │   └── validator.go                 # ParseAndValidate[T] + ValidateStruct
│   ├── migrations/
│   ├── go.mod
│   └── config.example.yaml
│
├── frontend/                   # Next.js 15 App Router
│   ├── public/
│   │   └── sw.js               # Service worker — handles Web Push events
│   ├── app/
│   │   ├── api/[...path]/route.ts  # Proxy → backend :3001
│   │   ├── (auth)/login/
│   │   ├── (role-a)/           # Route group per user role
│   │   ├── (role-b)/
│   │   └── (admin)/
│   ├── components/
│   │   ├── ui/             # Stateless primitives (Button, Input, Table, Modal…)
│   │   ├── layout/         # AppShell, PageHeader, SectionCard
│   │   └── <domain>/       # Feature composites built from ui/ primitives
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useApi.ts
│   │   ├── useSse.ts
│   │   ├── useNotifications.ts
│   │   └── usePushNotifications.ts
│   ├── lib/
│   │   ├── api.ts
│   │   └── request-id.ts
│   ├── store/                  # Zustand stores
│   ├── types/                  # Shared TypeScript types
│   │   └── api.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   └── globals.css
│   ├── middleware.ts            # Role-based route protection
│   └── next.config.js
│
├── pm2.config.js               # <api-process> + <web-process> + ngrok
├── Makefile
└── docker-compose.yml
```

---

## Backend Layer Pattern

```
Handler (HTTP/SSE)
  └─ Usecase (business logic)        ← depends on domain interfaces only
       ├─ Domain (entities, enums, interfaces)
       └─ Resource (PostgreSQL via sqlx + RabbitMQ)   ← implements domain interfaces
            └─ worker goroutine
                 └─ SSE Notifier → clients
```

**Rule:** `context.Context` is passed unbroken through every layer — Handler → Usecase → Domain → Service (if any) → Resource — on every call so `request_id` is always propagated.

- `domain/` — struct + enum, no DB concern; **defines interfaces** for usecase and resource
- `resource/` — implements domain repository interfaces; SQL via sqlx (parameterized); RabbitMQ publisher/consumer
- `usecase/` — implements domain usecase interfaces; orchestration + business rules; depends only on domain interfaces, never on resource structs directly
- `handler/` — depends only on usecase interfaces; parse request, call usecase, return JSON envelope
- `middleware/` — JWT, CORS, request_id generation, rate limiter per IP, Jaeger tracing

---

## API Versioning

All backend routes must be prefixed with `/api/v1/`.

```go
// router/router.go
v1 := e.Group("/api/v1")
v1.POST("/users", userHandler.Register)          // public

protected := v1.Group("", jwtMiddleware)
protected.GET("/users/:id", userHandler.GetUser) // protected
```

When a breaking change is required, introduce `/api/v2/` as a parallel group — never modify v1 contracts in-place. `/api/v1/` and `/api/v2/` coexist until v1 clients are migrated.

---

## SOLID Design Principles (Mandatory)

All backend code **must** follow SOLID principles. No exceptions.

### Interface-Driven Layer Communication

**No direct struct dependency across layers.** Every cross-layer call must go through an interface defined in `domain/`.

```go
// domain/user.go — interface defined in domain, implemented elsewhere
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Create(ctx context.Context, u *User) error
}

type UserUsecase interface {
    GetUser(ctx context.Context, id string) (*User, error)
    RegisterUser(ctx context.Context, input RegisterInput) (*User, error)
}
```

```go
// resource/user_resource.go — implements domain.UserRepository
type userResource struct{ db *sqlx.DB }

func NewUserResource(db *sqlx.DB) domain.UserRepository {
    return &userResource{db: db}
}
```

```go
// usecase/user_usecase.go — depends on domain.UserRepository, not on resource struct
type userUsecase struct{ repo domain.UserRepository }

func NewUserUsecase(repo domain.UserRepository) domain.UserUsecase {
    return &userUsecase{repo: repo}
}
```

```go
// handler/user_handler.go — depends on domain.UserUsecase, not on usecase struct
type UserHandler struct{ uc domain.UserUsecase }

func NewUserHandler(uc domain.UserUsecase) *UserHandler {
    return &UserHandler{uc: uc}
}
```

**Wiring only happens in `cmd/server/main.go`** — that is the only place where concrete types are instantiated and injected.

---

## Middleware Stack (Echo — order matters)

1. **Recover** — catch panics, log stack trace, return `500` — must be outermost
2. **RequestID** — generate UUID v4 if `X-Request-ID` header absent; inject into `echo.Context` key `"request_id"`
3. **Jaeger Tracing** — start span per request
4. **Rate Limiter** — 100 req/min default; 10 req/min for auth endpoints (`golang.org/x/time/rate`)
5. **CORS** — allow Next.js origin (localhost:3000 + ngrok URL)
6. **Logger** — log each request with request_id + processed_time

**JWT Auth is NOT in the global stack.** It is applied as route-level middleware only on protected groups. Public routes (`/login`, `/register`, `/health`) must not have it.

```go
// router/router.go
v1 := e.Group("/api/v1")
v1.POST("/auth/login", authHandler.Login)       // public
v1.POST("/auth/register", authHandler.Register)  // public

protected := v1.Group("", jwtMiddleware)
protected.GET("/users/:id", userHandler.GetUser) // protected
```

Panic recovery must wrap everything so no unhandled panic escapes to the process level.

```go
func RequestIDMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        requestID := c.Request().Header.Get("X-Request-ID")
        if requestID == "" {
            requestID = uuid.New().String()
        }
        c.Set("request_id", requestID)
        c.Response().Header().Set("X-Request-ID", requestID)
        return next(c)
    }
}
```

---

## Input Validation

**Validation happens exclusively at the handler layer.** Usecases and resources trust the input passed to them — they must not re-validate.

Validation errors must return `400 Bad Request`. Never return `500` for a validation failure.

```go
// util/validator.go
var validate = validator.New()

func ValidateStruct(v any) error {
    return validate.Struct(v)
}

func ParseAndValidate[T any](payload any) (*T, error) {
    var target T
    data, err := json.Marshal(payload)
    if err != nil {
        return nil, err
    }
    if err := json.Unmarshal(data, &target); err != nil {
        return nil, err
    }
    if err := validate.Struct(target); err != nil {
        return nil, err
    }
    return &target, nil
}
```

Usage in handler:

```go
func (h *UserHandler) Register(c echo.Context) error {
    var body map[string]any
    if err := c.Bind(&body); err != nil {
        return errorJSON(c, error_wrapper.NewError(400, "ERR-H-01", "invalid request body", err))
    }
    input, err := util.ParseAndValidate[domain.RegisterInput](body)
    if err != nil {
        return errorJSON(c, error_wrapper.NewError(400, "ERR-H-01", err.Error(), err))
    }
    // pass validated input to usecase only after this point
}
```

Struct tags use `validate:"required,min=3"` from `github.com/go-playground/validator/v10`. All input structs are defined in `domain/` alongside their entity.

---

## Traceability: START / FINISH / processed_time

Every handler, usecase, and resource function logs START and FINISH with processed_time.

```go
func (h *XxxHandler) Action(c echo.Context) error {
    start := time.Now()
    util.Logger(c.Request().Context(), "XxxHandler.Action").Info("START")

    // ...

    util.Logger(c.Request().Context(), "XxxHandler.Action").
        Info("FINISH", fmt.Sprintf("processed_time=%dms", time.Since(start).Milliseconds()))
    return c.JSON(200, response)
}
```

---

## Logging: LoggerStruct Pattern

```go
// util/logger.go
type LoggerStruct struct {
    caller    string
    requestId interface{}
}

func Logger(ctx context.Context, caller string) *LoggerStruct {
    return &LoggerStruct{
        requestId: ctx.Value("request_id"),
        caller:    caller,
    }
}

func (l *LoggerStruct) Info(message ...any) *LoggerStruct { ... }
func (l *LoggerStruct) Struct(message interface{}) *LoggerStruct { ... }
func (l *LoggerStruct) Error(errW *error_wrapper.ErrorWrapper) *LoggerStruct { ... }
```

Context must be passed to every layer so `request_id` is always available in logs.

---

## Error Code Structure

Format: `ERR-{LAYER}-{NUMBER}`

| Layer | Prefix | Examples |
|-------|--------|---------|
| Handler | H | `ERR-H-01` (bad request), `ERR-H-02` (unauthorized) |
| Usecase | U | `ERR-U-01` (not found), `ERR-U-02` (conflict) |
| Domain | D | `ERR-D-01` (invalid status transition) |
| Resource | R | `ERR-R-01` (db query failed), `ERR-R-02` (mq publish failed) |

Error payload must carry: `actual_error`, `error_code`, `status_code`, `stack_trace`.

---

## Auth: JWT + bcrypt + salt

- Login endpoint: credential-based (identifier + password)
- bcrypt cost=12 + per-user salt (generated via `crypto/rand`, stored in `password_salt` column)
- JWT (24h expiry), sent via `Authorization: Bearer <token>`
- Next.js `middleware.ts` redirects to `/login` if no token in cookie
- `password_salt` column added to users table

---

## Environment Config

Config is loaded from a YAML file at startup into a typed struct. **`os.Getenv` must not be called anywhere in the codebase** — only inside the config loader itself.

```yaml
# config.yaml (gitignored — provide config.example.yaml with placeholder values)
server:
  port: 3001
  env: development

database:
  host: localhost
  port: 5432
  name: <project>_db
  user: <user>
  password: <pass>

jwt:
  secret: <secret>
  expiry_hours: 24

rabbitmq:
  url: amqp://<user>:<pass>@localhost:5672/

jaeger:
  endpoint: localhost:6831

vapid:
  public_key: <base64url-encoded-public-key>   # generated once; safe to expose to browser
  private_key: <base64url-encoded-private-key> # keep secret; never commit
  subject: mailto:admin@example.com
```

```go
// internal/config/config.go
type VAPIDConfig struct {
    PublicKey  string `yaml:"public_key"`
    PrivateKey string `yaml:"private_key"`
    Subject    string `yaml:"subject"`
}

type Config struct {
    Server   ServerConfig   `yaml:"server"`
    Database DatabaseConfig `yaml:"database"`
    JWT      JWTConfig      `yaml:"jwt"`
    RabbitMQ RabbitMQConfig `yaml:"rabbitmq"`
    Jaeger   JaegerConfig   `yaml:"jaeger"`
    VAPID    VAPIDConfig    `yaml:"vapid"`
}

func Load(path string) (*Config, error) {
    f, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("config: read file: %w", err)
    }
    var cfg Config
    if err := yaml.Unmarshal(f, &cfg); err != nil {
        return nil, fmt.Errorf("config: parse yaml: %w", err)
    }
    return &cfg, nil
}
```

Config is loaded once in `cmd/server/main.go` and injected via dependency injection. **Never store config in a global variable.**

---

## Distributed Tracing: Jaeger

- Each layer creates a child span
- Span name format: `{layer}.{function}` — e.g., `handler.Checkin`, `usecase.CreateSession`
- `request_id` injected as span tag
- Export via OTLP gRPC (:4317) or UDP agent (:6831)

```yaml
# docker-compose.yml
jaeger:
  image: jaegertracing/all-in-one:1.57
  ports:
    - "16686:16686"   # UI
    - "6831:6831/udp" # UDP agent
    - "4317:4317"     # OTLP gRPC
```

---

## Message Queue: RabbitMQ

```yaml
# docker-compose.yml
rabbitmq:
  image: rabbitmq:3-management-alpine
  ports:
    - "5672:5672"
    - "15672:15672"
  environment:
    RABBITMQ_DEFAULT_USER: <user>
    RABBITMQ_DEFAULT_PASS: <pass>
```

- Exchange: `<project>.<domain>` (direct)
- Queue: `<project>.<domain>.queue` (durable)
- Message schema: define per domain, always include `request_id`
- Worker: consume → apply business sort/priority → batch-dispatch SSE every ~2s
- Durable + persistent messages: not lost on worker restart
- Not managed by PM2 — runs as Docker container or system service

---

## Real-time: SSE

- Endpoint: `GET /api/v1/stream/<resource>`
- Heartbeat every 30s (prevents ngrok timeout)
- In-process `Notifier` struct: `map[userID][]chan Notification` + mutex
- Frontend `useSse.ts` hook with auto-reconnect on error

---

## Notification Engine

Two complementary channels work together:

| Channel | When it fires | What the user sees |
|---------|--------------|-------------------|
| **Web Push (VAPID)** | Immediately on event | OS-level notification (even when browser is closed) |
| **Notification Inbox** | Persisted to DB | Bell icon with unread count; user sees all past notifications |

The RabbitMQ worker triggers **both** on every notification event so inbox and OS notification stay in sync.

> **iOS caveat:** Web Push requires the user to install the site as a PWA (Add to Home Screen) on iOS 16.4+. On earlier iOS or desktop Chrome/Firefox it works natively. Always register the service worker; on unsupported platforms the inbox still works — only the OS notification is silently skipped.

---

### VAPID Key Generation (once per project)

```bash
# Install webpush CLI or use the Go tool
go run github.com/SherClockHolmes/webpush-go/cmd/vapid-keygen@latest
# Outputs base64url-encoded public + private key — paste into config.yaml
```

---

### Backend

#### DB Tables (add to migrations)

```sql
-- +goose Up
CREATE TABLE push_subscriptions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);

CREATE TABLE notifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL,
    body       TEXT        NOT NULL,
    data       JSONB,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- +goose Down
DROP TABLE notifications;
DROP TABLE push_subscriptions;
```

#### Domain Interfaces

```go
// domain/notification.go
type PushSubscription struct {
    ID        string    `db:"id"`
    UserID    string    `db:"user_id"`
    Endpoint  string    `db:"endpoint"`
    P256dh    string    `db:"p256dh"`
    Auth      string    `db:"auth"`
    CreatedAt time.Time `db:"created_at"`
}

type SubscribeInput struct {
    Endpoint string `json:"endpoint"  validate:"required,url"`
    P256dh   string `json:"p256dh"    validate:"required"`
    Auth     string `json:"auth"      validate:"required"`
}

type Notification struct {
    ID        string     `db:"id"         json:"id"`
    UserID    string     `db:"user_id"    json:"user_id"`
    Title     string     `db:"title"      json:"title"`
    Body      string     `db:"body"       json:"body"`
    Data      *string    `db:"data"       json:"data"`      // JSON string
    ReadAt    *time.Time `db:"read_at"    json:"read_at"`
    CreatedAt time.Time  `db:"created_at" json:"created_at"`
}

type NotificationRepository interface {
    SaveSubscription(ctx context.Context, sub *PushSubscription) error
    GetSubscriptionsByUserID(ctx context.Context, userID string) ([]*PushSubscription, error)
    CreateNotification(ctx context.Context, n *Notification) error
    ListNotifications(ctx context.Context, userID string, pq PaginationQuery) ([]*Notification, int, error)
    MarkAsRead(ctx context.Context, id string, userID string) error
}

type NotificationUsecase interface {
    Subscribe(ctx context.Context, userID string, input SubscribeInput) error
    Dispatch(ctx context.Context, userID string, title, body string, data map[string]any) error
    ListNotifications(ctx context.Context, userID string, pq PaginationQuery) ([]*Notification, int, error)
    MarkAsRead(ctx context.Context, id string, userID string) error
}
```

#### Resource — Push Send

```go
// resource/notification_resource.go
// go get github.com/SherClockHolmes/webpush-go

import webpush "github.com/SherClockHolmes/webpush-go"

func (r *notificationResource) Dispatch(ctx context.Context, userID string, title, body string, data map[string]any) error {
    subs, err := r.GetSubscriptionsByUserID(ctx, userID)
    if err != nil {
        return error_wrapper.NewError(500, "ERR-R-03", "fetch subscriptions failed", err)
    }
    payload, _ := json.Marshal(map[string]any{"title": title, "body": body, "data": data})
    for _, sub := range subs {
        _, _ = webpush.SendNotification(payload, &webpush.Subscription{
            Endpoint: sub.Endpoint,
            Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
        }, &webpush.Options{
            VAPIDPublicKey:  r.cfg.VAPID.PublicKey,
            VAPIDPrivateKey: r.cfg.VAPID.PrivateKey,
            Subject:         r.cfg.VAPID.Subject,
            TTL:             86400,
        })
    }
    return nil
}
```

Errors from individual push sends are intentionally swallowed per-subscription (expired/invalid endpoints are expected). Log them but do not fail the whole dispatch.

#### Worker Integration

The RabbitMQ worker calls both channels in sequence so inbox and push stay in sync:

```go
// usecase/worker.go — inside the consume loop
func (w *worker) handleEvent(ctx context.Context, evt Event) error {
    // 1. Persist to inbox first — source of truth
    if err := w.notifRepo.CreateNotification(ctx, &domain.Notification{
        UserID: evt.UserID,
        Title:  evt.Title,
        Body:   evt.Body,
        Data:   evt.DataJSON,
    }); err != nil {
        return err
    }
    // 2. Best-effort Web Push — failure does NOT roll back the inbox entry
    _ = w.notifUC.Dispatch(ctx, evt.UserID, evt.Title, evt.Body, evt.Data)
    return nil
}
```

#### HTTP Endpoints

```go
// protected group
protected.POST("/push/subscribe",             pushHandler.Subscribe)
protected.GET("/notifications",               notifHandler.List)
protected.PATCH("/notifications/:id/read",    notifHandler.MarkAsRead)
protected.PATCH("/notifications/read-all",    notifHandler.MarkAllAsRead)
```

---

### Frontend

#### Service Worker (`public/sw.js`)

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notification', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: data.data ?? {},
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      const existing = list.find((c) => c.url === url && 'focus' in c)
      return existing ? existing.focus() : clients.openWindow(url)
    })
  )
})
```

#### Push Registration Hook

```ts
// hooks/usePushNotifications.ts
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export async function registerPush(vapidPublicKey: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
  const { endpoint, keys } = sub.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  await apiFetch('/v1/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  })
}
```

Call `registerPush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)` once after login — e.g., inside the auth success handler. Wrap in a try/catch; failure must not block the login flow.

#### Notification Inbox Hook

```ts
// hooks/useNotifications.ts
export interface Notification {
  id: string
  title: string
  body: string
  data: unknown
  read_at: string | null
  created_at: string
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<Notification[]>('/v1/notifications?limit=30&offset=0&sort=desc&order=created_at'),
    refetchInterval: 30_000,
  })
}

export function useMarkAsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
```

#### Bell Icon Component (`components/ui/NotificationBell.tsx`)

```tsx
export function NotificationBell() {
  const { data } = useNotifications()
  const unread = data?.data?.filter((n) => !n.read_at).length ?? 0

  return (
    <button aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
            className="relative p-2">
      <BellIcon className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center
                         rounded-full bg-[var(--color-danger)] text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
```

Place `<NotificationBell />` in `AppShell.tsx` topbar. Clicking it opens a drawer/dropdown that renders the inbox list.

#### `next.config.js` — expose VAPID public key

```js
// next.config.js
env: {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
}
```

---

### Notification Engine Checklist

- [ ] VAPID keys generated and stored in config.yaml (never in code)
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set in environment
- [ ] `push_subscriptions` and `notifications` tables migrated
- [ ] `registerPush` called after login with try/catch
- [ ] Service worker registered at `/sw.js` (must be at root scope)
- [ ] Worker dispatches inbox insert first, push second (inbox is source of truth)
- [ ] Unread count badge visible in topbar
- [ ] iOS: PWA manifest present (`/manifest.json`) + `<link rel="manifest">` in `<head>`

---

## File Upload

- Storage path: `/var/<project>/uploads/<domain>/{id}.jpg`
- Constraints: max 5MB, JPEG/PNG only (adjust per domain)
- Served via: `e.Static("/uploads", "/var/<project>/uploads")`
- URL stored in relevant table column

---

## Response Envelope

```json
// Success
{ "success": true, "data": {}, "message": null, "meta": { "request_id": "uuid-v4" } }

// Error
{
  "success": false,
  "data": null,
  "message": "human-readable description",
  "error_code": "ERR-H-01",
  "actual_error": "original internal error string (e.g. sql: no rows in result set)",
  "stack_trace": "goroutine 1 [running]:\nmain.someFunc(...)\n\t/app/handler/user.go:42",
  "meta": { "request_id": "uuid-v4" }
}
```

`request_id` always present in `meta` — from frontend header or generated by backend middleware.

`actual_error` is the raw underlying error string. `stack_trace` is captured at the point the error is wrapped. Both fields are included in all environments — gate them at the frontend or API gateway if needed for production exposure.

### Error Response Helper

```go
// util/error_wrapper/error_wrapper.go
type ErrorWrapper struct {
    Message     string `json:"message"`
    ErrorCode   string `json:"error_code"`
    ActualError string `json:"actual_error"`
    StackTrace  string `json:"stack_trace"`
    StatusCode  int    `json:"-"`
}

func NewError(statusCode int, errorCode, message string, actual error) *ErrorWrapper {
    return &ErrorWrapper{
        Message:     message,
        ErrorCode:   errorCode,
        ActualError: actual.Error(),
        StackTrace:  captureStack(),
        StatusCode:  statusCode,
    }
}

func captureStack() string {
    buf := make([]byte, 4096)
    n := runtime.Stack(buf, false)
    return string(buf[:n])
}
```

```go
// handler response helper
func errorJSON(c echo.Context, ew *error_wrapper.ErrorWrapper) error {
    return c.JSON(ew.StatusCode, map[string]any{
        "success":      false,
        "data":         nil,
        "message":      ew.Message,
        "error_code":   ew.ErrorCode,
        "actual_error": ew.ActualError,
        "stack_trace":  ew.StackTrace,
        "meta":         map[string]any{"request_id": c.Get("request_id")},
    })
}
```

---

## Pagination Convention

All list endpoints follow a consistent contract.

### Request Query Params

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 20 | Items per page (max: 100) |
| `offset` | int | 0 | Number of items to skip |
| `sort` | string | `desc` | Sort direction: `asc` \| `desc` |
| `order` | string | `created_at` | Column to order by |

### Response Meta

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "sort": "desc",
    "order": "created_at",
    "request_id": "uuid-v4"
  }
}
```

### Domain Struct

```go
// domain/pagination.go
type PaginationQuery struct {
    Limit  int    `query:"limit"  validate:"min=1,max=100"`
    Offset int    `query:"offset" validate:"min=0"`
    Sort   string `query:"sort"   validate:"oneof=asc desc"`
    Order  string `query:"order"  validate:"oneof=created_at updated_at"` // extend per domain
}

func DefaultPagination() PaginationQuery {
    return PaginationQuery{Limit: 20, Offset: 0, Sort: "desc", Order: "created_at"}
}
```

Handler binds query params into `PaginationQuery` using `c.Bind(&pq)` (Echo resolves `query:` struct tags from URL params), then validates with `util.ValidateStruct(&pq)`. Do **not** use `ParseAndValidate` here — that function expects a JSON body, not URL query params. Usecase must not apply its own pagination defaults.

```go
func (h *UserHandler) ListUsers(c echo.Context) error {
    pq := domain.DefaultPagination()
    if err := c.Bind(&pq); err != nil {
        return errorJSON(c, error_wrapper.NewError(400, "ERR-H-01", "invalid query params", err))
    }
    if err := util.ValidateStruct(&pq); err != nil {
        return errorJSON(c, error_wrapper.NewError(400, "ERR-H-01", err.Error(), err))
    }
    result, err := h.uc.ListUsers(c.Request().Context(), pq)
    // ...
}
```

**`Order` must always be validated against a whitelist** — never interpolate it directly into a SQL string. Each domain extends the `oneof` list to the columns it actually exposes.

---

## Frontend: Proxy Architecture

All frontend API calls go through a Next.js proxy route — never directly to the backend.

```
Browser → /api/... (Next.js proxy) → http://localhost:3001/api/...
```

Why proxy (not Next.js rewrite):
- Inject `X-Request-ID` server-side before forwarding
- Read auth token from cookie (more secure than localStorage)
- Backend URL never exposed to browser

```ts
// app/api/[...path]/route.ts
// params is a Promise in Next.js 15 App Router — must be awaited
const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'])

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const backendUrl = `${process.env.BACKEND_URL}/api/${path.join('/')}`

  const forwardedHeaders: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) forwardedHeaders[key] = value
  })
  forwardedHeaders['x-request-id'] = requestId

  return fetch(backendUrl, {
    method: req.method,
    headers: forwardedHeaders,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    duplex: 'half',
  } as RequestInit)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
```

---

## Frontend: request_id Injection

```ts
// lib/api.ts
export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const requestId = crypto.randomUUID()
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...options?.headers,
    },
  })
  // res.json() returns Promise<unknown>; safe to assert ApiResponse<T> since all backend routes use this envelope
  return res.json() as Promise<ApiResponse<T>>
}
```

---

## Frontend: State Management

| Concern | Library | Rule |
|---------|---------|------|
| Server state | **TanStack Query** (`@tanstack/react-query`) | All API fetching, caching, background revalidation |
| Client / UI state | **Zustand** | Global UI state only: auth session, modals, sidebar open/close |
| Form state | **React Hook Form** | All forms — no controlled inputs via `useState` |
| URL state | Next.js `useSearchParams` | Filters, sort, pagination, active tab, search query |

**Do not duplicate server state into Zustand.** TanStack Query is the source of truth for anything that originates from the API. Derive values — don't store computed state.

```ts
// hooks/useUsers.ts
export function useUsers(params: PaginationQuery) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => apiFetch<User[]>(`/users?limit=${params.limit}&offset=${params.offset}&sort=${params.sort}&order=${params.order}`),
  })
}
```

```ts
// store/ui.ts
interface UIStore {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
```

---

## Frontend: Reusable Component Architecture

**Rule: No inline duplication of UI logic.** If a UI pattern appears more than once, extract it into `components/ui/` or a domain-specific component before writing it a second time.

### Component Hierarchy

```
components/
├── ui/                    # Stateless, domain-agnostic primitives
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Modal.tsx
│   ├── Toast.tsx
│   ├── Badge.tsx
│   ├── Spinner.tsx
│   ├── Table.tsx
│   ├── Pagination.tsx
│   └── EmptyState.tsx
├── layout/                # Page shells, shared chrome
│   ├── AppShell.tsx       # Sidebar + topbar wrapper
│   ├── PageHeader.tsx
│   └── SectionCard.tsx
└── <domain>/              # Feature-specific composites built from ui/ primitives
    ├── UserCard.tsx
    └── OrderTable.tsx
```

### Rules

1. **`components/ui/`** contains only stateless, props-driven primitives. No data fetching, no Zustand reads, no TanStack Query calls inside `ui/` components.
2. **Domain components** (`components/<domain>/`) compose `ui/` primitives and may read from hooks or stores — but must not own their own data fetching. Data flows in via props from a container or page.
3. **Pages and route segments** are the only place that owns data fetching (`useQuery`, `useMutation`). Pass data down as props.
4. **Never copy-paste a component.** If you need a variation, extend via props (`variant`, `size`, `intent`) or composition — not a new file.
5. All `ui/` components must implement every relevant interaction state: default, hover, focus, active, disabled, loading, error.

### Shared Prop Conventions

```ts
// All interactive ui/ components accept these base props
interface BaseProps {
  className?: string
  disabled?: boolean
}

// Buttons and triggers
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

// Status / feedback
type Intent = 'default' | 'success' | 'warning' | 'danger' | 'info'
```

### Data Table Pattern

List pages always reuse `<Table>` + `<Pagination>` from `components/ui/`. Never build a one-off table in a page file.

```tsx
// components/ui/Table.tsx — generic, typed rows
export interface ColumnDef<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
}

interface TableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  isLoading?: boolean
  emptyMessage?: string
}

// Usage in a domain page
<Table
  columns={userColumns}
  data={users}
  isLoading={isLoading}
  emptyMessage="No users found"
/>
<Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
```

### Form Pattern

All forms use React Hook Form + `components/ui/Input`, `Select`, etc. Never use raw `<input>` or `useState` for form fields.

```tsx
const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>()

<Input
  label="Email"
  error={errors.email?.message}
  {...register('email', { required: 'Email is required' })}
/>
```

---

## TypeScript: Strict Mode

`tsconfig.json` must have `"strict": true`. No exceptions, no overrides per-file.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Rules

- **No `any`.** Use `unknown` and narrow with type guards or Zod.
- **No `as` casting** without a comment explaining why it is provably safe.
- **No non-null assertion (`!`)** unless the value is structurally guaranteed non-null at that scope.
- All API response shapes must be typed explicitly — never inferred from raw `fetch` return.

```ts
// types/api.ts
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  message: string | null
  error_code?: string
  actual_error?: string
  stack_trace?: string
  meta: {
    total?: number
    limit?: number
    offset?: number
    sort?: string
    order?: string
    request_id: string
  }
}
```

Shared domain types live in `types/` and are imported by hooks, components, and server actions — never re-declared inline.

---

## Frontend: Design System

### Direction: define per project (e.g. minimalist, editorial, neo-brutalist)

Design tokens are defined in `styles/tokens.css` as CSS custom properties. Required token categories:

| Token | Purpose |
|-------|---------|
| `--color-bg` | Page background |
| `--color-surface` | Card / panel surface |
| `--color-accent` | Primary brand accent |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary / hint text |
| `--color-border` | Borders and dividers |
| `--color-sidebar` | Sidebar background |
| `--color-success` | Positive feedback |
| `--color-danger` | Error / destructive |
| `--color-warning` | Warning state |

- Typography: define 2 fonts max — one for UI/body, one for mono/code display
- Border radius: define once as `--radius-base`, use consistently

---

## Frontend: UIUX Styling Guidelines (Mandatory)

### Rule: Guidelines-First Development

**Before writing any frontend component**, a UIUX Styling Guidelines document must exist. All frontend development follows it — no exceptions.

### What the Guidelines Must Cover

The guidelines document is a **single self-contained HTML file** (`docs/uiux-guidelines.html`) that includes:

1. **Color palette** — all CSS tokens with swatches rendered in-browser
2. **Typography** — font families, sizes, weights, line heights; rendered examples for h1–h6, body, caption, mono
3. **Spacing scale** — spacing tokens (4px base grid), visual ruler showing each step
4. **Border radius & shadow** — all variants rendered
5. **Component library** — rendered live HTML+CSS for every reusable component:
   - Buttons (all variants + states: default, hover, focus, active, disabled, loading)
   - Form inputs (text, select, textarea, checkbox, radio, toggle — all states)
   - Cards, badges, tags
   - Navigation (top bar, sidebar, bottom nav)
   - Modals, drawers, toasts
   - Tables, lists
   - Loading skeletons
6. **Wireframes** — each major screen/view wireframed as HTML layout (not images):
   - Use actual HTML structure with placeholder content
   - Annotate layout zones (header, main, nav, sidebar)
   - Cover all user roles / views defined in the project
7. **Interaction states** — hover, focus, active, disabled, loading, empty, error shown for each component
8. **Responsive breakpoints** — show layout changes at 375px, 768px, 1024px, 1440px
9. **Dark + Light mode** — if both supported, all components shown in both modes with a toggle

### File Location & Format

```
docs/
└── uiux-guidelines.html    # Single file, all CSS+JS inline, no external deps
```

- Must be openable directly in browser with no build step
- All styles inline or in a `<style>` block — no external CSS imports
- Wireframes built with HTML/CSS, not image placeholders

### Development Rule

Every frontend component or screen **must reference the guidelines** before implementation:
- Token names come from `styles/tokens.css`, never hardcoded values
- Component structure follows the rendered example in `uiux-guidelines.html`
- Any deviation from guidelines must be documented and intentional

### One-Handed Operation Rules

- Touch target minimum: **48×48px**
- Bottom navigation bar (max 4 items) — all primary actions
- No horizontal scroll
- Primary actions always bottom/center, not top-left corner
- Key content reachable within bottom 60% of screen height

### Navigation Pattern

```
┌────────────────────────────┐
│  Header (logo + dark toggle) │
├────────────────────────────┤
│     Main Content (scroll)    │
├────────────────────────────┤
│  Bottom Nav: [Home][Search]  │
│            [Scan][Profile]   │
└────────────────────────────┘
```

Desktop (≥768px): fixed sidebar (220px) + main; bottom nav hidden.

### Component Checklist

- [ ] Hover/focus/active states designed (not browser defaults)
- [ ] Touch target ≥48×48px
- [ ] Works one-handed on 375px width
- [ ] Dark + light mode tested
- [ ] No horizontal overflow

---

## Deployment

Deployment targets a **home server or laptop** reachable via SSH. Two variants are supported out of the box: **local network / VPS** and **Tailscale-connected laptop homeserver**. Both share the same rsync + pm2 restart pattern.

### PM2 Processes

- `<api-process>` — Go binary on :3001
- `<web-process>` — `next start` on :3000
- `ngrok` — expose :3000 to public (only if no Tailscale funnel / cloudflared)

### Deployment Variants

| Variant | Reach | Use when |
|---------|-------|----------|
| **Standard SSH** | Public IP, VPS, or local LAN | Fixed public host, port-forwarded box, or same LAN |
| **Tailscale** | Any device in your tailnet | Laptop homeserver behind NAT, moves between networks, no port forwarding needed |

Both variants use the same `build → rsync → pm2 restart` shape. Only the reach + hostname change.

---

### Standard SSH Deploy (baseline)

```makefile
SERVER      ?= <hostname-or-ip>
SERVER_USER ?= <deploy-user>
SERVER_DIR  ?= /opt/<project>

deploy: build deploy-backend deploy-frontend
	ssh $(SERVER_USER)@$(SERVER) "cd $(SERVER_DIR) && pm2 restart <api-process> <web-process>"

deploy-backend: build-backend
	rsync -avz --delete backend/dist/<api-binary> $(SERVER_USER)@$(SERVER):$(SERVER_DIR)/bin/<api-binary>

deploy-frontend: build-frontend
	rsync -avz --delete frontend/.next/ $(SERVER_USER)@$(SERVER):$(SERVER_DIR)/frontend/.next/
	rsync -avz frontend/package.json frontend/next.config.ts $(SERVER_USER)@$(SERVER):$(SERVER_DIR)/frontend/
```

---

### Tailscale Deploy (laptop homeserver anywhere)

Use when the target box is a laptop that:
- Sits behind a home NAT (no port forwarding)
- Moves between networks (café, office, hotel)
- Doesn't have a stable public IP
- You only want to reach from your own devices

**Prerequisites:**

1. Tailscale installed + logged in on both dev machine and target box
2. Target box's Tailscale hostname is stable (check via `tailscale status`)
3. SSH access on target — either standard SSH keys OR Tailscale SSH (`tailscale up --ssh` on target)
4. Target box has `pm2`, `node`, and `<project>` directory pre-provisioned

**Cross-compile mandatory.** If dev machine is macOS/ARM and target is Linux/amd64, the local `go build` produces a binary that will not run on target. Always cross-compile for the target OS/arch.

```makefile
# ─── Tailscale deploy vars ──────────────────────────────────────
TS_HOST      ?= <tailscale-hostname>    # matches `tailscale status`
TS_USER      ?= $(SERVER_USER)
TS_DIR       ?= $(SERVER_DIR)
TS_SSH       ?= ssh                     # use `tailscale ssh` if target has Tailscale SSH enabled
TS_RSYNC_SSH ?= ssh -o StrictHostKeyChecking=accept-new

# Target arch — override for Apple Silicon target (GOARCH=arm64)
TS_GOOS      ?= linux
TS_GOARCH    ?= amd64

# ─── Preflight ──────────────────────────────────────────────────
tailscale-check:
	@command -v tailscale >/dev/null 2>&1 || (echo "❌ tailscale CLI not installed" && exit 1)
	@tailscale status >/dev/null 2>&1 || (echo "❌ tailscale not running — run 'tailscale up'" && exit 1)
	@tailscale status | awk '{print $$2}' | grep -qx "$(TS_HOST)" || \
		(echo "❌ '$(TS_HOST)' not in tailnet — check: tailscale status" && exit 1)
	@$(TS_SSH) -o ConnectTimeout=5 -o BatchMode=yes $(TS_USER)@$(TS_HOST) 'echo ok' >/dev/null 2>&1 || \
		(echo "❌ SSH to $(TS_USER)@$(TS_HOST) failed" && exit 1)
	@echo "✅ Tailscale reachable — $(TS_USER)@$(TS_HOST)"

# ─── Cross-compile for target ───────────────────────────────────
build-backend-remote:
	cd backend && GOOS=$(TS_GOOS) GOARCH=$(TS_GOARCH) CGO_ENABLED=0 \
		go build -o dist/<api-binary>-$(TS_GOOS)-$(TS_GOARCH) ./cmd/server/...

# ─── Sync + restart ─────────────────────────────────────────────
deploy-tailscale: tailscale-check build-backend-remote build-frontend \
                  deploy-backend-tailscale deploy-frontend-tailscale migrate-up-remote
	@echo "→ Restarting pm2 processes on $(TS_HOST)…"
	$(TS_SSH) $(TS_USER)@$(TS_HOST) "cd $(TS_DIR) && pm2 restart <api-process> <web-process>"
	@echo "✅ Deployed to $(TS_HOST)"

deploy-backend-tailscale: build-backend-remote
	rsync -avz --delete -e "$(TS_RSYNC_SSH)" \
		backend/dist/<api-binary>-$(TS_GOOS)-$(TS_GOARCH) \
		$(TS_USER)@$(TS_HOST):$(TS_DIR)/bin/<api-binary>
	rsync -avz --delete -e "$(TS_RSYNC_SSH)" \
		backend/migrations/ $(TS_USER)@$(TS_HOST):$(TS_DIR)/migrations/

deploy-frontend-tailscale: build-frontend
	rsync -avz --delete -e "$(TS_RSYNC_SSH)" \
		frontend/.next/ $(TS_USER)@$(TS_HOST):$(TS_DIR)/frontend/.next/
	rsync -avz -e "$(TS_RSYNC_SSH)" \
		frontend/package.json frontend/package-lock.json frontend/next.config.ts \
		$(TS_USER)@$(TS_HOST):$(TS_DIR)/frontend/
	$(TS_SSH) $(TS_USER)@$(TS_HOST) "cd $(TS_DIR)/frontend && npm ci --omit=dev"

migrate-up-remote:
	$(TS_SSH) $(TS_USER)@$(TS_HOST) "cd $(TS_DIR) && ./bin/<migrate-binary> up"

pm2-status:
	$(TS_SSH) $(TS_USER)@$(TS_HOST) "pm2 status"

logs-tailscale:
	$(TS_SSH) $(TS_USER)@$(TS_HOST) "pm2 logs <api-process>"
```

**Config secrets** (`config.yaml`, `.env`) are **not** synced by these targets. Provision them once on the target box and manage rotation manually — never rsync secrets from a dev checkout.

**Frontend `npm ci --omit=dev`** runs on the target so `node_modules` matches the target's OS/arch. Never rsync `node_modules` from dev.

### Public Exposure (optional)

The Tailscale variant keeps the app private-by-default (reachable only from your tailnet). If you need public access, pick one:

| Method | Fit |
|--------|-----|
| **Tailscale Funnel** | `tailscale funnel 3000` — HTTPS via `<host>.<tailnet>.ts.net`. Best for personal / demo use. |
| **Cloudflare Tunnel** | `cloudflared tunnel` — public custom domain, no open ports. Best for production-facing home labs. |
| **ngrok** | Fast temporary demos. Not for durable prod. |

Do not combine multiple public tunnels for the same port — pick one and stick with it.

### Deploy Checklist

- [ ] `plan.md` deployment section names the variant (Standard SSH / Tailscale)
- [ ] Cross-compile matches target OS/arch (`TS_GOOS`, `TS_GOARCH`)
- [ ] Secrets (`config.yaml`, VAPID keys, JWT secret) are on target — never in rsync payload
- [ ] Migrations run **before** pm2 restart (see CI/CD Rule under DB Migrations)
- [ ] `tailscale-check` passes in CI or as first step of any deploy runbook
- [ ] `pm2 startup` configured on target so processes survive reboot
- [ ] `pm2 save` run after any process rename / add

---

## DB Migrations (Goose)

Migration tool: **`pressly/goose`**. All migrations live in `backend/migrations/`.

```
backend/migrations/
├── 001_initial_schema.sql
├── 002_add_users_salt.sql
└── 003_add_<domain>_table.sql
```

Naming: zero-padded sequential prefix + snake_case description. Files use Goose SQL annotations:

```sql
-- +goose Up
CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now()
);

-- +goose Down
DROP TABLE users;
```

### Migration Entry Point

```go
// cmd/migrate/main.go
import (
    "log"
    "os"

    "github.com/jmoiron/sqlx"
    _ "github.com/lib/pq"
    "github.com/pressly/goose/v3"
    "<module>/internal/config"
)

func main() {
    if len(os.Args) < 2 {
        log.Fatal("usage: migrate <up|down>")
    }
    direction := os.Args[1]
    cfg, err := config.Load("config.yaml")
    if err != nil { log.Fatal(err) }
    db, err := sqlx.Open("postgres", cfg.Database.DSN())
    if err != nil { log.Fatal(err) }
    switch direction {
    case "up":
        if err := goose.Up(db.DB, "migrations"); err != nil { log.Fatal(err) }
    case "down":
        if err := goose.Down(db.DB, "migrations"); err != nil { log.Fatal(err) }
    default:
        log.Fatalf("unknown direction: %s", direction)
    }
}
```

### Makefile

```makefile
migrate-up:
    go run ./cmd/migrate/main.go up

migrate-down:
    go run ./cmd/migrate/main.go down

migrate-create:
    go run github.com/pressly/goose/v3/cmd/goose -dir migrations create $(name) sql
```

### CI/CD Rule

**Migrations run before the application process restarts.** Deployment sequence is strictly:

1. Run `make migrate-up`
2. If migration fails → abort deployment, do not restart the process
3. Only after successful migration → `pm2 restart <api-process>`

Never start the application against a schema that hasn't been migrated. This rule applies to both manual deploys and automated pipelines.

---

## Testing Standards

### Backend

- Framework: `testing` stdlib + `testify`
- Mock library: **`github.com/golang/mock/gomock`** — NOT uber-go/mock
- Mocks: generated via `mockgen` from domain interfaces — never hand-written
- Pattern: **test-table** for all test cases per function — no standalone test functions per case
- Coverage minimum: **85%**

#### Rules

1. **Test-table is mandatory.** Every test function uses a `tests := []struct{...}` slice. No single-case test functions.
2. **No inline mock implementations inside test files.** All mocks are pre-generated via `mockgen` and live in `internal/mocks/`.
3. **Mock setup is done inside the test-table struct** via a `mockSetup func(ctrl *gomock.Controller)` field — not ad-hoc outside the loop.
4. **All mocks are generated from domain interfaces**, not from concrete structs.

```go
func TestXxxUsecase_Action(t *testing.T) {
    tests := []struct {
        name        string
        input       domain.XxxInput
        mockSetup   func(repo *mocks.MockXxxRepository)
        wantErr     bool
        wantErrCode string
    }{
        {
            name:  "success",
            input: domain.XxxInput{...},
            mockSetup: func(repo *mocks.MockXxxRepository) {
                repo.EXPECT().FindByID(gomock.Any(), "id-1").Return(&domain.Xxx{}, nil)
            },
        },
        {
            name:  "fail - not found",
            input: domain.XxxInput{ID: "missing"},
            mockSetup: func(repo *mocks.MockXxxRepository) {
                repo.EXPECT().FindByID(gomock.Any(), "missing").Return(nil, errors.New("not found"))
            },
            wantErr:     true,
            wantErrCode: "ERR-U-01",
        },
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            ctrl := gomock.NewController(t)
            defer ctrl.Finish()
            repo := mocks.NewMockXxxRepository(ctrl)
            tt.mockSetup(repo)
            uc := usecase.NewXxxUsecase(repo)
            result, err := uc.Action(context.Background(), tt.input)
            // assertions...
        })
    }
}
```

```makefile
generate-mocks:
    mockgen -source=internal/domain/<entity>.go -destination=internal/mocks/mock_<entity>.go -package=mocks
```

#### DB Module

- **Must use `github.com/jmoiron/sqlx`** — no raw `database/sql`, no GORM, no other ORM
- **All queries must use prepared statements** — use `sqlx.Preparex` or `db.PrepareNamedContext` before executing
- All queries are parameterized (no string concatenation)
- Use `sqlx.NamedExec` / `sqlx.Get` / `sqlx.Select` patterns

### Frontend

- Framework: **Vitest** + **React Testing Library**
- E2E: **Playwright**
- Coverage minimum: **80%** (hooks, lib, utils)
- Visual regression for UI components

---

## Project Plan (`plan.md`)

**Before any code is written**, a `plan.md` must exist at the project root. This is the single source of truth for everything project-specific. The boilerplate is the architectural blueprint; `plan.md` is what fills in every `<project>`, `<domain>`, `<role-a>`, `<role-b>` placeholder.

All development decisions — feature scope, domain design, route structure, agent prompts — must reference `plan.md` first.

### File Location

```
<project>/
└── plan.md    # committed, updated as the project evolves
```

### Required Sections

```markdown
# <Project Name> — Plan

## Overview
One paragraph: what the product does, who it's for, and the core problem it solves.

## User Roles
| Role | Description | Access Level |
|------|-------------|--------------|
| <role-a> | ... | ... |
| <role-b> | ... | ... |
| admin | ... | full |

## MVP Scope
Explicit list of features included in v1. Anything not listed is out of scope.
- [ ] Feature A
- [ ] Feature B

## Out of Scope (v1)
Explicit list of what will NOT be built yet.
- Feature X (post-MVP)

## Domain Entities
List every core entity with its key fields and relationships.
| Entity | Key Fields | Relations |
|--------|-----------|-----------|
| User | id, email, role, password_hash, password_salt | has many Orders |
| Order | id, user_id, status, total | belongs to User |

## API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/login | public | Login |
| GET | /api/v1/orders | JWT | List orders (paginated) |

## Frontend Pages
| Route | Role | Description |
|-------|------|-------------|
| /login | public | Login page |
| /(role-a)/dashboard | role-a | Main dashboard |
| /(admin)/users | admin | User management |

## Database Tables
High-level list — detail lives in migrations/.
- users
- orders
- ...

## Non-Functional Requirements
Only include constraints specific to this project (not covered by boilerplate defaults).
- Max response time: Xms for Y endpoint
- File upload max: XMB
- ...

## Milestones
| Milestone | Scope | Target |
|-----------|-------|--------|
| M1 — Auth | Login, register, JWT | ... |
| M2 — Core | ... | ... |
```

### Rules

1. **`plan.md` is written before any code.** If it doesn't exist, stop and write it first.
2. **Every agent prompt that involves domain logic must reference `plan.md`** — paste the relevant section as context.
3. **`plan.md` is a living document.** Update it when scope changes. It is the ground truth, not the code.
4. **Out of Scope must be explicit.** Unwritten scope creeps in silently — writing it out prevents it.
5. **Milestones drive the Build Order.** Each milestone maps to a subset of the Build Order steps below.

---

## Build Order

0. `plan.md` — project plan (roles, entities, endpoints, pages, milestones) — **must exist before step 1**
1. `docker-compose.yml` — local PostgreSQL + RabbitMQ + Jaeger
2. `backend/util/` — logger.go + error_wrapper.go
3. `backend/internal/domain/` — entities + enums + interfaces
4. `backend/migrations/` — SQL schema (Goose; includes `push_subscriptions` + `notifications` tables if Notification Engine used; run `make migrate-up` before first start)
5. `backend/internal/resource/` — data access (sqlx + RabbitMQ publisher + notification resource)
6. `backend/internal/usecase/` — business logic + prep_worker + SSE notifier + notification dispatch
7. `backend/internal/middleware/` — request_id, rate_limiter, JWT, tracing
8. `backend/internal/handler/` — HTTP + SSE handlers
9. `backend/cmd/server/main.go` — wire up
10. `backend/**/*_test.go` — unit tests (≥85%)
11. `frontend/styles/tokens.css` — design tokens
12. `frontend/components/ui/` + `frontend/components/layout/` — primitive component library (Button, Input, Table, Pagination, Modal, AppShell, PageHeader, NotificationBell…)
13. `frontend/lib/` + `frontend/hooks/` — API client + request_id injection + notification + push hooks; `public/sw.js` service worker
14. `frontend/app/api/[...path]/route.ts` — proxy
15. `frontend/app/(role-a)/` — primary role routes (MVP critical path)
16. `frontend/app/(role-b)/` — secondary role routes
17. `frontend/app/(admin)/` — admin routes
18. `frontend/**/*.test.ts` — unit + E2E tests
19. `pm2.config.js` + `Makefile` — deploy tooling
20. **Final Verification** — multi-agent alignment check against `plan.md` + `boilerplate.md` (see Final Verification section)

---

## Agent Orchestration

Spawn agents to parallelize independent work. Never run sequential agents when the tasks don't depend on each other.

### Agent × Task Map

| Task | Agent | Trigger |
|------|-------|---------|
| New feature planning | `planner` | Before writing any code |
| Domain interface design | `architect` | When adding a new domain entity |
| Go code written/changed | `go-reviewer` | Immediately after every Go edit |
| TS/Next.js code written | `typescript-reviewer` | Immediately after every TS edit |
| Auth, input handling, DB queries | `security-reviewer` | Before any commit touching these |
| Go build fails | `build-error-resolver` | When `go build` or `go vet` breaks |
| SQL schema / query design | `database-reviewer` | Before writing migrations |
| Critical user flows done | `e2e-runner` | After MVP feature complete |
| New feature, any bug fix | `tdd-guide` | Write tests first, always |

### Parallel Patterns for This Stack

**New domain feature (e.g. `order`):**
```
Parallel:
  Agent 1 — planner:    "Plan the order domain: entities, enums, interfaces, usecase methods, handler routes, migration needed"
  Agent 2 — architect:  "Design domain interfaces for order in internal/domain/order.go — UserRepository + UserUsecase pattern, context.Context on every method"
```
Then implement sequentially: domain → migration → resource → usecase → handler → frontend hooks → frontend pages.

**Post-implementation review:**
```
Parallel:
  Agent 1 — go-reviewer:          "Review internal/usecase/order_usecase.go and internal/handler/order_handler.go. Stack: Go + Echo + sqlx. Check SOLID compliance, context propagation, error_wrapper usage, no direct resource struct dependency."
  Agent 2 — typescript-reviewer:  "Review components/order/ and hooks/useOrders.ts. Stack: Next.js 15 App Router, TanStack Query, Zustand, strict TS. Check apiFetch generic usage, no useState for server state, reusable ui/ primitives used."
  Agent 3 — security-reviewer:    "Review internal/handler/order_handler.go. Check: input validated at handler layer only, prepared statements, no SQL string concat, JWT scoped to protected group, error messages don't leak internals."
```

**Full stack feature done → ship:**
```
Parallel:
  Agent 1 — e2e-runner:      "Write and run Playwright E2E for the order creation flow: login → create order → verify status update via SSE"
  Agent 2 — tdd-guide:       "Verify test coverage ≥85% on internal/usecase/order_usecase_test.go using test-table pattern and gomock"
```

### Prompting Template

Every agent prompt must include these four things — nothing more:

```
1. FILE(S): exact path(s) to read/modify
2. STACK: Go + Echo + sqlx + error_wrapper / Next.js 15 + TanStack Query + strict TS
3. CONSTRAINT: which rule applies (e.g. "context.Context unbroken", "prepared statements", "apiFetch<T> not double-wrapped")
4. OUTPUT: what done looks like ("Report CRITICAL and HIGH only" / "Write the test file" / "Fix and explain")
```

Example — go-reviewer prompt:
```
FILE: backend/internal/usecase/user_usecase.go
STACK: Go + Echo + sqlx. Domain interfaces in internal/domain/. error_wrapper in util/error_wrapper/.
CONSTRAINT: SOLID — usecase depends on domain.UserRepository interface only, never on resource struct. context.Context on every method. All errors wrapped with error_wrapper.NewError.
OUTPUT: Report CRITICAL and HIGH issues only. No style nits.
```

### Skills Reference (This Stack)

| Skill | When to invoke |
|-------|---------------|
| `golang-patterns` | Go idioms, SOLID wiring, interface patterns |
| `golang-testing` | Test-table setup, gomock generation |
| `postgres-patterns` | Query design, index strategy, schema review |
| `database-migrations` | Goose migration patterns, rollback safety |
| `frontend-patterns` | Component composition, state management, apiFetch usage |
| `frontend-design` | Design token setup, UIUX guidelines file |
| `tdd-workflow` | TDD cycle, RED→GREEN→REFACTOR enforcement |
| `security-review` | Pre-commit security scan across all layers |
| `backend-patterns` | General backend architecture reference |
| `api-design` | REST contract design, versioning, pagination |

Invoke a skill before writing code in its domain. Skills provide the reference — agents execute the work.

---

## Makefile Targets Reference

```makefile
# Development
dev / dev-backend / dev-frontend

# Build
build / build-backend / build-frontend

# Test
test / test-backend / test-backend-coverage
test-frontend / test-frontend-coverage / test-e2e

# Lint & Format
lint / lint-backend / lint-frontend / fmt

# Mocks
generate-mocks

# Database
migrate-up / migrate-down / migrate-create name=xxx

# Docker
docker-up / docker-down

# Deploy
deploy / deploy-backend / deploy-frontend
logs / logs-web

# Infra
health
```

---

## Final Verification

Run this after every milestone completion and before every deploy. Spawn all 5 agents in parallel — they are fully independent.

### When to Run

- After completing any milestone in `plan.md`
- Before any production deploy
- After a large refactor or new domain added

### 5-Agent Parallel Spawn

```
Spawn in parallel:

Agent 1 — planner (Plan Alignment)
  FILES: plan.md + entire codebase (list all routes, entities, pages implemented)
  TASK: Cross-check every item in plan.md MVP Scope against what is actually built.
        Check that nothing in Out of Scope was accidentally implemented.
        Report: [ ] not built, [x] built, [!] built but not in plan.

Agent 2 — architect (Backend Architecture Compliance)
  FILES: backend/internal/domain/, backend/internal/resource/, backend/internal/usecase/, backend/internal/handler/
  STACK: Go + Echo + sqlx + error_wrapper
  CHECK:
    - No direct struct dependency across layers (only domain interfaces)
    - context.Context unbroken on every method signature
    - All errors wrapped with error_wrapper.NewError — no raw errors returned from handler
    - JWT applied via protected group only — not inline on individual routes or global
    - All queries use prepared statements (sqlx.Preparex / PrepareNamedContext)
    - Input validation at handler layer only — usecase and resource do not re-validate
    - util.ValidateStruct for query params, util.ParseAndValidate for JSON body
  OUTPUT: PASS / FAIL per check. List every failing file + line.

Agent 3 — typescript-reviewer (Frontend Architecture Compliance)
  FILES: frontend/components/, frontend/hooks/, frontend/lib/, frontend/app/
  STACK: Next.js 15 App Router + TanStack Query + Zustand + React Hook Form + strict TS
  CHECK:
    - params always awaited (Next.js 15 — params is a Promise)
    - apiFetch<T> used correctly — no apiFetch<ApiResponse<T>> double-wrap
    - No useState for server state — TanStack Query is the only source of truth for API data
    - No raw <input> or useState for form fields — React Hook Form only
    - No one-off tables or forms built inline in page files — ui/ primitives always reused
    - No hardcoded colors, spacing, or font values — tokens.css variables only
    - No `any` without a comment justifying it
    - All `as` casts have an explanatory comment
  OUTPUT: PASS / FAIL per check. List every failing file + line.

Agent 4 — security-reviewer (Security Compliance)
  FILES: backend/internal/handler/, backend/internal/middleware/, backend/internal/resource/
  CHECK:
    - No hardcoded secrets anywhere in codebase
    - No string concatenation in SQL queries
    - PaginationQuery.Order validated via oneof whitelist — never interpolated raw
    - Rate limiter applied to all handler groups
    - Error responses do not expose internal stack traces beyond the error_wrapper fields
    - JWT secret loaded from config only — not os.Getenv inline
    - VAPID private key loaded from config only — never hardcoded or in env inline
    - All file uploads validated for type and size before processing
  OUTPUT: PASS / FAIL per check. List every FAIL with severity (CRITICAL / HIGH / MEDIUM).

Agent 5 — tdd-guide (Test Coverage)
  FILES: backend/**/*_test.go, frontend/**/*.test.ts
  CHECK:
    - Backend coverage ≥ 85% — run go test ./... -cover and report per-package
    - All usecase methods have test-table coverage including error cases
    - All mocks are generated (internal/mocks/) — no hand-written mocks
    - Frontend coverage ≥ 80% on hooks/, lib/, utils/
    - E2E tests exist for every critical user flow defined in plan.md
  OUTPUT: Coverage numbers per package. List any uncovered usecase methods or missing E2E flows.
```

### Verdict Rules

| Result | Action |
|--------|--------|
| All 5 agents PASS | Clear to deploy |
| Agent 1 has `[ ]` items | Features missing — do not deploy, complete MVP scope first |
| Agent 1 has `[!]` items | Scope creep — remove or formally add to plan.md before proceeding |
| Agent 2 or 3 has FAIL | Fix architecture violation before deploy |
| Agent 4 has CRITICAL or HIGH | **Hard block** — fix before anything else |
| Agent 5 below coverage target | Add tests before deploy |

### Prompt Template

When spawning, paste the relevant section of `plan.md` into each agent prompt so they have ground truth for what "correct" looks like — not just the code.

```
PLAN CONTEXT (from plan.md):
<paste MVP Scope + Domain Entities + API Endpoints sections>

FILES: <paths>
STACK: <stack line>
CHECK: <checklist above>
OUTPUT: PASS/FAIL per item. File + line for every failure.
```
