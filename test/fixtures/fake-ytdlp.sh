#!/bin/sh
# Stands for the PyInstaller yt-dlp binary: the spawned process is a bootloader, the real work runs in its child
sleep 30 &
echo $!
wait
