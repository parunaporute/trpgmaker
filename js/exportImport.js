// js/exportImport.js

/**
 * 不正なサロゲートペアを除去するreplacer
 * JSON.stringify(..., removeInvalidSurrogates, 2)
 */
function removeInvalidSurrogates(key, value) {
  if (typeof value === "string") {
    // サロゲートペアの上位 (D800-DBFF) / 下位 (DC00-DFFF) が不正に並んでいるものを除去
    // あるいは余っているもの (単体の D800-DBFF, DC00-DFFF) を除去
    return value.replace(/[\uD800-\uDFFF]/g, "");
  }
  return value;
}

// ここで IndexedDB の全ストアを列挙 (必要に応じて追加・編集してください)
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
    importBtn.addEventListener("click", function () {
      importFileInput.click();
    });
  }
  if (importFileInput) {
    importFileInput.addEventListener("change", onImportFileSelected);
  }
});

/**
 * エクスポートボタン押下 -> IndexedDB全ストア + localStorage をそれぞれ分割し、ZIPに固める
 */
async function onExportData() {
  try {
    // 1) localStorage の取得 -> localStorage.json
    const localStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      localStorageData[key] = value;
    }

    const zip = new JSZip();

    // localStorage.json を保存
    const localStorageStr = JSON.stringify(localStorageData, removeInvalidSurrogates, 2);
    zip.file("localStorage.json", localStorageStr);

    // 2) IndexedDB の全ストアデータをストアごとに取得し、storeName.json ファイルとして追加
    for (const storeName of STORE_NAMES) {
      const dataArray = await getAllFromStore(storeName);
      // 文字列化 (不正文字除去のため replacer 指定)
      const jsonStr = JSON.stringify(dataArray, removeInvalidSurrogates, 2);
      // 例: "indexedDB/characterData.json" のようにフォルダ分けしてもOK
      zip.file(`indexedDB/${storeName}.json`, jsonStr);
    }

    // 3) ZIP生成
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "trpg_export.zip");

    alert("エクスポートが完了しました。");
  } catch (err) {
    console.error("エクスポート失敗:", err);
    alert("エクスポートに失敗しました:\n" + err.message);
  }
}

/**
 * ファイル選択 -> インポート実行
 */
async function onImportFileSelected(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  evt.target.value = "";

  try {
    await importDataFromZip(file);
    alert("インポートが完了しました。\nページを再読み込みします。");
    window.location.reload();
  } catch (err) {
    console.error("インポート失敗:", err);
    alert("インポートに失敗しました:\n" + err.message);
  }
}

/**
 * ZIPファイルから localStorage.json や indexedDB/*.json を復元
 */
async function importDataFromZip(file) {
  const zip = await JSZip.loadAsync(file);

  // 1) localStorage.json -> localStorage 復元
  const localStorageFile = zip.file("localStorage.json");
  if (localStorageFile) {
    const localJsonText = await localStorageFile.async("string");
    const localObj = JSON.parse(localJsonText);
    localStorage.clear();
    for (const [k, v] of Object.entries(localObj)) {
      localStorage.setItem(k, v);
    }
  }

  // 2) IndexedDB の各ストアに対して、indexedDB/xxx.json を探す
  //    あれば読み込んで clear -> put
  for (const storeName of STORE_NAMES) {
    const storeJsonFile = zip.file(`indexedDB/${storeName}.json`);
    if (storeJsonFile) {
      const storeJsonText = await storeJsonFile.async("string");
      const dataArray = JSON.parse(storeJsonText);
      // ストアを clear してから put
      await clearAndPutStoreData(storeName, dataArray);
    }
  }
}

/**
 * 指定ストアの全データを取得
 */
function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = evt => {
      resolve(evt.target.result || []);
    };
    req.onerror = err => reject(err);
  });
}

/**
 * 指定ストアをクリアしてから、配列のデータを put
 */
function clearAndPutStoreData(storeName, dataArray) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      let i = 0;
      function putNext() {
        if (i >= dataArray.length) {
          resolve();
          return;
        }
        const item = dataArray[i++];
        const putReq = store.put(item);
        putReq.onsuccess = putNext;
        putReq.onerror = err => reject(err);
      }
      putNext();
    };
    clearReq.onerror = err => reject(err);
  });
}
