// partyCreate.js

// グローバル変数
window.partySelectionMode = false;     // パーティ側の選択モード
window.warehouseSelectionMode = false; // 倉庫側の選択モード

// 現在編集中のパーティID
let currentPartyId = null;
let currentParty = null;

window.addEventListener("load", async function () {
  // 1) IndexedDB 初期化
  await initIndexedDB();

  // 2) URLパラメータで partyId 取得
  const urlParams = new URLSearchParams(window.location.search);
  const pid = urlParams.get("partyId");
  if (pid) {
    currentPartyId = parseInt(pid, 10);
    if (Number.isNaN(currentPartyId)) {
      currentPartyId = null;
    }
  }

  // 3) 既存パーティをロード (もしあれば)
  if (currentPartyId) {
    currentParty = await getPartyById(currentPartyId);
    if (currentParty) {
      // パーティ名を input.value に反映
      document.getElementById("party-name-input").value = currentParty.name;
    } else {
      // partyId が無効なら新規扱い
      currentPartyId = null;
    }
  }

  // 4) characterData ロード
  const stored = await loadCharacterDataFromIndexedDB();
  if (stored) {
    window.characterData = stored;
  } else {
    window.characterData = [];
  }

  // 5) 初回レンダリング
  renderAllParty();

  // ---------------- イベント登録 ----------------

  // パーティ名保存ボタン
  document.getElementById("save-party-name-btn").addEventListener("click", onSavePartyName);

  // 倉庫を開くボタン
  document.getElementById("show-warehouse-btn").addEventListener("click", showWarehouseModal);

  // 倉庫を閉じるボタン
  document.getElementById("close-warehouse-btn").addEventListener("click", () => {
    const modal = document.getElementById("warehouse-modal");
    modal.classList.remove("active");

    // 選択モードをリセット
    warehouseSelectionMode = false;
    document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
    document.getElementById("add-to-party-btn").style.display = "none";

    // 選択カードをリセット
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    selectedCards.forEach(el => el.classList.remove("selected"));
  });

  // パーティ側の「選択モード」ボタン
  document.getElementById("toggle-party-selection-mode-btn").addEventListener("click", () => {
    window.partySelectionMode = !window.partySelectionMode;
    const btn = document.getElementById("toggle-party-selection-mode-btn");
    if (partySelectionMode) {
      btn.textContent = "選択モード解除";
    } else {
      btn.textContent = "選択モード";
      // 解除時、選択をリセット
      const selCards = document.querySelectorAll(
        "#avatar-card-container .card.selected, " +
        "#partner-card-container .card.selected, " +
        "#party-card-container .card.selected"
      );
      selCards.forEach(el => el.classList.remove("selected"));
    }
    updatePartyMoveButtonVisibility();
  });

  // パーティ側の「倉庫に戻す」ボタン
  document.getElementById("move-selected-to-warehouse-btn").addEventListener("click", async () => {
    const selectedCards = document.querySelectorAll(
      "#avatar-card-container .card.selected, " +
      "#partner-card-container .card.selected, " +
      "#party-card-container .card.selected"
    );
    if (selectedCards.length === 0) {
      alert("カードが選択されていません。");
      return;
    }
    selectedCards.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        window.characterData[idx].group = "Warehouse";
        window.characterData[idx].role = "none";
        window.characterData[idx].partyId = null;
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);

    // リセット & 再描画
    selectedCards.forEach(el => el.classList.remove("selected"));
    renderAllParty();
    updatePartyMoveButtonVisibility();
  });

  // 倉庫側の「選択モード」ボタン
  document.getElementById("toggle-warehouse-selection-mode-btn").addEventListener("click", () => {
    window.warehouseSelectionMode = !window.warehouseSelectionMode;
    const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
    if (warehouseSelectionMode) {
      btn.textContent = "選択モード解除";
    } else {
      btn.textContent = "選択モード";
      // リセット
      const selCards = document.querySelectorAll("#warehouse-card-container .card.selected");
      selCards.forEach(el => el.classList.remove("selected"));
    }
    updateWarehouseAddButtonVisibility();
  });

  // 倉庫の「パーティに入れる」ボタン
  document.getElementById("add-to-party-btn").addEventListener("click", async () => {
    if (!currentPartyId) {
      alert("パーティIDが未確定です。先にパーティ名を保存してください。");
      return;
    }
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (selectedCards.length === 0) {
      alert("カードが選択されていません。");
      return;
    }
    selectedCards.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const realIndex = window.characterData.findIndex(c => c.id === cardId);
      if (realIndex !== -1) {
        window.characterData[realIndex].group = "Party";
        window.characterData[realIndex].role = "none";
        window.characterData[realIndex].partyId = currentPartyId;
      }
    });

    await saveCharacterDataToIndexedDB(window.characterData);
    // 選択解除 & 再描画
    selectedCards.forEach(el => el.classList.remove("selected"));
    showWarehouseModal(); // 倉庫を開き直してリスト再描画
    renderAllParty();
    updateWarehouseAddButtonVisibility();
  });

  // 「メニューに戻る」
  document.getElementById("back-to-menu").addEventListener("click", () => {
    window.location.href = "index.html";
  });
});


