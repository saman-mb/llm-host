#!/usr/bin/env bash
# Install the llm-host GNOME Shell extension by symlinking the repo copy
# into ~/.local/share/gnome-shell/extensions/, then enabling it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="llm-host@local"
SRC="$REPO_ROOT/gnome-extension/$UUID"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions"
DEST="$DEST_DIR/$UUID"

if [ ! -d "$SRC" ]; then
    echo "error: extension source not found at $SRC" >&2
    exit 1
fi

mkdir -p "$DEST_DIR"

if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
    echo "error: $DEST exists and is not a symlink; refusing to clobber" >&2
    exit 1
fi

ln -sfn "$SRC" "$DEST"
echo "[install] symlinked $DEST -> $SRC"

# Enable the extension. If the shell hasn't discovered it yet (fresh install
# on Wayland), this may print "Extension does not exist" — the enable still
# persists in dconf and takes effect after the next shell start.
if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo "[install] enabled $UUID"
else
    # Persist the enable via dconf so it activates after re-login.
    current=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "@as []")
    if ! echo "$current" | grep -q "'$UUID'"; then
        # Append uuid into the array literal.
        new=$(echo "$current" | python3 -c "
import sys, ast
s = sys.stdin.read().strip()
# gsettings returns Python-list-ish syntax: ['a', 'b']
lst = ast.literal_eval(s) if s and s != '@as []' else []
if '$UUID' not in lst:
    lst.append('$UUID')
print(lst)
" 2>/dev/null || echo "['$UUID']")
        gsettings set org.gnome.shell enabled-extensions "$new"
        echo "[install] persisted enable in dconf"
    fi
    echo "[install] note: gnome-shell hasn't discovered the new extension yet."
    echo "[install]       log out and back in (Wayland) — it'll appear in the top bar."
fi

session=${XDG_SESSION_TYPE:-unknown}
if [ "$session" = "wayland" ]; then
    echo
    echo "Wayland session detected — log out and back in to load the extension."
    echo "After re-login, look for a 'LLM ●' button in the top bar."
else
    echo
    echo "X11 session — press Alt+F2, type 'r', Enter to reload GNOME Shell."
fi
