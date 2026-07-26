#!/usr/bin/env bash
#
# Build both versions of the board and serve them behind one ngrok tunnel:
#
#   /            landing page
#   /docking/    main                — square notes that dock to a parent's edges
#   /nested/     nested-containment  — children rendered inside the parent card
#
# Ctrl-C tears everything down and puts you back on the branch you started from.
# Nothing is uploaded anywhere; killing the tunnel is the whole teardown.
#
# Env overrides: PORT, STAGE, SKIP_TUNNEL=1

set -euo pipefail

PORT="${PORT:-4238}"
STAGE="${STAGE:-/tmp/floating-notes-demo}"
DOCKING_BRANCH="${DOCKING_BRANCH:-main}"
NESTED_BRANCH="${NESTED_BRANCH:-nested-containment}"

cd "$(git rev-parse --show-toplevel)"

# Switching branches would clobber uncommitted work, so refuse up front.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty — commit or stash first (this script switches branches)" >&2
  exit 1
fi

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SERVE_PID=""
NGROK_PID=""

cleanup() {
  echo
  echo "shutting down…"
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null || true
  [ -n "$SERVE_PID" ] && kill "$SERVE_PID" 2>/dev/null || true
  # npx starts `serve` through an npm wrapper, so killing the pid we hold can leave the node
  # process that actually owns the port. Sweep for it by name.
  pkill -f "serve -l $PORT" 2>/dev/null || true
  # Always hand the repo back the way we found it, including on a failed build.
  git switch --quiet "$START_BRANCH" 2>/dev/null || true
  echo "done. you are on $START_BRANCH"
}
# Only EXIT runs cleanup; the signal traps just exit, or teardown would print twice.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

build() {
  local branch="$1" dest="$2" base="$3"
  echo "==> building $branch at base href $base"
  git switch --quiet "$branch"
  # Without --base-href each build asks for /main-xxx.js at the domain root and
  # renders a blank page when served from a subpath.
  npx ng build --base-href "$base" >/dev/null
  rm -rf "${STAGE:?}/$dest"
  cp -r dist/floating-notes/browser "$STAGE/$dest"
}

rm -rf "${STAGE:?}"
mkdir -p "$STAGE"

build "$DOCKING_BRANCH" docking /docking/
build "$NESTED_BRANCH" nested /nested/
git switch --quiet "$START_BRANCH"

cat > "$STAGE/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Floating notes — two versions</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f1f5f9; background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
    background-size: 24px 24px;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a;
  }
  main { max-width: 640px; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.sub { margin: 0 0 24px; color: #64748b; font-size: 14px; }
  .cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  a.card {
    display: block; padding: 18px; border-radius: 8px; text-decoration: none; color: inherit;
    box-shadow: 0 1px 2px rgba(15,23,42,.2), 0 8px 16px -10px rgba(15,23,42,.4);
    transition: transform .12s;
  }
  a.card:hover { transform: translateY(-2px); }
  .docking { background: #fde68a; }
  .nested { background: #bfdbfe; }
  .chip { font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
  .docking .chip { color: #d97706; }
  .nested .chip { color: #2563eb; }
  strong { display: block; margin: 4px 0 6px; font-size: 15px; }
  small { font-size: 12px; line-height: 1.4; display: block; opacity: .75; }
  footer { margin-top: 24px; font-size: 12px; color: #94a3b8; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>Floating notes</h1>
  <p class="sub">Two takes on the same brainstorm board. Pick one.</p>
  <div class="cards">
    <a class="card docking" href="/docking/">
      <span class="chip">branch: main</span>
      <strong>Edge docking</strong>
      <small>Fixed squares that snap flush to a parent's left, right, top or bottom edge.</small>
    </a>
    <a class="card nested" href="/nested/">
      <span class="chip">branch: nested-containment</span>
      <strong>Containment</strong>
      <small>Children live inside the parent card, which grows to fit them.</small>
    </a>
  </div>
  <footer>
    Each version keeps its own board in your browser's localStorage — nothing is shared between
    visitors, and nothing syncs live. Use “Reset board” in either one to start over.
  </footer>
</main>
</body>
</html>
HTML

echo "==> serving $STAGE on http://localhost:$PORT"
npx --yes serve -l "$PORT" "$STAGE" >/dev/null 2>&1 &
SERVE_PID=$!
sleep 3

if ! curl -sf -o /dev/null "http://localhost:$PORT/docking/"; then
  echo "error: local server did not come up on port $PORT" >&2
  exit 1
fi

if [ "${SKIP_TUNNEL:-}" = "1" ]; then
  echo
  echo "  local only:  http://localhost:$PORT/"
  echo
  echo "Ctrl-C to stop."
  wait "$SERVE_PID"
  exit 0
fi

if ! command -v ngrok >/dev/null; then
  echo "warning: ngrok not found — serving locally only on http://localhost:$PORT/" >&2
  wait "$SERVE_PID"
  exit 0
fi

echo "==> opening tunnel"
ngrok http "$PORT" --log stdout --log-format json >"$STAGE/ngrok.log" 2>&1 &
NGROK_PID=$!

# The public URL is only known once the agent has registered with the service.
PUBLIC_URL=""
for _ in $(seq 1 20); do
  PUBLIC_URL="$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | grep -oE '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 1
done

if [ -z "$PUBLIC_URL" ]; then
  echo "error: tunnel did not report a URL — see $STAGE/ngrok.log" >&2
  exit 1
fi

echo
echo "  landing   $PUBLIC_URL/"
echo "  docking   $PUBLIC_URL/docking/     ($DOCKING_BRANCH)"
echo "  nested    $PUBLIC_URL/nested/      ($NESTED_BRANCH)"
echo
echo "  traffic   http://localhost:4040    (ngrok inspector)"
echo
echo "Free-tier ngrok shows an interstitial on first visit — click through once."
echo "The URL is random per session; it changes every time you run this."
echo "Ctrl-C to stop."

wait "$NGROK_PID"
