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

## includeGen.js
引数を指定されない場合はプロジェクト内のファイル構造をスキャンし、jsとCSSとHTMLのパスを `include.txt` に出力するバッチスクリプトです。
引数を指定さた場合はHTML内の構造をスキャンし、jsとCSSと当該HTMLのパスを `include.txt` に出力するバッチスクリプトです。

### 使い方

```bash
node ./includeGen.js
```

```bash
node ./includeGen.js ../index.html
```


## include.txt
`mergedGen.js` が参照するファイルリストを定義するテキストファイルです。スクリプトが統合対象とするファイルのパスをここに記載します。


## mergedGen.js
引数を指定されない場合は、AI 向けスクリプトを生成し、`include.txt` に記載されているファイルのみを統合して `merged.txt` に出力するバッチスクリプトです。
引数を指定された場合は、AI 向けスクリプトを生成し、引数に指定されたファイルに記載されているファイルを統合して `merged.txt` に出力するバッチスクリプトです。

### 使い方

```bash
node ./mergedGen.js
```

```bash
node ./mergedGen.js ./トップのセットinclude.txt
```

## XXXXのinclude.txt
`mergedGen.js`の引数に用いるファイルです。
