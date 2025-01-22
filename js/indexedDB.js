/********************************
 * indexedDB.js
 * IndexedDB関連の初期化・保存・読み込み等を担当
 ********************************/

let db = null;

/**
 * DB初期化
 * バージョン5:
 *  - scenarios ストア (keyPath: 'scenarioId', autoIncrement)
 *  - sceneEntries ストア (keyPath: 'entryId', autoIncrement)
 *  - characterData ストア (keyPath: 'id')
 *  - wizardState ストア (keyPath: 'id')
 *  - parties ストア (keyPath: 'partyId', autoIncrement)
 */
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 5);  // ★ バージョンを5に
    request.onupgradeneeded = (event) => {
      db = event.target.result;

      // characterData
      if (!db.objectStoreNames.contains("characterData")) {
        db.createObjectStore("characterData", { keyPath: "id" });
      }

      // scenarios
      if (!db.objectStoreNames.contains("scenarios")) {
        const scenarioStore = db.createObjectStore("scenarios", {
          keyPath: "scenarioId",
          autoIncrement: true
        });
        scenarioStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // sceneEntries
      if (!db.objectStoreNames.contains("sceneEntries")) {
        const sceneStore = db.createObjectStore("sceneEntries", {
          keyPath: "entryId",
          autoIncrement: true
        });
        sceneStore.createIndex("scenarioId", "scenarioId", { unique: false });
      }

      // wizardState
      if (!db.objectStoreNames.contains("wizardState")) {
        db.createObjectStore("wizardState", { keyPath: "id" });
      }

      // parties (new in version 5)
      if (!db.objectStoreNames.contains("parties")) {
        const partyStore = db.createObjectStore("parties", {
          keyPath: "partyId",
          autoIncrement: true
        });
        partyStore.createIndex("updatedAt", "updatedAt", { unique: false });
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
 * characterData を保存
 */
function saveCharacterDataToIndexedDB(characterData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("DBが未初期化です。");
      resolve();
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
 * characterData をロード
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

/**
 * wizardData を保存
 */
function saveWizardDataToIndexedDB(wizardData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("wizardState", "readwrite");
    const store = tx.objectStore("wizardState");
    const record = { id: "wizardData", data: wizardData };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = (err) => reject(err);
  });
}

/**
 * wizardData をロード
 */
function loadWizardDataFromIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("wizardState", "readonly");
    const store = tx.objectStore("wizardState");
    const getReq = store.get("wizardData");
    getReq.onsuccess = (evt) => {
      if (evt.target.result) {
        resolve(evt.target.result.data);
      } else {
        resolve(null);
      }
    };
    getReq.onerror = (err) => {
      reject(err);
    };
  });
}

/* -------------------------------------------
    新しいシナリオの追加・読み込み用API
   -------------------------------------------*/
function createNewScenario(wizardData, title = "新シナリオ") {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("scenarios", "readwrite");
    const store = tx.objectStore("scenarios");

    const now = new Date();
    const record = {
      title: title,
      wizardData: wizardData,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const addReq = store.add(record);
    addReq.onsuccess = (evt) => {
      const newId = evt.target.result;
      resolve(newId);
    };
    addReq.onerror = (err) => {
      reject(err);
    };
  });
}

function getScenarioById(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("scenarios", "readonly");
    const store = tx.objectStore("scenarios");
    const getReq = store.get(scenarioId);
    getReq.onsuccess = (evt) => {
      resolve(evt.target.result || null);
    };
    getReq.onerror = (err) => {
      reject(err);
    };
  });
}

function listAllScenarios() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("scenarios", "readonly");
    const store = tx.objectStore("scenarios");
    const req = store.getAll();
    req.onsuccess = (evt) => {
      const result = evt.target.result || [];
      result.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      resolve(result);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
}

function updateScenario(scenario) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    scenario.updatedAt = new Date().toISOString();
    const tx = db.transaction("scenarios", "readwrite");
    const store = tx.objectStore("scenarios");
    const putReq = store.put(scenario);
    putReq.onsuccess = () => {
      resolve();
    };
    putReq.onerror = (err) => {
      reject(err);
    };
  });
}

/* -------------------------------------------
    シーン履歴 (sceneEntries) の操作
   -------------------------------------------*/
function addSceneEntry(entry) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneEntries", "readwrite");
    const store = tx.objectStore("sceneEntries");
    const addReq = store.add(entry);
    addReq.onsuccess = (evt) => {
      resolve(evt.target.result);
    };
    addReq.onerror = (err) => {
      reject(err);
    };
  });
}

function getSceneEntriesByScenarioId(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneEntries", "readonly");
    const store = tx.objectStore("sceneEntries");
    const index = store.index("scenarioId");

    const range = IDBKeyRange.only(scenarioId);
    const results = [];
    index.openCursor(range).onsuccess = (evt) => {
      const cursor = evt.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        results.sort((a, b) => (a.entryId - b.entryId));
        resolve(results);
      }
    };
    index.openCursor(range).onerror = (err) => {
      reject(err);
    };
  });
}

