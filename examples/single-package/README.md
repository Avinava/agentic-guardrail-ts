# Single Package Example

A minimal TypeScript library with all guardrails configured.

## What's Included

- TypeScript strict mode
- Prettier formatting
- ESLint with TypeScript strict rules (no boundaries — single package)
- Knip dead code detection
- Lefthook pre-commit hooks
- Commitlint conventional commits
- Vitest testing with coverage ratcheting

## Try It

```bash
# Copy this example to a new directory
cp -r examples/single-package /tmp/my-test-project
cd /tmp/my-test-project

# Install deps
npm install

# Install git hooks
npx lefthook install

# Try committing with an error
echo 'console.log("oops");' >> src/index.ts
git add .
git commit -m "test: verify guardrails"
# → REJECTED by ESLint (no-console rule)
```
