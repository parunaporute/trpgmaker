/*************************************************
 * menu.js
 *************************************************/

/**
 * グローバルに「シナリオ一覧」をキャッシュしておく
 *  - ページロード後に一度だけ listAllScenarios() を呼び出す
 */
window.cachedScenarios = [];

/** initMenuPage: ページ読み込み時に呼び出されるメイン初期化 */
window.initMenuPage = async function () {
  // すでに initIndexedDB() は呼ばれている前提

  // localStorage から APIキーを読み込む
  window.apiKey = localStorage.getItem("apiKey") || "";

  // DB から全シナリオを取得し、cachedScenarios に格納
  try {
    const all = await listAllScenarios();
    window.cachedScenarios = all;
  } catch (err) {
    console.error("シナリオ一覧の取得に失敗:", err);
    showToast("シナリオ一覧の取得に失敗しました。");
    window.cachedScenarios = [];
  }

  // characterDataのロード
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // 「非表示を表示する」がオンかオフかで、最初の描画を行う
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;

  // フィルタを適用して表示
  applyScenarioFilter(showHidden);

  // メニュー上のボタン類をセットアップ
  setupMenuButtons();
  initAccordion();
};

/**
 * 現在の「非表示を表示する」チェック状態に合わせ、
 * cachedScenarios のうち表示対象となるものを差分更新する
 */
function applyScenarioFilter(showHidden) {
  const container = document.getElementById("scenario-list-container");
  const noScenariosMsg = document.getElementById("no-scenarios-message");
  if (!container) return;

  // 1) 既存の DOM 上にある scenario-list をマッピング (scenarioId -> DOM要素)
  const existingRows = Array.from(container.querySelectorAll(".scenario-list"));
  const existingMap = {};
  existingRows.forEach((row) => {
    const sid = row.dataset.scenarioId;
    existingMap[sid] = row;
  });

  // 2) フィルタ条件に合うシナリオを選び出す
  const filtered = window.cachedScenarios.filter((s) => {
    return showHidden ? s.hideFromHistoryFlag : !s.hideFromHistoryFlag;
  });

  // 3) 「表示するべき scenarioId の集合」
  const filteredIds = new Set(filtered.map((s) => s.scenarioId));

  // 4) すでにDOMにあるがフィルタに合わなくなったものを削除
  for (const sid in existingMap) {
    if (!filteredIds.has(sid)) {
      existingMap[sid].remove(); // DOMから削除
      delete existingMap[sid];
    }
  }

  // 5) フィルタに合うシナリオのうち、まだDOMに存在しないものを生成・append
  filtered.forEach((scenario) => {
    if (!existingMap[scenario.scenarioId]) {
      const row = createScenarioRow(scenario);
      container.appendChild(row);
      existingMap[scenario.scenarioId] = row;
    } else {
      // 既存行を念のため更新
      updateScenarioRow(existingMap[scenario.scenarioId], scenario);
    }
  });

  // 6) 0件ならコンテナを隠してメッセージ表示
  if (filtered.length === 0) {
    container.style.display = "none";
    noScenariosMsg.style.display = "block";
  } else {
    container.style.display = "";
    noScenariosMsg.style.display = "none";
  }
}

/**
 * 単一シナリオ行を生成して返す
 * scenario の状態に応じてボタンのラベルや色をセット
 */
function createScenarioRow(scenario) {
  const div = document.createElement("div");
  div.className = "scenario-list";
  // 部分更新・DOM検索用に scenarioId を data 属性に持たせる
  div.dataset.scenarioId = scenario.scenarioId;

  const infoText = document.createElement("span");
  infoText.className = "info";
  infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
  div.appendChild(infoText);

  // 今の「非表示を表示する」チェック状態を取得
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;

  // 「非表示を表示」チェックがオフの場合のみ「続きへ」「本棚へ」ボタン
  if (!showHidden) {
    // 続きへボタン
    const btnContinue = document.createElement("button");
    btnContinue.type = "button";
    btnContinue.textContent = "始める";
    btnContinue.addEventListener("click", () => {
      window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
    });
    div.appendChild(btnContinue);

    // 「本棚へ」/「収納済」トグルボタン
    const btnShelf = document.createElement("button");
    btnShelf.type = "button";
    btnShelf.classList.add("btn-shelf");

    if (!scenario.bookShelfFlag) {
      btnShelf.textContent = "本棚へ";
      btnShelf.style.backgroundColor = "";
    } else {
      btnShelf.textContent = "収納済";
      btnShelf.style.backgroundColor = "gray";
    }

    btnShelf.addEventListener("click", async () => {
      try {
        await toggleBookShelfFlag(scenario);
      } catch (err) {
        console.error(err);
        showToast("本棚フラグ切り替えに失敗:\n" + err.message);
      }
    });
    div.appendChild(btnShelf);
  }

  // 非表示フラグによって「非表示にする」or「表示する」ボタン
  if (!scenario.hideFromHistoryFlag) {
    const btnHide = document.createElement("button");
    btnHide.type = "button";
    btnHide.textContent = "非表示にする";
    btnHide.addEventListener("click", () => {
      showHideConfirmModal(scenario);
    });
    div.appendChild(btnHide);
  } else {
    const btnShow = document.createElement("button");
    btnShow.type = "button";
    btnShow.textContent = "表示する";
    btnShow.style.backgroundColor = "gray";
    btnShow.addEventListener("click", async () => {
      try {
        await toggleHideFromHistoryFlag(scenario, false);
        showToast(`シナリオ(ID:${scenario.scenarioId})を表示しました。`);
      } catch (err) {
        console.error(err);
        showToast("非表示フラグ切り替えに失敗:\n" + err.message);
      }
    });
    div.appendChild(btnShow);
  }

  // 「非表示を表示」チェックがオンの場合のみ「削除する」ボタン
  if (showHidden) {
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.textContent = "削除する";
    btnDelete.style.backgroundColor = "#f44336";
    btnDelete.addEventListener("click", () => {
      scenarioIdToDelete = scenario.scenarioId;
      showDeleteScenarioModal(true);
    });
    div.appendChild(btnDelete);
  }

  return div;
}

