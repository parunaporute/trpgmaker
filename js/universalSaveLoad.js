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

let saveLoadModal = null; // 生成したモーダルの参照

/**
 * セーブ／ロードモーダルを動的に生成する
 */
function createSaveLoadModal() {
  // すでに生成済みならスキップ
  if (saveLoadModal) return;

  // ラッパdiv
  saveLoadModal = document.createElement("div");
  saveLoadModal.id = "save-load-modal";
  saveLoadModal.classList.add("modal");

  // モーダルコンテンツ
  const modalContent = document.createElement("div");
  modalContent.classList.add("modal-content", "save-load-modal-content");
  modalContent.style.maxWidth = "500px";

  // slot-container
  const slotContainer = document.createElement("div");
  slotContainer.id = "slot-container";

  // slot-items-container
  const slotItemsContainer = document.createElement("div");
  slotItemsContainer.id = "slot-items-container";
  slotContainer.appendChild(slotItemsContainer);

  // スロット追加ボタン (+)
  const addSlotBtn = document.createElement("button");
  addSlotBtn.id = "add-slot-button";
  addSlotBtn.textContent = "＋";
  slotContainer.appendChild(addSlotBtn);

  // ボタン群 (セーブ／ロード)
  const flexBox1 = document.createElement("div");
  flexBox1.classList.add("c-flexbox");
  flexBox1.style.marginBottom = "20px";

  const doSaveBtn = document.createElement("button");
  doSaveBtn.id = "do-save-button";
  doSaveBtn.style.display = "none"; // デフォルト非表示
  doSaveBtn.textContent = "保存";

  const doLoadBtn = document.createElement("button");
  doLoadBtn.id = "do-load-button";
  doLoadBtn.textContent = "始める";

  flexBox1.appendChild(doSaveBtn);
  flexBox1.appendChild(doLoadBtn);

  // 全クリアボタン
  const flexBox2 = document.createElement("div");
  flexBox2.classList.add("c-flexbox");
  flexBox2.style.marginTop = "15px";

  const clearAllSlotsBtn = document.createElement("button");
  clearAllSlotsBtn.id = "clear-all-slots-button";
  clearAllSlotsBtn.style.backgroundColor = "#b71c1c";
  clearAllSlotsBtn.style.borderColor = "#b71c1c";
  clearAllSlotsBtn.textContent = "全クリア";

  flexBox2.appendChild(clearAllSlotsBtn);

  // 閉じるボタン
  const closeModalBtn = document.createElement("button");
  closeModalBtn.id = "save-load-close-button";
  closeModalBtn.classList.add("btn-close-modal");
  closeModalBtn.textContent = "閉じる";

  // 各要素をmodalContentへ配置
  modalContent.appendChild(slotContainer);
  modalContent.appendChild(flexBox1);
  modalContent.appendChild(flexBox2);
  modalContent.appendChild(closeModalBtn);

  // モーダル全体に組み立て
  saveLoadModal.appendChild(modalContent);

  // body へ追加
  document.body.appendChild(saveLoadModal);
}

/* DOM構築後にイベント紐づけ */
document.addEventListener("DOMContentLoaded", () => {
  // 1) 先にモーダルDOMを生成
  createSaveLoadModal();

  // 2) 生成済み要素を取得してイベントを紐づける
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

  // セーブロードボタン（画面上の「続き」ボタン）
  const saveLoadButton = document.getElementById("save-load-button");
  if (saveLoadButton) {
    saveLoadButton.addEventListener("click", openSaveLoadModal);
  }

  // ▼ 全クリアボタン
  const clearAllSlotsBtn = document.getElementById("clear-all-slots-button");
  if (clearAllSlotsBtn) {
    clearAllSlotsBtn.addEventListener("click", onClearAllSlots);
  }
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
    const rowContainer = document.createElement("div");
    rowContainer.className = "save-slot-row-container";

    const deleteButton = document.createElement("button");
    deleteButton.className = "save-slot-delete";
    deleteButton.innerHTML = `<span class="iconmoon icon-cross"></span>`;
    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation(); // ラベルクリック(=ラジオ選択)と区別
      await onDeleteSlot(slot.slotIndex);
    });

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
      label.textContent = `${slot.slotIndex}: 空き`;
    } else {
      const ymd = (slot.updatedAt || "").split("T")[0];
      const title = slot.data.scenarioTitle || "NoTitle";
      label.textContent = `${slot.slotIndex}: ${ymd} ${title}`;
    }

    row.appendChild(rb);
    row.appendChild(label);
    rowContainer.appendChild(row);
    rowContainer.appendChild(deleteButton);
    container.appendChild(rowContainer);
  }
};

/**
 * 個別スロットを削除
 */
window.onDeleteSlot = async function (slotIndex) {
  // 確認
  if (!confirm(`スロット${slotIndex}を削除します。よろしいですか？`)) {
    return;
  }
  // 削除
  await deleteUniversalSlot(slotIndex);

  // 再描画
  await renderSlotList();
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
    alert("そのスロットは空です。");
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
