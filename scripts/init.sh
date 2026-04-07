#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# agentic-guardrail-ts — init.sh
# One-command scaffolding for AI-assisted TypeScript projects
#
# Usage:
#   bash <(curl -s https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/scripts/init.sh)
#   # or
#   git clone https://github.com/Avinava/agentic-guardrail-ts.git /tmp/guardrails && bash /tmp/guardrails/scripts/init.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}${BOLD}║        🛡️  agentic-guardrail-ts  v2.0.0                 ║${NC}"
  echo -e "${CYAN}${BOLD}║   Automated guardrails for AI-assisted TypeScript dev   ║${NC}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✗${NC}  $1"; }
step()    { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ── Resolve GUARDRAIL_DIR (where reference/ lives) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARDRAIL_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$(pwd)"

# Validate we have the reference configs
if [ ! -d "$GUARDRAIL_DIR/reference" ]; then
  # Try fetching from GitHub
  GUARDRAIL_DIR="/tmp/agentic-guardrail-ts-$$"
  info "Downloading guardrail configs..."
  git clone --depth 1 https://github.com/Avinava/agentic-guardrail-ts.git "$GUARDRAIL_DIR" 2>/dev/null
  CLEANUP_DIR="$GUARDRAIL_DIR"
fi

cleanup() {
  if [ -n "${CLEANUP_DIR:-}" ] && [ -d "$CLEANUP_DIR" ]; then
    rm -rf "$CLEANUP_DIR"
  fi
}
trap cleanup EXIT

banner

# ── Step 1: Gather info ──
step "Project Configuration"

# Detect existing package.json
if [ -f "$TARGET_DIR/package.json" ]; then
  EXISTING_NAME=$(node -e "console.log(require('./package.json').name || '')" 2>/dev/null || echo "")
  if [ -n "$EXISTING_NAME" ]; then
    info "Detected existing project: ${BOLD}$EXISTING_NAME${NC}"
  fi
fi

# Project type
echo ""
echo -e "${CYAN}?${NC} Project type:"
echo "  1) Single package (simple TypeScript project)"
echo "  2) Monorepo (multiple packages with workspaces)"
read -rp "  Choice [1/2]: " PROJECT_TYPE
PROJECT_TYPE="${PROJECT_TYPE:-1}"

# Package manager
echo ""
echo -e "${CYAN}?${NC} Package manager:"
echo "  1) npm"
echo "  2) pnpm"
echo "  3) yarn"
read -rp "  Choice [1/2/3]: " PKG_MANAGER_CHOICE
case "${PKG_MANAGER_CHOICE:-1}" in
  2) PKG_MANAGER="pnpm"; WORKSPACE_PIN="workspace:*" ;;
  3) PKG_MANAGER="yarn"; WORKSPACE_PIN="workspace:*" ;;
  *) PKG_MANAGER="npm"; WORKSPACE_PIN="*" ;;
esac