/**
 * 既存のシナリオ行要素を丸ごと置き換える (DOMの部分再描画用)
 */
function updateScenarioRow(oldRow, scenario) {
  const newRow = createScenarioRow(scenario);
  oldRow.parentNode.replaceChild(newRow, oldRow);
  return newRow;
}

/**
 * DOMから指定のシナリオ行を削除する (scenarioIdベース)
 */
function removeScenarioFromDOM(scenarioId) {
  const row = document.querySelector(`.scenario-list[data-scenario-id="${scenarioId}"]`);
  if (row) {
    row.remove();
  }
}

/**
 * 「本棚フラグ」をトグルして部分的にDOM反映する
 */
async function toggleBookShelfFlag(scenario) {
  scenario.bookShelfFlag = !scenario.bookShelfFlag;
  scenario.updatedAt = new Date().toISOString();
  await updateScenario(scenario);

  // グローバル cachedScenarios も同期的に更新
  const index = window.cachedScenarios.findIndex((s) => s.scenarioId === scenario.scenarioId);
  if (index !== -1) {
    window.cachedScenarios[index] = { ...scenario };
  }

  // 表示中であれば行を更新
  const row = document.querySelector(`.scenario-list[data-scenario-id="${scenario.scenarioId}"]`);
  if (row) {
    updateScenarioRow(row, scenario);
  }
}

/**
 * 「hideFromHistoryFlag」をトグル (true=非表示, false=表示)
 */
async function toggleHideFromHistoryFlag(scenario, hideFlag) {
  scenario.hideFromHistoryFlag = hideFlag;
  scenario.updatedAt = new Date().toISOString();
  await updateScenario(scenario);

  // グローバル cachedScenarios も同期的に更新
  const index = window.cachedScenarios.findIndex((s) => s.scenarioId === scenario.scenarioId);
  if (index !== -1) {
    window.cachedScenarios[index] = { ...scenario };
  }

  // 現在のフィルタを取得して差分更新
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;
  applyScenarioFilter(showHidden);
}

