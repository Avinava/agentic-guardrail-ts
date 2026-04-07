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
  echo -e "${CYAN}${BOLD}║        🛡️  agentic-guardrail-ts  v1.0.0                 ║${NC}"
  echo -e "${CYAN}${BOLD}║   Automated guardrails for AI-assisted TypeScript dev   ║${NC}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✗${NC}  $1"; }
step()    { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ── Resolve GUARDRAIL_DIR (where configs/ lives) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARDRAIL_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$(pwd)"

# Validate we have the configs
if [ ! -d "$GUARDRAIL_DIR/configs" ]; then
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

# Project type — ask FIRST so we can tailor the scope prompt
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

# Agent
echo ""
echo -e "${CYAN}?${NC} Primary AI coding agent:"
echo "  1) Claude Code"
echo "  2) Cursor"
echo "  3) GitHub Copilot / Codex"
echo "  4) Gemini CLI"
echo "  5) All of the above"
read -rp "  Choice [1-5]: " AGENT_CHOICE
AGENT_CHOICE="${AGENT_CHOICE:-5}"

# Org scope — auto-detect or prompt
echo ""
DETECTED_SCOPE=""
if [ -f "$TARGET_DIR/package.json" ]; then
  DETECTED_SCOPE=$(node -e "
    const name = require('./package.json').name || '';
    const match = name.match(/^(@[^/]+)\//);
    if (match) console.log(match[1]);
  " 2>/dev/null || echo "")
fi

if [ "$PROJECT_TYPE" = "2" ]; then
  # Monorepo — scope is important
  echo -e "${CYAN}?${NC} npm org scope"
  echo -e "  ${BLUE}ℹ${NC}  This is the prefix for your workspace packages (e.g. ${BOLD}@acme${NC}/shared-types)."
  echo -e "  ${BLUE}ℹ${NC}  It's used in ESLint boundary rules and Syncpack configs to identify"
  echo -e "     your internal packages vs third-party dependencies."
  if [ -n "$DETECTED_SCOPE" ]; then
    echo -e "  ${GREEN}✓${NC}  Auto-detected: ${BOLD}$DETECTED_SCOPE${NC} (from package.json)"
    read -rp "  Scope [$DETECTED_SCOPE]: " ORG_SCOPE
    ORG_SCOPE="${ORG_SCOPE:-$DETECTED_SCOPE}"
  else
    echo ""
    echo -e "  Examples: ${BOLD}@acme${NC}, ${BOLD}@my-company${NC}, ${BOLD}@myname${NC}"
    read -rp "  Scope: " ORG_SCOPE
  fi
  if [ -z "$ORG_SCOPE" ]; then
    ORG_SCOPE="@myorg"
    warn "No scope provided, using placeholder: $ORG_SCOPE (edit configs later)"
  fi
else
  # Single package — scope is optional
  echo -e "${CYAN}?${NC} npm org scope ${YELLOW}(optional for single packages)${NC}"
  echo -e "  ${BLUE}ℹ${NC}  Only needed if your package name is scoped (e.g. ${BOLD}@acme${NC}/my-lib)."
  echo -e "  ${BLUE}ℹ${NC}  Press Enter to skip — you can always add it later."
  if [ -n "$DETECTED_SCOPE" ]; then
    echo -e "  ${GREEN}✓${NC}  Auto-detected: ${BOLD}$DETECTED_SCOPE${NC}"
    read -rp "  Scope [$DETECTED_SCOPE]: " ORG_SCOPE
    ORG_SCOPE="${ORG_SCOPE:-$DETECTED_SCOPE}"
  else
    read -rp "  Scope (or Enter to skip): " ORG_SCOPE
  fi
  if [ -z "$ORG_SCOPE" ]; then
    ORG_SCOPE="@myorg"
    info "Using placeholder: $ORG_SCOPE (only matters if you add workspace packages later)"
  fi
fi

# Ensure @ prefix
[[ "$ORG_SCOPE" != @* ]] && ORG_SCOPE="@$ORG_SCOPE"

echo ""
step "Scaffolding Configuration Files"

# ── Step 2: Copy configs ──
copy_config() {
  local src="$1"
  local dest="$2"
  if [ -f "$dest" ]; then
    warn "Skipping ${dest##*/} (already exists)"
    return
  fi
  cp "$src" "$dest"
  # Replace placeholders
  if command -v sed &>/dev/null; then
    sed -i.bak "s|__ORG_SCOPE__|$ORG_SCOPE|g" "$dest" 2>/dev/null && rm -f "$dest.bak"
    sed -i.bak "s|\"pinVersion\": \"\\*\"|\"pinVersion\": \"$WORKSPACE_PIN\"|g" "$dest" 2>/dev/null && rm -f "$dest.bak"
  fi
  success "Created ${dest##*/}"
}

# Foundation files
copy_config "$GUARDRAIL_DIR/configs/.editorconfig" "$TARGET_DIR/.editorconfig"
copy_config "$GUARDRAIL_DIR/configs/.nvmrc" "$TARGET_DIR/.nvmrc"
copy_config "$GUARDRAIL_DIR/configs/.prettierrc" "$TARGET_DIR/.prettierrc"
copy_config "$GUARDRAIL_DIR/configs/.prettierignore" "$TARGET_DIR/.prettierignore"

# Hooks & commits
copy_config "$GUARDRAIL_DIR/configs/lefthook.yml" "$TARGET_DIR/lefthook.yml"
copy_config "$GUARDRAIL_DIR/configs/commitlint.config.ts" "$TARGET_DIR/commitlint.config.ts"

# Linting & types
copy_config "$GUARDRAIL_DIR/configs/eslint.config.js" "$TARGET_DIR/eslint.config.js"
copy_config "$GUARDRAIL_DIR/configs/tsconfig.base.json" "$TARGET_DIR/tsconfig.base.json"

# Code health
copy_config "$GUARDRAIL_DIR/configs/knip.json" "$TARGET_DIR/knip.json"
copy_config "$GUARDRAIL_DIR/configs/.syncpackrc.json" "$TARGET_DIR/.syncpackrc.json"

# Testing & builds
copy_config "$GUARDRAIL_DIR/configs/vitest.config.ts" "$TARGET_DIR/vitest.config.ts"

# Monorepo-only
if [ "$PROJECT_TYPE" = "2" ]; then
  copy_config "$GUARDRAIL_DIR/configs/turbo.json" "$TARGET_DIR/turbo.json"
fi

# Gitignore template
if [ ! -f "$TARGET_DIR/.gitignore" ]; then
  cp "$GUARDRAIL_DIR/configs/.gitignore.template" "$TARGET_DIR/.gitignore"
  success "Created .gitignore"
fi

# ── Step 3: Scripts ──
mkdir -p "$TARGET_DIR/scripts"
for script in typecheck-staged.sh publint-all.sh; do
  if [ -f "$GUARDRAIL_DIR/scripts/$script" ]; then
    copy_config "$GUARDRAIL_DIR/scripts/$script" "$TARGET_DIR/scripts/$script"
    chmod +x "$TARGET_DIR/scripts/$script"
  fi
done

# ── Step 4: Agent instruction files ──
step "Creating Agent Instruction Files"

copy_agent() {
  local src="$1"
  local dest="$2"
  if [ -f "$src" ]; then
    copy_config "$src" "$dest"
  fi
}

case "$AGENT_CHOICE" in
  1) copy_agent "$GUARDRAIL_DIR/agents/CLAUDE.md" "$TARGET_DIR/CLAUDE.md" ;;
  2) copy_agent "$GUARDRAIL_DIR/agents/.cursorrules" "$TARGET_DIR/.cursorrules" ;;
  3) copy_agent "$GUARDRAIL_DIR/agents/AGENTS.md" "$TARGET_DIR/AGENTS.md" ;;
  4) copy_agent "$GUARDRAIL_DIR/agents/GEMINI.md" "$TARGET_DIR/GEMINI.md" ;;
  5)
    copy_agent "$GUARDRAIL_DIR/agents/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
    copy_agent "$GUARDRAIL_DIR/agents/GEMINI.md" "$TARGET_DIR/GEMINI.md"
    copy_agent "$GUARDRAIL_DIR/agents/AGENTS.md" "$TARGET_DIR/AGENTS.md"
    copy_agent "$GUARDRAIL_DIR/agents/.cursorrules" "$TARGET_DIR/.cursorrules"
    ;;
