// partyCreate.js

// グローバル変数
window.partySelectionMode = false;    // パーティ側の選択モードフラグ
window.warehouseSelectionMode = false; // 倉庫側の選択モードフラグ

window.addEventListener("load", async function(){
    await initIndexedDB();
    const stored = await loadCharacterDataFromIndexedDB();
    if(stored) {
      window.characterData = stored;
    } else {
      window.characterData = [];
    }

    // パーティ表示
    renderParty();

    // 倉庫モーダル管理
    document.getElementById("show-warehouse-btn").addEventListener("click", () => {
      showWarehouseModal();
    });

    // 倉庫モーダルを閉じる
    document.getElementById("close-warehouse-btn").addEventListener("click", () => {
      document.getElementById("warehouse-modal").style.display = "none";
      // 倉庫側の選択をリセット
      warehouseSelectionMode = false;
      document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
      document.getElementById("add-to-party-btn").style.display = "none";
      // 全カードの selected を外す
      const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
      selectedCards.forEach(el => el.classList.remove("selected"));
    });

    // 「選択モード（パーティ側）」ボタン
    document.getElementById("toggle-party-selection-mode-btn").addEventListener("click", () => {
      window.partySelectionMode = !window.partySelectionMode;
      const btn = document.getElementById("toggle-party-selection-mode-btn");
      if(partySelectionMode) {
        btn.textContent = "選択モード解除";
      } else {
        btn.textContent = "選択モード";
        // 解除時、選択を全リセット
        const selectedCards = document.querySelectorAll("#party-card-container .card.selected");
        selectedCards.forEach(el => el.classList.remove("selected"));
      }
      updatePartyMoveButtonVisibility();
    });

    // 「パーティ選択カードを倉庫に戻す」ボタン
    document.getElementById("move-selected-to-warehouse-btn").addEventListener("click", async () => {
      const selectedCards = document.querySelectorAll("#party-card-container .card.selected");
      if(selectedCards.length === 0) {
        alert("カードが選択されていません。");
        return;
      }
      selectedCards.forEach(el => {
        const cardId = el.getAttribute("data-id");
        const idx = window.characterData.findIndex(c => c.id === cardId);
        if(idx !== -1) {
          window.characterData[idx].group = "Warehouse";
        }
      });
      await saveCharacterDataToIndexedDB(window.characterData);
      // 選択解除 & 再描画
      selectedCards.forEach(el => el.classList.remove("selected"));
      renderParty();
      updatePartyMoveButtonVisibility();
    });

    // 「選択モード（倉庫側）」ボタン
    document.getElementById("toggle-warehouse-selection-mode-btn").addEventListener("click", () => {
      window.warehouseSelectionMode = !window.warehouseSelectionMode;
      const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
      if(warehouseSelectionMode) {
        btn.textContent = "選択モード解除";
      } else {
        btn.textContent = "選択モード";
        // 解除時、選択を全リセット
        const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
        selectedCards.forEach(el => el.classList.remove("selected"));
      }
      updateWarehouseAddButtonVisibility();
    });

    // 「倉庫選択カードをパーティへ」ボタン
    document.getElementById("add-to-party-btn").addEventListener("click", async () => {
      const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
      if(selectedCards.length === 0) {
        alert("カードが選択されていません。");
        return;
      }
      selectedCards.forEach(el => {
        const cardId = el.getAttribute("data-id");
        const realIndex = window.characterData.findIndex(c => c.id === cardId);
        if(realIndex !== -1){
          window.characterData[realIndex].group = "Party";
        }
      });

      await saveCharacterDataToIndexedDB(window.characterData);
      // 選択解除
      selectedCards.forEach(el => el.classList.remove("selected"));
      // 倉庫再描画 & パーティ再描画
      showWarehouseModal();
      renderParty();
      updateWarehouseAddButtonVisibility();
    });

    // 戻るボタン
    document.getElementById("back-to-menu").addEventListener("click", () => {
      window.location.href = "index.html";
    });
});


/** パーティのカードを表示 */
function renderParty(){
  const partyContainer = document.getElementById("party-card-container");
  partyContainer.innerHTML = "";
  // group==="Party" のみ抽出
  const partyCards = window.characterData.filter(c => c.group === "Party");

  if(partyCards.length === 0){
    partyContainer.textContent = "パーティにカードがありません。";
    return;
  }

  partyCards.forEach((card) => {
    const cardEl = createPartyCardElement(card);
    partyContainer.appendChild(cardEl);
  });
}

