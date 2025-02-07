/*************************************************
 * menu.js
 *************************************************/

/** シナリオ一覧再描画用(※非表示チェックの状態を見てフィルタする) */
async function renderScenarioList() {
  const container = document.getElementById("scenario-list-container");
  // リスト増殖バグを防ぐため、描画前に必ずクリア
  container.innerHTML = "";

  try {
    const scenarioList = await listAllScenarios();

    // 「非表示を表示する」チェックの状態を取得
    const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
    const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;

    // チェックが入っている場合は「非表示のもののみ」を抽出
    // チェックなしの場合は「表示するもののみ」を抽出
    const filteredScenarios = scenarioList.filter((s) => {
      return showHidden ? s.hideFromHistoryFlag === true : s.hideFromHistoryFlag === false;
    });

    if (filteredScenarios.length === 0) {
      container.style.justifyContent = "center";
      container.textContent = "進行中のシナリオはありません。";
      return;
    } else {
      container.style.justifyContent = "start";
    }

    // シナリオ一覧生成
    filteredScenarios.forEach((scenario) => {
      const div = document.createElement("div");
      div.className = "scenario-list";

      const infoText = document.createElement("span");
      infoText.className = "info";
      infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
      div.appendChild(infoText);

      // 「非表示を表示」チェックが**オフ**の場合のみ「続きへ」ボタンと「本棚へ」ボタンを表示
      if (!showHidden) {
        // 続きへボタン
        const btnContinue = document.createElement("button");
        btnContinue.type = "button"; // ← これを明示する
        btnContinue.textContent = "続きへ";
        btnContinue.addEventListener("click", () => {
          window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
        });
        div.appendChild(btnContinue);

        // 「本棚へ」/「収納済」をトグルにするボタン
        const btnShelf = document.createElement("button");
        btnShelf.type = "button";
        if (!scenario.bookShelfFlag) {
          // bookShelfFlag === false => 「本棚へ」
          btnShelf.textContent = "本棚へ";
          btnShelf.style.backgroundColor = "";
        } else {
          // bookShelfFlag === true => 「収納済」
          btnShelf.textContent = "収納済";
          btnShelf.style.backgroundColor = "gray";
        }
        btnShelf.addEventListener("click", async () => {
          try {
            scenario.bookShelfFlag = !scenario.bookShelfFlag;
            scenario.updatedAt = new Date().toISOString();
            await updateScenario(scenario);
            renderScenarioList(); // 変更内容を再描画
          } catch (err) {
            console.error(err);
            showToast("本棚フラグ切り替えに失敗:\n" + err.message);
          }
        });
        div.appendChild(btnShelf);
      }

      // 非表示フラグで「非表示にする」/「表示する」ボタン切り替え
      if (!scenario.hideFromHistoryFlag) {
        // hideFromHistoryFlag === false => 「非表示にする」ボタン
        const btnHide = document.createElement("button");
        btnHide.type = "button";
        btnHide.textContent = "非表示にする";
        btnHide.addEventListener("click", () => {
          showHideConfirmModal(scenario);
        });
        div.appendChild(btnHide);
      } else {
        // hideFromHistoryFlag === true => 「表示する」ボタン
        const btnShow = document.createElement("button");
        btnShow.type = "button";
        btnShow.textContent = "表示する";
        btnShow.style.backgroundColor = "gray";
        btnShow.addEventListener("click", async () => {
          scenario.hideFromHistoryFlag = false;
          scenario.updatedAt = new Date().toISOString();
          await updateScenario(scenario);
          renderScenarioList();
        });
        div.appendChild(btnShow);
      }

      // 「非表示を表示」チェックが**オン**の場合のみ「削除」ボタンを表示
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

      container.appendChild(div);
    });
  } catch (err) {
    console.error("シナリオ一覧の取得に失敗:", err);
    container.textContent = "シナリオ一覧の取得に失敗しました。再読み込みしてください。";
  }
}

