/************************************************************
 * universalSaveLoad.js
 * 
 * シナリオに紐づかず、全体で共通のセーブスロットを管理する。
 * slotIndex=1～N のレコードに "data" として
 *   {
 *     scenarioId,
 *     scenarioTitle,
 *     scenarioWizardData,
 *     scenes
 *   }
 * を保存する方式。
 ************************************************************/

/* DOM構築後にイベント紐づけ */
document.addEventListener("DOMContentLoaded", () => {
  const addSlotBtn = document.getElementById("add-slot-button");
  if (addSlotBtn) {
    addSlotBtn.addEventListener("click", onAddSlot);
  }

  const doSaveBtn = document.getElementById("do-save-button");
  if (doSaveBtn) {
    doSaveBtn.addEventListener("click", onClickSave);
  }

  const doLoadBtn = document.getElementById("do-load-button");
  if (doLoadBtn) {
    doLoadBtn.addEventListener("click", onClickLoad);
  }

  const closeModalBtn = document.getElementById("save-load-close-button");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeSaveLoadModal);
  }

  // セーブロードボタン
  const saveLoadButton = document.getElementById("save-load-button");
  saveLoadButton.addEventListener("click", () => {
    openSaveLoadModal(); // universalSaveLoad.js
  });

});

/**
 * モーダルを開き、スロット一覧を表示
 */
window.openSaveLoadModal = async function () {
  const modal = document.getElementById("save-load-modal");
  if (!modal) return;

  modal.classList.add("active");
  // もしスロット未作成なら5つ作る
  await ensureInitialSlots();
  // スロット一覧表示
  await renderSlotList();
};

/**
 * モーダルを閉じる
 */
window.closeSaveLoadModal = function () {
  const modal = document.getElementById("save-load-modal");
  if (modal) {
    modal.classList.remove("active");
  }
};

/**
 * スロット一覧を描画
 */
window.renderSlotList = async function () {
  const container = document.getElementById("slot-items-container");
  if (!container) return;

  container.innerHTML = "";

  // 全スロット取得
  const all = await listAllSlots();
  for (const slot of all) {
    const row = document.createElement("div");
    row.className = "save-slot-row";

    const rb = document.createElement("input");
    rb.type = "radio";
    rb.name = "slotRadio";
    rb.value = slot.slotIndex;
    rb.id = "slotRadio_" + slot.slotIndex;

    const label = document.createElement("label");
    label.setAttribute("for", rb.id);

    if (!slot.data) {
      // 空き
      label.textContent = `スロット${slot.slotIndex}: 空き`;
    } else {
      const ymd = (slot.updatedAt || "").split("T")[0];
      const title = slot.data.scenarioTitle || "NoTitle";
      label.textContent = `スロット${slot.slotIndex}: ${ymd} ${title}`;
    }

    row.appendChild(rb);
    row.appendChild(label);
    container.appendChild(row);
  }
};

/**
 * 「+」ボタン → スロット追加
 */
window.onAddSlot = async function () {
  // 全スロット取得して、maxIndex+1 のスロットを作る
  const all = await listAllSlots();
  let maxIdx = 0;
  for (const s of all) {
    if (s.slotIndex > maxIdx) maxIdx = s.slotIndex;
  }
  const newIdx = maxIdx + 1;

  const rec = {
    slotIndex: newIdx,
    updatedAt: new Date().toISOString(),
    data: null
  };
  await putUniversalSave(rec);

  await renderSlotList();
};
/**
 * 「セーブ」ボタン
 *   - 選択したスロットに現在シナリオの内容を詰める
 *   - 空でない場合は「上書きしても良いか」確認ダイアログ
 */
window.onClickSave = async function () {
  // 選択スロット
  const selected = document.querySelector('input[name="slotRadio"]:checked');
  if (!selected) {
    alert("スロットを選択してください。");
    return;
  }
  const slotIndex = parseInt(selected.value, 10);

  // スロットを取得 (すでに空きかどうか確認する)
  const existingSlot = await getUniversalSave(slotIndex);
  if (existingSlot && existingSlot.data) {
    // 既に何か入っている (空ではない)
    if (!confirm(`スロット${slotIndex}は既に使われています。\n上書きしてもよろしいですか？`)) {
      return; // キャンセル
    }
  }

  // 現在のシナリオID
  if (!window.currentScenarioId) {
    alert("現在のシナリオIDが不明です。");
    return;
  }
  // シナリオ本体
  const scenarioObj = await getScenarioById(window.currentScenarioId);
  if (!scenarioObj) {
    alert("シナリオがDBに存在しません。");
    return;
  }
  // シーン一覧
  const scenes = await getSceneEntriesByScenarioId(window.currentScenarioId);

  // データ詰める
  const data = {
    scenarioId: window.currentScenarioId,
    scenarioTitle: scenarioObj.title || "(無題)",
    scenarioWizardData: scenarioObj.wizardData || {},
    scenes
  };

  // スロットに保存
  const rec = {
    slotIndex,
    updatedAt: new Date().toISOString(),
    data
  };
  await putUniversalSave(rec);

  alert(`スロット${slotIndex}にセーブしました。`);
  renderSlotList();
};

