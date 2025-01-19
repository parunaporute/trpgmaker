@echo off

REM 出力ファイル名
set OUTPUT_FILE=merged.txt

REM もし出力先が既に存在していたら削除する
if exist %OUTPUT_FILE% del %OUTPUT_FILE%
(
echo 貴方は会社の中で一番のエンジニアです。
echo 最下部にアプリケーションのソースを添付しました。
echo ・
echo ・
echo ・
echo ・
echo ・
echo ・
echo 
echo 以上を実施し、編集しないファイルを除き完全なコードを下さい。

) >> %OUTPUT_FILE%

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
