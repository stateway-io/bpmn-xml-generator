#!/bin/sh
# install.sh — installs the bpmn-xml-generator skill into the current project.
#
# Compatible with Claude Code and Cline. The default path (.claude/skills/) is
# recognised by both tools. Use TARGET=cline to install to .cline/skills/ instead.
#
# Usage (run from your project root):
#
#   Claude Code or Cline (shared path):
#     curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | sh
#
#   Cline native path:
#     curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | TARGET=cline sh
#
#   Global — Claude Code or Cline (shared path):
#     curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | GLOBAL=1 sh
#
#   Global — Cline native path:
#     curl -fsSL https://raw.githubusercontent.com/stateway-io/bpmn-xml-generator/main/install.sh | GLOBAL=1 TARGET=cline sh
#
#   Skip installing the validator's npm dependencies:
#     ... | NO_DEPS=1 sh

set -e

REPO="${REPO:-stateway-io/bpmn-xml-generator}"
BRANCH="${BRANCH:-main}"
BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/${REPO}/${BRANCH}/.claude/skills/bpmn-xml-generator}"
SKILL="bpmn-xml-generator"

FILES="
SKILL.md
references/elements.md
references/patterns.md
references/examples.md
references/validation-errors.md
profiles/_contract.md
profiles/stateway.md
profiles/camunda8.md
profiles/flowable.md
scripts/package.json
scripts/package-lock.json
scripts/validate.mjs
scripts/layout.mjs
scripts/profiles.mjs
scripts/moddle/stateway.json
scripts/moddle/flowable.json
scripts/lint-rules/data-io.cjs
scripts/lint-rules/engine-support.cjs
scripts/lint-rules/expression-syntax.cjs
scripts/lint-rules/flowable-config.cjs
scripts/lint-rules/stateway-config.cjs
scripts/xsd/BPMN20.xsd
scripts/xsd/Semantic.xsd
scripts/xsd/BPMNDI.xsd
scripts/xsd/DC.xsd
scripts/xsd/DI.xsd
"

# Resolve destination directory
if [ "${GLOBAL:-0}" = "1" ]; then
  if [ "${TARGET:-claude}" = "cline" ]; then
    DEST="${HOME}/.cline/skills/${SKILL}"
  else
    DEST="${HOME}/.claude/skills/${SKILL}"
  fi
else
  if [ "${TARGET:-claude}" = "cline" ]; then
    DEST=".cline/skills/${SKILL}"
  else
    DEST=".claude/skills/${SKILL}"
  fi
fi

# ---------------------------------------------------------------------------
# Detect download tool
# ---------------------------------------------------------------------------
if command -v curl > /dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget > /dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  printf 'Error: curl or wget is required.\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
printf 'Installing %s skill to %s\n' "$SKILL" "$DEST"

for file in $FILES; do
  mkdir -p "$DEST/$(dirname "$file")"
  fetch "$BASE_URL/$file" "$DEST/$file"
  printf '  [ok] %s\n' "$file"
done

# ---------------------------------------------------------------------------
# Validator dependencies (optional, needs Node.js >= 20)
# ---------------------------------------------------------------------------
if [ "${NO_DEPS:-0}" = "1" ]; then
  printf '\nSkipped validator dependencies (NO_DEPS=1).\n'
elif command -v npm > /dev/null 2>&1; then
  printf '\nInstalling validator dependencies...\n'
  if npm ci --prefix "$DEST/scripts" --no-audit --no-fund --loglevel=error; then
    printf '  [ok] scripts/node_modules\n'
  else
    printf '  [warn] npm ci failed; run it later: npm ci --prefix %s/scripts\n' "$DEST"
  fi
else
  printf '\nNode.js/npm not found: the skill works, but cannot run its validator.\n'
  printf 'Install Node.js >= 20, then run: npm ci --prefix %s/scripts\n' "$DEST"
fi

if ! command -v xmllint > /dev/null 2>&1; then
  printf 'Optional: install xmllint (libxml2) to enable the XSD check of the validator.\n'
fi

printf '\nDone. Restart Claude Code or Cline (or start a new session) to activate the skill.\n'