# Org scope — auto-detect or prompt (only for monorepo)
DETECTED_SCOPE=""
if [ -f "$TARGET_DIR/package.json" ]; then
  DETECTED_SCOPE=$(node -e "
    const name = require('./package.json').name || '';
    const match = name.match(/^(@[^/]+)\//);
    if (match) console.log(match[1]);
  " 2>/dev/null || echo "")
fi

if [ "$PROJECT_TYPE" = "2" ]; then
  echo ""
  echo -e "${CYAN}?${NC} npm org scope"
  echo -e "  ${BLUE}ℹ${NC}  Prefix for workspace packages (e.g. ${BOLD}@acme${NC}/shared-types)."
  if [ -n "$DETECTED_SCOPE" ]; then
    echo -e "  ${GREEN}✓${NC}  Auto-detected: ${BOLD}$DETECTED_SCOPE${NC}"
    read -rp "  Scope [$DETECTED_SCOPE]: " ORG_SCOPE
    ORG_SCOPE="${ORG_SCOPE:-$DETECTED_SCOPE}"
  else
    read -rp "  Scope (e.g. @acme): " ORG_SCOPE
  fi
  if [ -z "$ORG_SCOPE" ]; then
    ORG_SCOPE="@myorg"
    warn "No scope provided, using placeholder: $ORG_SCOPE (edit configs later)"
  fi
  [[ "$ORG_SCOPE" != @* ]] && ORG_SCOPE="@$ORG_SCOPE"
else
  ORG_SCOPE="${DETECTED_SCOPE:-@myorg}"
fi

echo ""
step "Scaffolding Configuration Files"

# ── Step 2: Determine source directory ──
if [ "$PROJECT_TYPE" = "2" ]; then
  REF_DIR="$GUARDRAIL_DIR/reference/monorepo"
else
  REF_DIR="$GUARDRAIL_DIR/reference/single-package"
fi

# ── Step 3: Copy configs ──
copy_config() {
  local src="$1"
  local dest="$2"
  if [ -f "$dest" ]; then
    warn "Skipping ${dest##*/} (already exists)"
    return
  fi
  cp "$src" "$dest"
  # Replace @example scope with actual scope
  if command -v sed &>/dev/null; then
    sed -i.bak "s|@example|$ORG_SCOPE|g" "$dest" 2>/dev/null && rm -f "$dest.bak"
  fi
  success "Created ${dest##*/}"
}

# Foundation files
for f in .editorconfig .nvmrc .prettierrc .prettierignore; do
  if [ -f "$REF_DIR/$f" ]; then
    copy_config "$REF_DIR/$f" "$TARGET_DIR/$f"
  fi
done

# Linting & hooks
copy_config "$REF_DIR/lefthook.yml" "$TARGET_DIR/lefthook.yml"
copy_config "$REF_DIR/commitlint.config.ts" "$TARGET_DIR/commitlint.config.ts"
copy_config "$REF_DIR/eslint.config.js" "$TARGET_DIR/eslint.config.js"
copy_config "$REF_DIR/vitest.config.ts" "$TARGET_DIR/vitest.config.ts"

# TypeScript config
if [ "$PROJECT_TYPE" = "2" ]; then
  copy_config "$REF_DIR/tsconfig.base.json" "$TARGET_DIR/tsconfig.base.json"
else
  if [ -f "$REF_DIR/tsconfig.json" ] && [ ! -f "$TARGET_DIR/tsconfig.json" ]; then
    copy_config "$REF_DIR/tsconfig.json" "$TARGET_DIR/tsconfig.json"
  fi
fi

# Monorepo-only
if [ "$PROJECT_TYPE" = "2" ]; then
  copy_config "$REF_DIR/turbo.json" "$TARGET_DIR/turbo.json"
  copy_config "$REF_DIR/knip.json" "$TARGET_DIR/knip.json"
  copy_config "$REF_DIR/.syncpackrc.json" "$TARGET_DIR/.syncpackrc.json"
fi

# ── Step 4: Scripts (monorepo only) ──
if [ "$PROJECT_TYPE" = "2" ]; then
  mkdir -p "$TARGET_DIR/scripts"
  for script in typecheck-staged.sh publint-all.sh; do
    if [ -f "$GUARDRAIL_DIR/scripts/$script" ]; then
      copy_config "$GUARDRAIL_DIR/scripts/$script" "$TARGET_DIR/scripts/$script"
      chmod +x "$TARGET_DIR/scripts/$script"
    fi
  done
fi

# ── Step 5: .gitignore ──
if [ ! -f "$TARGET_DIR/.gitignore" ]; then
  cat > "$TARGET_DIR/.gitignore" << 'EOF'
node_modules/
dist/
coverage/
*.tsbuildinfo
.turbo/
.env
.env.local
EOF
  success "Created .gitignore"
fi

# ── Step 6: Install dependencies ──
step "Dev Dependencies"

DEPS=(
  "prettier"
  "lint-staged"
  "lefthook"
  "@commitlint/cli"
  "@commitlint/config-conventional"
  "eslint"
  "typescript-eslint"
  "eslint-config-prettier"
  "knip"
  "publint"
  "vitest"
  "typescript"
)

if [ "$PROJECT_TYPE" = "2" ]; then
  DEPS+=("eslint-plugin-boundaries" "syncpack" "turbo")
fi

DEPS_STRING=$(printf ' %s' "${DEPS[@]}")

echo ""
echo -e "${BOLD}The following devDependencies will be installed:${NC}"
echo ""
for dep in "${DEPS[@]}"; do
  echo "  • $dep"
done
echo ""

read -rp "$(echo -e "${CYAN}?${NC}") Install now with $PKG_MANAGER? [Y/n]: " INSTALL_CONFIRM
INSTALL_CONFIRM="${INSTALL_CONFIRM:-Y}"

if [[ "$INSTALL_CONFIRM" =~ ^[Yy] ]]; then
  info "Installing devDependencies..."
  case "$PKG_MANAGER" in
    pnpm) pnpm add -D $DEPS_STRING ;;
    yarn) yarn add -D $DEPS_STRING ;;
    *)    npm install -D $DEPS_STRING ;;
  esac
  success "Dependencies installed"

  # Initialize lefthook
  info "Installing git hooks..."
  npx lefthook install
  success "Git hooks installed"
else
  echo ""
  info "Run this manually when ready:"
  echo ""
  echo -e "  ${BOLD}$PKG_MANAGER ${PKG_MANAGER/npm/install}${PKG_MANAGER/npm/ -D}${DEPS_STRING}${NC}"
  echo -e "  ${BOLD}npx lefthook install${NC}"
fi

# ── Done ──
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║               🎉  Setup Complete!                       ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}What was created:${NC}"
echo "  • Config files:  .prettierrc, eslint.config.js, tsconfig, lefthook.yml, etc."
echo "  • Git hooks:     lefthook.yml (pre-commit + commit-msg)"
echo "  • CI pipeline:   .github/workflows/ci.yml (if you need one, see reference/ci/)"
if [ "$PROJECT_TYPE" = "2" ]; then
  echo "  • Scripts:       scripts/typecheck-staged.sh, scripts/publint-all.sh"
fi
echo ""
echo -e "${BOLD}Next steps:${NC}"
if [ "$PROJECT_TYPE" = "2" ]; then
  echo "  1. Review ${BOLD}eslint.config.js${NC} — map YOUR packages to tiers"
  echo "  2. Review ${BOLD}commitlint.config.ts${NC} — add YOUR package scopes"
  echo "  3. Review ${BOLD}knip.json${NC} — add YOUR workspace entries"
fi
echo "  4. Add scripts to your root ${BOLD}package.json${NC} (build, test, lint, etc.)"
echo "  5. Make a commit and watch the guardrails in action! 🔄"
echo ""
echo -e "  📖  Full docs: ${BLUE}https://github.com/Avinava/agentic-guardrail-ts#readme${NC}"
echo ""
