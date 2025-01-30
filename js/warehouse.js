// js/warehouse.js
// タブ切り替え時にHTMLを再生成せず、タブごとにscrollTopを保存して復元する。
// さらに「スクロール不要なら自動で行を追加」や「選択モード」「削除/パーティ追加」機能をまとめた完全版。

(() => {
  let warehouseModal = null;
  let previewModal = null;

  let warehouseMode = "menu";         // "menu" or "party"
  let currentPartyIdForAdd = null;    // partyId (mode==="party" 時)
  let afterAddCallback = null;        // パーティ追加完了後のコールバック

  let warehouseSelectionMode = false; // 倉庫選択モード

  // タブ: 「キャラクター」「アイテム」「モンスター」
  const TABS = ["キャラクター", "アイテム", "モンスター"];

  // タブごとに「初回ロード済みフラグ」「scrollTop」「行読み込み数」などを保持
  // 例: tabStates["キャラクター"] = { loadedLineCount:0, isLoaded:false, scrollTop:0, allCards: [...], containerEl:... }
  const tabStates = {};
  TABS.forEach(tabName => {
    tabStates[tabName] = {
      isLoaded: false,
      scrollTop: 0,
      loadedLineCount: 0,
      allCards: [],
      containerEl: null
    };
  });

  let currentTab = "キャラクター"; // 現在アクティブなタブ
  let cardsPerRow = 1;             // 1行あたりのカード数
  const LINES_PER_LOAD = 2;        // 一度に読み込む行数

  // -------------------------------------------------------
  // 1) モーダルHTMLを動的に挿入 (初回のみ)
  // -------------------------------------------------------
  function ensureWarehouseModalExists() {
    if (document.getElementById("warehouse-modal")) {
      warehouseModal = document.getElementById("warehouse-modal");
      previewModal   = document.getElementById("card-image-preview-modal");
      // タブごとのコンテナを取得
      tabStates["キャラクター"].containerEl = document.getElementById("warehouse-tab-content-キャラクター");
      tabStates["アイテム"].containerEl      = document.getElementById("warehouse-tab-content-アイテム");
      tabStates["モンスター"].containerEl    = document.getElementById("warehouse-tab-content-モンスター");
      return;
    }

    // まだ無い場合は body にHTMLを追加
    const modalHTML = `
<div id="warehouse-modal" class="modal">
  <button id="close-warehouse-btn" style="position:fixed; right:0; top:0;">閉じる</button>
  <div class="modal-content">
    <h2>倉庫</h2>
    <div class="manipulate-panel" style="margin-bottom:10px;">
      <div class="button-container" style="display:inline-flex; gap:10px;">
        <button id="toggle-warehouse-selection-mode-btn">選択モード</button>
        <button id="delete-selected-warehouse-btn" style="display:none;">選択したカードを削除</button>
        <button id="add-to-party-btn" style="display:none;">パーティに入れる</button>
      </div>
      <div class="warehouse-tab-container" style="overflow-x:auto; white-space:nowrap; margin-top:6px;">
        <div class="warehouse-tabs" style="display:inline-flex; gap:10px;">
          <div class="warehouse-tab" data-tab="キャラクター" style="padding:6px 12px; background-color:#444; border-radius:4px; cursor:pointer;">キャラクター</div>
          <div class="warehouse-tab" data-tab="アイテム" style="padding:6px 12px; background-color:#444; border-radius:4px; cursor:pointer;">アイテム</div>
          <div class="warehouse-tab" data-tab="モンスター" style="padding:6px 12px; background-color:#444; border-radius:4px; cursor:pointer;">モンスター</div>
        </div>
      </div>
    </div>

    <div id="warehouse-card-scroll-container" style="max-height:70vh; overflow-y:auto; width:100%;">
      <!-- タブごとにdivを用意。切り替え時にdisplayを none / flex する -->
      <div id="warehouse-tab-content-キャラクター" style="display:none; flex-wrap:wrap; gap:20px;justify-content: center;"></div>
      <div id="warehouse-tab-content-アイテム" style="display:none; flex-wrap:wrap; gap:20px;justify-content: center;"></div>
      <div id="warehouse-tab-content-モンスター" style="display:none; flex-wrap:wrap; gap:20px;justify-content: center;"></div>
    </div>
  </div>
</div>

<!-- プレビュー用モーダル -->
<div id="card-image-preview-modal" class="modal">
  <div class="modal-content">
    <img id="card-preview-img" src="" alt="card preview" style="max-width:95vw; max-height:95vh;" />
    <button id="card-preview-close-btn" style="margin-top:10px;">閉じる</button>
  </div>
</div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    warehouseModal = document.getElementById("warehouse-modal");
    previewModal   = document.getElementById("card-image-preview-modal");

    // タブごとにコンテナを取得
    tabStates["キャラクター"].containerEl = document.getElementById("warehouse-tab-content-キャラクター");
    tabStates["アイテム"].containerEl      = document.getElementById("warehouse-tab-content-アイテム");
    tabStates["モンスター"].containerEl    = document.getElementById("warehouse-tab-content-モンスター");

    // 閉じるボタン
    document.getElementById("close-warehouse-btn").addEventListener("click", closeWarehouseModal);

    // 選択モードボタン
    document.getElementById("toggle-warehouse-selection-mode-btn")
      .addEventListener("click", toggleWarehouseSelectionMode);

    // 削除
    document.getElementById("delete-selected-warehouse-btn")
      .addEventListener("click", deleteSelectedWarehouseCards);

    // パーティ追加
    document.getElementById("add-to-party-btn")
      .addEventListener("click", addSelectedCardsToParty);

    // タブ切り替えイベント
    const tabs = warehouseModal.querySelectorAll(".warehouse-tab");
    tabs.forEach(tabEl => {
      tabEl.addEventListener("click", () => {
        // タブ切り替え前に → 現タブの scrollTop を保存
        saveCurrentTabScroll();

        // 全タブの背景色をリセット
        tabs.forEach(t => t.style.backgroundColor = "#444");
        tabEl.style.backgroundColor = "#666";

        // 新タブに切り替え
        const newTab = tabEl.getAttribute("data-tab");
        switchTab(newTab);
      });
    });
    // 初期タブ強調
    tabs[0].style.backgroundColor = "#666";

    // プレビュー閉じる
    document.getElementById("card-preview-close-btn").addEventListener("click", () => {
      previewModal.classList.remove("active");
    });
    previewModal.addEventListener("click", e => {
      if (e.target === previewModal) {
        previewModal.classList.remove("active");
      }
    });

    // スクロール時: 下端付近なら行追加
    const scrollContainer = document.getElementById("warehouse-card-scroll-container");
    scrollContainer.addEventListener("scroll", onScrollCheck);
  }

  // -------------------------------------------------------
  // 2) モーダルを開く
  // -------------------------------------------------------
  function showWarehouseModal(mode = "menu", partyId = null, onAddCb = null) {
    ensureWarehouseModalExists();

    warehouseMode = mode;
    currentPartyIdForAdd = partyId;
    afterAddCallback = onAddCb || null;

    // 選択モードOFF
    warehouseSelectionMode = false;
    document.getElementById("toggle-warehouse-selection-mode-btn").textContent = "選択モード";
    updateSelectionButtonsVisibility();

    // もしボタンの表示を切り替えたいなら↓をアンコメント
    /*
    if (mode === "menu") {
      document.getElementById("delete-selected-warehouse-btn").style.display = "inline-block";
      document.getElementById("add-to-party-btn").style.display = "none";
    } else {
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display = "inline-block";
    }
    */

    // モーダルON
    warehouseModal.classList.add("active");
    previewModal.classList.remove("active");

    // タブ初期化: 「キャラクター」をアクティブ
    currentTab = "キャラクター";
    const tabs = warehouseModal.querySelectorAll(".warehouse-tab");
    tabs.forEach(t => {
      t.style.backgroundColor = (t.getAttribute("data-tab") === currentTab) ? "#666" : "#444";
    });

    // 既存の scrollContainer を先頭に
    //   (あるタブに深くスクロールしていた場合、まずは0にしてもいい or そのまま維持してもいい)
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (scrollC) scrollC.scrollTop = tabStates["キャラクター"].scrollTop || 0;

    // 全タブ非表示
    hideAllTabs();
    // キャラクタータブだけ表示
    tabStates["キャラクター"].containerEl.style.display = "flex";

    // 初回ならロード
    if (!tabStates["キャラクター"].isLoaded) {
      loadTabContent("キャラクター");
    }
  }

  // -------------------------------------------------------
  // 3) モーダルを閉じる
  // -------------------------------------------------------
  function closeWarehouseModal() {
    // 閉じる前に現在タブの scrollTop 保存
    saveCurrentTabScroll();

    warehouseModal.classList.remove("active");
    previewModal.classList.remove("active");
    warehouseMode = "menu";
    currentPartyIdForAdd = null;
    afterAddCallback = null;
  }

  // -------------------------------------------------------
  // 4) タブ切り替え (HTML再生成しない)
  // -------------------------------------------------------
  function switchTab(newTab) {
    // 1) いまのタブを非表示
    hideAllTabs();

    // 2) currentTab を更新
    currentTab = newTab;

    // 3) もし未ロードならロード
    if (!tabStates[currentTab].isLoaded) {
      loadTabContent(currentTab);
    }

    // 4) タブを表示
    tabStates[currentTab].containerEl.style.display = "flex";

    // 5) scrollTop を復元
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (scrollC) {
      scrollC.scrollTop = tabStates[currentTab].scrollTop || 0;
    }
  }

  // -------------------------------------------------------
  // 現タブの scrollTop を保存
  // -------------------------------------------------------
  function saveCurrentTabScroll() {
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (!scrollC) return;
    tabStates[currentTab].scrollTop = scrollC.scrollTop;
  }

  // -------------------------------------------------------
  // 全タブを非表示
  // -------------------------------------------------------
  function hideAllTabs() {
    TABS.forEach(tName => {
      const st = tabStates[tName];
      if (st.containerEl) {
        st.containerEl.style.display = "none";
      }
    });
  }

  // -------------------------------------------------------
  // 5) タブ初回ロード（スクロール不要なら行自動追加）
  // -------------------------------------------------------
  function loadTabContent(tabName) {
    const st = tabStates[tabName];
    if (!st) return;

    // いまの characterData から group==="Warehouse" && type===tabName のカード抽出
    st.allCards = (window.characterData || []).filter(c =>
      c.group === "Warehouse" && c.type === tabName
    );
    st.loadedLineCount = 0;
    st.containerEl.innerHTML = ""; // 初回のみ

    // 1行あたりの枚数
    cardsPerRow = calcCardsPerRow(st.containerEl);

    // 先頭数行を読み込む
    loadNextLines(tabName, LINES_PER_LOAD);

    // スクロールバーが出るまでさらに読み込む
    fillContainerIfNeeded(tabName);

    st.isLoaded = true; // 初回ロード済みフラグ
  }

  // -------------------------------------------------------
  // 6) スクロール下端付近
  // -------------------------------------------------------
  function onScrollCheck() {
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (!scrollC) return;
    // 下端50px以内
    const threshold = 50;
    if (scrollC.scrollTop + scrollC.clientHeight + threshold >= scrollC.scrollHeight) {
      // 行追加
      loadNextLines(currentTab, 2);
    }
  }

  // -------------------------------------------------------
  // 7) 行追加読み込み
  // -------------------------------------------------------
  function loadNextLines(tabName, lineCount) {
    const st = tabStates[tabName];
    if (!st || !st.containerEl) return;

    const displayedCount = st.loadedLineCount * cardsPerRow;
    const newCount = lineCount * cardsPerRow;
    const nextCards = st.allCards.slice(displayedCount, displayedCount + newCount);

    nextCards.forEach(card => {
      const cardEl = createWarehouseCardElement(card);
      st.containerEl.appendChild(cardEl);
    });

    st.loadedLineCount += lineCount;

    // 追加後にスクロール不要ならさらに読み込む
    setTimeout(() => {
      fillContainerIfNeeded(tabName);
    }, 0);
  }

  // -------------------------------------------------------
  // 8) スクロールが不要 & カードが残っている → 自動追加
  // -------------------------------------------------------
  function fillContainerIfNeeded(tabName) {
    const st = tabStates[tabName];
    if (!st) return;
    const scrollC = document.getElementById("warehouse-card-scroll-container");
    if (!scrollC) return;

    let safety = 0;
    while (
      scrollC.scrollHeight <= scrollC.clientHeight &&
      (st.loadedLineCount * cardsPerRow < st.allCards.length) &&
      safety < 50
    ) {
      loadNextLines(tabName, LINES_PER_LOAD);
      safety++;
    }
  }

  // -------------------------------------------------------
  // 9) 1行あたり何枚か
  // -------------------------------------------------------
  function calcCardsPerRow(containerEl) {
    if (!containerEl) return 1;
    const cwidth = containerEl.clientWidth;
    if (cwidth <= 0) return 1;

    let cardW = 300;
    let gap = 20;
    let per = 1;
    for (let i = 1; i <= 50; i++) {
      const total = i * cardW + (i - 1) * gap;
      if (total <= cwidth) {
        per = i;
      } else {
        break;
      }
    }
    return per;
  }

  // -------------------------------------------------------
  // 10) カード生成
  // -------------------------------------------------------
  function createWarehouseCardElement(card) {
    const cardEl = document.createElement("div");
    cardEl.className = "card rarity" + (card.rarity || "").replace("★", "").trim();
    cardEl.setAttribute("data-id", card.id);

    if (card.flipped) {
      cardEl.classList.add("flipped");
    }

    cardEl.addEventListener("click", e => {
      if (warehouseSelectionMode) {
        e.stopPropagation();
        cardEl.classList.toggle("selected");
        updateSelectionButtonsVisibility();
      } else {
        if (cardEl.classList.contains("flipped")) {
          // 裏面→表面
          cardEl.classList.remove("flipped");
          card.flipped = false;
          saveFlippedState(card.id, false);
        } else {
          // 画像プレビュー
          if (card.imageData) {
            openImagePreview(card.imageData);
          } else {
            alert("画像がありません。");
          }
        }
      }
    });

    const cardInner = document.createElement("div");
    cardInner.className = "card-inner";

    // 表
    const cardFront = document.createElement("div");
    cardFront.className = "card-front";

    const bgStyle = (card.backgroundcss || "")
      .replace("background-image:", "")
      .replace("background", "")
      .trim();
    if (bgStyle) {
      cardFront.style.backgroundImage = bgStyle;
    }

    const rv = (card.rarity || "").replace("★", "").trim();
    cardFront.innerHTML = `<div class='bezel rarity${rv}'></div>`;

    // タイプ
    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = card.type || "不明";
    cardFront.appendChild(typeEl);

    // 画像領域
    const imgC = document.createElement("div");
    imgC.className = "card-image";
    if (card.imageData) {
      const im = document.createElement("img");
      im.src = card.imageData;
      im.alt = card.name || "";
      imgC.appendChild(im);
    } else {
      // 画像生成ボタン
      const genBtn = document.createElement("button");
      genBtn.className = "gen-image-btn";
      genBtn.textContent = "画像生成";
      genBtn.addEventListener("click", ev => {
        ev.stopPropagation();
        generateWarehouseImage(card, genBtn);
      });
      imgC.appendChild(genBtn);
    }
    cardFront.appendChild(imgC);

    // カード情報
    const info = document.createElement("div");
    info.className = "card-info";

    const nameP = document.createElement("p");
    nameP.innerHTML = `<h3>${DOMPurify.sanitize(card.name || "")}</h3>`;
    info.appendChild(nameP);

    if (card.state) {
      const stateP = document.createElement("p");
      stateP.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
      info.appendChild(stateP);
    }
    const spP = document.createElement("p");
    spP.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special || "")}`;
    info.appendChild(spP);

    const capP = document.createElement("p");
    capP.innerHTML = `<span>${DOMPurify.sanitize(card.caption || "")}</span>`;
    info.appendChild(capP);

    cardFront.appendChild(info);

    // 裏
    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type || "")}</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);

    return cardEl;
  }

  async function saveFlippedState(cardId, flipped) {
    const idx = (window.characterData || []).findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData[idx].flipped = flipped;
      await saveCharacterDataToIndexedDB(window.characterData);
    }
  }

  function openImagePreview(imageUrl) {
    if (!previewModal) return;
    const imgEl = document.getElementById("card-preview-img");
    if (!imgEl) return;
    imgEl.src = imageUrl;
    previewModal.classList.add("active");
  }

  // 画像生成（menu仕様優先）
  async function generateWarehouseImage(card, btnEl) {
    const apiKey = window.apiKey || localStorage.getItem("apiKey");
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }
    if (btnEl) btnEl.disabled = true;

    alert("画像を生成しています...");
    const rarityNum = parseInt((card.rarity || "").replace("★", "").trim()) || 0;
    const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";

    const promptText =
      "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
      "Please do not include text in illustrations for any reason." +
      "If you can do that, I'll give you a super high tip." +
      "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
      (card.imageprompt || "");

    try {
      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: promptText,
          n: 1,
          size: size,
          response_format: "b64_json",
        }),
      });
      const data = await resp.json();
      if (data.error) {
        throw new Error(data.error.message);
      }

      const base64 = data.data[0].b64_json;
      const dataUrl = "data:image/png;base64," + base64;

      const idx = (window.characterData || []).findIndex(c => c.id === card.id);
      if (idx !== -1) {
        window.characterData[idx].imageData = dataUrl;
        await saveCharacterDataToIndexedDB(window.characterData);
      }
      alert("画像の生成が完了しました");
      // 再描画しなくてもよいが、最新を反映したいなら
      loadTabContent(currentTab);
    } catch (err) {
      console.error("画像生成失敗:", err);
      alert("画像生成に失敗しました:\n" + err.message);
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  // -------------------------------------------------------
  // 11) 選択モード (パーティ追加/削除用)
  // -------------------------------------------------------
  function toggleWarehouseSelectionMode() {
    warehouseSelectionMode = !warehouseSelectionMode;
    const btn = document.getElementById("toggle-warehouse-selection-mode-btn");
    if (warehouseSelectionMode) {
      btn.textContent = "選択モード解除";
    } else {
      btn.textContent = "選択モード";
      clearSelectedCards();
    }
    updateSelectionButtonsVisibility();
  }

  function clearSelectedCards() {
    const st = tabStates[currentTab];
    if (!st || !st.containerEl) return;
    const selectedEls = st.containerEl.querySelectorAll(".card.selected");
    selectedEls.forEach(el => el.classList.remove("selected"));
  }

  function updateSelectionButtonsVisibility() {
    if (!warehouseSelectionMode) {
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display = "none";
      return;
    }
    const st = tabStates[currentTab];
    if (!st || !st.containerEl) return;
    const sel = st.containerEl.querySelectorAll(".card.selected");
    if (sel.length === 0) {
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display = "none";
      return;
    }
    if (warehouseMode === "menu") {
      document.getElementById("delete-selected-warehouse-btn").style.display = "inline-block";
      document.getElementById("add-to-party-btn").style.display = "none";
    } else {
      document.getElementById("delete-selected-warehouse-btn").style.display = "none";
      document.getElementById("add-to-party-btn").style.display = "inline-block";
    }
  }

  // -------------------------------------------------------
  // 12) 削除 (menuモード)
  // -------------------------------------------------------
  async function deleteSelectedWarehouseCards() {
    if (warehouseMode !== "menu") return;
    const st = tabStates[currentTab];
    if (!st || !st.containerEl) return;

    const selectedEls = st.containerEl.querySelectorAll(".card.selected");
    if (selectedEls.length === 0) {
      alert("カードが選択されていません。");
      return;
    }
    if (!confirm("選択したカードを削除します。よろしいですか？")) {
      return;
    }

    selectedEls.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const idx = (window.characterData || []).findIndex(c => c.id === cardId);
      if (idx !== -1) {
        window.characterData.splice(idx, 1);
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);

    // 再ロード
    loadTabContent(currentTab);
  }

  // -------------------------------------------------------
  // 13) パーティに追加 (partyモード)
  // -------------------------------------------------------
  async function addSelectedCardsToParty() {
    if (warehouseMode !== "party") return;
    if (!currentPartyIdForAdd) {
      alert("パーティIDがありません。");
      return;
    }
    const st = tabStates[currentTab];
    if (!st || !st.containerEl) return;

    const selectedEls = st.containerEl.querySelectorAll(".card.selected");
    if (selectedEls.length === 0) {
      alert("カードが選択されていません。");
      return;
    }
    selectedEls.forEach(el => {
      const cardId = el.getAttribute("data-id");
      const idx = (window.characterData || []).findIndex(c => c.id === cardId);
      if (idx !== -1) {
        window.characterData[idx].group = "Party";
        window.characterData[idx].role = "none";
        window.characterData[idx].partyId = currentPartyIdForAdd;
      }
    });
    await saveCharacterDataToIndexedDB(window.characterData);

    clearSelectedCards();
    loadTabContent(currentTab);

    if (typeof afterAddCallback === "function") {
      afterAddCallback();
    }
    updateSelectionButtonsVisibility();
  }

  // -------------------------------------------------------
  // グローバル公開
  // -------------------------------------------------------
  window.showWarehouseModal = showWarehouseModal;
})();
