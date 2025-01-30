// js/exportImport.js

/**
 * 不正サロゲートペアを除去する replacer (念のため)
 */
function removeInvalidSurrogates(key, value) {
  if (typeof value === "string") {
    return value.replace(/[\uD800-\uDFFF]/g, "");
  }
  return value;
}

// 画像を含むストアの名前(例として2つ: characterData, bgImages)
const IMAGE_STORES = ["characterData", "bgImages"];

// すべてのストア名
const STORE_NAMES = [
  "characterData",
  "scenarios",
  "sceneEntries",
  "wizardState",
  "parties",
  "bgImages",
  "sceneSummaries",
  "endings"
];

document.addEventListener("DOMContentLoaded", function () {
  const exportBtn = document.getElementById("export-button");
  const importBtn = document.getElementById("import-button");
  const importFileInput = document.getElementById("import-file-input");

  if (exportBtn) {
    exportBtn.addEventListener("click", onExportData);
  }
  if (importBtn) {
    importBtn.addEventListener("click", () => importFileInput.click());
  }
  if (importFileInput) {
    importFileInput.addEventListener("change", onImportFileSelected);
  }
});

/**
 * Base64 -> バイナリ(Uint8Array) の変換
 */
function base64ToUint8Array(base64) {
  const binStr = atob(base64.replace(/^data:\w+\/\w+;base64,/, "")); 
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uint8Array -> Base64データURL へ変換 (インポート時に使う)
 *   mimeType は "image/png" など
 */
function uint8ArrayToBase64(uint8Arr, mimeType = "image/png") {
  let binary = "";
  for (let i = 0; i < uint8Arr.length; i++) {
    binary += String.fromCharCode(uint8Arr[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}


/**
 * 1) エクスポート (画像は個別ファイル化)
 */
async function onExportData() {
  try {
    const zip = new JSZip();

    // (A) localStorage を localStorage.json に保存
    const localObj = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      localObj[key] = localStorage.getItem(key);
    }
    zip.file("localStorage.json", JSON.stringify(localObj, removeInvalidSurrogates, 2));

    // (B) IndexedDB の各ストア
    for (const storeName of STORE_NAMES) {
      const dataArray = await getAllFromStore(storeName);

      // 画像ストアなら、画像を別ファイルにして JSON 側は参照パスに置き換える
      if (IMAGE_STORES.includes(storeName)) {
        for (const record of dataArray) {
          if (record.imageData) {
            // Base64 -> バイナリ
            const bin = base64ToUint8Array(record.imageData);

            // ファイル名を決める (例: bgImages/123.png)
            // record.id や keyPath をそのまま使うなど、お好みで
            const fileName = `${storeName}/${record.id || "no_id"}.png`;

            // ZIP 内にファイル追加
            zip.file(fileName, bin);

            // JSON 側では "imageData" を "__EXTERNAL__...(ファイル名)" に置き換え
            record.imageData = `__EXTERNAL__${fileName}`;
          }
        }
      }

      // (C) ストアの内容を JSON ファイル化
      const jsonText = JSON.stringify(dataArray, removeInvalidSurrogates, 2);
      zip.file(`indexedDB/${storeName}.json`, jsonText);
    }

    // (D) ZIP生成 & ダウンロード
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "trpg_export.zip");
    alert("エクスポート完了");
  } catch (err) {
    console.error("エクスポート失敗:", err);
    alert("エクスポートに失敗しました:\n" + err.message);
  }
}

/**
 * 2) インポート
 *    ZIP -> localStorage.json, indexedDB/*.json, さらに __EXTERNAL__ の画像ファイルを復元
 */
async function onImportFileSelected(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  evt.target.value = ""; // リセット

  try {
    await importDataFromZip(file);
    alert("インポートが完了しました。\nページを再読み込みします。");
    window.location.reload();
  } catch (err) {
    console.error("インポート失敗:", err);
    alert("インポートに失敗しました:\n" + err.message);
  }
}

async function importDataFromZip(file) {
  const zip = await JSZip.loadAsync(file);

  // (A) localStorage.json
  const localFile = zip.file("localStorage.json");
  if (localFile) {
    const txt = await localFile.async("string");
    const obj = JSON.parse(txt);
    localStorage.clear();
    for (const [k, v] of Object.entries(obj)) {
      localStorage.setItem(k, v);
    }
  }

  // (B) IndexedDB の各ストアをクリア->復元
  for (const storeName of STORE_NAMES) {
    const storeJsonFile = zip.file(`indexedDB/${storeName}.json`);
    if (!storeJsonFile) continue; // 無ければスキップ

    // JSON読み込み
    const jsonText = await storeJsonFile.async("string");
    let dataArray = JSON.parse(jsonText);

    // (C) 画像ストアなら、__EXTERNAL__... を本来の Base64 画像に戻す
    if (IMAGE_STORES.includes(storeName)) {
      for (const record of dataArray) {
        if (typeof record.imageData === "string" && record.imageData.startsWith("__EXTERNAL__")) {
          // "__EXTERNAL__bgImages/123.png" みたいな文字列を取り出す
          const filePath = record.imageData.replace("__EXTERNAL__", ""); 
          // ZIP 内のファイルを探す
          const imgFile = zip.file(filePath);
          if (imgFile) {
            const uint8 = await imgFile.async("uint8array");
            // PNG前提なら "image/png"
            record.imageData = uint8ArrayToBase64(uint8, "image/png");
          } else {
            // 画像ファイルが見つからない場合はエラー
            console.warn("画像ファイルがZIP内に見つかりません:", filePath);
            record.imageData = ""; // 画像なしとして扱う or そのままエラーにする
          }
        }
      }
    }

    // (D) DBに書き戻し
    await clearAndPutStoreData(storeName, dataArray);
  }
}

/** IndexedDB操作: 全件取得 */
function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = (evt) => resolve(evt.target.result || []);
    req.onerror = (err) => reject(err);
  });
}

/** IndexedDB操作: ストアを clear して配列のデータを put */
function clearAndPutStoreData(storeName, dataArray) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    store.clear().onsuccess = () => {
      let i = 0;
      function putNext() {
        if (i >= dataArray.length) {
          resolve();
          return;
        }
        const item = dataArray[i++];
        const putReq = store.put(item);
        putReq.onsuccess = putNext;
        putReq.onerror = (err) => reject(err);
      }
      putNext();
    };
    tx.onerror = (err) => reject(err);
  });
}
