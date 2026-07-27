#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Cargo did not provide a binary to the macOS runner." >&2
  exit 64
fi

binary_argument=$1
shift
binary_directory=$(CDPATH= cd -- "$(dirname -- "$binary_argument")" && pwd)
binary_path="$binary_directory/$(basename -- "$binary_argument")"

if [ "$(basename -- "$binary_path")" != "musical" ]; then
  exec "$binary_path" "$@"
fi

if [ "${MUSICAL_AI_TEST:-false}" = "true" ]; then
  app_name="Musical AI Test"
  bundle_identifier="com.circularmoonray.musical.ai-test"
else
  app_name="Musical Dev"
  bundle_identifier="com.circularmoonray.musical.dev"
fi

dev_apps_root="$(dirname -- "$binary_directory")/codex-dev-apps"
app_root="$dev_apps_root/$app_name.app"
contents_root="$app_root/Contents"
macos_root="$contents_root/MacOS"
wrapped_executable="$macos_root/musical"
plist_path="$contents_root/Info.plist"

for candidate in \
  "$dev_apps_root/Musical Dev.app/Contents/MacOS/musical" \
  "$dev_apps_root/Musical AI Test.app/Contents/MacOS/musical"
do
  existing_pids=$(pgrep -f -- "$candidate" || true)
  if [ -n "$existing_pids" ]; then
    echo "Refusing to start another Musical process; already running: $existing_pids" >&2
    exit 66
  fi
done

mkdir -p "$macos_root"

if [ -e "$wrapped_executable" ] && [ ! -L "$wrapped_executable" ]; then
  echo "Refusing to replace non-symlink executable: $wrapped_executable" >&2
  exit 65
fi

ln -sfn "$binary_path" "$wrapped_executable"

{
  printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>'
  printf '%s\n' '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  printf '%s\n' '<plist version="1.0">'
  printf '%s\n' '<dict>'
  printf '%s\n' '  <key>CFBundleDisplayName</key>'
  printf '  <string>%s</string>\n' "$app_name"
  printf '%s\n' '  <key>CFBundleExecutable</key>'
  printf '%s\n' '  <string>musical</string>'
  printf '%s\n' '  <key>CFBundleIdentifier</key>'
  printf '  <string>%s</string>\n' "$bundle_identifier"
  printf '%s\n' '  <key>CFBundleName</key>'
  printf '  <string>%s</string>\n' "$app_name"
  printf '%s\n' '  <key>CFBundlePackageType</key>'
  printf '%s\n' '  <string>APPL</string>'
  printf '%s\n' '  <key>NSHighResolutionCapable</key>'
  printf '%s\n' '  <true/>'
  printf '%s\n' '</dict>'
  printf '%s\n' '</plist>'
} > "$plist_path"

# Replace the Cargo runner process with the app itself so Tauri's watcher owns
# and terminates the exact Musical process during rebuilds.
exec "$wrapped_executable" "$@"
