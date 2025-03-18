// js/warehouse.js
// 倉庫 + ゴミ箱タブを統合しつつ、
// 画像プレビューは「クリックで別 multiModal」を開いて表示

(() => {
  // ▼ 倉庫モード:
  //    - "menu"  => メニューから開いた倉庫
  //    - "party" => パーティ編集から開いた倉庫
  let warehouseMode = "menu";

  // ▼ パーティID + コールバック
  let currentPartyIdForAdd = null;
  let afterAddCallback = null;

  // ▼ カレントタブ: "キャラクター" / "アイテム" / "モンスター" / "ゴミ箱"
  let currentTab = "キャラクター";

  // ▼ 選択モード (倉庫 / ゴミ箱)
  let warehouseSelectionMode = false;
  let trashSelectionMode = false;

  // ▼ 現在表示すべきカード一覧
  let allCardsForCurrentTab = [];

  // ▼ 1行に何枚カードを並べるか
  let cardsPerRow = 1;
  // ▼ ロード済みの行数
  let loadedLineCount = 0;
  // ▼ 1回あたり何行分読み込むか
  const LINES_PER_LOAD = 1;

  /****************************************************
   * ソート設定（タブごとに保持）
   ****************************************************/
  function setSortConfig(tabName, sortKey, sortDir) {
    localStorage.setItem(`warehouseSortKey_${tabName}`, sortKey);
    localStorage.setItem(`warehouseSortDir_${tabName}`, sortDir);
  }

  function getSortConfig(tabName) {
    const sortKey = localStorage.getItem(`warehouseSortKey_${tabName}`) || "id";
    const sortDir = localStorage.getItem(`warehouseSortDir_${tabName}`) || "asc";
    return { sortKey, sortDir };
  }

  function applySort(array, sortKey, sortDir) {
    array.sort((a, b) => {
      if (sortKey === "id") {
        const tA = getTimeFromId(a.id);
        const tB = getTimeFromId(b.id);
        return tA - tB;
      } else if (sortKey === "name") {
        const an = a.name || "";
        const bn = b.name || "";
        return an.localeCompare(bn);
      } else if (sortKey === "state") {
        const as = a.state || "";
        const bs = b.state || "";
        return as.localeCompare(bs);
      }
      return 0;
    });
    if (sortDir === "desc") {
      array.reverse();
    }
  }

  function getTimeFromId(cardId) {
    // 例: "card_1690001234567_XXXX"
    const parts = cardId.split("_");
    if (parts.length < 3) return 0;
    const t = parseInt(parts[1], 10);
    return isNaN(t) ? 0 : t;
  }

  /****************************************************
   * 倉庫モーダルを multiModal で開く
   ****************************************************/
  function showWarehouseModal(mode = "menu", partyId = null, onAddCb = null) {
    warehouseMode = mode;
    currentPartyIdForAdd = partyId || null;
    afterAddCallback = onAddCb || null;

    // 倉庫タブは最初「キャラクター」
    currentTab = "キャラクター";
    warehouseSelectionMode = false;
    trashSelectionMode = false;

    multiModal.open({
      title: "倉庫",
      contentHtml: buildWarehouseModalHtml(),
      showCloseButton: true,      // 右上×ボタン
      closeOnOutsideClick: true,  // モーダル外クリックで閉じる
      appearanceType: "top",
      // onOpenでイベント紐付け + 表示
      onOpen: () => {
        // タブをキャラクターにし、UI初期化
        // (tabが'ゴミ箱'だとUI切り替えがあるため)
        const tabEls = document.querySelectorAll(".warehouse-tab");
        tabEls.forEach(t => t.classList.remove("active"));
        const charTab = Array.from(tabEls).find(el => el.getAttribute("data-tab") === "キャラクター");
        if (charTab) {
          charTab.classList.add("active");
        }

        // イベント等のセットアップ
        setupWarehouseModalEvents();
        applySortUIFromStorage(currentTab);
        loadCardsByTab();
      }
    });
  }

  // すべてのHTMLを contentHtml としてまとめる
  function buildWarehouseModalHtml() {
    return `
<div style="display:flex;flex-direction:column;max-height:89vh">
  <div class="warehouse-header-bar">
    <div class="warehouse-left">
      <button id="toggle-warehouse-selection-mode-btn" style="margin:0;">選択モード</button>
      <button id="delete-selected-warehouse-btn" style="margin:0; display:none;">選択したカードをゴミ箱へ</button>
      <button id="add-to-party-btn" style="margin:0; display:none;">パーティに入れる</button>

      <!-- ゴミ箱用 選択モード -->
      <button id="trash-selection-mode-btn" style="display:none;">選択モード</button>
      <button id="trash-restore-selected-btn" style="display:none;">選択したカードを元に戻す</button>
      <button id="trash-delete-selected-btn" style="display:none;background-color:#f44336;">選択したカードを完全削除</button>
    </div>
    <div class="warehouse-center">
      <div class="warehouse-tabs">
        <div class="warehouse-tab" data-tab="キャラクター">キャラクター</div>
        <div class="warehouse-tab" data-tab="アイテム">アイテム</div>
        <div class="warehouse-tab" data-tab="モンスター">モンスター</div>
        <div class="warehouse-tab" data-tab="ゴミ箱">ゴミ箱</div>
      </div>
    </div>
    <div class="warehouse-right">
      <select id="warehouse-sort-dropdown">
        <option value="id">取得順</option>
        <option value="name">名前順</option>
        <option value="state">状態順</option>
      </select>
      <button id="warehouse-sort-direction-btn" style="width:30px; margin:0;">↓</button>
    </div>
  </div>

  <!-- ゴミ箱タブ専用: すべて戻す/すべて削除 -->
  <div class="c-flexbox" id="trash-all-actions" style="display:none;margin-bottom:0">
    <button id="trash-restore-all-btn">すべて戻す</button>
    <button id="trash-delete-all-btn" style="background-color:#f44336;">すべて完全削除</button>
  </div>

  <div id="warehouse-card-scroll-container" style="overflow-y:auto; width:100%; margin-top:0px;">
    <div id="warehouse-card-container" style="display:flex; flex-wrap:wrap; gap:20px; opacity:0; transition:opacity 0.3s ease;"></div>
  </div>
</div>
`;
  }

  // ここで各種イベントを付与
  function setupWarehouseModalEvents() {
    // ▼ 倉庫側 選択モード
    document.getElementById("toggle-warehouse-selection-mode-btn")
      .addEventListener("click", toggleWarehouseSelectionMode);
    document.getElementById("delete-selected-warehouse-btn")
      .addEventListener("click", moveSelectedCardsToTrash);
    document.getElementById("add-to-party-btn")
      .addEventListener("click", addSelectedCardsToParty);

    // ▼ ゴミ箱側 選択モード
    document.getElementById("trash-selection-mode-btn")
      .addEventListener("click", toggleTrashSelectionMode);
    document.getElementById("trash-restore-selected-btn")
      .addEventListener("click", restoreSelectedTrashCards);
    document.getElementById("trash-delete-selected-btn")
      .addEventListener("click", deleteSelectedTrashCards);
    document.getElementById("trash-restore-all-btn")
      .addEventListener("click", restoreAllTrashCards);
    document.getElementById("trash-delete-all-btn")
      .addEventListener("click", deleteAllTrashCards);

    // ▼ タブクリック
    const tabEls = document.querySelectorAll(".warehouse-tab");
    tabEls.forEach(tabEl => {
      tabEl.addEventListener("click", () => {
        tabEls.forEach(t => t.classList.remove("active"));
        tabEl.classList.add("active");
        currentTab = tabEl.getAttribute("data-tab");
        loadCardsByTab();
      });
    });

    // ▼ ソートUI
    document.getElementById("warehouse-sort-dropdown")
      .addEventListener("change", onSortChange);
    document.getElementById("warehouse-sort-direction-btn")
      .addEventListener("click", onSortDirToggle);

    // ▼ スクロール最下部で次行読み込み
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    scrollC.addEventListener("scroll", onScrollCheck);
  }

  /****************************************************
   * ロード => カード一覧描画
   ****************************************************/
  function loadCardsByTab() {
    const container = document.getElementById("warehouse-card-container");
    if (!container) return;

    container.innerHTML = "";
    container.style.visibility = "hidden";
    container.style.opacity = "0";

    // タブに応じて絞り込み
    if (currentTab === "ゴミ箱") {
      allCardsForCurrentTab = (window.characterData || []).filter(c => c.group === "Trash");
    } else {
      allCardsForCurrentTab = (window.characterData || [])
        .filter(c => c.group === "Warehouse" && c.type === currentTab);
    }

    loadedLineCount = 0;

    // ソート
    const config = getSortConfig(currentTab);
    applySort(allCardsForCurrentTab, config.sortKey, config.sortDir);

    // ゴミ箱 or 倉庫 切り替えUI
    updateHeaderUIForTab();

    cardsPerRow = calcCardsPerRow();
    loadNextLines(LINES_PER_LOAD);

    fillContainerIfNeeded(() => {
      container.style.visibility = "visible";
      container.style.opacity = "1";
    });
  }

  function calcCardsPerRow() {
    const container = document.getElementById("warehouse-card-container");
    if (!container) return 1;
    const cw = container.clientWidth || 0;
    if (cw <= 0) return 1;

    let cardW = 300;
    let gap = 20;
    let per = 1;
    for (let n = 1; n <= 50; n++) {
      const totalW = n * cardW + (n - 1) * gap;
      if (totalW <= cw) per = n;
      else break;
    }
    return per;
  }

  function fillContainerIfNeeded(callback) {
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (!scrollC) {
      if (callback) callback();
      return;
    }
    let safety = 0;
    while (
      scrollC.scrollHeight <= scrollC.clientHeight &&
      loadedLineCount * cardsPerRow < allCardsForCurrentTab.length &&
      safety < 50
    ) {
      loadNextLines(LINES_PER_LOAD);
      safety++;
    }
    if (callback) callback();
  }

  function onScrollCheck() {
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (!scrollC) return;
    const threshold = 50;
    if (scrollC.scrollTop + scrollC.clientHeight + threshold >= scrollC.scrollHeight) {
      loadNextLines(2);
    }
  }

  function loadNextLines(lineCount) {
    const container = document.getElementById("warehouse-card-container");
    if (!container) return;

    const displayedCount = loadedLineCount * cardsPerRow;
    const newCount = lineCount * cardsPerRow;
    const slice = allCardsForCurrentTab.slice(displayedCount, displayedCount + newCount);

    slice.forEach(card => {
      let cardEl;
      if (currentTab === "ゴミ箱") {
        cardEl = createTrashCardElement(card);
      } else {
        cardEl = createWarehouseCardElement(card);
      }
      container.appendChild(cardEl);
    });

    loadedLineCount += lineCount;
  }

  /****************************************************
   * タブによるヘッダーUI切り替え
   ****************************************************/
  function updateHeaderUIForTab() {
    const toggleSelBtn = document.getElementById("toggle-warehouse-selection-mode-btn");
    const delSelBtn = document.getElementById("delete-selected-warehouse-btn");
    const addPartyBtn = document.getElementById("add-to-party-btn");

    const trashSelBtn = document.getElementById("trash-selection-mode-btn");
    const trashRestoreSelBtn = document.getElementById("trash-restore-selected-btn");
    const trashDeleteSelBtn = document.getElementById("trash-delete-selected-btn");
    const trashAllActions = document.getElementById("trash-all-actions");

    if (currentTab === "ゴミ箱") {
      toggleSelBtn.style.display = "none";
      delSelBtn.style.display = "none";
      addPartyBtn.style.display = "none";

      trashSelBtn.style.display = "inline-block";
      trashRestoreSelBtn.style.display = "none";
      trashDeleteSelBtn.style.display = "none";
      trashAllActions.style.display = "flex";
    } else {
      toggleSelBtn.style.display = "inline-block";
      trashSelBtn.style.display = "none";
      trashRestoreSelBtn.style.display = "none";
      trashDeleteSelBtn.style.display = "none";
      trashAllActions.style.display = "none";

      updateWarehouseSelectionButtons();
    }
  }

  /****************************************************
   * 倉庫カード生成
   ****************************************************/
  function createWarehouseCardElement(card) {
    const cardEl = document.createElement("div");
    const rarityVal = (card.rarity || "").replace("★", "").trim();
    cardEl.className = "card rarity" + rarityVal;
    cardEl.setAttribute("data-id", card.id);

    // 裏返し
    if (card.flipped) {
      cardEl.classList.add("flipped");
    }

    cardEl.addEventListener("click", (e) => {
      if (warehouseSelectionMode) {
        e.stopPropagation();
        cardEl.classList.toggle("selected");
        updateWarehouseSelectionButtons();
      } else {
        // ▼ flipping or preview
        if (cardEl.classList.contains("flipped")) {
          cardEl.classList.remove("flipped");
          card.flipped = false;
          saveFlippedState(card.id, false);
        } else {
          if (card.imageData) {
            openImagePreview(card);
          } else {
            showToast("画像がありません。");
          }
        }
      }
    });

    const inner = document.createElement("div");
    inner.className = "card-inner";

    // FRONT
    const front = document.createElement("div");
    front.className = "card-front";
    const bgStyle = (card.backgroundcss || "")
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
    if (bgStyle) {
      front.style.backgroundImage = bgStyle;
    }
    front.innerHTML = `<div class="bezel rarity${rarityVal}"></div>`;

    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = card.type || "不明";
    front.appendChild(typeEl);

    const imgC = document.createElement("div");
    imgC.className = "card-image";

    if (card.imageData) {
      const imgEl = document.createElement("img");
      imgEl.src = card.imageData;
      imgEl.alt = card.name || "";
      // 回転角度を反映
      if (card.rotationAngle) {
        if (card.rotationAngle % 180 === 90) {
          imgEl.style.transform = `rotate(${card.rotationAngle}deg) scale(1.5)`;
        } else {
          imgEl.style.transform = `rotate(${card.rotationAngle}deg)`;
        }
      }
      imgC.appendChild(imgEl);
    } else {
      // ▼ 画像生成ボタン
      const genBtn = document.createElement("button");
      genBtn.className = "gen-image-btn";
      genBtn.textContent = "画像生成";
      genBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        generateWarehouseImage(card, genBtn);
      });
      imgC.appendChild(genBtn);
    }
    front.appendChild(imgC);

    // 情報
    const infoC = document.createElement("div");
    infoC.className = "card-info";

    const nameP = document.createElement("p");
    nameP.innerHTML = `<h3>${DOMPurify.sanitize(card.name || "")}</h3>`;
    infoC.appendChild(nameP);

    if (card.state) {
      const st = document.createElement("p");
      st.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
      infoC.appendChild(st);
    }
    if (card.special) {
      const sp = document.createElement("p");
      sp.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special)}`;
      infoC.appendChild(sp);
    }
    const cap = document.createElement("p");
    cap.innerHTML = `<span>${DOMPurify.sanitize(card.caption || "")}</span>`;
    infoC.appendChild(cap);

    front.appendChild(infoC);

    // ゴミ箱ボタン
    const delBtn = document.createElement("button");
    delBtn.title = "ゴミ箱へ移動";
    delBtn.innerHTML = `<span class="iconmoon icon-bin" style="font-size:1rem"></span>`;
    Object.assign(delBtn.style, {
      position: "absolute",
      right: "0",
      bottom: "0",
      width: "35px",
      height: "35px",
      minWidth: "35px",
      minHeight: "35px",
      backgroundColor: "#f44336",
      color: "#fff",
      border: "none",
      borderRadius: "0 0 0 4px",
      boxShadow: "inset 0 0 5px #161616",
      zIndex: 10000
    });
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("このカードをゴミ箱に移動しますか？")) {
        moveSingleCardToTrash(card.id);
      }
    });
    front.appendChild(delBtn);

    // BACK
    const back = document.createElement("div");
    back.className = "card-back";
    back.innerHTML = `<strong>${DOMPurify.sanitize(card.type || "")}</strong>`;

    inner.appendChild(front);
    inner.appendChild(back);
    cardEl.appendChild(inner);

    return cardEl;
  }

  async function saveFlippedState(cardId, flipped) {
    const idx = (window.characterData || []).findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData[idx].flipped = flipped;
      await saveCharacterDataToIndexedDB(window.characterData);
    }
  }

  /****************************************************
   * ゴミ箱カード生成
   ****************************************************/
  function createTrashCardElement(card) {
    // (中略: 従来の実装をそのまま)
    // → クリック時にゴミ箱の選択モードとして card.selected 切り替え
    // → 復元/完全削除ボタン
    const cardEl = document.createElement("div");
    const rarityVal = (card.rarity || "").replace("★", "").trim();
    cardEl.className = "card rarity" + rarityVal;
    cardEl.setAttribute("data-id", card.id);

    cardEl.addEventListener("click", (e) => {
      if (trashSelectionMode) {
        e.stopPropagation();
        cardEl.classList.toggle("selected");
        updateTrashSelectionButtons();
      }
    });

    const inner = document.createElement("div");
    inner.className = "card-inner";

    // FRONT
    const front = document.createElement("div");
    front.className = "card-front";
    const bgStyle = (card.backgroundcss || "")
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
    if (bgStyle) {
      front.style.backgroundImage = bgStyle;
    }
    front.innerHTML = `<div class="bezel rarity${rarityVal}"></div>`;

    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = card.type || "不明";
    front.appendChild(typeEl);

    const imgC = document.createElement("div");
    imgC.className = "card-image";
    if (card.imageData) {
      const imgEl = document.createElement("img");
      imgEl.src = card.imageData;
      imgEl.alt = card.name || "";
      if (card.rotationAngle) {
        if (card.rotationAngle % 180 === 90) {
          imgEl.style.transform = `rotate(${card.rotationAngle}deg) scale(1.5)`;
        } else {
          imgEl.style.transform = `rotate(${card.rotationAngle}deg)`;
        }
      }
      imgC.appendChild(imgEl);
    }
    front.appendChild(imgC);

    // 情報
    const infoC = document.createElement("div");
    infoC.className = "card-info";

    const nameP = document.createElement("p");
    nameP.innerHTML = `<h3>${DOMPurify.sanitize(card.name || "")}</h3>`;
    infoC.appendChild(nameP);

    if (card.state) {
      const st = document.createElement("p");
      st.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
      infoC.appendChild(st);
    }
    if (card.special) {
      const sp = document.createElement("p");
      sp.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special)}`;
      infoC.appendChild(sp);
    }
    const cap = document.createElement("p");
    cap.innerHTML = `<span>${DOMPurify.sanitize(card.caption || "")}</span>`;
    infoC.appendChild(cap);

    front.appendChild(infoC);

    // ▼ 倉庫に戻す
    const restoreBtn = document.createElement("button");
    restoreBtn.title = "倉庫に戻す";
    restoreBtn.innerHTML = `<span class="iconmoon icon-undo2" style="font-size:1rem"></span>`;
    restoreBtn.style.position = "absolute";
    restoreBtn.style.right = "40px";
    restoreBtn.style.bottom = "0";
    restoreBtn.style.width = "35px";
    restoreBtn.style.height = "35px";
    restoreBtn.style.minWidth = "35px";
    restoreBtn.style.minHeight = "35px";
    restoreBtn.style.backgroundColor = "#4caf50";
    restoreBtn.style.color = "#fff";
    restoreBtn.style.border = "none";
    restoreBtn.style.borderRadius = "0";
    restoreBtn.style.boxShadow = "inset 0 0 5px #161616";
    restoreBtn.style.zIndex = 10000;
    restoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("このカードを倉庫に戻しますか？")) {
        restoreSingleCard(card.id);
      }
    });
    front.appendChild(restoreBtn);

    // ▼ 完全削除
    const delBtn = document.createElement("button");
    delBtn.title = "完全削除";
    delBtn.innerHTML = `<span class="iconmoon icon-bin" style="font-size:1rem"></span>`;
    delBtn.style.position = "absolute";
    delBtn.style.right = "0";
    delBtn.style.bottom = "0";
    delBtn.style.width = "35px";
    delBtn.style.height = "35px";
    delBtn.style.minWidth = "35px";
    delBtn.style.minHeight = "35px";
    delBtn.style.backgroundColor = "#f44336";
    delBtn.style.color = "#fff";
    delBtn.style.border = "none";
    delBtn.style.borderRadius = "0 0 0 4px";
    delBtn.style.boxShadow = "inset 0 0 5px #161616";
    delBtn.style.zIndex = 10000;
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("このカードを完全に削除しますか？")) {
        deleteSingleCardPermanently(card.id);
      }
    });
    front.appendChild(delBtn);

    const back = document.createElement("div");
    back.className = "card-back";
    inner.appendChild(front);
    inner.appendChild(back);
    cardEl.appendChild(inner);

    return cardEl;
  }

  /****************************************************
   * 倉庫選択モード（キャラ/アイテム/モンスター時）
   ****************************************************/
  function toggleWarehouseSelectionMode() {
    warehouseSelectionMode = !warehouseSelectionMode;
    const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
    btn.textContent = warehouseSelectionMode ? "選択モード解除" : "選択モード";
    if (!warehouseSelectionMode) {
      clearWarehouseSelections();
    }
    updateWarehouseSelectionButtons();
  }

  function updateWarehouseSelectionButtons() {
    if (currentTab === "ゴミ箱") return;
    const delBtn = document.getElementById("delete-selected-warehouse-btn");
    const addBtn = document.getElementById("add-to-party-btn");

    if (!warehouseSelectionMode) {
      delBtn.style.display = "none";
      addBtn.style.display = "none";
      return;
    }
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (warehouseMode === "menu") {
      delBtn.style.display = (selected.length > 0) ? "inline-block" : "none";
      addBtn.style.display = "none";
    } else {
      delBtn.style.display = "none";
      addBtn.style.display = (selected.length > 0) ? "inline-block" : "none";
    }
  }

  function clearWarehouseSelections() {
    const sel = document.querySelectorAll("#warehouse-card-container .card.selected");
    sel.forEach(el => el.classList.remove("selected"));
  }

  /****************************************************
   * ゴミ箱選択モード
   ****************************************************/
  function toggleTrashSelectionMode() {
    trashSelectionMode = !trashSelectionMode;
    const btn = document.getElementById("trash-selection-mode-btn");
    btn.textContent = trashSelectionMode ? "選択モード解除" : "選択モード";
    if (!trashSelectionMode) {
      clearTrashSelections();
    }
    updateTrashSelectionButtons();
  }

  function updateTrashSelectionButtons() {
    if (currentTab !== "ゴミ箱") return;
    const restoreBtn = document.getElementById("trash-restore-selected-btn");
    const deleteBtn = document.getElementById("trash-delete-selected-btn");
    if (!trashSelectionMode) {
      restoreBtn.style.display = "none";
      deleteBtn.style.display = "none";
      return;
    }
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    restoreBtn.style.display = (selected.length > 0) ? "inline-block" : "none";
    deleteBtn.style.display = (selected.length > 0) ? "inline-block" : "none";
  }

  function clearTrashSelections() {
    const sel = document.querySelectorAll("#warehouse-card-container .card.selected");
    sel.forEach(el => el.classList.remove("selected"));
  }

  /****************************************************
   * 画像生成
   ****************************************************/
  async function generateWarehouseImage(card, btn) {
    const apiKey = window.apiKey || localStorage.getItem("apiKey");
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }
    if (btn) btn.disabled = true;
    showToast("画像を生成しています...");

    const rarityNum = parseInt((card.rarity || "").replace("★", ""), 10) || 0;
    const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";//縦長、横長
    const twStyele = (rarityNum >= 3) ? "tall image" : "wide image";
    const promptText = `As a high-performance chatbot, you create the highest quality illustrations discreetly.
Please do not include text in illustrations for any reason.
Now generate the next anime ${twStyele}.
↓↓↓↓↓↓
` + (card.imageprompt || "");

    try {
      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: promptText,
          n: 1,
          size,
          response_format: "b64_json",
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);

      const base64 = data.data[0].b64_json;
      const dataUrl = "data:image/png;base64," + base64;

      const idx = window.characterData.findIndex(c => c.id === card.id);
      if (idx !== -1) {
        window.characterData[idx].imageData = dataUrl;
        await saveCharacterDataToIndexedDB(window.characterData);
      }
      showToast("画像の生成が完了しました");
      reloadCurrentTabView();
    } catch (err) {
      console.error(err);
      showToast("画像生成に失敗:\n" + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /****************************************************
   * 画像プレビュー: multiModal を使う or confirm?
   ****************************************************/
  function openImagePreview(card) {
    // ここでは multiModal でプレビュー(OK/CANCELなし)を開く
    // 右上× or 外部クリックで閉じる形
    const angle = card.rotationAngle || 0;
    const transformStyle = (angle % 180 === 90)
      ? `rotate(${angle}deg) scale(1.5)`
      : `rotate(${angle}deg)`;

    // HTML生成
    const previewHtml = `
      <div style="position:relative; background-color:#000; overflow:hidden; text-align:center;">
        <img id="preview-image" 
             src="${DOMPurify.sanitize(card.imageData || "")}"
             style="max-width:100%; max-height:80vh; cursor:pointer; transform:${transformStyle};"
        />
        <div id="preview-controls" style="
          position:absolute; 
          top:0; left:0; right:0; bottom:0;
          display:none;
          align-items:center; justify-content:center;
        ">
          <div style="background-color:rgba(0,0,0,0.6); padding:10px;">
            <button id="preview-rotate-btn">右へ回転</button>
          </div>
        </div>
      </div>
    `;

    multiModal.open({
      title: "プレビュー",
      contentHtml: previewHtml,
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true,
      // onOpenでイベントを付与
      onOpen: () => {
        const imgEl = document.getElementById("preview-image");
        const ctrlEl = document.getElementById("preview-controls");
        const rotateBtn = document.getElementById("preview-rotate-btn");

        // 画像クリック -> controls表示切替
        if (imgEl && ctrlEl) {
          imgEl.addEventListener("click", () => {
            if (ctrlEl.style.display === "none") {
              ctrlEl.style.display = "flex";
            } else {
              ctrlEl.style.display = "none";
            }
          });
        }

        // 右へ回転
        if (rotateBtn) {
          rotateBtn.addEventListener("click", async () => {
            const newAngle = ((card.rotationAngle || 0) + 90) % 360;
            card.rotationAngle = newAngle;

            // DB更新
            const idx = window.characterData.findIndex(c => c.id === card.id);
            if (idx !== -1) {
              window.characterData[idx].rotationAngle = newAngle;
              await saveCharacterDataToIndexedDB(window.characterData);
            }

            // DOM更新
            if (imgEl) {
              if (newAngle % 180 === 90) {
                imgEl.style.transform = `rotate(${newAngle}deg) scale(1.5)`;
              } else {
                imgEl.style.transform = `rotate(${newAngle}deg)`;
              }
            }

            // リスト側も反映
            applyRotationToCardElement(card.id, newAngle);
          });
        }
      }
    });
  }

  function applyRotationToCardElement(cardId, angle) {
    const cardEl = document.querySelector(`#warehouse-card-container .card[data-id="${cardId}"]`);
    if (!cardEl) return;

    const imgEl = cardEl.querySelector(".card-image img");
    if (!imgEl) return;

    if (angle % 180 === 90) {
      imgEl.style.transform = `rotate(${angle}deg) scale(1.5)`;
    } else {
      imgEl.style.transform = `rotate(${angle}deg)`;
    }
  }

  function reloadCurrentTabView() {
    const container = document.getElementById("warehouse-card-container");
    if (container) {
      container.innerHTML = "";
      container.style.opacity = "0";
      container.style.visibility = "hidden";
    }
    loadedLineCount = 0;

    if (currentTab === "ゴミ箱") {
      allCardsForCurrentTab = (window.characterData || []).filter(c => c.group === "Trash");
    } else {
      allCardsForCurrentTab = (window.characterData || [])
        .filter(c => c.group === "Warehouse" && c.type === currentTab);
    }
    const config = getSortConfig(currentTab);
    applySort(allCardsForCurrentTab, config.sortKey, config.sortDir);

    loadNextLines(LINES_PER_LOAD);

    fillContainerIfNeeded(() => {
      if (container) {
        container.style.visibility = "visible";
        container.style.opacity = "1";
      }
    });
  }

  function onSortChange() {
    const sortKey = document.getElementById("warehouse-sort-dropdown").value;
    const { sortDir } = getSortConfig(currentTab);
    setSortConfig(currentTab, sortKey, sortDir);
    reloadCurrentTabView();
  }

  function onSortDirToggle() {
    const sortDirBtn = document.getElementById("warehouse-sort-direction-btn");
    const config = getSortConfig(currentTab);
    const newDir = (config.sortDir === "asc") ? "desc" : "asc";
    setSortConfig(currentTab, config.sortKey, newDir);
    sortDirBtn.innerHTML = (newDir === "asc")
      ? `<span class="iconmoon icon-sort-alpha-asc"></span>`
      : `<span class="iconmoon icon-sort-alpha-desc"></span>`;
    reloadCurrentTabView();
  }

  function applySortUIFromStorage(tabName) {
    const dd = document.getElementById("warehouse-sort-dropdown");
    const dirBtn = document.getElementById("warehouse-sort-direction-btn");
    if (!dd || !dirBtn) return;
    const { sortKey, sortDir } = getSortConfig(tabName);
    dd.value = sortKey;
    dirBtn.innerHTML = (sortDir === "asc")
      ? `<span class="iconmoon icon-sort-alpha-asc"></span>`
      : `<span class="iconmoon icon-sort-alpha-desc"></span>`;
  }

  /****************************************************
   * 倉庫 -> ゴミ箱
   ****************************************************/
  async function moveSingleCardToTrash(cardId) {
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    window.characterData[idx].group = "Trash";
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  async function moveSelectedCardsToTrash() {
    if (warehouseMode !== "menu") return;
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (!selected.length) {
      showToast("カードが選択されていません。");
      return;
    }
    if (!confirm("選択したカードをゴミ箱に移動します。よろしいですか？")) return;

    selected.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        window.characterData[idx].group = "Trash";
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * 倉庫 -> パーティ
   ****************************************************/
  async function addSelectedCardsToParty() {
    if (warehouseMode !== "party") return;
    if (!currentPartyIdForAdd) {
      showToast("パーティIDがありません。");
      return;
    }
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (!selected.length) {
      showToast("カードが選択されていません。");
      return;
    }
    selected.forEach(el => {
      const cid = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cid);
      if (idx !== -1) {
        window.characterData[idx].group = "Party";
        window.characterData[idx].role = "none";
        window.characterData[idx].partyId = currentPartyIdForAdd;
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    clearWarehouseSelections();
    reloadCurrentTabView();
    if (typeof afterAddCallback === "function") {
      afterAddCallback();
    }
    updateWarehouseSelectionButtons();
  }

  /****************************************************
   * ゴミ箱: 単体復元
   ****************************************************/
  async function restoreSingleCard(cardId) {
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    window.characterData[idx].group = "Warehouse";
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * ゴミ箱: 単体完全削除
   ****************************************************/
  async function deleteSingleCardPermanently(cardId) {
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    window.characterData.splice(idx, 1);
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * ゴミ箱: 選択復元
   ****************************************************/
  async function restoreSelectedTrashCards() {
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (!selected.length) {
      showToast("カードが選択されていません。");
      return;
    }
    if (!confirm("選択したカードを倉庫へ戻しますか？")) return;

    selected.forEach(el => {
      const cid = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cid);
      if (idx !== -1) {
        window.characterData[idx].group = "Warehouse";
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * ゴミ箱: 選択削除
   ****************************************************/
  async function deleteSelectedTrashCards() {
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (!selected.length) {
      showToast("カードが選択されていません。");
      return;
    }
    if (!confirm("選択したカードを完全に削除します。よろしいですか？")) return;

    selected.forEach(el => {
      const cid = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cid);
      if (idx !== -1) {
        window.characterData.splice(idx, 1);
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * ゴミ箱: すべて戻す
   ****************************************************/
  async function restoreAllTrashCards() {
    if (!confirm("ゴミ箱内のカードをすべて倉庫に戻しますか？")) return;
    window.characterData.forEach(c => {
      if (c.group === "Trash") {
        c.group = "Warehouse";
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * ゴミ箱: すべて削除
   ****************************************************/
  async function deleteAllTrashCards() {
    if (!confirm("ゴミ箱を空にします。完全に削除してよろしいですか？")) return;
    window.characterData = window.characterData.filter(c => c.group !== "Trash");
    await saveCharacterDataToIndexedDB(window.characterData);
    reloadCurrentTabView();
  }

  /****************************************************
   * 外部に公開する関数
   ****************************************************/
  window.showWarehouseModal = showWarehouseModal;
})();
