/********************************
 * indexedDB.js
 * IndexedDB関連の初期化・保存・読み込み等を担当
 ********************************/

let db = null;

/**
 * DB初期化
 * バージョン4:
 *  - scenarios ストア (keyPath: 'scenarioId', autoIncrement)
 *  - sceneEntries ストア (keyPath: 'entryId', autoIncrement)
 *  - characterData ストア (keyPath: 'id')
 *  - wizardState ストア (keyPath: 'id')
 */
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 4);
    request.onupgradeneeded = (event) => {
      db = event.target.result;

      // 既存チェック
      if (!db.objectStoreNames.contains("characterData")) {
        db.createObjectStore("characterData", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("scenarios")) {
        const scenarioStore = db.createObjectStore("scenarios", {
          keyPath: "scenarioId",
          autoIncrement: true
        });
        scenarioStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("sceneEntries")) {
        const sceneStore = db.createObjectStore("sceneEntries", {
          keyPath: "entryId",
          autoIncrement: true
        });
        sceneStore.createIndex("scenarioId", "scenarioId", { unique: false });
      }

      if (!db.objectStoreNames.contains("wizardState")) {
        db.createObjectStore("wizardState", { keyPath: "id" });
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

/* ★ユニークID生成ヘルパ */
function generateUniqueId() {
  return Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

/* ★シナリオコピー用（画像含む） */
async function copyScenarioById(originalScenarioId) {
  if (!db) {
    throw new Error("DB未初期化");
  }
  try {
    // 1) 元シナリオ取得
    const original = await getScenarioById(originalScenarioId);
    if (!original) {
      throw new Error("コピー元シナリオが存在しません");
    }

    // 2) 新シナリオを作成（タイトルに「(コピー)」を付ける）
    const newTitle = original.title + " (コピー)";
    const newScenarioId = await createNewScenario(original.wizardData, newTitle);

    // 3) 元シーンエントリをすべて取得
    const originalEntries = await getSceneEntriesByScenarioId(originalScenarioId);

    // 3.5) シーンIDのマッピングを作る (元シーンID → 新シーンID)
    const sceneIdMap = {};
    // まず sceneEntries のうち type==='scene' のものに対して、新しい sceneId を割り当てる
    originalEntries.forEach(e => {
      if (e.type === "scene") {
        sceneIdMap[e.sceneId] = generateUniqueId();
      }
    });

    // 4) すべて新シナリオIDに合わせて複製
    const tx = db.transaction("sceneEntries", "readwrite");
    const sceneStore = tx.objectStore("sceneEntries");

    for (const e of originalEntries) {
      // シーンまたは画像に紐づくsceneIdがあれば置き換える
      let newSceneId = e.sceneId;
      if (sceneIdMap[e.sceneId]) {
        newSceneId = sceneIdMap[e.sceneId];
      }

      const copyEntry = {
        scenarioId: newScenarioId,
        type: e.type,
        sceneId: newSceneId,
        content: e.content,
        dataUrl: e.dataUrl || null,
        prompt: e.prompt || null
      };
      sceneStore.add(copyEntry);
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = (err) => {
        reject(err);
      };
    });

    // 5) 最後に scenarios.updatedAt を更新
    const newScenario = await getScenarioById(newScenarioId);
    if (newScenario) {
      newScenario.updatedAt = new Date().toISOString();
      await updateScenario(newScenario);
    }

    return newScenarioId;
  } catch (err) {
    console.error("copyScenarioById失敗:", err);
    throw err;
  }
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
window.copyScenarioById = copyScenarioById;  // 修正後エクスポート