/**
 * 「ロード」ボタン
 *   - 選択スロットの scenarioId が現在と同じなら即ロード
 *   - 違う場合は scenario.html?slotIndex=...&action=load へ飛んでロードする
 */
window.onClickLoad = async function () {
  const selected = document.querySelector('input[name="slotRadio"]:checked');
  if (!selected) {
    alert("スロットを選択してください。");
    return;
  }
  const slotIndex = parseInt(selected.value, 10);
  const slot = await getUniversalSave(slotIndex);
  if (!slot || !slot.data) {
    alert("そのスロットは空きです。");
    return;
  }

  const targetScenarioId = slot.data.scenarioId;
  if (!targetScenarioId) {
    alert("スロットにシナリオ情報がありません。");
    return;
  }

  // 現在のシナリオと同じ？
  if (targetScenarioId === window.currentScenarioId) {
    // 同じなら今の画面でロード処理
    await doLoadScenarioFromSlot(slot.data);
    alert(`現在のシナリオをスロット${slotIndex}で上書きしました。`);
  } else {
    // 違うシナリオID → scenario.html?slotIndex=..&action=load へ飛ぶ
    const url = `scenario.html?slotIndex=${slotIndex}&action=load`;
    window.location.href = url;
  }
};

/* ======================================
   ▼ 全クリアボタンの処理
====================================== */
window.onClearAllSlots = async function () {
  // 確認ダイアログ
  if (!confirm("全スロットをクリアし、空き状態に戻します。\nよろしいですか？")) {
    return; // キャンセル
  }

  // 全削除
  const all = await listAllSlots();
  for (const s of all) {
    // slotIndexが確定 => DBのレコード削除
    await deleteUniversalSlot(s.slotIndex);
  }

  // 初期スロット5つを作成
  await ensureInitialSlots();

  // 再描画
  await renderSlotList();
  alert("全スロットをクリアし、初期状態に戻しました。");
};

/**
 * スロット data からシナリオをDBへ反映し、メモリ更新
 * (現在のシナリオIDと同じ前提)
 */
window.doLoadScenarioFromSlot = async function (slotData) {
  // slotData = { scenarioId, scenarioTitle, scenarioWizardData, scenes }
  const sId = slotData.scenarioId;

  // DB上のシナリオを取得
  let scenarioObj = await getScenarioById(sId);
  if (!scenarioObj) {
    alert("該当シナリオがDBに見つかりません。ロードできません。");
    return;
  }

  // シナリオを上書き
  scenarioObj.title = slotData.scenarioTitle || "(無題)";
  scenarioObj.wizardData = slotData.scenarioWizardData || {};
  await updateScenario(scenarioObj, true);

  // シーン履歴を入れ替え
  const existing = await getSceneEntriesByScenarioId(sId);
  for (const e of existing) {
    await deleteSceneEntry(e.entryId);
  }
  for (const sc of slotData.scenes) {
    delete sc.entryId; // 自動採番
    sc.scenarioId = sId;
    await addSceneEntry(sc);
  }

  // メモリ更新
  await loadScenarioData(sId);
};

/* ======================================
   ▼ スロット管理用 IndexedDB 関数
====================================== */
window.ensureInitialSlots = async function () {
  const all = await listAllSlots();
  if (all.length > 0) {
    return; // 既に何かある
  }
  // slotIndex=1～5 を空きで作成
  for (let i = 1; i <= 5; i++) {
    const rec = {
      slotIndex: i,
      updatedAt: new Date().toISOString(),
      data: null
    };
    await putUniversalSave(rec);
  }
};

window.listAllSlots = function () {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("DB未初期化");
      resolve([]);
      return;
    }
    const tx = db.transaction("universalSaves", "readonly");
    const store = tx.objectStore("universalSaves");
    const req = store.getAll();
    req.onsuccess = (evt) => {
      const result = evt.target.result || [];
      result.sort((a, b) => a.slotIndex - b.slotIndex);
      resolve(result);
    };
    req.onerror = (err) => reject(err);
  });
};

window.getUniversalSave = function (slotIndex) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("universalSaves", "readonly");
    const store = tx.objectStore("universalSaves");
    const req = store.get(slotIndex);
    req.onsuccess = e => {
      resolve(e.target.result || null);
    };
    req.onerror = err => reject(err);
  });
};

window.putUniversalSave = function (record) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("universalSaves", "readwrite");
    const store = tx.objectStore("universalSaves");
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = err => reject(err);
  });
};

/** 新規追加: スロットを1件削除 */
window.deleteUniversalSlot = function (slotIndex) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB未初期化");
    const tx = db.transaction("universalSaves", "readwrite");
    const store = tx.objectStore("universalSaves");
    const delReq = store.delete(slotIndex);
    delReq.onsuccess = () => resolve();
    delReq.onerror = err => reject(err);
  });
};