/** 「非表示にする」ボタン押下時の確認モーダル表示 */
function showHideConfirmModal(scenario) {
  let modal = document.getElementById("hide-from-history-modal");
  if (!modal) {
    // 存在しなければ新規作成
    modal = document.createElement("div");
    modal.id = "hide-from-history-modal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px;">
        <p>本当に非表示にしますか？</p>
        <div class="c-flexbox">
          <button id="hide-from-history-ok">OK</button>
          <button id="hide-from-history-cancel">キャンセル</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.classList.add("active");

  // 前回リスナーが残っている場合を考慮し、一旦置き換えて再度 addEventListener
  const okBtn = modal.querySelector("#hide-from-history-ok");
  const cancelBtn = modal.querySelector("#hide-from-history-cancel");
  okBtn.replaceWith(okBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));

  // OK
  modal.querySelector("#hide-from-history-ok").addEventListener("click", async () => {
    try {
      await toggleHideFromHistoryFlag(scenario, true);
      showToast(`シナリオ(ID:${scenario.scenarioId})を非表示にしました。`);
    } catch (err) {
      console.error(err);
      showToast("非表示フラグ切り替えに失敗:\n" + err.message);
    }
    modal.classList.remove("active");
  });

  // キャンセル
  modal.querySelector("#hide-from-history-cancel").addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

// 削除用モーダル
let scenarioIdToDelete = null;
function showDeleteScenarioModal(show) {
  const modal = document.getElementById("delete-scenario-modal");
  if (!modal) return;
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

/** シナリオ削除モーダルでOK */
async function confirmDeleteScenario() {
  if (scenarioIdToDelete == null) {
    showDeleteScenarioModal(false);
    return;
  }
  try {
    await deleteScenarioById(scenarioIdToDelete);
    showToast(`シナリオ(ID:${scenarioIdToDelete})を削除しました。`);
  } catch (err) {
    console.error(err);
    showToast("シナリオ削除に失敗:\n" + err.message);
  }

  // cachedScenarios から該当シナリオを取り除く
  window.cachedScenarios = window.cachedScenarios.filter(
    (s) => s.scenarioId !== scenarioIdToDelete
  );

  // DOMから該当行を削除
  removeScenarioFromDOM(scenarioIdToDelete);

  scenarioIdToDelete = null;
  showDeleteScenarioModal(false);
}

/** メニュー内のボタン等のイベント設定 */
function setupMenuButtons() {
  // 「APIキー設定」または「キー設定済」のボタン
  const setApiKeyButton = document.getElementById("set-api-key-button");
  const apiKeyModal = document.getElementById("api-key-modal");
  const apiKeyInput = document.getElementById("api-key-input");
  const apiKeyOkButton = document.getElementById("api-key-ok-button");
  const apiKeyClearButton = document.getElementById("api-key-clear-button");

  if (!window.apiKey) {
    setApiKeyButton.textContent = "APIキー設定";
  } else {
    setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
  }

  setApiKeyButton.addEventListener("click", () => {
    apiKeyModal.classList.add("active");
    apiKeyInput.value = window.apiKey;
  });

  apiKeyOkButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem("apiKey", key);
      window.apiKey = key;
      setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
    }
    apiKeyModal.classList.remove("active");
  });

  apiKeyClearButton.addEventListener("click", () => {
    if (confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？")) {
      localStorage.removeItem("apiKey");
      window.apiKey = "";
      setApiKeyButton.textContent = "APIキー設定";
      apiKeyModal.classList.remove("active");
    }
  });

  document.getElementById("clear-character-btn").addEventListener("click", async () => {
    if (confirm("エレメント情報をクリアします。よろしいですか？")) {
      window.characterData = [];
      await saveCharacterDataToIndexedDB(window.characterData);
      showToast("エレメント情報をクリアしました。");
    }
  });

  document.getElementById("show-warehouse-btn").addEventListener("click", () => {
    showWarehouseModal("menu");
  });

  document.getElementById("character-create").addEventListener("click", () => {
    window.location.href = "characterCreate.html";
  });

  document.getElementById("party-list").addEventListener("click", () => {
    window.location.href = "partyList.html";
  });

  document.getElementById("start-new-scenario-button").addEventListener("click", () => {
    window.location.href = "scenarioWizard.html";
  });

  // シナリオ削除モーダル OK/CANCEL
  document.getElementById("delete-scenario-ok").addEventListener("click", confirmDeleteScenario);
  document.getElementById("delete-scenario-cancel").addEventListener("click", () => {
    scenarioIdToDelete = null;
    showDeleteScenarioModal(false);
  });

  // 「本棚」ボタン(全シナリオ一覧へ飛ぶもの)
  document.getElementById("show-bookshelf-btn").addEventListener("click", () => {
    window.location.href = "bookshelf.html";
  });

  // 「非表示を表示する」チェックボックスのイベント
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  if (showHiddenCheckbox) {
    // クリックされたとき、アコーディオンへの伝搬を止める
    showHiddenCheckbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    // チェック状態が変わったら差分更新
    showHiddenCheckbox.addEventListener("change", () => {
      const showHidden = showHiddenCheckbox.checked;
      applyScenarioFilter(showHidden);
    });
  }
}

/** アコーディオンの展開状態管理 */
function initAccordion() {
  const header = document.getElementById("ongoing-scenarios-header");
  const content = document.getElementById("ongoing-scenarios-content");
  if (!header || !content) return;

  // 前回の開閉状態を復元
  const savedState = localStorage.getItem("ongoingScenariosAccordionState");
  if (savedState === "open") {
    content.classList.add("open");
  }

  // ヘッダクリックで開閉トグル
  header.addEventListener("click", (e) => {
    // チェックボックス or そのラベルがクリックされた場合は開閉しない
    if (
      e.target.closest("#show-hidden-scenarios") ||
      e.target.closest("label[for='show-hidden-scenarios']")
    ) {
      return;
    }
    // 開閉
    content.classList.toggle("open");
    if (content.classList.contains("open")) {
      localStorage.setItem("ongoingScenariosAccordionState", "open");
    } else {
      localStorage.setItem("ongoingScenariosAccordionState", "closed");
    }
  });
}

