# 0004: Playwright pack on ast-grep, not eslint-plugin-playwright

Status: accepted (2026-11-27)

## Context

Playwright suites collect fixed sleeps, committed `.only`, skips that nobody revisits and tests that branch. The gate lints with Oxlint, which has no native Playwright rules. Oxlint can load ESLint plugins through `jsPlugins`, so `eslint-plugin-playwright` was tried first.

## What the spike verified

Oxlint 1.95.0 and 1.90.0 with `eslint-plugin-playwright` 2.12.2, on scratch spec files.

| Check | Result |
|---|---|
| Plugin loads and reports through `jsPlugins` | Works on both versions; a missing plugin fails the run |
| `no-wait-for-timeout` | Reports `page.waitForTimeout` and `page.mainFrame().waitForTimeout`; misses `p.waitForTimeout` where `p = page` |
| `no-focused-test` | Reports `test.only` and `test.describe.only` |
| `no-skipped-test` | Reports `skip`, also the conditional form with a reason (default options). Did not report any `test.fixme` or `test.describe.fixme` |
| Sleeps as `new Promise` plus `setTimeout` | No rule |
| A dated quarantine tag | No rule |
| `expect-expect` | Reports a test whose assertion is in a helper (unless every helper is configured) |
| Dependencies | The plugin declares `eslint` as a peer, so a default `npm install` adds ESLint |
| Stability | Oxlint documents JS plugins as alpha, not subject to semver |

## Decision

1. The pack is one `scan` tool, `playwright`. ast-grep finds the code shapes; JavaScript does the date check of the quarantine tag. The plugin loads, but it cannot express two of the required bans (sleep promises, dated quarantine) and misses `fixme`, so a second engine would be needed anyway. ESLint stays out.
2. The rules are generated in `guardrails-packs.mjs`, once per ast-grep language, not shipped as files in the target's `rules/`. So they cannot drift or be edited, they do not run through the project's `sgconfig.yml`, and the target configures only `include` and `ignore`.
3. A skip is accepted with a live `@quarantine-YYYY-MM-DD` tag, or as `test.skip(condition, 'reason')` with a condition that reads a name. This keeps Playwright's normal way of limiting a test to a browser or device, with the reason written down. No environment-only or allow-list form: it would need a list to maintain.
4. An expired or undated tag fails even without a `.skip`, because suites exclude quarantined tests with `grepInvert`.
5. Conditionals are limited to `if` and `switch` directly in a test or step body, without throw-only guards. Wider forms (ternaries, callbacks, hooks) were mostly legitimate.
6. No "test without assertions" rule. Assertions live in page objects, helpers and implicit waits, and no syntax pattern separates those from an empty test.
7. `ast-grep-ignore` comments that would silence these rules are findings. Exceptions go through the reviewed baseline.

## Consequences

- Adding the pack needs `@ast-grep/cli` only.
- The rules match syntax, not types: aliases of the test object not named `*Test`, computed members and a constant used as a tag are not resolved.
- A quarantine expiry turns a green branch red on its date. That is the point; fix the test or renew the tag in review.
- ast-grep skips files it cannot read, non-UTF-8 files and very large files while exiting 0, so the tool reads its `--inspect summary` counts and fails if any file was skipped. A new ast-grep release that changes that output fails the gate.

## When to revisit

Oxlint JS plugins leave alpha and the plugin covers `fixme`; then the focus and wait rules could move to it, keeping the quarantine check here.
