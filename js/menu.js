// js/menu.js

// こちらでは「initMenuPage」という関数のみ定義し、
// index.html 側で await initIndexedDB() の完了後に呼び出す形にして、
// 「DB未初期化」エラーを防ぎます。

window.initMenuPage = async function () {
  // すでに initIndexedDB() は呼ばれている前提

  // localStorage から APIキーを読み込む
  window.apiKey = localStorage.getItem("apiKey") || "";

  // シナリオ一覧を取得して表示
  try {
    const scenarioList = await listAllScenarios();
    const container = document.getElementById("scenario-list-container");
    container.innerHTML = "";

    if (scenarioList.length === 0) {
      container.style.justifyContent = "center";
      container.textContent = "進行中のシナリオはありません。";
    } else {
      scenarioList.forEach(scenario => {
        const div = document.createElement("div");
        div.className = "scenario-list";

        const infoText = document.createElement("span");
        infoText.className = "info";

        infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
        div.appendChild(infoText);

        // 続きへ
        const btnContinue = document.createElement("button");
        btnContinue.textContent = "続きへ";
        btnContinue.addEventListener("click", () => {
          window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
        });
        div.appendChild(btnContinue);

        // コピー
        const btnCopy = document.createElement("button");
        btnCopy.textContent = "コピーする";
        btnCopy.addEventListener("click", async () => {
          try {
            const newScenarioId = await copyScenarioById(scenario.scenarioId);
            showToast(`シナリオ(ID:${scenario.scenarioId})をコピーしました。\n新ID: ${newScenarioId}`);
            location.reload(); // リスト更新
          } catch (err) {
            console.error(err);
            showToast("シナリオのコピーに失敗:\n" + err.message);
          }
        });
        div.appendChild(btnCopy);

        // 削除
        const btnDelete = document.createElement("button");
        btnDelete.textContent = "削除";
        btnDelete.style.backgroundColor = "#f44336";
        btnDelete.addEventListener("click", () => {
          scenarioIdToDelete = scenario.scenarioId;
          showDeleteScenarioModal(true);
        });
        div.appendChild(btnDelete);

        container.appendChild(div);
      });
    }
  } catch (err) {
    console.error("シナリオ一覧の取得に失敗:", err);
    const container = document.getElementById("scenario-list-container");
    container.textContent = "シナリオ一覧の取得に失敗しました。再読み込みしてください。";
  }

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
};

// シナリオ削除用で使う変数
let scenarioIdToDelete = null;

/** メニュー画面のボタン類設定 */
function setupMenuButtons() {
  // 「APIキー設定」または「キー設定済」のボタン
  const setApiKeyButton = document.getElementById("set-api-key-button");
  const apiKeyModal = document.getElementById("api-key-modal");
  const apiKeyInput = document.getElementById("api-key-input");
  const apiKeyOkButton = document.getElementById("api-key-ok-button");
  const apiKeyClearButton = document.getElementById("api-key-clear-button");

  // すでにキーがあれば「キー設定済」、なければ「APIキー設定」と表示
  if (!window.apiKey) {
    setApiKeyButton.textContent = "APIキー設定";
  } else {
    setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
  }

  // 「APIキー設定」ボタンをクリック -> モーダルを開く
  setApiKeyButton.addEventListener("click", () => {
    apiKeyModal.classList.add("active");
    apiKeyInput.value = window.apiKey; // すでにキーがあれば反映
  });

  // モーダル内のOKボタン
  apiKeyOkButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem("apiKey", key);
      window.apiKey = key;
      setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
      // showToast("APIキーを設定しました。");
    }
    // モーダルを閉じる
    apiKeyModal.classList.remove("active");
  });

  // モーダル内のクリアボタン
  apiKeyClearButton.addEventListener("click", () => {
    if (confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？")) {
      localStorage.removeItem("apiKey");
      window.apiKey = "";
      setApiKeyButton.textContent = "APIキー設定";
      // showToast("APIキーをクリアしました。");
      // モーダルを閉じる
      apiKeyModal.classList.remove("active");
    }
  });

  // 全エレメントクリア
  document.getElementById("clear-character-btn").addEventListener("click", async () => {
    if (confirm("エレメント情報をクリアします。よろしいですか？")) {
      window.characterData = [];
      await saveCharacterDataToIndexedDB(window.characterData);
      showToast("エレメント情報をクリアしました。");
    }
  });

  // 倉庫確認 => showWarehouseModal("menu")
  document.getElementById("show-warehouse-btn").addEventListener("click", () => {
    showWarehouseModal("menu");
  });

  // エレメント作成
  document.getElementById("character-create").addEventListener("click", () => {
    window.location.href = "characterCreate.html";
  });

  // パーティ一覧
  document.getElementById("party-list").addEventListener("click", () => {
    window.location.href = "partyList.html";
  });

  // 新しいシナリオ
  document.getElementById("start-new-scenario-button").addEventListener("click", () => {
    window.location.href = "scenarioWizard.html";
  });

  // シナリオ削除モーダルのOK/CANCEL
  document.getElementById("delete-scenario-ok").addEventListener("click", async () => {
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
    location.reload();
  });
  document.getElementById("delete-scenario-cancel").addEventListener("click", () => {
    scenarioIdToDelete = null;
    showDeleteScenarioModal(false);
  });
}

/** シナリオ削除モーダルの表示/非表示 */
function showDeleteScenarioModal(show) {
  const modal = document.getElementById("delete-scenario-modal");
  if (!modal) return;
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

/** シナリオをコピー */
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
    updatedAt: now
  };
  const newScenarioId = await createNewScenario(newScenario.wizardData, newScenario.title);

  const entries = await getSceneEntriesByScenarioId(originalScenarioId);
  for (const e of entries) {
    const copy = {
      scenarioId: newScenarioId,
      type: e.type,
      sceneId: e.sceneId + "_copy_" + Date.now(),
      content: e.content,
      dataUrl: e.dataUrl || null,
      prompt: e.prompt || null
    };
    await addSceneEntry(copy);
  }

  const newScen = await getScenarioById(newScenarioId);
  newScen.title = scenario.title + "_copy";
  newScen.updatedAt = new Date().toISOString();
  await updateScenario(newScen);

  return newScenarioId;
}

/** 簡易トースト表示 */
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

  // 3秒後に消す
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}