/** パーティカード生成 */
function createPartyCardElement(card){
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  cardEl.setAttribute("data-id", card.id);

  // クリック時の動作：選択モード中は .selected をトグル、そうでなければ反転のみ
  cardEl.addEventListener("click", (e) => {
    if(window.partySelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updatePartyMoveButtonVisibility();
    } else {
      // 通常時はカードを反転
      cardEl.classList.toggle("flipped");
    }
  });

  // カードの中身
  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  const bgStyle = card.backgroundcss
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
  cardFront.style = "background-image:" + bgStyle;

  const rarityValue = (typeof card.rarity === "string") ? card.rarity.replace("★", "").trim() : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if(card.imageData){
    const imageEl = document.createElement("img");
    imageEl.src = card.imageData;
    imageEl.alt = card.name;
    imageContainer.appendChild(imageEl);
  }
  cardFront.appendChild(imageContainer);

  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = "<h3>" + DOMPurify.sanitize(card.name) + "</h3>";
  infoContainer.appendChild(nameEl);

  if (card.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(card.state);
    infoContainer.appendChild(stateEl);
  }
  const specialEl = document.createElement("p");
  specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(card.special);
  infoContainer.appendChild(specialEl);

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

/** 倉庫モーダルを表示 */
function showWarehouseModal(){
  const modal = document.getElementById("warehouse-modal");
  modal.style.display = "flex";

  const warehouseContainer = document.getElementById("warehouse-card-container");
  warehouseContainer.innerHTML = "";

  // group==="Warehouse" のみ
  const warehouseCards = window.characterData.filter(c => c.group === "Warehouse");
  if(warehouseCards.length === 0) {
    warehouseContainer.textContent = "倉庫にカードがありません。";
    return;
  }

  warehouseCards.forEach((card) => {
    const cardEl = createWarehouseCardElement(card);
    warehouseContainer.appendChild(cardEl);
  });
  updateWarehouseAddButtonVisibility();
}

/** 倉庫カード生成 */
function createWarehouseCardElement(card){
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  cardEl.setAttribute("data-id", card.id);

  // クリック時：選択モード中は .selected をトグル、それ以外は反転のみ
  cardEl.addEventListener("click", (e) => {
    if(window.warehouseSelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updateWarehouseAddButtonVisibility();
    } else {
      cardEl.classList.toggle("flipped");
    }
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";
  const bgStyle = card.backgroundcss
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
  cardFront.style = "background-image:" + bgStyle;

  const rarityValue = (typeof card.rarity === "string") ? card.rarity.replace("★", "").trim() : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if(card.imageData){
    const imageEl = document.createElement("img");
    imageEl.src = card.imageData;
    imageEl.alt = card.name;
    imageContainer.appendChild(imageEl);
  }
  cardFront.appendChild(imageContainer);

  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = "<h3>" + DOMPurify.sanitize(card.name) + "</h3>";
  infoContainer.appendChild(nameEl);

  if (card.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(card.state);
    infoContainer.appendChild(stateEl);
  }
  const specialEl = document.createElement("p");
  specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(card.special);
  infoContainer.appendChild(specialEl);

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

/** パーティへ入れるボタンの表示・非表示制御（倉庫側） */
function updateWarehouseAddButtonVisibility(){
  const addBtn = document.getElementById("add-to-party-btn");
  if(!warehouseSelectionMode) {
    // 選択モードOFF時は非表示
    addBtn.style.display = "none";
    return;
  }
  // 選択モードON
  const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
  if(selectedCards.length > 0){
    addBtn.style.display = "inline-block";
  } else {
    addBtn.style.display = "none";
  }
}

/** 倉庫に戻すボタンの表示・非表示制御（パーティ側） */
function updatePartyMoveButtonVisibility(){
  const moveBtn = document.getElementById("move-selected-to-warehouse-btn");
  if(!partySelectionMode){
    moveBtn.style.display = "none";
    return;
  }
  const selectedCards = document.querySelectorAll("#party-card-container .card.selected");
  if(selectedCards.length > 0) {
    moveBtn.style.display = "inline-block";
  } else {
    moveBtn.style.display = "none";
  }
}