/** 「非表示」ボタン押下時の確認モーダル表示 */
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

  // ボタンごと置き換え
  okBtn.replaceWith(okBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));

  // OK
  modal.querySelector("#hide-from-history-ok").addEventListener("click", async () => {
    scenario.hideFromHistoryFlag = true;
    scenario.updatedAt = new Date().toISOString();
    await updateScenario(scenario);
    showToast(`シナリオ(ID:${scenario.scenarioId})を非表示にしました。`);
    modal.classList.remove("active");
    renderScenarioList();
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
  scenarioIdToDelete = null;
  showDeleteScenarioModal(false);
  // 再描画
  renderScenarioList();
}

/** initMenuPage: ページ読み込み時に呼び出されるメイン初期化 */
window.initMenuPage = async function () {
  // すでに initIndexedDB() は呼ばれている前提

  // localStorage から APIキーを読み込む
  window.apiKey = localStorage.getItem("apiKey") || "";

  // シナリオ一覧を描画
  await renderScenarioList();

  // characterDataのロード
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // メニュー上のボタン類をセットアップ
  setupMenuButtons();
  initAccordion();
};

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

  // シナリオ削除モーダルOK/CANCEL
  document.getElementById("delete-scenario-ok").addEventListener("click", confirmDeleteScenario);
  document.getElementById("delete-scenario-cancel").addEventListener("click", () => {
    scenarioIdToDelete = null;
    showDeleteScenarioModal(false);
  });

  // 「本棚」ボタン(全シナリオ一覧へ飛ぶもの)
  document.getElementById("show-bookshelf-btn").addEventListener("click", () => {
    window.location.href = "bookshelf.html";
  });

  // 「非表示を表示する」チェックボックスのイベント伝搬を防ぐ
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  if (showHiddenCheckbox) {
    // チェックボックスがクリックされたとき、アコーディオンへの伝搬を止める
    showHiddenCheckbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    // 状態が変わったら再描画
    showHiddenCheckbox.addEventListener("change", () => {
      renderScenarioList();
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

  // ヘッダをクリックした時のみアコーディオンを開閉
  header.addEventListener("click", (e) => {
    // チェックボックス または そのラベル( for="show-hidden-scenarios" )がクリックされた場合はアコーディオンを開閉しない
    if (
      e.target.closest("#show-hidden-scenarios") ||
      e.target.closest("label[for='show-hidden-scenarios']")
    ) {
      return;
    }
    // 開閉トグル
    content.classList.toggle("open");
    if (content.classList.contains("open")) {
      localStorage.setItem("ongoingScenariosAccordionState", "open");
    } else {
      localStorage.setItem("ongoingScenariosAccordionState", "closed");
    }
  });
}

/** シナリオをコピー (必要な場合) */
/*
async function copyScenarioById(originalScenarioId) {
  const scenario = await getScenarioById(originalScenarioId);
  if (!scenario) {
    throw new Error("コピー元シナリオが見つかりませんでした。");
  }
  const now = new Date().toISOString();
  const newScenario = {
    title: scenario.title + "_copy",
    wizardData: JSON.parse(JSON.stringify(scenario.wizardData || {})),
    createdAt: now,
    updatedAt: now,
    bookShelfFlag: false,
    hideFromHistoryFlag: false,
  };
  // 新規シナリオ作成
  const newScenarioId = await createNewScenario(newScenario.wizardData, newScenario.title);

  // シーン情報を複製
  const entries = await getSceneEntriesByScenarioId(originalScenarioId);
  for (const e of entries) {
    const copy = {
      scenarioId: newScenarioId,
      type: e.type,
      sceneId: e.sceneId + "_copy_" + Date.now(),
      content: e.content,
      dataUrl: e.dataUrl || null,
      prompt: e.prompt || null,
      content_en: e.content_en || "",
    };
    await addSceneEntry(copy);
  }

  // 最終的に更新して保存
  const newScen = await getScenarioById(newScenarioId);
  newScen.title = scenario.title + "_copy";
  newScen.updatedAt = new Date().toISOString();
  newScen.bookShelfFlag = false;
  newScen.hideFromHistoryFlag = false;
  await updateScenario(newScen);

  return newScenarioId;
}
*/

/** トースト簡易表示 */
function showToast(message) {
  const oldToast = document.getElementById("toast-message");
  if (oldToast) {
    oldToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  toast.style.color = "#fff";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "4px";
  toast.style.fontSize = "14px";
  toast.style.zIndex = "9999";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s ease";

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}
