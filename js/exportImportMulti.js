// js/exportImportMulti.js

// ====================== 設定 ======================

// 画像を含むストア名
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

/**
 * 不正サロゲートペアを除去するreplacer (JSON.stringify用)
 */
function removeInvalidSurrogates(key, value) {
  if (typeof value === "string") {
    return value.replace(/[\uD800-\uDFFF]/g, "");
  }
  return value;
}

/**
 * Base64 -> Uint8Array
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
 * Uint8Array -> dataURL (Base64)
 *   mimeType は"image/png"など
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
 * IndexedDBから全件取得
 */
function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = (evt) => {
      resolve(evt.target.result || []);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
}

/**
 * ストアをclearして配列のデータをput
 */
function clearAndPutStoreData(storeName, dataArray) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
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

/**
 * ============== メタデータZIPをエクスポート =============
 *  - localStorage
 *  - 画像以外のストア (scenarios, sceneEntries, etc)
 */
async function exportMetadataZip() {
  try {
    const zip = new JSZip();

    // localStorage -> localStorage.json
    const localData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      localData[k] = localStorage.getItem(k);
    }
    zip.file("localStorage.json", JSON.stringify(localData, removeInvalidSurrogates, 2));

    // 画像以外のストアを export
    for (const storeName of STORE_NAMES) {
      if (IMAGE_STORES.includes(storeName)) continue; // スキップ(画像系は別)

      const dataArr = await getAllFromStore(storeName);
      const jsonStr = JSON.stringify(dataArr, removeInvalidSurrogates, 2);
      zip.file(`indexedDB/${storeName}.json`, jsonStr);
    }

    // zip ダウンロード
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "metadata.zip");
    alert("メタデータのエクスポートが完了しました (metadata.zip)");
  } catch (err) {
    console.error("exportMetadataZip失敗:", err);
    alert("メタデータのエクスポートに失敗:\n" + err.message);
  }
}

/**
 * ============== 画像ZIPをエクスポート =============
 *  - characterData, bgImages など
 *  - 各レコードの imageData を個別PNGにして格納し、JSON側は参照パス(__EXTERNAL__)に
 */
async function exportImagesZip() {
  try {
    const zip = new JSZip();

    for (const storeName of IMAGE_STORES) {
      const dataArr = await getAllFromStore(storeName);

      for (const record of dataArr) {
        if (record.imageData) {
          // Base64 -> バイナリ
          const bin = base64ToUint8Array(record.imageData);
          // ファイル名
          const fileName = `${storeName}/${record.id || "no_id"}.png`;
          // ZIPに追加
          zip.file(fileName, bin);
          // JSON側は __EXTERNAL__参照
          record.imageData = `__EXTERNAL__${fileName}`;
        }
      }

      // JSONファイルにも保存
      const jsonStr = JSON.stringify(dataArr, removeInvalidSurrogates, 2);
      zip.file(`indexedDB/${storeName}.json`, jsonStr);
    }

    // zip ダウンロード
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "images.zip");
    alert("画像のエクスポートが完了しました (images.zip)");
  } catch (err) {
    console.error("exportImagesZip失敗:", err);
    alert("画像のエクスポートに失敗:\n" + err.message);
  }
}

/**
 * ============== メタデータZIPをインポート =============
 *  - localStorage.json
 *  - 画像以外のストア *.json
 */
async function importMetadataZip(file) {
  try {
    const zip = await JSZip.loadAsync(file);

    // localStorage.json
    const lsFile = zip.file("localStorage.json");
    if (lsFile) {
      const lsText = await lsFile.async("string");
      const lsObj = JSON.parse(lsText);
      localStorage.clear();
      for (const [k, v] of Object.entries(lsObj)) {
        localStorage.setItem(k, v);
      }
    }

    // 画像以外のストアをインポート
    for (const storeName of STORE_NAMES) {
      if (IMAGE_STORES.includes(storeName)) continue; // スキップ(画像系は別)

      const storeJsonFile = zip.file(`indexedDB/${storeName}.json`);
      if (!storeJsonFile) continue;

      const jsonText = await storeJsonFile.async("string");
      const dataArr = JSON.parse(jsonText);
      await clearAndPutStoreData(storeName, dataArr);
    }

    alert("メタデータZIPのインポートが完了しました");
  } catch (err) {
    console.error("importMetadataZip失敗:", err);
    alert("メタデータインポートに失敗:\n" + err.message);
  }
}

/**
 * ============== 画像ZIPをインポート =============
 *  - 画像ストア *.json
 *  - __EXTERNAL__xxx.png の実ファイルをBase64復元
 */
async function importImagesZip(file) {
  try {
    const zip = await JSZip.loadAsync(file);

    for (const storeName of IMAGE_STORES) {
      const storeJsonFile = zip.file(`indexedDB/${storeName}.json`);
      if (!storeJsonFile) continue;

      const jsonText = await storeJsonFile.async("string");
      const dataArr = JSON.parse(jsonText);

      // 画像ファイルを復元
      for (const record of dataArr) {
        if (record.imageData && record.imageData.startsWith("__EXTERNAL__")) {
          const filePath = record.imageData.replace("__EXTERNAL__", "");
          const imgFile = zip.file(filePath);
          if (imgFile) {
            const uint8 = await imgFile.async("uint8array");
            record.imageData = uint8ArrayToBase64(uint8, "image/png");
          } else {
            console.warn("画像ファイルが見つかりません:", filePath);
            record.imageData = ""; // 見つからない場合は空にする or エラーにする
          }
        }
      }

      // ストアに書き戻し
      await clearAndPutStoreData(storeName, dataArr);
    }

    alert("画像ZIPのインポートが完了しました");
  } catch (err) {
    console.error("importImagesZip失敗:", err);
    alert("画像インポートに失敗:\n" + err.message);
  }
}

/**
 * 画面上のボタンを取得して処理を紐付け
 */
document.addEventListener("DOMContentLoaded", () => {
  // エクスポートボタン
  const exportMetaBtn = document.getElementById("export-metadata-button");
  const exportImgBtn = document.getElementById("export-images-button");

  // インポートボタン & ファイル入力
  const importMetaBtn = document.getElementById("import-metadata-button");
  const importMetaInput = document.getElementById("import-metadata-file");
  const importImgBtn = document.getElementById("import-images-button");
  const importImgInput = document.getElementById("import-images-file");

  if (exportMetaBtn) {
    exportMetaBtn.addEventListener("click", exportMetadataZip);
  }
  if (exportImgBtn) {
    exportImgBtn.addEventListener("click", exportImagesZip);
  }

  if (importMetaBtn && importMetaInput) {
    importMetaBtn.addEventListener("click", () => importMetaInput.click());
    importMetaInput.addEventListener("change", (evt) => {
      const file = evt.target.files[0];
      if (file) {
        importMetadataZip(file);
      }
      evt.target.value = ""; // 選択リセット
    });
  }

  if (importImgBtn && importImgInput) {
    importImgBtn.addEventListener("click", () => importImgInput.click());
    importImgInput.addEventListener("change", (evt) => {
      const file = evt.target.files[0];
      if (file) {
        importImagesZip(file);
      }
      evt.target.value = "";
    });
  }
});
