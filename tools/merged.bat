@echo off
chcp 65001 >nul

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
echo 以上を実施し、編集しないファイルを除き完全なコードを下さい。
echo しかしながら、最高の成果物を出すために、少しでも不明な点があれば質問をください。
echo --------
) >> %OUTPUT_FILE%

echo HTMLファイルの結合処理中...

for %%f in ("..\\*.html") do (
  REM exclude.txt に「..\ファイル名.html」の行があれば除外
  findstr /x /c:"..\\%%~nxf" exclude.txt >nul 2>&1
  echo %%~nxf >> %OUTPUT_FILE%
  if errorlevel 1 (
    type "%%f" >> %OUTPUT_FILE%
  ) else (
    echo ... >> %OUTPUT_FILE%
  )
  echo ---- >> %OUTPUT_FILE%
)

echo CSSファイルの結合処理中...

for %%f in ("..\\*.css") do (
  findstr /x /c:"..\\%%~nxf" exclude.txt >nul 2>&1
  echo %%~nxf >> %OUTPUT_FILE%
  if errorlevel 1 (
    type "%%f" >> %OUTPUT_FILE%
  ) else (
    echo ... >> %OUTPUT_FILE%
  )
  echo ---- >> %OUTPUT_FILE%
)

echo JSファイルの結合処理中...

for %%f in ("..\\js\\*.js") do (
  findstr /x /c:"..\\js\\%%~nxf" exclude.txt >nul 2>&1
  echo %%~nxf >> %OUTPUT_FILE%
  if errorlevel 1 (
    type "%%f" >> %OUTPUT_FILE%
  ) else (
    echo ... >> %OUTPUT_FILE%
  )
  echo ---- >> %OUTPUT_FILE%
)

echo すべてのファイルを結合しました！
pause
