# AI Optimization Report

## 1. Tools & Prompting

I used Claude chat for planning, phased prompt drafting, and review. I used GitHub Copilot in VS Code for repository work. I used PowerShell, Prisma CLI, Vitest, browser automation, and the Next.js build for verification.

I worked one task at a time. Before editing, I searched the repository and read the owning route, service, schema, or neighboring test. I kept security requirements explicit: server-side role checks, session-derived identity, strict validation, transaction boundaries, and no client-controlled status decisions.

My verification workflow was:

- `npm run build`
- `npm test`
- focused Vitest commands such as `npx vitest run tests/sewing.test.ts`
- Prisma migration, schema, and database metadata checks
- authenticated browser checks for role pages and responsive widths
- `git diff --check`

## 2. Flawed / Broken AI Code

### Flaw 1: Client-only role protection

**What I asked:** I asked for UI role isolation while keeping the server as the real security boundary.

**What the AI produced:** The existing dashboards were client components:

```tsx
"use client";

export default function VerifierPage() {
  // client-side queue and UI state
}
```

The page itself did not perform a server-side role check.

**Why it was wrong:** A client redirect or hidden link is not an authorization boundary. A user could request the page directly, and page-level UX protection would not replace API authorization.

**How I fixed it:** I added server route layouts that check the session before rendering the client page:

```tsx
async function SewingGate({ children }: { children: ReactNode }) {
  await requirePageRole("sewing_supervisor");
  return children;
}
```

The API routes independently call `requireRole`.

**How I proved the fix:** An unauthenticated browser request to `/sewing` returned `307` and redirected to `/`. Authenticated browser checks showed role-specific navigation.

### Flaw 2: `force-dynamic` broke the Next.js 16 build

**What I asked:** I asked for dynamic sewing routes while the repository used Next.js 16 Cache Components. The prompt direction led to adding `export const dynamic = "force-dynamic"`.

**What the AI produced:** The three sewing routes contained:

```ts
export const dynamic = "force-dynamic";
```

At the same time, `next.config.ts` had Cache Components enabled.

**Why it was wrong:** Next.js 16 rejected route-segment `dynamic` configuration when `cacheComponents: true`, so the production build failed. The first workaround disabled Cache Components, which contradicted the repository's intended configuration.

**How I fixed it:** I removed the route-segment declarations, restored the original config, and put cookie/database-backed UI and role checks behind Suspense boundaries:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};
```

```tsx
<Suspense fallback={null}>
  <SewingGate>{children}</SewingGate>
</Suspense>
```

**How I proved the fix:** `npm run build` passed and reported the role pages as partial-prerendered with dynamic server-streamed content. A repository search found no `dynamic`, `revalidate`, or `fetchCache` route declarations.

### Flaw 3: Sewing tests assumed fixtures and unrelated queue state

**What I asked:** I asked for sewing integration tests using the same database setup and cleanup as the verification tests, including a queue containing orders in every status.

**What the AI produced:** The first test setup assumed users and a recipe already existed:

```ts
const supervisor = await prisma.user.findFirstOrThrow({
  where: { role: "cutting_supervisor" },
});
const recipe = await prisma.recipe.findFirstOrThrow({
  include: { components: true },
});
```

The first queue assertion compared the entire response with one local ID:

```ts
expect(json.orders.map((order) => order.id)).toEqual([orders[3].id]);
```

**Why it was wrong:** A clean database would fail during setup. A shared database can contain unrelated verified orders, so the assertion could fail even when the queue implementation was correct.

**How I fixed it:** I made the suite create missing fixtures and scoped assertions to the IDs created by that suite:

```ts
const returnedSeededOrders = json.orders.filter((order) =>
  createdOrderIds.includes(order.id),
);
expect(returnedSeededOrders.map((order) => order.id)).toEqual([orders[3].id]);
```

**How I proved the fix:** `tests/sewing.test.ts` passed all 7 tests when the configured database was reachable.

### Flaw 4: Security smoke script polluted captured order IDs

**What I asked:** I asked for a Bash/curl security smoke script that creates orders through the API and reuses their IDs for later checks.

**What the AI produced:** The first helper printed a PASS line to stdout before returning the ID:

```bash
expect_status "supervisor creates $roll_id" 201
jq -er '.order.id' <<<"$RESPONSE_BODY"
```

The caller captured the entire stdout value:

```bash
RED_ID="$(create_order ... )"
```

**Why it was wrong:** The captured variable contained both the PASS message and the order ID, so later URLs were invalid.

**How I fixed it:** I sent the creation status to stderr and kept stdout limited to the ID:

```bash
pass "supervisor creates $roll_id" >&2
jq -er '.order.id' <<<"$RESPONSE_BODY"
```

**How I proved the fix:** `git diff --check` passed and I reviewed the script flow. I could not execute it in this Windows environment because Git Bash was available but `jq` was not installed.

### Flaw 5: Login accepted untyped request data

**What I asked:** I asked for strict login validation so non-string values could not reach Prisma.

**What the AI produced:** The original route parsed the body into a loose optional-field type and used truthiness checks:

```ts
let body: { email?: string; password?: string };
body = await request.json();

