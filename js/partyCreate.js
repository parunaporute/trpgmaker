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
  
    document.getElementById("close-warehouse-btn").addEventListener("click", () => {
      document.getElementById("warehouse-modal").style.display = "none";
    });
  
    // 「倉庫からパーティへ」ボタン
    document.getElementById("add-to-party-btn").addEventListener("click", async () => {
      // 選択中の倉庫カードをパーティに移す
      const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
      if(selectedCards.length === 0) {
        alert("カードが選択されていません。");
        return;
      }
      // data-id から全体配列内のカードを検索して group = "Party" に書き換え
      selectedCards.forEach(el => {
        const cardId = el.getAttribute("data-id");
        const realIndex = window.characterData.findIndex(c => c.id === cardId);
        if(realIndex !== -1){
          window.characterData[realIndex].group = "Party";
        }
      });
  
      await saveCharacterDataToIndexedDB(window.characterData);
      renderParty();
      showWarehouseModal(); // 再描画
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
    // group==="Party" のみ
    const partyCards = window.characterData.filter(c => c.group === "Party");
  
    if(partyCards.length === 0){
      partyContainer.textContent = "パーティにカードがありません。";
      return;
    }
  
    partyCards.forEach((card) => {
      // 修正：サブ配列のインデックスではなく card 自体を渡す
      const cardEl = createPartyCardElement(card);
      partyContainer.appendChild(cardEl);
    });
  }
  
  /** 倉庫モーダルを表示し、倉庫カードを表示 */
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
      // 修正：card.id を埋め込み、サブ配列idxは持たない
      const cardEl = createWarehouseCardElement(card);
      warehouseContainer.appendChild(cardEl);
    });
  }
  
  /** パーティカード生成（クリックで倉庫戻しモーダルを出す） */
  function createPartyCardElement(card){
    const cardEl = document.createElement("div");
    cardEl.className = "card";
  
    // 修正：card.id を持たせる
    cardEl.setAttribute("data-id", card.id);
    cardEl.addEventListener("click", () => {
      // 「倉庫に戻しますか？」モーダル
      showReturnToWarehouseModal(card.id);
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
  
  /** 倉庫カード生成（クリックで選択切り替え） */
  function createWarehouseCardElement(card){
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    // 修正：card.id を持たせる
    cardEl.setAttribute("data-id", card.id);
  
    cardEl.addEventListener("click", () => {
      // 選択状態のtoggle
      cardEl.classList.toggle("selected");
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
  
  /** 「倉庫に戻しますか？」モーダル */
  let currentPartyCardId = null;
  function showReturnToWarehouseModal(cardId){
    currentPartyCardId = cardId;
    const modal = document.getElementById("return-to-warehouse-modal");
    modal.style.display = "flex";
  }
  
  document.getElementById("return-ok-btn").addEventListener("click", async ()=>{
    const modal = document.getElementById("return-to-warehouse-modal");
    modal.style.display = "none";
    if(currentPartyCardId) {
      // 修正：cardId で検索
      const idx = window.characterData.findIndex(c => c.id === currentPartyCardId);
      if(idx !== -1){
        window.characterData[idx].group = "Warehouse";
        await saveCharacterDataToIndexedDB(window.characterData);
        renderParty();
      }
    }
    currentPartyCardId = null;
  });
  
  document.getElementById("return-cancel-btn").addEventListener("click", ()=>{
    const modal = document.getElementById("return-to-warehouse-modal");
    modal.style.display = "none";
    currentPartyCardId = null;
  });
