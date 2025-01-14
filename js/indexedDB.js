/********************************
 * indexedDB.js
 * IndexedDB関連の初期化・保存・読み込み等を担当
 ********************************/

let db = null;

/**
 * DB初期化
 * "trpgDB" というDBに "sceneHistory" と "characterData" のストアを作る
 */
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 2);  // バージョンを 2 に更新
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      // sceneHistory ストアが無ければ作成
      if (!db.objectStoreNames.contains("sceneHistory")) {
        db.createObjectStore("sceneHistory", { keyPath: "id" });
      }
      // characterData ストアが無ければ作成
      if (!db.objectStoreNames.contains("characterData")) {
        db.createObjectStore("characterData", { keyPath: "id" });
      }
    };
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };
    request.onerror = (event) => {
      console.error("IndexedDBの初期化に失敗:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * sceneHistory をまとめて IndexedDB へ保存
 * 1レコード (id=1) に配列データを保存する
 */
function saveSceneHistoryToIndexedDB(sceneHistory) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("DBが未初期化です。");
      resolve();
      return;
    }
    const tx = db.transaction("sceneHistory", "readwrite");
    const store = tx.objectStore("sceneHistory");

    // まず既存データをクリア
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      // クリア後に、id=1 として保存
      const record = { id: 1, data: sceneHistory };
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        resolve();
      };
      putReq.onerror = (err) => {
        reject(err);
      };
    };
    clearRequest.onerror = (err) => {
      reject(err);
    };
  });
}

/**
 * IndexedDBから sceneHistory をロード
 * 1レコード (id=1) に格納した配列データを取り出す
 */
function loadSceneHistoryFromIndexedDB() {
  return new Promise((resolve) => {
    if (!db) {
      console.warn("DBが未初期化です。");
      resolve([]);
      return;
    }
    const tx = db.transaction("sceneHistory", "readonly");
    const store = tx.objectStore("sceneHistory");
    const getReq = store.get(1);
    getReq.onsuccess = (event) => {
      if (event.target.result && event.target.result.data) {
        resolve(event.target.result.data);
      } else {
        resolve([]);
      }
    };
    getReq.onerror = () => {
      resolve([]);
    };
  });
}

/**
 * キャラクターデータを IndexedDB に保存する
 * ここでは、1レコード (id="characterData") にデータ全体を保存する
 */
function saveCharacterDataToIndexedDB(characterData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("DBが未初期化です。");
      resolve();  // DB が未初期化の場合はエラーではなく resolve する
      return;
    }
    const tx = db.transaction("characterData", "readwrite");
    const store = tx.objectStore("characterData");
    const record = { id: "characterData", data: characterData };
    const putReq = store.put(record);
    putReq.onsuccess = () => {
      resolve();
    };
    putReq.onerror = (err) => {
      reject(err);
    };
  });
}

/**
 * IndexedDBからキャラクターデータをロードする
 */
function loadCharacterDataFromIndexedDB() {
  return new Promise((resolve) => {
    if (!db) {
      console.warn("DBが未初期化です。");
      resolve([]);
      return;
    }
    const tx = db.transaction("characterData", "readonly");
    const store = tx.objectStore("characterData");
    const getReq = store.get("characterData");
    getReq.onsuccess = (event) => {
      if (event.target.result && event.target.result.data) {
        resolve(event.target.result.data);
      } else {
        resolve([]);
      }
    };
    getReq.onerror = () => {
      resolve([]);
    };
  });
}
