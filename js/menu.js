// menu.js

// ★ ここでグローバルにAPIキーをロード
window.apiKey = localStorage.getItem("apiKey") || "";

let scenarioIdToDelete = null;
let warehouseSelectionMode = false; // 倉庫側の選択モードフラグ

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

  // 3秒後にフェードアウトして消す
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

(async function initMenuPage() {
  const savedApiKey = localStorage.getItem("apiKey");
  if (savedApiKey) {
    document.getElementById("api-key-input").value = savedApiKey;
  }

  // シナリオ一覧を取得
  try {
    const scenarioList = await listAllScenarios();
    const container = document.getElementById("scenario-list-container");
    container.innerHTML = "";

    if (scenarioList.length === 0) {
      container.textContent = "進行中のシナリオはありません。";
    } else {
      scenarioList.forEach(scenario => {
        const div = document.createElement("div");
        div.style.margin = "10px 0";

        const infoText = document.createElement("span");
        infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
        div.appendChild(infoText);

        // 続きへ
        const btnContinue = document.createElement("button");
        btnContinue.textContent = "続きへ";
        btnContinue.style.marginRight = "6px";
        btnContinue.addEventListener("click", () => {
          window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
        });
        div.appendChild(btnContinue);

        // コピー
        const btnCopy = document.createElement("button");
        btnCopy.textContent = "コピーする";
        btnCopy.style.marginRight = "6px";
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

  // characterData
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // 倉庫
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

  // リサイズ時
  window.addEventListener("resize", () => {
    const modal = document.getElementById("warehouse-modal");
    if (modal && modal.classList.contains("active")) {
      renderWarehouseCards();
    }
  });

  // 画像プレビューモーダル
  // 「閉じる」ボタン
  const previewCloseBtn = document.getElementById("card-preview-close-btn");
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener("click", () => {
      const modal = document.getElementById("card-image-preview-modal");
      modal.classList.remove("active");
    });
  }
  // 外側クリック
  const previewModal = document.getElementById("card-image-preview-modal");
  if (previewModal) {
    previewModal.addEventListener("click", (e) => {
      if (e.target === previewModal) {
        previewModal.classList.remove("active");
      }
    });
  }
})();

// APIキー設定
document.getElementById("set-api-key-button").addEventListener("click", function () {
  const apiKey = document.getElementById("api-key-input").value.trim();
  if (apiKey) {
    localStorage.setItem("apiKey", apiKey);
    window.apiKey = apiKey;
    showToast("APIキーが設定されました。");
  } else {
    showToast("APIキーを入力してください。");
  }
});
document.getElementById("clear-api-key-button").addEventListener("click", function () {
  if (confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？")) {
    localStorage.removeItem("apiKey");
    window.apiKey = "";
    showToast("APIキーがクリアされました。");
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

// シナリオ削除用モーダル
function showDeleteScenarioModal(show) {
  const modal = document.getElementById("delete-scenario-modal");
  if (!modal) return;
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

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

// 倉庫モーダル
function showWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  modal.classList.add("active");
  renderWarehouseCards();
}
function closeWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  modal.classList.remove("active");

  // 選択モードリセット
  warehouseSelectionMode = false;
  document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
  document.getElementById("delete-selected-warehouse-btn").style.display = "none";

  // 選択状態クリア
  const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
  selectedCards.forEach(card => card.classList.remove("selected"));
}

/**
 * 倉庫内カードの再描画
 *  - 本物のカードを並べた後、ダミー要素を追加して
 *    最終行が埋まった扱いになるようにする
 */
function renderWarehouseCards() {
  const container = document.getElementById("warehouse-card-container");
  container.innerHTML = "";

  // group==="Warehouse" のカードを抽出
  const warehouseCards = window.characterData.filter(c => c.group === "Warehouse");
  if (warehouseCards.length === 0) {
    container.textContent = "倉庫にカードがありません。";
    return;
  }

  // 1) 本物のカードを追加
  warehouseCards.forEach(card => {
    container.appendChild(createWarehouseCardElement(card));
  });

  // 2) 最後の行を埋めるためのダミー要素を追加
  fillDummyItems(container, warehouseCards.length);
}

/**
 * ダミー要素で「最終行」を埋め、実質的に左寄せさせる関数
 * - container: Flexbox親要素 (CSSで gap を指定している)
 * - realCount: 本物のカード枚数
 */
function fillDummyItems(container, realCount) {
  // 1) 先頭のカード要素を取得
  const firstCard = container.querySelector(".card:not(.dummy)");
  if (!firstCard) return;

  // 2) カード本体の幅を取得 (gapは入っていない)
  const style = getComputedStyle(firstCard);
  const cardWidth = parseFloat(style.width);

  // 3) コンテナ幅
  const containerWidth = container.clientWidth;
  if (containerWidth <= 0 || isNaN(cardWidth)) return;

  // 4) コンテナの gap (X方向) を取得
  const containerStyle = getComputedStyle(container);
  const gapStr = containerStyle.columnGap || containerStyle.gap || "0";
  const gap = parseFloat(gapStr) || 0;

  // 5) 「1行に何個入るか」を厳密に求める
  let itemsPerRow = 1;
  for (let n = 1; n < 999; n++) {
    const total = n * cardWidth + (n - 1) * gap;
    if (total <= containerWidth) {
      itemsPerRow = n;
    } else {
      break;
    }
  }

  // 6) 最終行に並ぶ枚数
  const remainder = realCount % itemsPerRow;
  if (remainder === 0) {
    return;
  }

  // 7) ダミー数を計算
  const dummyCount = itemsPerRow - remainder;

  // 8) ダミー要素を追加
  for (let i = 0; i < dummyCount; i++) {
    const dummyDiv = document.createElement("div");
    dummyDiv.className = "card dummy";
    container.appendChild(dummyDiv);
  }
}


/** 画像生成(倉庫用) */
async function generateWarehouseImage(card, btnElement) {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  if (btnElement) {
    btnElement.disabled = true;
  }
  showToast("画像を生成しています...");

  const rarityNum = parseInt(card.rarity.replace("★", "").trim()) || 0;
  const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";

  const promptText =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
    (card.imageprompt || "");

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n: 1,
        size: size,
        response_format: "b64_json",
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // characterData 更新
    const idx = window.characterData.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      window.characterData[idx].imageData = dataUrl;
      await saveCharacterDataToIndexedDB(window.characterData);
    }

    showToast("画像の生成が完了しました");
    renderWarehouseCards();
  } catch (err) {
    console.error("画像生成失敗:", err);
    showToast("画像生成に失敗しました:\n" + err.message);
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
    }
  }
}

/** 倉庫カードDOM生成 */
function createWarehouseCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card rarity" + card.rarity.replace("★", "").trim();
  cardEl.setAttribute("data-id", card.id);

  if (card.flipped) {
    cardEl.classList.add("flipped");
  }

  cardEl.addEventListener("click", (e) => {
    if (warehouseSelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updateDeleteSelectedWarehouseButton();
    } else {
      // flipped→表面 / それ以外→画像プレビュー
      if (cardEl.classList.contains("flipped")) {
        cardEl.classList.remove("flipped");
        card.flipped = false;
        const idx = window.characterData.findIndex(c => c.id === card.id);
        if (idx !== -1) {
          window.characterData[idx].flipped = false;
        }
        saveCharacterDataToIndexedDB(window.characterData);
      } else {
        if (card.imageData) {
          openPreviewModal(card.imageData);
        } else {
          showToast("画像がありません。");
        }
      }
    }
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  // 背景
  const bgStyle = (card.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bgStyle) {
    cardFront.style.backgroundImage = bgStyle;
  }
  // レアリティ枠
  const rarityValue = card.rarity.replace("★", "").trim();
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  // タイプ表示
  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  // 画像領域
  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if (card.imageData) {
    const imageEl = document.createElement("img");
    imageEl.src = card.imageData;
    imageEl.alt = card.name;
    imageContainer.appendChild(imageEl);
  } else {
    const genImgBtn = document.createElement("button");
    genImgBtn.className = "gen-image-btn";
    genImgBtn.textContent = "画像生成";
    genImgBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      generateWarehouseImage(card, genImgBtn);
    });
    imageContainer.appendChild(genImgBtn);
  }
  cardFront.appendChild(imageContainer);

  // 情報
  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = `<h3>${DOMPurify.sanitize(card.name)}</h3>`;
  infoContainer.appendChild(nameEl);

  if (card.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
    infoContainer.appendChild(stateEl);
  }
  const specialEl = document.createElement("p");
  specialEl.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special)}`;
  infoContainer.appendChild(specialEl);

  const captionEl = document.createElement("p");
  captionEl.innerHTML = `<span>${DOMPurify.sanitize(card.caption)}</span>`;
  infoContainer.appendChild(captionEl);

  cardFront.appendChild(infoContainer);

  // 裏面
  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type)}</strong>`;

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  cardEl.appendChild(cardInner);

  return cardEl;
}

