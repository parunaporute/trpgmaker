# ./htmlGen

## render.js

`htmlGen/render.js` は [Nunjucks](https://mozilla.github.io/nunjucks/) を使って、
テンプレートから HTML を生成するためのスクリプトです。

### 必要要件

- Node.js (推奨: v14 以上)
- `npm install nunjucks` で nunjucks をインストールしていること

### 使い方

```bash
node htmlGen/render.js
```

# ./tools

htmlGen ディレクトリに含まれるバッチスクリプトおよび関連ファイルの概要です。

## includeAllGen.bat
プロジェクト内のファイル構造をスキャンし、その情報を `include.txt` に出力するバッチスクリプトです。

## include.txt
`mergeInclude.bat` が参照するファイルリストを定義するテキストファイルです。スクリプトが統合対象とするファイルのパスをここに記載します。

## mergeInclude.bat
AI 向けスクリプトを生成し、`include.txt` に記載されているファイルのみを統合して `merged.txt` に出力するバッチスクリプトです。引数にファイルを指定すると、`include.txt` の代わりに利用します。

### 使い方

```bat
./merginclude.bat
```


## merged.bat
AI で使用可能なスクリプトを生成し、すべてのファイルを統合した結果を `merged.txt` に出力するバッチスクリプトです。

## XXXXのinclude.txt
`mergeInclude.bat`の引数に用いるファイルです。
