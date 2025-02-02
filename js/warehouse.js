// js/warehouse.js
// 倉庫表示ロジックを一括管理

(() => {
  let warehouseModal = null;
  let previewModal = null;
  let warehouseMode = "menu";         // "menu" or "party"
  let currentPartyIdForAdd = null;    // パーティID
  let afterAddCallback = null;        // パーティ追加後のコールバック
  let currentTab = "キャラクター";      // タブ (キャラクター / アイテム / モンスター)

  let warehouseSelectionMode = false;
  let allWarehouseCards = [];
  let cardsPerRow = 1;
  let loadedLineCount = 0;
  const LINES_PER_LOAD = 1;

  // === 追加: タブ毎に持つソート設定を保存・取得するユーティリティ =========================
  function setSortConfig(tabName, sortKey, sortDir) {
    localStorage.setItem(`warehouseSortKey_${tabName}`, sortKey);
    localStorage.setItem(`warehouseSortDir_${tabName}`, sortDir);
  }

  function getSortConfig(tabName) {
    const sortKey = localStorage.getItem(`warehouseSortKey_${tabName}`) || "id";  // デフォルトは 取得順
    const sortDir = localStorage.getItem(`warehouseSortDir_${tabName}`) || "asc"; // デフォルトは 昇順
    return { sortKey, sortDir };
  }

  // ソートロジック
  function applySort(array, sortKey, sortDir) {
    array.sort((a, b) => {
      if (sortKey === "id") {
        // 「card_タイムスタンプ_ランダム」の形式 → タイムスタンプ抜き出し
        const tA = getTimeFromId(a.id);
        const tB = getTimeFromId(b.id);
        return tA - tB; // 古い方が先
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
    const parts = cardId.split("_");
    if (parts.length < 3) return 0;
    const t = parseInt(parts[1], 10);
    return isNaN(t) ? 0 : t;
  }

  // -------------------------------
  // モーダルHTMLの動的挿入
  // -------------------------------
  function ensureWarehouseModalExists() {
    if (document.getElementById("warehouse-modal")) {
      warehouseModal = document.getElementById("warehouse-modal");
      previewModal = document.getElementById("card-image-preview-modal");
      return;
    }
    // まだ無い場合、body末尾に挿入
    const modalHTML = `
<div id="warehouse-modal" class="modal">
  <div class="modal-content">
  <div class="r-flexbox" style="width:100%"><button id="close-warehouse-btn">✕</button></div>
    <h2>倉庫</h2>

    <!-- ここから：ヘッダー部分を三分割 (左：選択モードボタン類、中央：タブ、右：ソートUI) -->
    <div class="warehouse-header-bar">
      <div class="warehouse-left">
        <button id="toggle-warehouse-selection-mode-btn" style="margin:0;">選択モード</button>
        <button id="delete-selected-warehouse-btn" style="margin:0; display:none;">選択したカードを削除</button>
        <button id="add-to-party-btn" style="margin:0; display:none;">パーティに入れる</button>
      </div>
      <div class="warehouse-center">
        <div class="warehouse-tabs">
          <div class="warehouse-tab" data-tab="キャラクター">キャラクター</div>
          <div class="warehouse-tab" data-tab="アイテム">アイテム</div>
          <div class="warehouse-tab" data-tab="モンスター">モンスター</div>
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
    <!-- ここまでヘッダー -->

    <div id="warehouse-card-scroll-container" style="margin:10px 0; max-height:70vh; overflow-y:auto; width:100%;">
      <div id="warehouse-card-container" style="display:flex; flex-wrap:wrap; gap:20px;"></div>
    </div>
  </div>
</div>

<!-- プレビュー用モーダル -->
<div id="card-image-preview-modal" class="modal">
  <div class="modal-content">
    <img id="card-preview-img" src="" alt="card image" style="max-width:95vw; max-height:95vh;" />
    <button id="card-preview-close-btn" style="margin-top:10px;">閉じる</button>
  </div>
</div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    warehouseModal = document.getElementById("warehouse-modal");
    previewModal = document.getElementById("card-image-preview-modal");

    // 閉じるボタン
    document.getElementById("close-warehouse-btn").addEventListener("click", closeWarehouseModal);

    // 選択モード
    document.getElementById("toggle-warehouse-selection-mode-btn")
      .addEventListener("click", toggleWarehouseSelectionMode);

    // 削除ボタン
    document.getElementById("delete-selected-warehouse-btn")
      .addEventListener("click", deleteSelectedWarehouseCards);

    // パーティに入れる
    document.getElementById("add-to-party-btn")
      .addEventListener("click", addSelectedCardsToParty);

    // タブ切り替え
    const tabEls = warehouseModal.querySelectorAll(".warehouse-tab");
    tabEls.forEach(tabEl => {
      tabEl.addEventListener("click", () => {
        // 全タブリセット
        tabEls.forEach(t => t.classList.remove("active"));
        // クリックしたタブをアクティブに
        tabEl.classList.add("active");

        currentTab = tabEl.getAttribute("data-tab");
        loadCardsByTab();
      });
    });
    // 最初のタブをアクティブ
    tabEls[0].classList.add("active");

    // ソートUIのイベント
    const sortDropdown = document.getElementById("warehouse-sort-dropdown");
    const sortDirBtn = document.getElementById("warehouse-sort-direction-btn");
    sortDropdown.addEventListener("change", onSortChange);
    sortDirBtn.addEventListener("click", onSortDirToggle);

    // プレビュー閉じる
    document.getElementById("card-preview-close-btn").addEventListener("click", () => {
      previewModal.classList.remove("active");
    });
    previewModal.addEventListener("click", (e) => {
      if (e.target === previewModal) {
        previewModal.classList.remove("active");
      }
    });

    // スクロール監視
    const scrollContainer = document.getElementById("warehouse-card-scroll-container");
    scrollContainer.addEventListener("scroll", onScrollCheck);
  }

  // -------------------------------
  // モーダルを開く
  // -------------------------------
  function showWarehouseModal(mode = "menu", partyId = null, onAddCb = null) {
    ensureWarehouseModalExists();

    warehouseMode = mode;
    currentPartyIdForAdd = partyId;
    afterAddCallback = onAddCb || null;

    // 選択モード解除
    warehouseSelectionMode = false;
    document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
    clearSelectedCards();

    // タブ初期化 (デフォルトを「キャラクター」)
    currentTab = "キャラクター";

    // 全タブをアクティブリセットして、キャラクタータブのみ active
    const tabEls = warehouseModal.querySelectorAll(".warehouse-tab");
    tabEls.forEach(t => t.classList.remove("active"));
    const charTab = Array.from(tabEls).find(t => t.getAttribute("data-tab") === "キャラクター");
    if (charTab) charTab.classList.add("active");

    // モーダルを表示
    warehouseModal.classList.add("active");

    // ソートUIの初期状態をローカルストレージから読み込み＆反映
    applySortUIFromStorage(currentTab);

    // カード読み込み
    loadCardsByTab();
  }

  // -------------------------------
  // モーダルを閉じる
  // -------------------------------
  function closeWarehouseModal() {
    warehouseModal.classList.remove("active");
    previewModal.classList.remove("active");
    warehouseMode = "menu";
    currentPartyIdForAdd = null;
    afterAddCallback = null;
  }

  // -------------------------------
  // タブ別にカードをロードして表示
  // -------------------------------
  function loadCardsByTab() {
    const container = document.getElementById("warehouse-card-container");
    const scrollContainer = document.getElementById("warehouse-card-scroll-container");
    if (!container || !scrollContainer) return;

    // いったん不可視化してチラつき防止
    container.style.visibility = "hidden";

    // 既存リセット
    allWarehouseCards = (window.characterData || [])
      .filter(c => c.group === "Warehouse" && c.type === currentTab);
    loadedLineCount = 0;
    container.innerHTML = "";

    // ソート適用
    const config = getSortConfig(currentTab);
    applySort(allWarehouseCards, config.sortKey, config.sortDir);

    // 1行あたり枚数を計算
    cardsPerRow = calcCardsPerRow();

    // とりあえず1行分読み込み
    loadNextLines(LINES_PER_LOAD);

    // スクロールが出るまで繰り返し読み込み
    fillContainerIfNeeded(() => {
      container.style.visibility = "visible";
      container.style.opacity = "1";
    });
  }

  function fillContainerIfNeeded(callback) {
    const scrollContainer = document.getElementById("warehouse-card-scroll-container");
    if (!scrollContainer) {
      if (callback) callback();
      return;
    }
    let safeCounter = 0;
    while (
      scrollContainer.scrollHeight <= scrollContainer.clientHeight &&
      loadedLineCount * cardsPerRow < allWarehouseCards.length &&
      safeCounter < 50
    ) {
      loadNextLines(LINES_PER_LOAD);
      safeCounter++;
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
    const nextCards = allWarehouseCards.slice(displayedCount, displayedCount + newCount);

    nextCards.forEach(card => {
      const cardEl = createWarehouseCardElement(card);
      container.appendChild(cardEl);
    });

    loadedLineCount += lineCount;

    // 追加後にまだスクロールが出ないなら追加
    const scrollContainer = document.getElementById("warehouse-card-scroll-container");
    if (!scrollContainer) return;
    setTimeout(() => {
      const stillNoScroll = (scrollContainer.scrollHeight <= scrollContainer.clientHeight);
      const notAllLoaded = (loadedLineCount * cardsPerRow < allWarehouseCards.length);
      if (stillNoScroll && notAllLoaded) {
        loadNextLines(LINES_PER_LOAD);
      }
    }, 0);
  }

  function calcCardsPerRow() {
    const container = document.getElementById("warehouse-card-container");
    if (!container) return 1;
    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return 1;

    let cardW = 300;
    let gap = 20;
    let per = 1;
    for (let n = 1; n <= 50; n++) {
      const totalW = n * cardW + (n - 1) * gap;
      if (totalW <= containerWidth) {
        per = n;
      } else {
        break;
      }
    }
    return per;
  }

  // -------------------------------
  // カード生成 (倉庫表示用)
  // -------------------------------
  function createWarehouseCardElement(card) {
    const cardEl = document.createElement("div");
    cardEl.className = "card rarity" + (card.rarity || "").replace("★", "").trim();
    cardEl.setAttribute("data-id", card.id);

    if (card.flipped) {
      cardEl.classList.add("flipped");
    }

    cardEl.addEventListener("click", (e) => {
      if (warehouseSelectionMode) {
        e.stopPropagation();
        cardEl.classList.toggle("selected");
        updateSelectionButtonsVisibility();
      } else {
        // 裏返しか画像プレビュー
        if (cardEl.classList.contains("flipped")) {
          cardEl.classList.remove("flipped");
          card.flipped = false;
          saveFlippedState(card.id, false);
        } else {
          if (card.imageData) {
            openImagePreview(card.imageData);
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

    const bgStyle = (card.backgroundcss || "")
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
    if (bgStyle) {
      cardFront.style.backgroundImage = bgStyle;
    }

    // レアリティ光彩
    const rarityValue = (card.rarity || "").replace("★", "").trim();
    cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

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
      imageEl.alt = card.name || "";
      imageContainer.appendChild(imageEl);
    } else {
      // 画像生成ボタン
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
    nameEl.innerHTML = `<h3>${DOMPurify.sanitize(card.name || "")}</h3>`;
    infoContainer.appendChild(nameEl);

    if (card.state) {
      const stateEl = document.createElement("p");
      stateEl.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
      infoContainer.appendChild(stateEl);
    }
    if (card.special) {
      const specialEl = document.createElement("p");
      specialEl.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special)}`;
      infoContainer.appendChild(specialEl);
    }

    const captionEl = document.createElement("p");
    captionEl.innerHTML = `<span>${DOMPurify.sanitize(card.caption || "")}</span>`;
    infoContainer.appendChild(captionEl);

    cardFront.appendChild(infoContainer);

    // 裏面
    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type || "")}</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);

    return cardEl;
  }

  // 裏返し状態の保存
  async function saveFlippedState(cardId, flipped) {
    const idx = (window.characterData || []).findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData[idx].flipped = flipped;
      await saveCharacterDataToIndexedDB(window.characterData);
    }
  }

  // 画像プレビュー
  function openImagePreview(imageUrl) {
    if (!previewModal) return;
    const imgEl = document.getElementById("card-preview-img");
    if (!imgEl) return;
    imgEl.src = imageUrl;
    previewModal.classList.add("active");
  }

  // -------------------------------
  // 画像生成 (DALL-E API)
  // -------------------------------
  async function generateWarehouseImage(card, btnElement) {
    const apiKey = window.apiKey || localStorage.getItem("apiKey");
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }
    if (btnElement) btnElement.disabled = true;
    showToast("画像を生成しています...");

    const rarityNum = parseInt((card.rarity || "").replace("★", ""), 10) || 0;
    const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";
    const promptText =
      "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
      "Please do not include text in illustrations for any reason." +
      "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
      (card.imageprompt || "");

    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
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
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const base64 = data.data[0].b64_json;
      const dataUrl = "data:image/png;base64," + base64;

      // DB更新
      const idx = window.characterData.findIndex(c => c.id === card.id);
      if (idx !== -1) {
        window.characterData[idx].imageData = dataUrl;
        await saveCharacterDataToIndexedDB(window.characterData);
      }

      showToast("画像の生成が完了しました");
      reloadCurrentView();
    } catch (err) {
      console.error(err);
      showToast("画像生成に失敗しました:\n" + err.message);
    } finally {
      if (btnElement) btnElement.disabled = false;
    }
  }

  // -------------------------------
  // 選択モード
  // -------------------------------
  function toggleWarehouseSelectionMode() {
    warehouseSelectionMode = !warehouseSelectionMode;
    const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
    btn.textContent = warehouseSelectionMode ? "選択モード解除" : "選択モード";
    if (!warehouseSelectionMode) {
      clearSelectedCards();
    }
    updateSelectionButtonsVisibility();
  }

  function clearSelectedCards() {
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    selectedCards.forEach(card => card.classList.remove("selected"));
  }

  function updateSelectionButtonsVisibility() {
    if (!warehouseSelectionMode) {
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display = "none";
      return;
    }
    const selected = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (warehouseMode === "menu") {
      // メニューから来た場合のみ「削除」表示
      document.getElementById("delete-selected-warehouse-btn").style.display =
        (selected.length > 0) ? "inline-block" : "none";
      document.getElementById("add-to-party-btn").style.display = "none";
    } else {
      // パーティから来た場合のみ「パーティに入れる」表示
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display =
        (selected.length > 0) ? "inline-block" : "none";
    }
  }

  // -------------------------------
  // 倉庫カード削除 (menuモード)
  // -------------------------------
  async function deleteSelectedWarehouseCards() {
    if (warehouseMode !== "menu") return;
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (selectedCards.length === 0) {
      showToast("カードが選択されていません。");
      return;
    }
    if (!confirm("選択したカードを削除します。よろしいですか？")) {
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
    reloadCurrentView();
  }

  // -------------------------------
  // パーティに追加 (partyモード)
  // -------------------------------
  async function addSelectedCardsToParty() {
    if (warehouseMode !== "party") return;
    if (!currentPartyIdForAdd) {
      showToast("パーティIDがありません。");
      return;
    }
    const selectedCards = document.querySelectorAll("#warehouse-card-container .card.selected");
    if (selectedCards.length === 0) {
      showToast("カードが選択されていません。");
      return;
    }
    selectedCards.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const idx = window.characterData.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        window.characterData[idx].group = "Party";
        window.characterData[idx].role = "none";
        window.characterData[idx].partyId = currentPartyIdForAdd;
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);

    clearSelectedCards();
    reloadCurrentView();

    if (typeof afterAddCallback === "function") {
      afterAddCallback();
    }
    updateSelectionButtonsVisibility();
  }

  // -------------------------------
  // 再描画
  // -------------------------------
  function reloadCurrentView() {
    const container = document.getElementById("warehouse-card-container");
    if (container) container.innerHTML = "";
    loadedLineCount = 0;

    let all = (window.characterData || [])
      .filter(c => c.group === "Warehouse" && c.type === currentTab);

    const config = getSortConfig(currentTab);
    applySort(all, config.sortKey, config.sortDir);
    allWarehouseCards = all;

    loadNextLines(LINES_PER_LOAD);
  }

  // -------------------------------
  // ソートUIの操作ハンドラ
  // -------------------------------
  function onSortChange() {
    const sortKey = document.getElementById("warehouse-sort-dropdown").value;
    const { sortDir } = getSortConfig(currentTab);
    setSortConfig(currentTab, sortKey, sortDir);
    reloadCurrentView();
  }

  function onSortDirToggle() {
    const sortDirBtn = document.getElementById("warehouse-sort-direction-btn");
    const config = getSortConfig(currentTab);
    const newDir = (config.sortDir === "asc") ? "desc" : "asc";
    setSortConfig(currentTab, config.sortKey, newDir);
    sortDirBtn.innerHTML = (newDir === "asc") ? `<span class="iconmoon icon-sort-alpha-asc"></span>` : `<span class="iconmoon icon-sort-alpha-desc"></span>`;
    reloadCurrentView();
  }
  // タブ切り替え時やモーダルを開いたときに、UIの状態をローカルストレージから復元
  function applySortUIFromStorage(tabName) {
    const sortDropdown = document.getElementById("warehouse-sort-dropdown");
    const sortDirBtn = document.getElementById("warehouse-sort-direction-btn");
    if (!sortDropdown || !sortDirBtn) return;

    const config = getSortConfig(tabName);
    sortDropdown.value = config.sortKey;
//    sortDirBtn.textContent = (config.sortDir === "asc") ? "↑" : "↓";
    sortDirBtn.innerHTML = (config.sortDir === "asc") ? `<span class="iconmoon icon-sort-alpha-asc"></span>` : `<span class="iconmoon icon-sort-alpha-desc"></span>`;
  }

  // -------------------------------
  // グローバル公開
  // -------------------------------
  window.showWarehouseModal = showWarehouseModal;
})();
