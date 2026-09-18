#!/usr/bin/env bash
# TE-Anubis installer.
#
#   curl -fsSL https://raw.githubusercontent.com/gabesx/te-Anubis/main/install.sh | bash
#
# Clones (or updates) TE-Anubis into $TE_ANUBIS_INSTALL_DIR (default ~/.te-anubis), builds it
# with the Node.js/npm already on your machine (there's no published npm package or standalone
# binary yet — this builds from source), and symlinks `anubis` into $TE_ANUBIS_BIN_DIR (default
# ~/.local/bin). Re-running this script later updates an existing install in place.
#
# Env vars: TE_ANUBIS_INSTALL_DIR, TE_ANUBIS_BIN_DIR, TE_ANUBIS_REF (git ref to install, default
# "main"), TE_ANUBIS_REPO_URL (clone source, default the real repo — overridable so CI/tests can
# point this at a local checkout instead of the network).
set -euo pipefail

REPO_URL="${TE_ANUBIS_REPO_URL:-https://github.com/gabesx/te-Anubis.git}"
REF="${TE_ANUBIS_REF:-main}"
INSTALL_DIR="${TE_ANUBIS_INSTALL_DIR:-$HOME/.te-anubis}"
BIN_DIR="${TE_ANUBIS_BIN_DIR:-$HOME/.local/bin}"
MIN_NODE_MAJOR=20

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

for cmd in node npm git; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but was not found on PATH."
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
  die "Node.js >= ${MIN_NODE_MAJOR} is required (found $(node -v)). Install a newer Node.js and re-run this script."
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch --quiet origin "$REF"
  git -C "$INSTALL_DIR" checkout --quiet --detach FETCH_HEAD
else
  info "Cloning TE-Anubis into $INSTALL_DIR"
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  git -C "$INSTALL_DIR" checkout --quiet "$REF"
fi

info "Installing dependencies"
(cd "$INSTALL_DIR" && npm ci --no-fund --no-audit)

info "Building"
(cd "$INSTALL_DIR" && npm run build --silent)

chmod +x "$INSTALL_DIR/bin/anubis.js"
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/anubis.js" "$BIN_DIR/anubis"
info "Linked $BIN_DIR/anubis -> $INSTALL_DIR/bin/anubis.js"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    warn "$BIN_DIR is not on your PATH."
    warn "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.) and restart your shell:"
    warn "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

if PATH="$BIN_DIR:$PATH" anubis --version >/dev/null 2>&1; then
  info "TE-Anubis installed: $(PATH="$BIN_DIR:$PATH" anubis --version)"
  info "Set an API key (GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY) and run 'anubis review --help'."
  info "See https://github.com/gabesx/te-Anubis/blob/main/docs/local-setup.md for details."
  info "To uninstall: rm -rf '$INSTALL_DIR' '$BIN_DIR/anubis'"
else
  die "Build finished but 'anubis --version' failed to run. Check the output above for errors."
fi
