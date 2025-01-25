// js/exportImport.js

/**
 * エクスポート / インポート 機能
 * - 「エクスポート」ボタン押下 -> IndexedDB全ストア + localStorage をZIPに固めてダウンロード
 * - 「インポート」ボタン押下 -> ZIPを選択し、解凍してIndexedDB + localStorage を復元
 */

document.addEventListener("DOMContentLoaded", function () {
  const exportBtn = document.getElementById("export-button");
  const importBtn = document.getElementById("import-button");
  const importFileInput = document.getElementById("import-file-input");

  if (exportBtn) {
    exportBtn.addEventListener("click", onExportData);
  }
  if (importBtn) {
    importBtn.addEventListener("click", function () {
      // ファイル選択ダイアログを出す
      importFileInput.click();
    });
  }
  if (importFileInput) {
    importFileInput.addEventListener("change", onImportFileSelected);
  }
});

/**
 * エクスポートボタン押下時
 * IndexedDB内の全ストア + localStorageの内容を１つのJSONにまとめてZIPダウンロードする
 */
async function onExportData() {
  try {
    // 1) localStorage の取得
    const localStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      localStorageData[key] = value;
    }

    // 2) IndexedDB の全ストアデータ取得
    const indexedDBData = {
      characterData: await getAllFromStore("characterData"),
      scenarios: await getAllFromStore("scenarios"),
      sceneEntries: await getAllFromStore("sceneEntries"),
      wizardState: await getAllFromStore("wizardState"),
      parties: await getAllFromStore("parties"),
      bgImages: await getAllFromStore("bgImages")
    };

    const exportObj = {
      localStorage: localStorageData,
      indexedDB: indexedDBData
    };

    const jsonStr = JSON.stringify(exportObj, null, 2);

    // 3) ZIP生成
    const zip = new JSZip();
    zip.file("export.json", jsonStr);

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "trpg_export.zip");

    alert("エクスポートが完了しました。");
  } catch (err) {
    console.error("エクスポート失敗:", err);
    alert("エクスポートに失敗しました:\n" + err.message);
  }
}

/**
 * インポートボタン押下 -> ファイル選択後に呼ばれる
 */
async function onImportFileSelected(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  // ファイル選択後は input をリセットしておく
  evt.target.value = "";

  // インポート実行
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
 * ZIPファイルから export.json を取り出して IndexedDB + localStorage を復元
 */
async function importDataFromZip(file) {
  // 1) ZIPを展開
  const zip = await JSZip.loadAsync(file);
  const exportFile = zip.file("export.json");
  if (!exportFile) throw new Error("ZIP内にexport.jsonが見つかりません。");

  const jsonText = await exportFile.async("string");
  const parsed = JSON.parse(jsonText);

  // 2) localStorage を上書き復元
  if (parsed.localStorage) {
    localStorage.clear();
    for (const [k, v] of Object.entries(parsed.localStorage)) {
      localStorage.setItem(k, v);
    }
  }

  // 3) IndexedDB を上書き復元
  // 3-1) まず、全ストアをクリアしてから、保存されたデータを put する
  const storeNames = [
    "characterData", "scenarios", "sceneEntries",
    "wizardState", "parties", "bgImages"
  ];
  // トランザクションはストアごとに分けて行う
  for (const storeName of storeNames) {
    const dataArr = parsed.indexedDB?.[storeName];
    if (!dataArr) continue;

    await clearAndPutStoreData(storeName, dataArr);
  }
}

/**
 * 指定ストアの全データを取得して返す (readwrite, store.getAll)
 */
function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
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
 * 指定ストアをclear()した後、配列のデータをput()する
 */
function clearAndPutStoreData(storeName, dataArray) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
    }
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    // 1) clear
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      // 2) データをput
      let i = 0;
      function putNext() {
        if (i >= dataArray.length) {
          resolve();
          return;
        }
        const item = dataArray[i];
        i++;
        const putReq = store.put(item);
        putReq.onsuccess = putNext;
        putReq.onerror = err => reject(err);
      }
      putNext();
    };
    clearReq.onerror = err => reject(err);
  });
}
