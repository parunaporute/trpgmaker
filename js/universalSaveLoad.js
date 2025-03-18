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


// ▼ 画面上にある "続き" ボタンへイベントを付与
document.addEventListener("DOMContentLoaded", () => {
  const saveLoadButton = document.getElementById("save-load-button");
  if (saveLoadButton) {
    saveLoadButton.addEventListener("click", openSaveLoadModal);
  }
});

/**
 * セーブ／ロード用モーダルを multiModal で開く。
 */
window.openSaveLoadModal = async function () {
  multiModal.open({
    title: "セーブ/ロード",
    contentHtml: `
      <div id="slot-container">
        <div id="slot-items-container"></div>
        <button id="add-slot-button">＋</button>
      </div>
      <div class="c-flexbox" style="margin-bottom:20px;">
        <button id="do-save-button" style="display:none;">保存</button>
        <button id="do-load-button">始める</button>
      </div>
      <div class="c-flexbox" style="margin-top:15px;">
        <button id="clear-all-slots-button" style="background-color:#b71c1c; border-color:#b71c1c;">全クリア</button>
      </div>
    `,
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    cancelLabel: "閉じる",
    // モーダルが開いた後でDOM要素が存在するようになる → onOpenでイベントを付与
    onOpen: async () => {
      // もしスロット未作成なら5つ作る
      await ensureInitialSlots();

      // イベント紐付け
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

      const clearAllSlotsBtn = document.getElementById("clear-all-slots-button");
      if (clearAllSlotsBtn) {
        clearAllSlotsBtn.addEventListener("click", onClearAllSlots);
      }

      // 初期表示
      await renderSlotList();
    }
  });
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

  // セーブボタンの表示/非表示を切り替え
  const doSaveBtn = document.getElementById("do-save-button");
  if (doSaveBtn) {
    // 現在のシナリオがあればセーブ可能
    if (window.currentScenarioId) {
      doSaveBtn.style.display = "";
    } else {
      doSaveBtn.style.display = "none";
    }
  }
};

/**
 * 個別スロットを削除
 */
window.onDeleteSlot = async function (slotIndex) {
  // 確認ダイアログを multiModal で
  multiModal.open({
    title: "スロット削除",
    contentHtml: `<p>スロット${slotIndex}を削除します。よろしいですか？</p>`,
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    okLabel: "OK",
    cancelLabel: "キャンセル",
    onOk: async () => {
      // 削除
      await deleteUniversalSlot(slotIndex);
      // 再描画
      await renderSlotList();
    }
  });
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
 *   - 空でない場合は「上書きしても良いか」ダイアログ
 */
window.onClickSave = async function () {
  // 選択スロット
  const selected = document.querySelector('input[name="slotRadio"]:checked');
  if (!selected) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>スロットを選択してください。</p>",
      cancelLabel: "閉じる"
    });
    return;
  }
  const slotIndex = parseInt(selected.value, 10);

  // スロットを取得 (すでに何かあるか確認)
  const existingSlot = await getUniversalSave(slotIndex);
  if (existingSlot && existingSlot.data) {
    // 既に何か入っている → 上書き確認
    multiModal.open({
      title: "上書き確認",
      contentHtml: `<p>スロット${slotIndex}は既に使われています。<br>上書きしてもよろしいですか？</p>`,
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true,
      okLabel: "OK",
      cancelLabel: "キャンセル",
      onOk: async () => {
        await doSaveToSlot(slotIndex);
      }
    });
  } else {
    await doSaveToSlot(slotIndex);
  }
};

async function doSaveToSlot(slotIndex) {
  // 現在のシナリオID
  if (!window.currentScenarioId) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>現在のシナリオIDが不明です。</p>",
      cancelLabel: "閉じる"
    });
    return;
  }
  // シナリオ本体
  const scenarioObj = await getScenarioById(window.currentScenarioId);
  if (!scenarioObj) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>シナリオがDBに存在しません。</p>",
      cancelLabel: "閉じる"
    });
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

  multiModal.open({
    title: "保存完了",
    contentHtml: `<p>スロット${slotIndex}にセーブしました。</p>`,
    cancelLabel: "OK"
  });
  renderSlotList();
}

/**
 * 「ロード」ボタン
 *   - 選択スロットの scenarioId が現在と同じなら即ロード
 *   - 違う場合は scenario.html?slotIndex=...&action=load へ飛ぶ
 */
window.onClickLoad = async function () {
  const selected = document.querySelector('input[name="slotRadio"]:checked');
  if (!selected) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>スロットを選択してください。</p>",
      cancelLabel: "閉じる"
    });
    return;
  }
  const slotIndex = parseInt(selected.value, 10);
  const slot = await getUniversalSave(slotIndex);
  if (!slot || !slot.data) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>そのスロットは空です。</p>",
      cancelLabel: "閉じる"
    });
    return;
  }

  const targetScenarioId = slot.data.scenarioId;
  if (!targetScenarioId) {
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>スロットにシナリオ情報がありません。</p>",
      cancelLabel: "閉じる"
    });
    return;
  }

  // 現在のシナリオと同じ？
  if (targetScenarioId === window.currentScenarioId) {
    // 同じなら今の画面でロード処理
    await doLoadScenarioFromSlot(slot.data);
    multiModal.open({
      title: "ロード完了",
      contentHtml: `<p>現在のシナリオをスロット${slotIndex}で上書きしました。</p>`,
      cancelLabel: "OK"
    });
  } else {
    // 違うシナリオID → scenario.html?slotIndex=..&action=load へ飛ぶ
    const url = `scenario.html?slotIndex=${slotIndex}&action=load`;
    window.location.href = url;
  }
};

/**
 * 全クリアボタン
 */
window.onClearAllSlots = async function () {
  multiModal.open({
    title: "全スロットをクリア",
    contentHtml: "<p>全スロットをクリアし、空き状態に戻します。よろしいですか？</p>",
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    okLabel: "OK",
    cancelLabel: "キャンセル",
    onOk: async () => {
      // 全削除
      const all = await listAllSlots();
      for (const s of all) {
        await deleteUniversalSlot(s.slotIndex);
      }
      // 初期スロット5つを作成
      await ensureInitialSlots();
      // 再描画
      await renderSlotList();
      multiModal.open({
        title: "完了",
        contentHtml: "<p>全スロットをクリアし、初期状態に戻しました。</p>",
        cancelLabel: "OK"
      });
    }
  });
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
    multiModal.open({
      title: "エラー",
      contentHtml: "<p>該当シナリオがDBに見つかりません。ロードできません。</p>",
      cancelLabel: "閉じる"
    });
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
}

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
