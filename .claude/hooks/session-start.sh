#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install Node dependencies so type-checking and builds work immediately.
# `npm install` is used (over `npm ci`) to take advantage of container caching.
npm install

# Note: FFmpeg binaries are NOT fetched here (large download). Run
# `npm run fetch-ffmpeg` on demand when you need to exercise the engine locally.