const { email, password } = body;
if (!email || !password) {
  return NextResponse.json(
    { error: "Email and password are required" },
    { status: 400 },
  );
}
```

**Why it was wrong:** The route did not strictly validate the JSON shape, normalize the email, reject extra fields, or provide a safe schema boundary before the database lookup.

**How I fixed it:** I added a strict schema and used it before Prisma:

```ts
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
}).strict();
```

**How I proved the fix:** `tests/validation/auth.test.ts` passes valid input, missing email, number/object/array email values, empty password, and extra-key cases.

### Flaw 6: Server errors exposed internal messages

**What I asked:** I asked for generic 500 responses that keep details in server logs instead of returning Prisma or SQL text.

**What the AI produced:** The order route returned the caught exception message:

```ts
return NextResponse.json(
  { error: error instanceof Error ? error.message : "Internal server error" },
  { status: 500 },
);
```

The verification services had the same pattern in their 500 results.

**Why it was wrong:** A database or SQL exception could be returned directly to the client, exposing implementation details.

**How I fixed it:** I kept server-side logging but returned a constant response:

```ts
console.error("Error creating order:", error);
return NextResponse.json(
  { error: "Internal server error" },
  { status: 500 },
);
```

I also replaced the remaining server-side raw `error.message` transition response with a controlled message built from typed transition fields.

**How I proved the fix:** `tests/error-sanitization.test.ts` passes and asserts that a simulated Prisma/SQL failure returns exactly `Internal server error` without Prisma or SQL text. A repository search found no server-side `error.message` response path.

## 3. Human Refactoring

I kept business logic in `src/lib/services/` and made route handlers thin:

```text
route -> requireRole -> strict Zod validation -> service -> Prisma transaction
```

I made two important human-directed refactorings explicit.

First, I moved login validation ahead of database access:

```ts
const parsed = loginSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json(
    { errors: zodErrorToFieldErrors(parsed.error) },
    { status: 422 },
  );
}
```

Second, I made unknown-user login timing closer to the known-user path by comparing the password against a module-level dummy bcrypt hash:

```ts
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("apparelflow-dummy-password", 10);

if (!user) {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  return NextResponse.json(
    { error: "Invalid email or password" },
    { status: 401 },
  );
}
```

I also enforced the production JWT secret minimum without adding a fallback:

```ts
if (process.env.NODE_ENV === "production" && secret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}
```

## 4. Defensive Architecture

I rely on multiple server-side layers rather than trusting the UI:

1. **JWT session identity:** Protected routes read the HTTP-only `af_session` cookie. Request bodies do not choose the user ID, role, verifier ID, or order status.
2. **Server RBAC:** `requireRole` runs before protected route work. Server page layouts separately protect `/supervisor`, `/verifier`, and `/sewing`.
3. **Strict input validation:** Zod rejects unexpected keys and invalid values. Approval accepts no client data, rejection requires a trimmed note, counts are bounded integers, and login accepts only the strict schema.
4. **Query isolation:** The sewing queue hardcodes `status = VERIFIED`. Sewing detail allows only `VERIFIED` and `SEWING_STARTED`, returning `404` for other statuses.
5. **Atomic transitions:** Approval, rejection, and sewing start use transaction boundaries and status checks to prevent stale or duplicate transitions.
6. **Audit integrity:** `verification_logs` has a database trigger that rejects updates and deletes. Audit identity and timestamps are server-controlled.
7. **Database isolation:** RLS is enabled on all six application tables with no policies. The Prisma PostgreSQL role bypasses RLS for the application; anonymous/authenticated Supabase API keys cannot read those tables.
8. **Testing:** Unit and validation tests cover calculations and contracts. Integration tests cover RBAC, hidden states, atomic sewing start, audit immutability, error sanitization, and login validation.

I would still improve the production security posture with login rate limiting, CSRF protection appropriate to the cookie/session design, and a refresh-token/session rotation strategy.
