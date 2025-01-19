/********************************
 * indexedDB.js
 * IndexedDB関連の初期化・保存・読み込み等を担当
 ********************************/

let db = null;

/**
 * DB初期化
 * バージョン3:
 *  - scenarios ストア (keyPath: 'scenarioId', autoIncrement)
 *  - sceneEntries ストア (keyPath: 'entryId', autoIncrement)
 *  - characterData ストア (keyPath: 'id')
 */
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("trpgDB", 3);
    request.onupgradeneeded = (event) => {
      db = event.target.result;

      // 既存チェック
      if (!db.objectStoreNames.contains("characterData")) {
        db.createObjectStore("characterData", { keyPath: "id" });
      }

      // 新設: scenarios ストア
      if (!db.objectStoreNames.contains("scenarios")) {
        const scenarioStore = db.createObjectStore("scenarios", {
          keyPath: "scenarioId",
          autoIncrement: true
        });
        scenarioStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // 新設: sceneEntries ストア
      if (!db.objectStoreNames.contains("sceneEntries")) {
        const sceneStore = db.createObjectStore("sceneEntries", {
          keyPath: "entryId",
          autoIncrement: true
        });
        sceneStore.createIndex("scenarioId", "scenarioId", { unique: false });
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

/* -------------------------------------------
    新しいシナリオの追加・読み込み用API
   -------------------------------------------*/

/**
 * 新しいシナリオを scenarios ストアに追加
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

/**
 * シナリオをID指定で取得
 */
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

/**
 * 進行中のシナリオをすべて取得
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
      result.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      resolve(result);
    };
    req.onerror = (err) => {
      reject(err);
    };
  });
}

/**
 * シナリオを更新 (updatedAtを上書きなど)
 */
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

/**
 * シーン履歴エントリを追加
 */
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

/**
 * 指定シナリオIDの全シーンエントリを取得
 */
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

/**
 * シーンエントリを更新
 */
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

/**
 * シーンエントリを削除
 */
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

/* -------------------------------------------
  ★シナリオ削除用(シナリオ本体 + シーン履歴)
-------------------------------------------*/
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

/* ==========================================
   ★シナリオコピー用に追加した関数
   ==========================================*/
/**
 * 指定シナリオを丸ごとコピーする
 * 1) 元シナリオを取得
 * 2) 新シナリオを同じwizardDataで作成
 * 3) 元シナリオのシーンエントリを取得
 * 4) それぞれ新シナリオIDで追加
 * @param {number} originalScenarioId
 * @returns {Promise<number>} 新シナリオID
 */
async function copyScenarioById(originalScenarioId) {
  if (!db) {
    throw new Error("DB未初期化");
  }
  // 1) 元シナリオ取得
  const original = await getScenarioById(originalScenarioId);
  if (!original) {
    throw new Error("コピー元シナリオが存在しません");
  }

  // 2) 新シナリオを作成（タイトルに「(コピー)」を付ける例）
  const newTitle = original.title + " (コピー)";
  const newScenarioId = await createNewScenario(original.wizardData, newTitle);

  // 3) 元シーンエントリをすべて取得
  const originalEntries = await getSceneEntriesByScenarioId(originalScenarioId);

  // 4) 全部新シナリオIDで登録
  const tx = db.transaction("sceneEntries", "readwrite");
  const sceneStore = tx.objectStore("sceneEntries");

  for (const e of originalEntries) {
    const copyEntry = {
      scenarioId: newScenarioId,
      type: e.type,
      sceneId: e.sceneId,     // シーンIDは同じでも問題ない（シナリオIDが別なので衝突はしない）
      content: e.content,
      dataUrl: e.dataUrl || null,
      prompt: e.prompt || null
    };
    sceneStore.add(copyEntry);
  }
  // トランザクション完了を待つ
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (err) => reject(err);
  });

  // scenarios.updatedAtを更新しておく
  const newScenario = await getScenarioById(newScenarioId);
  if (newScenario) {
    newScenario.updatedAt = new Date().toISOString();
    await updateScenario(newScenario);
  }

  return newScenarioId;
}

/* -------------------------------------------
  エクスポート
-------------------------------------------*/
window.initIndexedDB = initIndexedDB;

window.saveCharacterDataToIndexedDB = saveCharacterDataToIndexedDB;
window.loadCharacterDataFromIndexedDB = loadCharacterDataFromIndexedDB;

window.createNewScenario = createNewScenario;
window.getScenarioById = getScenarioById;
window.listAllScenarios = listAllScenarios;
window.updateScenario = updateScenario;

window.addSceneEntry = addSceneEntry;
window.getSceneEntriesByScenarioId = getSceneEntriesByScenarioId;
window.updateSceneEntry = updateSceneEntry;
window.deleteSceneEntry = deleteSceneEntry;

/* ★シナリオ削除用 */
window.deleteScenarioById = deleteScenarioById;

/* ★シナリオコピー用 */
window.copyScenarioById = copyScenarioById;
