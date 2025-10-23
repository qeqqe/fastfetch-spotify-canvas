#!/usr/bin/env bash
set -euo pipefail

cd ~/fastfetch-spotify-canvas && bun dist/index.cjs > /dev/null 2>&1  && cd

MEDIA_DIR="$HOME/images/fastfetch/media"

shopt -s nullglob
files=("$MEDIA_DIR"/*)
if [ "${#files[@]}" -eq 0 ]; then
    echo "No media file found in $MEDIA_DIR" >&2
    exit 1
fi

if [ "${#files[@]}" -gt 1 ]; then
    file=$(ls -1t "$MEDIA_DIR"/* | head -n1)
else
    file="${files[0]}"
fi

#(case-insensitive)
ext="${file##*.}"
ext="${ext,,}"  # lowercase

case "$ext" in
    jpg|jpeg)
        kitten icat -n --place 45x45@0x6 --scale-up --align left "$file" | fastfetch --logo-width 45 --raw -
        ;;
    gif)
        kitten icat -n --place 30x30@0x6 --scale-up --align left "$file" | fastfetch --logo-width 30 --raw -
        ;;
    *)
        echo "Unsupported media type: .$ext" >&2
        exit 2
        ;;
esac