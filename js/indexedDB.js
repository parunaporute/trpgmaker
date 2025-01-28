/********************************
 * indexedDB.js
 * IndexedDB関連の初期化・保存・読み込み等を担当
 ********************************/

let db = null;

/**
 * DB初期化
 * バージョン8:
 *  - scenarios ストア (keyPath: 'scenarioId', autoIncrement)
 *  - sceneEntries ストア (keyPath: 'entryId', autoIncrement)
 *    → content_en を保持できるようにする
 *  - characterData ストア (keyPath: 'id')
 *  - wizardState ストア (keyPath: 'id')
 *  - parties ストア (keyPath: 'partyId', autoIncrement)
 *  - bgImages ストア (keyPath: 'id', autoIncrement)
 *  - ★追加: sceneSummaries ストア (keyPath: 'summaryId', autoIncrement)
 */
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 8);
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
      let sceneStore;
      if (!db.objectStoreNames.contains("sceneEntries")) {
        sceneStore = db.createObjectStore("sceneEntries", {
          keyPath: "entryId",
          autoIncrement: true
        });
        sceneStore.createIndex("scenarioId", "scenarioId", { unique: false });
      } else {
        // 既存ストアがある場合は再取得して、必要に応じてIndex追加
        sceneStore = request.transaction.objectStore("sceneEntries");
      }
      // content_en用index(重複可)
      if (sceneStore && !sceneStore.indexNames.contains("content_en")) {
        try {
          sceneStore.createIndex("content_en", "content_en", { unique: false });
        } catch (e) {
          console.warn("content_enのIndex作成に失敗/または既に存在:", e);
        }
      }

      // wizardState
      if (!db.objectStoreNames.contains("wizardState")) {
        db.createObjectStore("wizardState", { keyPath: "id" });
      }

      // parties
      if (!db.objectStoreNames.contains("parties")) {
        const partyStore = db.createObjectStore("parties", {
          keyPath: "partyId",
          autoIncrement: true
        });
        partyStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // bgImages
      if (!db.objectStoreNames.contains("bgImages")) {
        db.createObjectStore("bgImages", {
          keyPath: "id",
          autoIncrement: true
        });
      }

      // ★ 新ストア: sceneSummaries
      if (!db.objectStoreNames.contains("sceneSummaries")) {
        const sumStore = db.createObjectStore("sceneSummaries", {
          keyPath: "summaryId",
          autoIncrement: true
        });
        // summaryIndex (0,1,2,3...) を保存したければ追加インデックスを作る
        sumStore.createIndex("chunkIndex", "chunkIndex", { unique: true });
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
    content_enフィールドを併せて扱う
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

/* ★ シナリオ削除 */
function deleteScenarioById(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction(["scenarios", "sceneEntries"], "readwrite");
    const scenarioStore = tx.objectStore("scenarios");
    const sceneEntriesStore = tx.objectStore("sceneEntries");

    // 1) シナリオ本体を削除
    const deleteReq = scenarioStore.delete(scenarioId);
    deleteReq.onsuccess = () => {
      // 2) sceneEntriesで scenarioId === scenarioId のものを全削除
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
   sceneSummariesストアへの操作
   - chunkIndex (0,1,2...)ごとに英語版と日本語版を保存
-------------------------------------------*/
function addSceneSummaryRecord(summaryObj) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneSummaries", "readwrite");
    const store = tx.objectStore("sceneSummaries");
    const addReq = store.add(summaryObj);
    addReq.onsuccess = (evt) => resolve(evt.target.result);
    addReq.onerror = (err) => reject(err);
  });
}

function getSceneSummaryByChunkIndex(chunkIndex) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("sceneSummaries", "readonly");
    const store = tx.objectStore("sceneSummaries");
    const idx = store.index("chunkIndex");
    const req = idx.get(chunkIndex);
    req.onsuccess = () => {
      resolve(req.result || null);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
}

function updateSceneSummaryRecord(summaryObj) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    // summaryIdを持っている想定
    const tx = db.transaction("sceneSummaries", "readwrite");
    const store = tx.objectStore("sceneSummaries");
    const putReq = store.put(summaryObj);
    putReq.onsuccess = () => {
      resolve();
    };
    putReq.onerror = (err) => {
      reject(err);
    };
  });
}

function deleteSceneSummaryByChunkIndex(chunkIndex) {
  return new Promise(async (resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    try {
      const sumRec = await getSceneSummaryByChunkIndex(chunkIndex);
      if (!sumRec) {
        return resolve(); // 特になし
      }
      const tx = db.transaction("sceneSummaries", "readwrite");
      const store = tx.objectStore("sceneSummaries");
      const delReq = store.delete(sumRec.summaryId);
      delReq.onsuccess = () => resolve();
      delReq.onerror = (err) => reject(err);
    } catch (e) {
      reject(e);
    }
  });
}

/* -------------------------------------------
   パーティ管理
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

// sceneSummaries
window.addSceneSummaryRecord = addSceneSummaryRecord;
window.getSceneSummaryByChunkIndex = getSceneSummaryByChunkIndex;
window.updateSceneSummaryRecord = updateSceneSummaryRecord;
window.deleteSceneSummaryByChunkIndex = deleteSceneSummaryByChunkIndex;

/** 新規パーティ作成 */
window.createParty = function (name) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties", "readwrite");
    const store = tx.objectStore("parties");
    const now = new Date().toISOString();
    const rec = {
      name: name,
      createdAt: now,
      updatedAt: now
    };
    const req = store.add(rec);
    req.onsuccess = (evt) => {
      resolve(evt.target.result); // partyId
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
};

window.getPartyById = function (partyId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties", "readonly");
    const store = tx.objectStore("parties");
    const req = store.get(partyId);
    req.onsuccess = (evt) => {
      resolve(evt.target.result || null);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
};

window.listAllParties = function () {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties", "readonly");
    const store = tx.objectStore("parties");
    const req = store.getAll();
    req.onsuccess = (evt) => {
      const list = evt.target.result || [];
      list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      resolve(list);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
};

window.updateParty = function (party) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    party.updatedAt = new Date().toISOString();
    const tx = db.transaction("parties", "readwrite");
    const store = tx.objectStore("parties");
    const req = store.put(party);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
};

window.deletePartyById = function (partyId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject("DB未初期化");
    }
    const tx = db.transaction("parties", "readwrite");
    const store = tx.objectStore("parties");

    const req = store.delete(partyId);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
};
