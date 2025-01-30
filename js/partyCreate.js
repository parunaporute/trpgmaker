// js/partyCreate.js

// パーティ編成画面の初期処理をまとめる関数
// index.html の「DOMContentLoaded」で initIndexedDB() 完了後に呼ばれます。
window.initPartyCreatePage = async function () {

  // URLパラメータで partyId を取得
  const urlParams = new URLSearchParams(window.location.search);
  let currentPartyId = parseInt(urlParams.get("partyId"), 10);
  if (Number.isNaN(currentPartyId)) {
    currentPartyId = null;
  }

  let currentParty = null;
  if (currentPartyId) {
    currentParty = await getPartyById(currentPartyId);
    if (currentParty) {
      // パーティ名を input に反映
      document.getElementById("party-name-input").value = currentParty.name;
    } else {
      // 無効IDなら新規扱い
      currentPartyId = null;
    }
  }

  // characterData
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // ボタンイベント
  document.getElementById("save-party-name-btn").addEventListener("click", async () => {
    const newName = document.getElementById("party-name-input").value.trim() || "名称未設定";
    if (!currentPartyId) {
      // 新規
      const newId = await createParty(newName);
      currentPartyId = newId;
      alert("パーティを新規作成しました (ID:" + newId + ")");
    } else {
      // 既存パーティ名更新
      const pt = await getPartyById(currentPartyId);
      if (pt) {
        pt.name = newName;
        await updateParty(pt);
        alert("パーティ名を更新しました (ID:" + currentPartyId + ")");
      }
    }
  });

  // 倉庫ボタン => showWarehouseModal("party", partyId, コールバック)
  document.getElementById("show-warehouse-btn").addEventListener("click", () => {
    if (!currentPartyId) {
      alert("パーティIDが未確定です。先にパーティ名を保存してください。");
      return;
    }
    showWarehouseModal("party", currentPartyId, () => {
      // パーティにカード追加後のコールバック
      renderAllParty();
    });
  });

  // パーティ側の選択モード
  let partySelectionMode = false;
  document.getElementById("toggle-party-selection-mode-btn").addEventListener("click", () => {
    partySelectionMode = !partySelectionMode;
    const btn = document.getElementById("toggle-party-selection-mode-btn");
    if (partySelectionMode) {
      btn.textContent = "選択モード解除";
    } else {
      btn.textContent = "選択モード";
      // 選択解除
      const selCards = document.querySelectorAll(
        "#avatar-card-container .card.selected, " +
        "#partner-card-container .card.selected, " +
        "#party-card-container .card.selected"
      );
      selCards.forEach(el => el.classList.remove("selected"));
    }
    updatePartyMoveButtonVisibility();
  });

  // 「選択したカードを倉庫に戻す」
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
    // 選択解除 & 再描画
    selectedCards.forEach(el => el.classList.remove("selected"));
    renderAllParty();
    updatePartyMoveButtonVisibility();
  });

  // 「メニューに戻る」
  document.getElementById("back-to-menu").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // パーティ描画
  function renderAllParty() {
    const partyCards = window.characterData.filter(
      c => c.group === "Party" && c.partyId === currentPartyId
    );
    const avatarContainer = document.getElementById("avatar-card-container");
    const partnerContainer = document.getElementById("partner-card-container");
    const partyContainer = document.getElementById("party-card-container");

    avatarContainer.innerHTML = "";
    partnerContainer.innerHTML = "";
    partyContainer.innerHTML = "";

    const avatarCards = partyCards.filter(c => c.role === "avatar");
    const partnerCards = partyCards.filter(c => c.role === "partner");
    const noneCards = partyCards.filter(c => !c.role || c.role === "none");

    avatarCards.forEach(card => {
      avatarContainer.appendChild(createPartyCardElement(card));
    });
    partnerCards.forEach(card => {
      partnerContainer.appendChild(createPartyCardElement(card));
    });
    noneCards.forEach(card => {
      partyContainer.appendChild(createPartyCardElement(card));
    });
  }

  // カード生成
  function createPartyCardElement(card) {
    const cardEl = document.createElement("div");
    cardEl.className = "card rarity" + card.rarity.replace("★", "").trim();
    cardEl.setAttribute("data-id", card.id);

    cardEl.addEventListener("click", (e) => {
      if (document.getElementById("toggle-party-selection-mode-btn").textContent.includes("解除")) {
        // 選択モード中
        e.stopPropagation();
        cardEl.classList.toggle("selected");
        updatePartyMoveButtonVisibility();
      } else {
        // 通常時: 裏返し
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

    // レアリティ
    const rv = card.rarity.replace("★", "").trim();
    cardFront.innerHTML = `<div class='bezel rarity${rv}'></div>`;

    // タイプ
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

    // キャラクターのみ role 切り替えボタン
    if (card.type === "キャラクター") {
      const roleDiv = document.createElement("div");
      roleDiv.style.marginTop = "8px";

      const avatarBtn = document.createElement("button");
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
    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type)}</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);

    return cardEl;
  }

  async function toggleAvatar(card) {
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

  async function togglePartner(card) {
    if (card.role === "partner") {
      card.role = "none";
    } else {
      card.role = "partner";
    }
    await saveCharacterDataToIndexedDB(window.characterData);
    renderAllParty();
  }

  function updatePartyMoveButtonVisibility() {
    const moveBtn = document.getElementById("move-selected-to-warehouse-btn");
    const sel = document.querySelectorAll(
      "#avatar-card-container .card.selected, " +
      "#partner-card-container .card.selected, " +
      "#party-card-container .card.selected"
    );
    moveBtn.style.display = (sel.length > 0) ? "inline-block" : "none";
  }

  // 最後に一度だけレンダリング実行
  renderAllParty();
};
