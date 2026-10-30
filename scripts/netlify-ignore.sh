#!/usr/bin/env bash
# Netlify "ignore" check. Exit 0 = skip this build, exit 1 = build.
# Builds whenever anything the website uses has changed; skips commits that
# only touch the collector, GitHub workflows, database scripts or docs.

# First deploy, or a manual "Trigger deploy": always build.
if [ -z "$CACHED_COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  exit 1
fi

# If the comparison fails for any reason, build to be safe.
if ! changed=$(git diff --name-only "$CACHED_COMMIT_REF" "$COMMIT_REF" 2>/dev/null); then
  exit 1
fi

site_changes=$(printf '%s\n' "$changed" | grep -vE '^(collector/|\.github/|db/|config/|style-guides/)|\.(sql|md)$' | grep -v '^$')
if [ -n "$site_changes" ]; then
  echo "Website files changed; building:"
  printf '%s\n' "$site_changes" | head -20
  exit 1
fi

echo "Only collector/workflow/database files changed; skipping the build."
exit 0
