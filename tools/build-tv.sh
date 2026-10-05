#!/bin/sh
# Builds the kitchen TV's assets from a video atlas: a clip holding an 8x8
# grid of feeds (every tile 1/8 of the width and height), looped, 64 frames.
#
#   tv/reel.mp4  the atlas, grey, no audio, small
#   tv/glow.png  the prebaked light: one pixel per tile per frame, the
#                tile's average brightness. Frame f is the 8x8 block at
#                x = 8f .. 8f+7, so tile (column c, row r) of frame f is
#                the pixel at (8f + c, r). The game reads it to make the
#                TV's glow follow what's on screen without looking at video.
#
# Needs ffmpeg:  tools/build-tv.sh path/to/atlas.mp4
set -e
SRC=${1:?usage: tools/build-tv.sh atlas.mp4}
OUT="$(dirname "$0")/../tv"
mkdir -p "$OUT"
ffmpeg -y -v error -i "$SRC" -an -vf format=gray -c:v libx264 -pix_fmt yuv420p -crf 26 \
  -movflags +faststart "$OUT/reel.mp4"
ffmpeg -y -v error -i "$SRC" -vf "format=gray,scale=8:8:flags=area,tile=64x1" \
  -frames:v 1 "$OUT/glow.png"