esac

# ── Step 5: CI ──
step "Creating CI Pipeline"
mkdir -p "$TARGET_DIR/.github/workflows"
if [ ! -f "$TARGET_DIR/.github/workflows/ci.yml" ]; then
  cp "$GUARDRAIL_DIR/.github/workflows/ci.yml" "$TARGET_DIR/.github/workflows/ci.yml" 2>/dev/null || true
  success "Created .github/workflows/ci.yml"
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
  "eslint-plugin-boundaries"
  "eslint-config-prettier"
  "knip"
  "syncpack"
  "publint"
  "vitest"
  "typescript"
)

if [ "$PROJECT_TYPE" = "2" ]; then
  DEPS+=("turbo")
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
echo "  • Config files:  .prettierrc, eslint.config.js, tsconfig.base.json, etc."
echo "  • Git hooks:     lefthook.yml (pre-commit + commit-msg)"
echo "  • Agent file:    CLAUDE.md / .cursorrules / GEMINI.md / AGENTS.md"
echo "  • CI pipeline:   .github/workflows/ci.yml"
echo "  • Scripts:       scripts/typecheck-staged.sh, scripts/publint-all.sh"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Review and customize ${BOLD}eslint.config.js${NC} — map YOUR packages to tiers"
echo "  2. Review and customize ${BOLD}commitlint.config.ts${NC} — add YOUR package scopes"
echo "  3. Review and customize ${BOLD}knip.json${NC} — add YOUR workspace entries"
echo "  4. Add scripts to your root ${BOLD}package.json${NC} (see docs/getting-started.md)"
echo "  5. Make an intentional mistake and try to commit — watch the loop! 🔄"
echo ""
echo -e "  📖  Full docs: ${BLUE}https://github.com/Avinava/agentic-guardrail-ts#readme${NC}"
echo ""
