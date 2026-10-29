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
# Formats a browser can't play, and a playlist file posing as audio (conv.js).
mkdir -p conv
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=3" -ac 2 conv/ok.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=500:duration=3" -ac 2 -c:a wmav2 conv/talk.wma
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=600:duration=3" -ac 2 -c:a alac conv/lossless.m4a
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=700:duration=3" -ac 2 -c:a pcm_s16be conv/song.aiff
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=800:duration=3" -ac 2 -c:a adpcm_ima_qt -f aiff conv/ima.aif
printf '#EXTM3U\n#EXTINF:3,Song\nsong.mp3\n' > conv/notaudio.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=300:duration=1500" -ac 2 -c:a wmav2 -b:a 128k conv/longtalk.wma
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=520:duration=90" -ac 2 -c:a libmp3lame -b:a 128k conv/playme.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=330:duration=10" -ac 2 -c:a pcm_s16le conv/tone.wav
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=350:duration=10" -ac 2 -c:a pcm_s16le conv/tone2.wav
ffmpeg -loglevel error -y -f lavfi -i "testsrc=duration=6:size=320x240:rate=15" -f lavfi -i "sine=frequency=440:duration=6" -c:v mpeg4 -c:a aac -b:a 128k -shortest conv/teaching.mp4
ffmpeg -loglevel error -y -f lavfi -i "testsrc=duration=5:size=320x240:rate=15" -f lavfi -i "sine=frequency=550:duration=5" -c:v mpeg4 -c:a libvorbis -shortest conv/clip.mkv
ffmpeg -loglevel error -y -f lavfi -i "testsrc=duration=3:size=160x120:rate=10" -c:v mpeg4 conv/silent.mp4
# A folder of albums with no playlist files, for "Make a playlist of each folder" (folderpl.js).
# Track numbers deliberately disagree with the file names' order.
rm -rf folderpl && mkdir -p "folderpl/Pujas/Heruka" "folderpl/Pujas/Tara" "folderpl/Pujas/Teachings/Day 1"
fp(){ ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$3:duration=1" -metadata title="$2" ${4:+-metadata track=$4} -b:a 64k "$1"; }
fp "folderpl/Pujas/Heruka/b-10 Dedication.mp3" Dedication 300 10
fp "folderpl/Pujas/Heruka/z-2 Prayers.mp3" Prayers 310 2
fp "folderpl/Pujas/Heruka/a-untagged.mp3" Untagged 320
fp "folderpl/Pujas/Tara/Tara 10.mp3" T10 330
fp "folderpl/Pujas/Tara/Tara 2.mp3" T2 340
fp "folderpl/Pujas/Teachings/Intro.mp3" Intro 350 1
fp "folderpl/Pujas/Teachings/Day 1/Session.mp3" Session 360 1
# Playlists with audio that isn't there, for the review's playlist choice (plmiss.js):
# Good finds all its tracks, Mostly 2 of 3, Old 1 of 4.
rm -rf plmiss && mkdir -p plmiss/Set/audio plmiss/Set/Playlists
for n in one two three; do ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=500:duration=1" -metadata title=$n -b:a 64k plmiss/Set/audio/$n.mp3; done
printf '#EXTM3U\n../audio/one.mp3\n../audio/two.mp3\n' > plmiss/Set/Playlists/Good.m3u8
printf '#EXTM3U\n../audio/one.mp3\n../audio/three.mp3\n../audio/gone.mp3\n' > plmiss/Set/Playlists/Mostly.m3u8
printf '#EXTM3U\n../audio/three.mp3\n../audio/old1.mp3\n../audio/old2.mp3\n../audio/old3.mp3\n' > plmiss/Set/Playlists/Old.m3u8
# A slower folder to stop part-way, for the stop dialog (stopimport.js): A has 3 tracks, B 22.
rm -rf stopimp && mkdir -p stopimp/Set/A stopimp/Set/B
for i in 1 2 3; do ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$((300+i*10)):duration=120" -b:a 128k "stopimp/Set/A/a$i.mp3"; done
for i in $(seq 1 22); do ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$((400+i*10)):duration=120" -b:a 128k "stopimp/Set/B/b$i.mp3"; done
# The converter, where the test copy looks for it (conv3.js).
../../scripts/get_ffmpeg.sh > /dev/null && mkdir -p ffmpeg && cp ../../ffmpeg/ffmpeg-core.js ../../ffmpeg/ffmpeg-core.wasm ../../ffmpeg/VERSION ffmpeg/
echo "Test audio made in tests/www"
# Long-ish AAC in .m4a, for reading a piece at a time (m4apieces.js): a
# Zoom-like mono 32 kHz recording with its table at the end, and a stereo
# one with its table at the front.
mkdir -p m4a
ffmpeg -loglevel error -y -f lavfi -i "sine=f=200:d=480,volume='0.05+0.3*abs(sin(2*PI*t/97))':eval=frame" -ac 1 -ar 32000 -c:a aac -b:a 48k m4a/zoom.m4a
ffmpeg -loglevel error -y -f lavfi -i "sine=f=300:d=420,volume='0.1+0.25*abs(sin(2*PI*t/61))':eval=frame" -ac 2 -ar 44100 -c:a aac -b:a 96k -movflags +faststart m4a/fast.m4a
