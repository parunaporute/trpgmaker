#!/bin/bash

# 出力ファイル名
OUTPUT_FILE="merged.txt"

# もし出力先が既に存在していたら削除する
if [ -f "$OUTPUT_FILE" ]; then
    rm "$OUTPUT_FILE"
fi

echo "HTMLファイルの結合処理中..."

# ../*.html のファイルをループ
for f in ../*.html; do
    # ファイル名のみを出力
    echo "${f##*/}" >> "$OUTPUT_FILE"
    # ファイル内容を追記
    cat "$f" >> "$OUTPUT_FILE"
    # 区切り線を追記
    echo "---" >> "$OUTPUT_FILE"
done

echo "CSSファイルの結合処理中..."

# ../*.css のファイルをループ
for f in ../*.css; do
    echo "${f##*/}" >> "$OUTPUT_FILE"
    cat "$f" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
done

echo "JSファイルの結合処理中..."

# ../js/*.js のファイルをループ
for f in ../js/*.js; do
    echo "${f##*/}" >> "$OUTPUT_FILE"
    cat "$f" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
done

echo "すべてのファイルを結合しました！"

# 一時停止（Enterを押すまで待機したい場合）
read -p "続行するにはEnterキーを押してください..."