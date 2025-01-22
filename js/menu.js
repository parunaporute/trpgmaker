// menu.js

let scenarioIdToDelete = null;
let warehouseSelectionMode = false; // ★追加: 倉庫側の選択モードフラグ

// -----------------------------------------
// トースト表示用のユーティリティ関数
// -----------------------------------------
function showToast(message) {
  const oldToast = document.getElementById("toast-message");
  if (oldToast) {
    oldToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  // スタイルを付与（シンプルな例）
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

  // 3秒後にフェードアウトして消す
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

// -----------------------------------------
// 初期化：シナリオ一覧の取得 & characterDataのロード
// -----------------------------------------
(async function initMenuPage() {
  // 1) APIキーを入力欄に表示
  const savedApiKey = localStorage.getItem("apiKey");
  if (savedApiKey) {
    document.getElementById("api-key-input").value = savedApiKey;
  }

  // 2) シナリオ一覧を取得して表示
  try {
    const scenarioList = await listAllScenarios();  // indexedDB.js の関数
    const container = document.getElementById("scenario-list-container");
    container.innerHTML = "";

    if (scenarioList.length === 0) {
      container.textContent = "進行中のシナリオはありません。";
    } else {
      scenarioList.forEach(scenario => {
        const div = document.createElement("div");
        div.style.margin = "10px 0";

        // シナリオ情報
        const infoText = document.createElement("span");
        infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
        div.appendChild(infoText);

        // 「続きへ」ボタン
        const btnContinue = document.createElement("button");
        btnContinue.textContent = "続きへ";
        btnContinue.style.marginRight = "6px";
        btnContinue.addEventListener("click", () => {
          window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
        });
        div.appendChild(btnContinue);

        // ★ 追加: 「コピーする」ボタン
        const btnCopy = document.createElement("button");
        btnCopy.textContent = "コピーする";
        btnCopy.style.marginRight = "6px";
        btnCopy.addEventListener("click", async () => {
          try {
            const newScenarioId = await copyScenarioById(scenario.scenarioId);
            showToast(`シナリオ(ID:${scenario.scenarioId})をコピーしました。\n新ID: ${newScenarioId}`);
            // リスト更新のためリロードするか、あるいは手動で再取得する
            location.reload();
          } catch (err) {
            console.error(err);
            showToast("シナリオのコピーに失敗:\n" + err.message);
          }
        });
        div.appendChild(btnCopy);

        // 「削除」ボタン
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

  // 3) characterDataをロード
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // 4) 倉庫ボタン・倉庫モーダル関連のイベント設定
  const showWarehouseBtn = document.getElementById("show-warehouse-btn");
  if (showWarehouseBtn) {
    showWarehouseBtn.addEventListener("click", showWarehouseModal);
  }

  const toggleModeBtn = document.getElementById("toggle-warehouse-selection-mode-btn");
  if (toggleModeBtn) {
    toggleModeBtn.addEventListener("click", toggleWarehouseSelectionMode);
  }

  const closeWarehouseBtn = document.getElementById("close-warehouse-btn");
  if (closeWarehouseBtn) {
    closeWarehouseBtn.addEventListener("click", closeWarehouseModal);
  }

  const deleteWarehouseBtn = document.getElementById("delete-selected-warehouse-btn");
  if (deleteWarehouseBtn) {
    deleteWarehouseBtn.addEventListener("click", deleteSelectedWarehouse);
  }
})();

// -----------------------------------------
// APIキー関連
// -----------------------------------------
document.getElementById("set-api-key-button").addEventListener("click", function () {
  const apiKey = document.getElementById("api-key-input").value.trim();
  if (apiKey) {
    localStorage.setItem("apiKey", apiKey);
    showToast("APIキーが設定されました。");
  } else {
    showToast("APIキーを入力してください。");
  }
});

document.getElementById("clear-api-key-button").addEventListener("click", function () {
  const confirmClear = confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？");
  if (confirmClear) {
    localStorage.removeItem("apiKey");
    showToast("APIキーがクリアされました。");
  }
});

// -----------------------------------------
// 全エレメントをクリア
// -----------------------------------------
document.getElementById("clear-character-btn").addEventListener("click", async () => {
  const confirmClear = confirm("エレメント情報をクリアします。よろしいですか？");
  if (confirmClear) {
    window.characterData = [];
    await saveCharacterDataToIndexedDB(window.characterData);
    showToast("エレメント情報をクリアしました。");
  }
});

// -----------------------------------------
// シナリオ削除用モーダルの制御
// -----------------------------------------
function showDeleteScenarioModal(show) {
  const modal = document.getElementById("delete-scenario-modal");
  if (!modal) return;
  modal.style.display = show ? "flex" : "none";
}

document.getElementById("delete-scenario-ok").addEventListener("click", async () => {
  if (scenarioIdToDelete == null) {
    showDeleteScenarioModal(false);
    return;
  }
  try {
    await deleteScenarioById(scenarioIdToDelete);  // indexedDB.js の関数
    showToast(`シナリオ(ID:${scenarioIdToDelete})を削除しました。`);
  } catch (err) {
    console.error(err);
    showToast("シナリオ削除に失敗:\n" + err.message);
  }
  scenarioIdToDelete = null;
  showDeleteScenarioModal(false);

  // 一覧を再描画するためリロード
  location.reload();
});

document.getElementById("delete-scenario-cancel").addEventListener("click", () => {
  scenarioIdToDelete = null;
  showDeleteScenarioModal(false);
});

// -----------------------------------------
// ▼ 倉庫表示関連 (新規機能)
// -----------------------------------------

/** 倉庫モーダルを表示 */
function showWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  modal.style.display = "flex";
  renderWarehouseCards();
}

/** 倉庫モーダルを閉じる */
function closeWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  modal.style.display = "none";

  // 選択モードリセット
  warehouseSelectionMode = false;
  document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
  document.getElementById("delete-selected-warehouse-btn").style.display = "none";

  // 選択状態を解除
  const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
  selectedCards.forEach(card => card.classList.remove("selected"));
}

/** 倉庫内カードを再描画 */
function renderWarehouseCards() {
  const container = document.getElementById("warehouse-card-container");
  container.innerHTML = "";

  // group==="Warehouse" のカードを抽出
  const warehouseCards = window.characterData.filter(c => c.group === "Warehouse");
  if (warehouseCards.length === 0) {
    container.textContent = "倉庫にカードがありません。";
    return;
  }

  // カード要素生成
  warehouseCards.forEach(card => {
    const cardEl = createWarehouseCardElement(card);
    container.appendChild(cardEl);
  });
}

/** 倉庫カードDOM生成 */
function createWarehouseCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  cardEl.setAttribute("data-id", card.id);

  // カードクリック時
  cardEl.addEventListener("click", (e) => {
    if (warehouseSelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updateDeleteSelectedWarehouseButton();
    } else {
      // 通常は反転表示
      cardEl.classList.toggle("flipped");
    }
  });

  // カード内部構造
  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  // 背景CSS
  const bgStyle = (card.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  cardFront.style = "background-image:" + bgStyle;

  // レアリティに対応する枠
  const rarityValue = (typeof card.rarity === "string") ? card.rarity.replace("★", "").trim() : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  // カードタイプ表示
  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  // 画像部
  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if (card.imageData) {
    const imageEl = document.createElement("img");
    imageEl.src = card.imageData;
    imageEl.alt = card.name;
    imageContainer.appendChild(imageEl);
  }
  cardFront.appendChild(imageContainer);

  // 下部情報
  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  // 名前
  const nameEl = document.createElement("p");
  nameEl.innerHTML = "<h3>" + DOMPurify.sanitize(card.name) + "</h3>";
  infoContainer.appendChild(nameEl);

  // 状態
  if (card.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(card.state);
    infoContainer.appendChild(stateEl);
  }

  // 特技
  const specialEl = document.createElement("p");
  specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(card.special);
  infoContainer.appendChild(specialEl);

  // キャプション
  const captionEl = document.createElement("p");
  captionEl.innerHTML = "<span>" + DOMPurify.sanitize(card.caption) + "</span>";
  infoContainer.appendChild(captionEl);

  cardFront.appendChild(infoContainer);

  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type)}</strong>`;

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  cardEl.appendChild(cardInner);

  return cardEl;
}

/** 倉庫の選択モード切り替え */
function toggleWarehouseSelectionMode() {
  warehouseSelectionMode = !warehouseSelectionMode;
  const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
  if (warehouseSelectionMode) {
    btn.textContent = "選択モード解除";
  } else {
    btn.textContent = "選択モード";
    // モード解除時はすべて選択解除
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    selectedCards.forEach(card => card.classList.remove("selected"));
  }
  updateDeleteSelectedWarehouseButton();
}

/** 選択状態に応じて「選択したカードを削除」ボタンの表示を切り替え */
function updateDeleteSelectedWarehouseButton() {
  const deleteBtn = document.getElementById("delete-selected-warehouse-btn");
  if (!warehouseSelectionMode) {
    deleteBtn.style.display = "none";
    return;
  }
  const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
  deleteBtn.style.display = (selected.length > 0) ? "inline-block" : "none";
}

/** 選択した倉庫内カードを削除 */
async function deleteSelectedWarehouse() {
  const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
  if (selectedCards.length === 0) {
    alert("カードが選択されていません。");
    return;
  }

  // 選択カードをcharacterDataから削除
  selectedCards.forEach(cardEl => {
    const cardId = cardEl.getAttribute("data-id");
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      // ここでは「倉庫から取り除く」ではなく「完全に削除」する挙動
      window.characterData.splice(idx, 1);
    }
  });

  await saveCharacterDataToIndexedDB(window.characterData);

  // 再描画
  renderWarehouseCards();
  updateDeleteSelectedWarehouseButton();
}