function updateSceneEntry(entry) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneEntries", "readwrite");
    const store = tx.objectStore("sceneEntries");
    const putReq = store.put(entry);
    putReq.onsuccess = () => {
      resolve();
    };
    putReq.onerror = (err) => {
      reject(err);
    };
  });
}

function deleteSceneEntry(entryId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneEntries", "readwrite");
    const store = tx.objectStore("sceneEntries");
    const delReq = store.delete(entryId);
    delReq.onsuccess = () => {
      resolve();
    };
    delReq.onerror = (err) => {
      reject(err);
    };
  });
}

/* ★シナリオ削除用 */
function deleteScenarioById(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    // scenarios, sceneEntries両方をreadwrite
    const tx = db.transaction(["scenarios", "sceneEntries"], "readwrite");
    const scenarioStore = tx.objectStore("scenarios");
    const sceneEntriesStore = tx.objectStore("sceneEntries");

    // 1) シナリオ本体を削除
    const deleteReq = scenarioStore.delete(scenarioId);
    deleteReq.onsuccess = () => {
      // 2) さらにsceneEntriesで scenarioId が一致するものを全削除
      const idx = sceneEntriesStore.index("scenarioId");
      const range = IDBKeyRange.only(scenarioId);

      idx.openCursor(range).onsuccess = (evt) => {
        const cursor = evt.target.result;
        if (cursor) {
          sceneEntriesStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = (err) => {
        reject(err);
      };
    };
    deleteReq.onerror = (err) => {
      reject(err);
    };
  });
}

/* -------------------------------------------
  エクスポート
-------------------------------------------*/
window.initIndexedDB = initIndexedDB;

window.saveCharacterDataToIndexedDB = saveCharacterDataToIndexedDB;
window.loadCharacterDataFromIndexedDB = loadCharacterDataFromIndexedDB;

window.saveWizardDataToIndexedDB = saveWizardDataToIndexedDB;
window.loadWizardDataFromIndexedDB = loadWizardDataFromIndexedDB;

window.createNewScenario = createNewScenario;
window.getScenarioById = getScenarioById;
window.listAllScenarios = listAllScenarios;
window.updateScenario = updateScenario;

window.addSceneEntry = addSceneEntry;
window.getSceneEntriesByScenarioId = getSceneEntriesByScenarioId;
window.updateSceneEntry = updateSceneEntry;
window.deleteSceneEntry = deleteSceneEntry;

window.deleteScenarioById = deleteScenarioById;

/* -------------------------------------------
   ★ 新規: パーティ管理
-------------------------------------------*/

/** 新規パーティ作成 */
window.createParty = function(name){
  return new Promise((resolve, reject)=>{
    if(!db){
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties","readwrite");
    const store = tx.objectStore("parties");
    const now = new Date().toISOString();
    const rec = {
      name: name,
      createdAt: now,
      updatedAt: now
    };
    const req = store.add(rec);
    req.onsuccess = (evt)=>{
      resolve(evt.target.result); // partyId
    };
    req.onerror = (err)=>{
      reject(err);
    };
  });
};

/** パーティ1件取得 */
window.getPartyById = function(partyId){
  return new Promise((resolve, reject)=>{
    if(!db){
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties","readonly");
    const store = tx.objectStore("parties");
    const req = store.get(partyId);
    req.onsuccess = (evt)=>{
      resolve(evt.target.result || null);
    };
    req.onerror = (err)=>{
      reject(err);
    };
  });
};

/** パーティ一覧 */
window.listAllParties = function(){
  return new Promise((resolve, reject)=>{
    if(!db){
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties","readonly");
    const store = tx.objectStore("parties");
    const req = store.getAll();
    req.onsuccess = (evt)=>{
      const list = evt.target.result || [];
      // updatedAt降順
      list.sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
      resolve(list);
    };
    req.onerror = (err)=>{
      reject(err);
    };
  });
};

/** パーティ更新 */
window.updateParty = function(party){
  return new Promise((resolve, reject)=>{
    if(!db){
      return reject("DB未初期化");
    }
    party.updatedAt = new Date().toISOString();
    const tx = db.transaction("parties","readwrite");
    const store = tx.objectStore("parties");
    const req = store.put(party);
    req.onsuccess = ()=>{
      resolve();
    };
    req.onerror = (err)=>{
      reject(err);
    };
  });
};

/** パーティ削除 */
window.deletePartyById = function(partyId){
  return new Promise((resolve, reject)=>{
    if(!db){
      return reject("DB未初期化");
    }

    const tx = db.transaction("parties","readwrite");
    const store = tx.objectStore("parties");

    // 実際にはパーティ削除時に紐づく characterData.group==="Party" + partyIdをどうするか要検討
    // 今回は「削除してもキャラは倉庫などに移らず残る」またはユーザ判断で削除。
    // ひとまずパーティ自体だけ削除する。
    const req = store.delete(partyId);
    req.onsuccess = ()=>{
      resolve();
    };
    req.onerror = (err)=>{
      reject(err);
    };
  });
};