/** パーティ名保存 */
async function onSavePartyName() {
  const nameInput = document.getElementById("party-name-input");
  const newName = nameInput.value.trim() || "名称未設定";

  // まだパーティIDが無いなら createParty で作成
  if (!currentPartyId) {
    const newId = await createParty(newName);
    currentPartyId = newId;
    currentParty = await getPartyById(newId);
    alert("パーティを新規作成しました (ID:" + newId + ")");
  } else {
    // 既存パーティ名を更新
    currentParty.name = newName;
    await updateParty(currentParty);
    alert("パーティ名を更新しました (ID:" + currentPartyId + ")");
  }
}

/** 現在のパーティを再レンダリング (avatar, partner, none で分類表示) */
function renderAllParty() {
  // group==="Party" かつ partyId===currentPartyId のカードのみ
  const partyCards = window.characterData.filter(
    c => c.group === "Party" && c.partyId === currentPartyId
  );

  const avatarContainer = document.getElementById("avatar-card-container");
  const partnerContainer = document.getElementById("partner-card-container");
  const partyContainer = document.getElementById("party-card-container");

  // クリア
  avatarContainer.innerHTML = "";
  partnerContainer.innerHTML = "";
  partyContainer.innerHTML = "";

  // role別に振り分け
  const avatarCards = partyCards.filter(c => c.role === "avatar");
  const partnerCards = partyCards.filter(c => c.role === "partner");
  const noneCards = partyCards.filter(c => !c.role || c.role === "none");

  // 生成
  avatarCards.forEach(card => {
    const el = createPartyCardElement(card);
    avatarContainer.appendChild(el);
  });
  partnerCards.forEach(card => {
    const el = createPartyCardElement(card);
    partnerContainer.appendChild(el);
  });
  noneCards.forEach(card => {
    const el = createPartyCardElement(card);
    partyContainer.appendChild(el);
  });
}

/** パーティカード生成 */
function createPartyCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card ";
  cardEl.className += "rarity" + card.rarity.replace("★", "").trim();
  cardEl.setAttribute("data-id", card.id);

  cardEl.addEventListener("click", (e) => {
    if (window.partySelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updatePartyMoveButtonVisibility();
    } else {
      // 通常時は反転（裏面表示）
      cardEl.classList.toggle("flipped");
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

  if (card.type == "キャラクター") {
    // role切り替えボタン
    const roleDiv = document.createElement("div");
    roleDiv.style.marginTop = "8px";

    const avatarBtn = document.createElement("button");
    console.log(card.type == "キャラクター");
    avatarBtn.textContent = (card.role === "avatar") ? "アバター解除" : "アバターに設定";
    avatarBtn.style.marginRight = "5px";
    avatarBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleAvatar(card);
    });
    roleDiv.appendChild(avatarBtn);

    const partnerBtn = document.createElement("button");
    partnerBtn.textContent = (card.role === "partner") ? "パートナー解除" : "パートナーに設定";
    partnerBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await togglePartner(card);
    });
    roleDiv.appendChild(partnerBtn);

    infoContainer.appendChild(roleDiv);
  }

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