/** 画像プレビュー(メニュー画面用) */
function openPreviewModal(imageUrl) {
  const modal = document.getElementById("card-image-preview-modal");
  if (!modal) {
    showToast("プレビューモーダルがありません。");
    return;
  }
  const imgEl = document.getElementById("card-preview-img");
  if (!imgEl) {
    showToast("プレビュー画像要素が見つかりません。");
    return;
  }
  imgEl.src = imageUrl;
  modal.classList.add("active");
}

/** 倉庫の選択モード */
function toggleWarehouseSelectionMode() {
  warehouseSelectionMode = !warehouseSelectionMode;
  const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
  if (warehouseSelectionMode) {
    btn.textContent = "選択モード解除";
  } else {
    btn.textContent = "選択モード";
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    selectedCards.forEach(card => card.classList.remove("selected"));
  }
  updateDeleteSelectedWarehouseButton();
}

function updateDeleteSelectedWarehouseButton() {
  const deleteBtn = document.getElementById("delete-selected-warehouse-btn");
  if (!warehouseSelectionMode) {
    deleteBtn.style.display = "none";
    return;
  }
  const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
  deleteBtn.style.display = selected.length > 0 ? "inline-block" : "none";
}

async function deleteSelectedWarehouse() {
  const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
  if (selectedCards.length === 0) {
    alert("カードが選択されていません。");
    return;
  }
  selectedCards.forEach(cardEl => {
    const cardId = cardEl.getAttribute("data-id");
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData.splice(idx, 1);
    }
  });
  await saveCharacterDataToIndexedDB(window.characterData);
  renderWarehouseCards();
  updateDeleteSelectedWarehouseButton();
}

/* シナリオコピー */
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
