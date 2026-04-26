# Tech Debt Ledger

Append-only ledger of known technical debt. Every `eslint-disable` that represents known debt should cross-link here by ID.

## Format

Each entry has:
- **ID:** short slug for cross-referencing from `eslint-disable` comments (e.g., `tech-debt.md#rhf-any-wrapper`)
- **Owner:** who identified it
- **Discovered:** date
- **Status:** `open` | `in-progress` | `✅ resolved`
- **Root cause:** one-liner explaining why this can't be fixed right now
- **eslint-disable count:** how many disable comments reference this entry
- **Closing commit:** SHA when resolved

## Active

### rhf-any-wrapper
- **Owner:** @developer
- **Discovered:** 2025-04-10
- **Status:** open
- **Root cause:** React Hook Form's `UseFormReturn<any>` is polymorphic by design; narrowing requires a generic wrapper that doesn't exist yet.
- **eslint-disable count:** 3 (`form-provider.tsx`, `use-form-wrapper.ts`, `form-context.ts`)

### legacy-api-response
- **Owner:** @developer
- **Discovered:** 2025-04-15
- **Status:** in-progress
- **Root cause:** Legacy REST API returns untyped JSON. Adding Zod validation in #287.
- **eslint-disable count:** 5 (`api-client.ts`)

## Resolved

### stale-cache-import
- **Owner:** @developer
- **Discovered:** 2025-03-15
- **Status:** ✅ resolved
- **Root cause:** CacheService was refactored from default to named export; stale `dist/` cached the old shape.
- **Closing commit:** `abc1234`

---

## Guidelines

- **Add entries proactively.** If you add an `eslint-disable`, add a tech-debt entry.
- **Update counts.** When you add or remove a disable comment, update the count here.
- **Review quarterly.** Check each open entry — can it be resolved now? Has the count grown?
- **Move to Resolved.** When fixed, move the entry down with the closing commit SHA.
- **Never delete.** Resolved entries are historical record. They help future contributors understand past decisions.