/** アバター切り替え（1枚だけ選択可能） */
async function toggleAvatar(card) {
  // もし既にアバターなら解除
  if (card.role === "avatar") {
    card.role = "none";
  } else {
    // 他のavatarを解除
    window.characterData.forEach(c => {
      if (c.group === "Party" && c.partyId === currentPartyId && c.role === "avatar") {
        c.role = "none";
      }
    });
    card.role = "avatar";
  }
  await saveCharacterDataToIndexedDB(window.characterData);
  renderAllParty();
}

/** パートナー切り替え（複数可） */
async function togglePartner(card) {
  if (card.role === "partner") {
    card.role = "none";
  } else {
    card.role = "partner";
  }
  await saveCharacterDataToIndexedDB(window.characterData);
  renderAllParty();
}

/** 倉庫モーダル表示 (index.html と同じ .modal.active 方式に変更) */
function showWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  modal.classList.add("active");

  const whContainer = document.getElementById("warehouse-card-container");
  whContainer.innerHTML = "";

  // group==="Warehouse" のみ
  const warehouseCards = window.characterData.filter(c => c.group === "Warehouse");
  if (warehouseCards.length === 0) {
    whContainer.textContent = "倉庫にカードがありません。";
    return;
  }
  // カード要素生成
  warehouseCards.forEach(card => {
    const cardEl = createWarehouseCardElement(card);
    whContainer.appendChild(cardEl);
  });
  updateWarehouseAddButtonVisibility();
}

/** 倉庫カード生成 */
function createWarehouseCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card ";
  cardEl.className += "rarity" + card.rarity.replace("★", "").trim();
  cardEl.setAttribute("data-id", card.id);

  cardEl.addEventListener("click", (e) => {
    if (window.warehouseSelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updateWarehouseAddButtonVisibility();
    } else {
      // 通常時は反転
      cardEl.classList.toggle("flipped");
    }
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  // 背景CSS
  const bgStyle = (card.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bgStyle) {
    cardFront.style.backgroundImage = bgStyle;
  }

  // レアリティ
  const rv = (typeof card.rarity === "string") ? card.rarity.replace("★", "").trim() : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rv}'></div>`;

  // タイプ
  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  // 画像
  const imgC = document.createElement("div");
  imgC.className = "card-image";
  if (card.imageData) {
    const im = document.createElement("img");
    im.src = card.imageData;
    im.alt = card.name;
    imgC.appendChild(im);
  }
  cardFront.appendChild(imgC);

  // info
  const info = document.createElement("div");
  info.className = "card-info";

  const nameP = document.createElement("p");
  nameP.innerHTML = "<h3>" + DOMPurify.sanitize(card.name) + "</h3>";
  info.appendChild(nameP);

  if (card.state) {
    const stP = document.createElement("p");
    stP.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(card.state);
    info.appendChild(stP);
  }
  const spP = document.createElement("p");
  spP.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(card.special);
  info.appendChild(spP);

  const capP = document.createElement("p");
  capP.innerHTML = "<span>" + DOMPurify.sanitize(card.caption) + "</span>";
  info.appendChild(capP);

  cardFront.appendChild(info);

  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type)}</strong>`;

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  cardEl.appendChild(cardInner);

  return cardEl;
}

/** 倉庫 -> パーティ追加ボタンの表示/非表示 */
function updateWarehouseAddButtonVisibility() {
  const addBtn = document.getElementById("add-to-party-btn");
  if (!warehouseSelectionMode) {
    addBtn.style.display = "none";
    return;
  }
  const sel = document.querySelectorAll("#warehouse-card-container .card.selected");
  addBtn.style.display = (sel.length > 0) ? "inline-block" : "none";
}

/** パーティ -> 倉庫に戻すボタンの表示/非表示 */
function updatePartyMoveButtonVisibility() {
  const moveBtn = document.getElementById("move-selected-to-warehouse-btn");
  if (!partySelectionMode) {
    moveBtn.style.display = "none";
    return;
  }
  const sel = document.querySelectorAll(
    "#avatar-card-container .card.selected, " +
    "#partner-card-container .card.selected, " +
    "#party-card-container .card.selected"
  );
  moveBtn.style.display = (sel.length > 0) ? "inline-block" : "none";
}
