#!/usr/bin/env bash
# Render the 7 Kai Day-2 clips (HQ, safe band, cold open) + sunset thumbnails.
cd /c/Users/moham/Downloads/cl/sluice || exit 1
D='C:/Users/moham/AppData/Local/Temp/kai/day2'
CAM="--layout stack --cam 0:430:390:222 --focus 0.65"
r() {  # file start end cold hook title [layout args...]
  f=$1; s=$2; e=$3; c=$4; hook=$5; title=$6; shift 6
  python clipper/clip.py kai --file "$D/$f" --start "$s" --end "$e" --cold-open "$c" \
    --hook "$hook" --title "$title" "$@" 2>&1 | grep -E "ERROR|done:|copied"
}
r w3452.mp4 8.5 33 7  "KAI CALLED THIS SCENE BEAUTIFUL" "Kai Cenat called this GTA 6 fight scene beautiful 😭 #KaiCenat #GTA6" $CAM
r w4007.mp4 0 26 12.6 "KAI SCREAMED AT THIS MISSION" "Kai Cenat lost it during this GTA 6 mission 😭 #KaiCenat #GTA6" $CAM
r w4547.mp4 0 27 20.0 "LUCIA SET THE STANDARD" "Kai Cenat says girls need to be like Lucia 😭 #KaiCenat #GTA6" $CAM
r w9472.mp4 14 40 2.5 "HOW DON'T YOU KNOW HOW TO PLAY?!" "Kai Cenat roasts a kid who can't play GTA 6 💀 #KaiCenat #GTA6" --layout center --focus 0.45
r w14048.mp4 6 25 8.5 "KAI CENAT'S GTA 6 MONEY PLAN" "Kai Cenat found the easiest money in GTA 6 💰 #KaiCenat #GTA6" $CAM
r w14768.mp4 8 27 13.5 "THAT'S HOW YOU MAKE MONEY CHAT" "Kai Cenat's GTA 6 money method actually worked 💰 #KaiCenat #GTA6" $CAM
r w18412.mp4 4 24 13.8 "KAI JUST FOUND GTA 6 ROBBERIES" "Kai Cenat finds robberies in GTA 6 😳 #KaiCenat #GTA6" $CAM
echo ALL-RENDERED
