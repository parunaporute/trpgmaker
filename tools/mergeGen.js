#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ======================================================
// 1) 引数から LIST_FILE を決定
// ======================================================
const inputArg = process.argv[2];
const LIST_FILE = inputArg || 'include.txt';

// 2) OUTPUT_FILE は常に merged.txt
const OUTPUT_FILE = 'merged.txt';

// ======================================================
// もし OUTPUT_FILE が存在していたら削除
// ======================================================
if (fs.existsSync(OUTPUT_FILE)) {
  fs.unlinkSync(OUTPUT_FILE);
}

// ======================================================
// 3) 先頭に固定メッセージを書き込む
// ======================================================
const fixedMessage = `貴方は会社の中で一番のエンジニアです。
最下部にアプリケーションのソースを添付しました。
・
・
・
・
・
・
以上を実施し、編集しないファイルを除き完全なコードを下さい。しかしながら、最高の成果物を出すために、少しでも不明な点があれば質問をください。
`;

fs.writeFileSync(OUTPUT_FILE, fixedMessage + '\n', { encoding: 'utf8' });

// ======================================================
// 処理開始メッセージ
// ======================================================
console.log('選択されたファイルの結合処理中...');

// ======================================================
// 4) LIST_FILE を一行ずつ読み込む → 各ファイルを結合
// ======================================================
// バッチファイルの for /f と同様に、LIST_FILE から行を取得
if (!fs.existsSync(LIST_FILE)) {
  console.error(`[エラー] 指定されたリストファイルが見つかりません: ${LIST_FILE}`);
  process.exit(1);
}

const lines = fs.readFileSync(LIST_FILE, 'utf8')
  .split(/\r?\n/)      // 改行コード (CRLF/LF) に対応
  .filter(line => line.trim() !== ''); // 空行は無視

for (const line of lines) {
  // 行はファイルパスとして扱う
  const filePath = line.trim();
  if (fs.existsSync(filePath)) {
    // ファイルがある場合 → ファイル名 & 中身 & 区切り線
    // バッチファイルの %%~nxf 相当: ファイル名＋拡張子
    const fileName = path.basename(filePath);

    fs.appendFileSync(OUTPUT_FILE, fileName + '\n', { encoding: 'utf8' });

    const content = fs.readFileSync(filePath, 'utf8');
    fs.appendFileSync(OUTPUT_FILE, content, { encoding: 'utf8' });

    fs.appendFileSync(OUTPUT_FILE, '---\n', { encoding: 'utf8' });
  } else {
    // ファイルが存在しない場合 → 警告文 & 区切り線
    const message = `[警告] 指定されたファイルが見つかりません: ${filePath}`;
    console.warn(message);
    fs.appendFileSync(OUTPUT_FILE, message + '\n---\n', { encoding: 'utf8' });
  }
}

// ======================================================
// 5) 結合完了メッセージ
// ======================================================
console.log('すべてのファイルを結合しました！');

// バッチファイルの pause の代わりに Enter 入力で終了する
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enterキーを押すと終了します...', () => {
  rl.close();
});
