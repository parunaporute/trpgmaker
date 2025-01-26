@echo off
chcp 65001 >nul

REM include.txtを生成(上書き)
if exist include.txt del include.txt

echo HTMLファイルを収集中...
for %%f in ("..\\*.html") do echo %%f >> include.txt

echo CSSファイルを収集中...
for %%f in ("..\\*.css") do echo %%f >> include.txt

echo JSファイルを収集中...
for %%f in ("..\\js\\*.js") do echo %%f >> include.txt

echo 収集したファイルパスを include.txt に書き出しました。
pause
