@echo off

REM 出力ファイル名
set OUTPUT_FILE=merged.txt

REM もし出力先が既に存在していたら削除する
if exist %OUTPUT_FILE% del %OUTPUT_FILE%

echo HTMLファイルの結合処理中...

for %%f in ("..\\*.html") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo CSSファイルの結合処理中...

for %%f in ("..\\*.css") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo JSファイルの結合処理中...

for %%f in ("..\\js\\*.js") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo すべてのファイルを結合しました！
pause
