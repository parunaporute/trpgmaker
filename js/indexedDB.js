/* indexedDB.js */
let db = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 17); // バージョンを16に

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
      } else {
        // 既に "scenarios" ストアがある場合
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
        sceneStore = request.transaction.objectStore("sceneEntries");
      }
      // content_en用index(重複可)
      if (sceneStore && !sceneStore.indexNames.contains("content_en")) {
        try {
          sceneStore.createIndex("content_en", "content_en", { unique: false });
        } catch (e) {
          console.warn("content_enのIndex作成に失敗:", e);
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

      // sceneSummaries
      if (!db.objectStoreNames.contains("sceneSummaries")) {
        const sumStore = db.createObjectStore("sceneSummaries", {
          keyPath: "summaryId",
          autoIncrement: true
        });
        sumStore.createIndex("chunkIndex", "chunkIndex", { unique: true });
      }

      // endings
      if (!db.objectStoreNames.contains("endings")) {
        db.createObjectStore("endings", { keyPath: ["scenarioId", "type"] });
      }

      // avatarData
      if (!db.objectStoreNames.contains("avatarData")) {
        db.createObjectStore("avatarData", { keyPath: "id" });
      }

      // ===== ここから追加 =====
      // entitiesストア（アイテムやキャラクターを管理）
      if (!db.objectStoreNames.contains("entities")) {
        const entStore = db.createObjectStore("entities", {
          keyPath: "entityId",
          autoIncrement: true
        });
        entStore.createIndex("scenarioId", "scenarioId", { unique: false });
      }
      if (!db.objectStoreNames.contains("universalSaves")) {
        const store = db.createObjectStore("universalSaves", {
          keyPath: "slotIndex" // 1,2,3...をユニークキーに
        });
        // 追加のindexは不要なら何もしない
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * 新しいシナリオを作成
 */
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
      updatedAt: now.toISOString(),
      bookShelfFlag: false,        // 新規はデフォルトOFF
      hideFromHistoryFlag: false   // 新規はデフォルトOFF
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

/**
 * シナリオを更新
 */
function updateScenario(scenario, noUpdateDateTimeFlag) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    if (!noUpdateDateTimeFlag) {
      scenario.updatedAt = new Date().toISOString();
    }
    if (typeof scenario.bookShelfFlag === "undefined") scenario.bookShelfFlag = false;
    if (typeof scenario.hideFromHistoryFlag === "undefined") scenario.hideFromHistoryFlag = false;
    if (scenario.bookShelfFlag && typeof scenario.shelfOrder !== "number") {
      scenario.shelfOrder = Date.now();
    }

    const tx = db.transaction("scenarios", "readwrite");
    const store = tx.objectStore("scenarios");
    const req = store.put(scenario);
    req.onsuccess = () => resolve();
    req.onerror = err => reject(err);
  });
}

/**
 * シナリオをID指定で取得
 */
function getScenarioById(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("scenarios", "readonly");
    const store = tx.objectStore("scenarios");
    const getReq = store.get(scenarioId);
    getReq.onsuccess = (evt) => {
      resolve(evt.target.result || null);
    };
    getReq.onerror = (err) => reject(err);
  });
}

/**
 * シナリオを全件取得
 */
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
      result.forEach(sc => {
        sc.bookShelfFlag = sc.bookShelfFlag || false;
        sc.hideFromHistoryFlag = sc.hideFromHistoryFlag || false;
      });
      result.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      resolve(result);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
}

/** シナリオ削除 */
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
      // 2) sceneEntriesで scenarioId === scenarioId のものを削除
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

/* シーン履歴: add/update/get/delete */
function addSceneEntry(entry) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
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

function getSceneEntriesByScenarioId(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
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
        results.sort((a, b) => a.entryId - b.entryId);
        resolve(results);
      }
    };
    index.openCursor(range).onerror = (err) => reject(err);
  });
}

function deleteSceneEntry(entryId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
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

/* ---------- シーン要約関連 ---------- */
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
        return resolve();
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

/* ---------- パーティ関連 ---------- */
window.initIndexedDB = initIndexedDB;
window.createNewScenario = createNewScenario;
window.updateScenario = updateScenario;
window.getScenarioById = getScenarioById;
window.addSceneEntry = addSceneEntry;
window.getSceneEntriesByScenarioId = getSceneEntriesByScenarioId;
window.deleteSceneEntry = deleteSceneEntry;

window.addSceneSummaryRecord = addSceneSummaryRecord;
window.getSceneSummaryByChunkIndex = getSceneSummaryByChunkIndex;
window.updateSceneSummaryRecord = updateSceneSummaryRecord;
window.deleteSceneSummaryByChunkIndex = deleteSceneSummaryByChunkIndex;

/** キャラデータ関連 */
window.saveCharacterDataToIndexedDB = function (characterData) {
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
};

window.loadCharacterDataFromIndexedDB = function() {
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
};

window.saveWizardDataToIndexedDB = function(wizardData) {
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
};

window.loadWizardDataFromIndexedDB = function() {
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
};

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

/* エンディング関連 */
window.getEnding = function (scenarioId, type) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("endings", "readonly");
    const store = tx.objectStore("endings");
    const getReq = store.get([scenarioId, type]);
    getReq.onsuccess = (evt) => {
      resolve(evt.target.result || null);
    };
    getReq.onerror = (err) => reject(err);
  });
};

window.saveEnding = function (scenarioId, type, story) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("endings", "readwrite");
    const store = tx.objectStore("endings");
    const rec = {
      scenarioId,
      type,
      story,
      createdAt: new Date().toISOString()
    };
    const putReq = store.put(rec);
    putReq.onsuccess = () => resolve();
    putReq.onerror = (err) => reject(err);
  });
};

window.deleteEnding = function (scenarioId, type) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("endings", "readwrite");
    const store = tx.objectStore("endings");
    const delReq = store.delete([scenarioId, type]);
    delReq.onsuccess = () => resolve();
    delReq.onerror = (err) => reject(err);
  });
};

// ============ Entitiesストア関連 ============
window.addEntity = function(entity) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("entities", "readwrite");
    const store = tx.objectStore("entities");
    const req = store.add(entity);
    req.onsuccess = evt => {
      resolve(evt.target.result);
    };
    req.onerror = err => reject(err);
  });
};

window.updateEntity = function(entity) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("entities", "readwrite");
    const store = tx.objectStore("entities");
    const req = store.put(entity);
    req.onsuccess = () => resolve();
    req.onerror = err => reject(err);
  });
};

window.getEntitiesByScenarioId = function(scenarioId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("entities", "readonly");
    const store = tx.objectStore("entities");
    const idx = store.index("scenarioId");
    const range = IDBKeyRange.only(scenarioId);
    const results = [];
    idx.openCursor(range).onsuccess = evt => {
      const cursor = evt.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    idx.openCursor(range).onerror = err => reject(err);
  });
};

window.deleteEntity = function(entityId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("entities", "readwrite");
    const store = tx.objectStore("entities");
    const req = store.delete(entityId);
    req.onsuccess = () => resolve();
    req.onerror = err => reject(err);
  });
};
