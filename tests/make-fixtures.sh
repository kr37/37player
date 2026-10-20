#!/bin/bash
# Makes the test audio with ffmpeg (nothing copyrighted is kept in the repo).
set -e
cd "$(dirname "$0")/www"
inv="pan=stereo|c0=c0|c1=-1*c0"   # "invert stereo", like the Life of Buddha files
ffmpeg -loglevel error -y -f lavfi -i "sine=f=220:d=600,volume='0.2+0.15*sin(2*PI*t/120)':eval=frame" -af "$inv" -c:a libmp3lame -b:a 96k ten.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=f=220:d=7200,volume='0.2+0.15*sin(2*PI*t/600)':eval=frame" -af "$inv" -c:a libmp3lame -b:a 96k long2h.mp3
for spec in s16:pcm_s16le s24:pcm_s24le f32:pcm_f32le u8:pcm_u8; do ffmpeg -loglevel error -y -i ten.mp3 -c:a ${spec#*:} w_${spec%%:*}.wav; done
ffmpeg -loglevel error -y -i ten.mp3 -ac 1 -ar 48000 -c:a pcm_s16le w_mono48.wav
ffmpeg -loglevel error -y -f lavfi -i "sine=f=220:d=3600" -af "$inv" -ar 44100 -c:a pcm_s16le w_big.wav
# A small library to import: one folder of music with two playlists.
mkdir -p "ovt/M/Art/Alb"
ffmpeg -loglevel error -y -f lavfi -i "sine=f=330:d=225" -c:a libmp3lame -b:a 128k -metadata title="Liberating Prayer" -metadata album="Liberating Prayer" -metadata artist="New Kadampa Tradition" -metadata track=1 "ovt/M/Art/Alb/01 lp.mp3"
ffmpeg -loglevel error -y -f lavfi -i "sine=f=440:d=20" -c:a libmp3lame -b:a 192k "ovt/M/Art/Alb/02 loud.mp3"
printf '#EXTM3U\nArt/Alb/01 lp.mp3\n' > ovt/M/One.m3u8
printf '#EXTM3U\nArt/Alb/02 loud.mp3\nArt/Alb/01 lp.mp3\n' > ovt/M/Two.m3u8
echo "Test audio made in tests/www"
