#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 追加: node-html-parser のインポート
const { parse } = require('node-html-parser');

const includeFile = 'include.txt';

// --------------------------------------------------------------------------
// 1) バッチと同じ「..\\*.html, ..\\*.css, ..\\js\\*.js」を出力する関数
// --------------------------------------------------------------------------
function collectBatchLike() {
  // このスクリプト(jsファイル)があるディレクトリ
  const scriptDir = __dirname;

  // 親ディレクトリ ( .. )
  const parentDir = path.join(scriptDir, '..');
  // 親ディレクトリの下にある jsフォルダ
  const parentJsDir = path.join(parentDir, 'js');

  // ヘルパー: 指定したディレクトリで、拡張子が ext のファイル群を
  // scriptDir からの相対パス (..\filename など) で返す
  function getRelativePaths(dirPath, ext) {
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const matched = entries
      .filter((dirent) => {
        return dirent.isFile() && dirent.name.toLowerCase().endsWith(ext);
      })
      .map((dirent) => {
        // 絶対パス
        const absolutePath = path.join(dirPath, dirent.name);
        // scriptDir → absolutePath の相対パス (例: "..\\bookshelf.html")
        return path.relative(scriptDir, absolutePath);
      });

    return matched;
  }

  // 収集する
  const htmlFiles = getRelativePaths(parentDir, '.html');
  const cssFiles = getRelativePaths(parentDir, '.css');
  const jsFiles  = getRelativePaths(parentJsDir, '.js');

  // 1つの配列にまとめる
  const allPaths = [...htmlFiles, ...cssFiles, ...jsFiles];
  // 改行区切りのテキストにする
  const output = allPaths.join('\n');

  // include.txt に書き出し
  fs.writeFileSync(includeFile, output, 'utf8');
  console.log('../を探索し収集しました。');
}

// --------------------------------------------------------------------------
// 2) node-html-parser で HTML を解析し、ローカルJS/CSSを書き出す関数
// --------------------------------------------------------------------------
function collectWithNodeHtmlParser(htmlFile) {
  const scriptDir = __dirname;

  // HTMLの絶対パスを取得
  const absoluteHtmlPath = path.resolve(htmlFile);
  if (!fs.existsSync(absoluteHtmlPath)) {
    console.error(`指定されたファイルが見つかりません: ${absoluteHtmlPath}`);
    process.exit(1);
  }

  // HTMLの中身を読み込み
  const htmlContent = fs.readFileSync(absoluteHtmlPath, 'utf8');

  // node-html-parser でパース (返り値はルートノード)
  const root = parse(htmlContent);

  // HTMLファイルがあるディレクトリ
  const htmlDir = path.dirname(absoluteHtmlPath);

  // 出力を組み立てる
  let output = '';

  // 1. HTML自身 (スクリプトディレクトリからの相対パス)
  const relativeHtml = path.relative(scriptDir, absoluteHtmlPath);
  output += `${relativeHtml}\n`; // まず自分自身を出力

  // 2. <script src="..."> からローカルJSを収集
  //    node-html-parser では querySelectorAll('script[src]') がないので、一旦 script タグを全部取得し、srcを持つものだけ判定
  const scriptTags = root.querySelectorAll('script');
  scriptTags.forEach((tag) => {
    const srcValue = tag.getAttribute('src');
    if (!srcValue) return; // src属性がない場合はスキップ

    // 外部リソース(http/https/プロトコル相対 //)を除外
    if (/^(https?:)?\/\//i.test(srcValue)) {
      return;
    }
    // HTMLファイルの場所を基準に絶対パスへ
    const absScriptPath = path.resolve(htmlDir, srcValue);
    // スクリプトのあるディレクトリ相対に変換
    const relScriptPath = path.relative(scriptDir, absScriptPath);
    output += relScriptPath + '\n';
  });

  // 3. <link rel="stylesheet" href="..."> からローカルCSSを収集
  const linkTags = root.querySelectorAll('link');
  linkTags.forEach((link) => {
    // rel="stylesheet" 以外はスキップ
    const relValue = link.getAttribute('rel');
    if (!relValue || relValue.toLowerCase() !== 'stylesheet') return;

    const hrefValue = link.getAttribute('href');
    if (!hrefValue) return;
    // 外部リソース(http/https/プロトコル相対 //)を除外
    if (/^(https?:)?\/\//i.test(hrefValue)) {
      return;
    }
    // 絶対パスにしてから scriptDir 相対に
    const absCssPath = path.resolve(htmlDir, hrefValue);
    const relCssPath = path.relative(scriptDir, absCssPath);
    output += relCssPath + '\n';
  });

  // include.txt へ出力
  fs.writeFileSync(includeFile, output, 'utf8');
  console.log('node-html-parser で収集しました。');
}

// --------------------------------------------------------------------------
// メイン: 引数の有無で動きを切り替える
// --------------------------------------------------------------------------
const arg = process.argv[2];

// 既存の include.txt があれば削除
if (fs.existsSync(includeFile)) {
  fs.unlinkSync(includeFile);
}

// 引数がない → バッチ的に「..\\*.html」「..\\*.css」「..\\js\\*.js」取得
if (!arg) {
  collectBatchLike();
// 引数がある → HTMLを読み込んでローカルJS/CSS収集
} else {
  collectWithNodeHtmlParser(arg);
}
