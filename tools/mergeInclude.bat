@echo off
chcp 65001 >nul

REM 出力ファイル名
set OUTPUT_FILE=merged.txt

REM もし出力先が既に存在していたら削除する
if exist %OUTPUT_FILE% del %OUTPUT_FILE%

REM 先頭に固定メッセージを付与
(
echo 貴方は会社の中で一番のエンジニアです。
echo 最下部にアプリケーションのソースを添付しました。
echo ・
echo ・
echo ・
echo ・
echo ・
echo ・
echo 以上を実施し、編集しないファイルを除き完全なコードを下さい。しかしながら、最高の成果物を出すために、少しでも不明な点があれば質問をください。
) >> %OUTPUT_FILE%

echo 選択されたファイルの結合処理中...

REM include.txt に書かれた各行を読み込み、ファイル名→本文→区切り線 の順に追記する
for /f "usebackq delims=" %%f in ("include.txt") do (
  if exist "%%~f" (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%~f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
    ) else (
    echo [警告] 指定されたファイルが見つかりません: %%f
    echo [警告] 指定されたファイルが見つかりません: %%f >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
  )
)

echo すべてのファイルを結合しました！
pause
