/****************************************
 * bookshelfPage.js (multiModal対応版)
 * 表紙クリック → ドロップダウンメニューを開閉
 * スクロールや画面外クリックで閉じる
 * ドラッグ・アンド・ドロップで並べ替え
 ****************************************/

let scenarioToDelete = null;
let scenarioToCopy = null;
let scenarioToEdit = null;

/** 現在表示中のドロップダウンがどのシナリオに紐づくか */
let currentDropdownScenarioId = null;
/** ドロップダウンを配置するコンテナ（body直下の #dropdown-portal）。 */
let dropdownPortalEl = null;

/**
 * 初期化
 */
async function initBookshelfPage() {
  const backBtn = document.getElementById("back-to-menu");
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // ドロップダウン用ポータルを取得
  dropdownPortalEl = document.getElementById("dropdown-portal");

  // 画面の空白orスクロールでドロップダウンを閉じる
  document.addEventListener("click", () => {
    closeDropdownPortal();
  });
  const scrollArea = document.getElementById("bookshelf-scroll-area");
  if (scrollArea) {
    scrollArea.addEventListener("scroll", () => {
      closeDropdownPortal();
    });
  }

  // シナリオ一覧を取得
  let allScenarios = [];
  try {
    allScenarios = await listAllScenarios();
  } catch (err) {
    console.error("シナリオ一覧の取得失敗:", err);
    return;
  }

  // useCoverImage未定義ならtrueをセット
  for (const sc of allScenarios) {
    if (typeof sc.useCoverImage === "undefined") {
      sc.useCoverImage = true;
    }
  }

  // 本棚だけ抽出 + ソート
  const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag);
  shelfScenarios.sort((a, b) => {
    const orderA = (typeof a.shelfOrder === "number") ? a.shelfOrder : Infinity;
    const orderB = (typeof b.shelfOrder === "number") ? b.shelfOrder : Infinity;
    if (orderA > orderB) return -1;
    if (orderA < orderB) return 1;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  // 背表紙とリストを描画
  renderBooksOnShelf(shelfScenarios);
  renderBookshelfList(shelfScenarios);

  // アコーディオン初期化
  initBookshelfListAccordion();
}

/**
 * 再描画
 */
async function refreshBookshelfView() {
  try {
    const allScenarios = await listAllScenarios();
    for (const sc of allScenarios) {
      if (typeof sc.useCoverImage === "undefined") {
        sc.useCoverImage = true;
      }
    }
    const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag);
    shelfScenarios.sort((a, b) => {
      const orderA = (typeof a.shelfOrder === "number") ? a.shelfOrder : Infinity;
      const orderB = (typeof b.shelfOrder === "number") ? b.shelfOrder : Infinity;
      if (orderA > orderB) return -1;
      if (orderA < orderB) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    renderBooksOnShelf(shelfScenarios);
    renderBookshelfList(shelfScenarios);
  } catch (err) {
    console.error("Error refreshing the bookshelf view:", err);
  }
}

/**
 * 本棚(横スクロール) の描画
 * - 表紙をクリックするとドロップダウンポータルを開閉
 */
async function renderBooksOnShelf(scenarios) {
  const shelfContainer = document.getElementById("bookshelf-container");
  shelfContainer.innerHTML = "";

  const bookLeftMargin = 0;

  for (const scenario of scenarios) {
    // シーンを取得
    const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
    const actionCount = entries.filter(e => e.type === "action").length;
    const spineWidth = 30 + actionCount; // 背表紙の幅

    const shortTitle = scenario.title?.substring(0, 15) || "●●●";
    const images = entries.filter(e => e.type === "image");
    const coverImage = images.length > 0 ? images[images.length - 1] : null;

    // 3Dラッパ
    const wrapper = document.createElement("div");
    wrapper.classList.add("book-wrapper");
    wrapper.setAttribute("data-scenario-id", scenario.scenarioId);

    // DnD属性
    wrapper.setAttribute("draggable", "true");
    wrapper.addEventListener("dragstart", handleDragStart);
    wrapper.addEventListener("dragover", handleDragOver);
    wrapper.addEventListener("drop", handleDrop);
    wrapper.addEventListener("dragend", handleDragEnd);
    wrapper.addEventListener("dragenter", handleDragEnter);
    wrapper.addEventListener("dragleave", handleDragLeave);

    // 表紙or背表紙
    if (scenario.bookFacingFront) {
      wrapper.classList.add("facing-front");
      wrapper.style.paddingRight = (170 - spineWidth) + "px";
      setTimeout(() => {
        wrapper.style.zIndex = 1000;
        if (wrapper.classList.contains("facing-front")) {
          const bf = wrapper.querySelector(".book-front");
          bf.style.transform = `rotateY(90deg) translateZ(-${spineWidth}px)`;
          bf.style.transformOrigin = `0 ${spineWidth}px`;
        }
        const spacing = scenario.coverSpacing ?? 5;
        wrapper.style.marginLeft = (bookLeftMargin + spacing) + "px";
        wrapper.style.marginRight = (bookLeftMargin + spacing) + "px";

      }, 500);
    } else {
      // spacing
      const spacing = scenario.coverSpacing ?? 5;
      wrapper.style.marginLeft = (bookLeftMargin + spacing) + "px";
      wrapper.style.marginRight = (bookLeftMargin + spacing) + "px";
    }

    const inner = document.createElement("div");
    inner.classList.add("book-inner");
    wrapper.appendChild(inner);

    // ===== 背表紙 (.book) =====
    const bookSpine = document.createElement("div");
    bookSpine.className = "book";
    bookSpine.style.display = "inline-flex";
    bookSpine.style.verticalAlign = "bottom";
    bookSpine.style.height = "200px";
    bookSpine.style.width = spineWidth + "px";
    bookSpine.style.minWidth = "30px";
    bookSpine.style.margin = "0";
    bookSpine.style.position = "relative";
    bookSpine.style.cursor = "pointer";
    if (spineWidth > 110) {
      bookSpine.style.paddingLeft = "10%";
      bookSpine.style.justifyContent = "left";
    } else {
      bookSpine.style.justifyContent = "center";
    }
    bookSpine.style.alignItems = "left";
    bookSpine.style.boxShadow = "inset 0 0 5px rgb(0, 0, 0)";
    bookSpine.style.borderRadius = "2px";
    bookSpine.style.paddingTop = "7px";
    bookSpine.style.paddingBottom = "4px";
    bookSpine.style.boxSizing = "border-box";
    

    // 装丁色
    const c1 = scenario.coverColor1 || "#004755";
    const c2 = scenario.coverColor2 || "#00d0ff";
    if (scenario.useCoverImage && coverImage) {
      bookSpine.style.backgroundImage = `url(${coverImage.dataUrl})`;
      bookSpine.style.backgroundSize = "cover";
      bookSpine.style.backgroundPosition = "center";
      bookSpine.style.backgroundBlendMode = "multiply";
    } else {
      bookSpine.style.backgroundImage = `linear-gradient(45deg, ${c1}, ${c2})`;
    }

    const titleEl = document.createElement("div");
    titleEl.textContent = shortTitle;
    titleEl.style.position = "relative";
    titleEl.style.boxSizing = "border-box";
    titleEl.style.color = "rgb(255 255 255 / 90%)";
    titleEl.style.fontSize = "0.75rem";
    titleEl.style.writingMode = "vertical-rl";
    titleEl.style.textOrientation = "upright";
    titleEl.style.backgroundColor = "#00000080";
    titleEl.style.padding = "5px";
    titleEl.style.overflow = "hidden";
    titleEl.style.textOverflow = "ellipsis";
    bookSpine.appendChild(titleEl);

    // 背表紙クリック → 表紙を開く
    bookSpine.addEventListener("click", async () => {
      focusBookshelfListItem(scenario.scenarioId);
      scenario.bookFacingFront = true;
      const noUpdateDateTimeFlag = true;
      await updateScenario(scenario, noUpdateDateTimeFlag);

      wrapper.classList.add("facing-front");
      wrapper.style.paddingRight = (170 - spineWidth - bookLeftMargin + bookLeftMargin) + "px";
      const spacing = scenario.coverSpacing ?? 0;
      wrapper.style.marginLeft = (bookLeftMargin + spacing) + "px";
      wrapper.style.marginRight = (bookLeftMargin + spacing) + "px";
      setTimeout(() => {
        if (wrapper.classList.contains("facing-front")) {
          const bf = wrapper.querySelector(".book-front");
          bf.style.transform = `rotateY(90deg) translateZ(-${spineWidth}px)`;
          bf.style.transformOrigin = `0 ${spineWidth}px`;
        }
      }, 500);
      wrapper.style.zIndex = 1000;
    });

    // ===== 表紙 (.book-front) =====
    const bookFront = document.createElement("div");
    bookFront.classList.add("book-front");
    bookFront.style.left = spineWidth + "px";
    bookFront.style.transformOrigin = `0 ${spineWidth}px`;
    bookFront.style.borderRadius = "0 4px 4px 0";

    if (scenario.useCoverImage && coverImage) {
      // 表紙
      const frontImg = document.createElement("img");
      frontImg.src = coverImage.dataUrl;
      frontImg.style.borderRadius = "0 4px 4px 0";
      bookFront.appendChild(frontImg);
    } else {
      // グラデーション
      bookFront.style.backgroundImage = `linear-gradient(45deg, ${c1}, ${c2})`;
    }

    const frontTitle = document.createElement("div");
    frontTitle.classList.add("book-front-title");
    frontTitle.textContent = scenario.title || "(無題)";
    bookFront.appendChild(frontTitle);

    // 表紙クリック → ドロップダウンメニュー
    bookFront.addEventListener("click", (evt) => {
      evt.stopPropagation();
      if (currentDropdownScenarioId === scenario.scenarioId) {
        closeDropdownPortal();
      } else {
        openDropdownPortal(scenario, bookFront);
      }
      focusBookshelfListItem(scenario.scenarioId);
    });

    inner.appendChild(bookSpine);
    inner.appendChild(bookFront);
    shelfContainer.appendChild(wrapper);
  }
}

/**
 * ドロップダウンメニューを表示 (multiModalではなくDOM要素ポータルで実装)
 */
function openDropdownPortal(scenario, frontEl) {
  if (!dropdownPortalEl) return;
  if (currentDropdownScenarioId && currentDropdownScenarioId !== scenario.scenarioId) {
    closeDropdownPortal();
  }
  currentDropdownScenarioId = scenario.scenarioId;

  const rect = frontEl.getBoundingClientRect();
  const topPos = window.scrollY + rect.bottom;
  const leftPos = window.scrollX + rect.left;
  dropdownPortalEl.style.top = `${topPos}px`;
  dropdownPortalEl.style.left = `${leftPos}px`;
  dropdownPortalEl.innerHTML = "";

  // 1) 縦置きにする
  const itemVertical = document.createElement("button");
  itemVertical.textContent = "縦置きにする";
  itemVertical.addEventListener("click", async (e) => {
    e.stopPropagation();
    scenario.bookFacingFront = false;
    await updateScenario(scenario, true);

    const wrapper = document.querySelector(`.book-wrapper[data-scenario-id="${scenario.scenarioId}"]`);
    if (wrapper) {
      wrapper.classList.remove("facing-front");
      const front = wrapper.querySelector(".book-front");
      if (front) {
        front.style.transform = `rotateY(90deg)`;
      }
      wrapper.style.paddingRight = "0";
      wrapper.style.zIndex = 0;
    }
    closeDropdownPortal();
  });
  dropdownPortalEl.appendChild(itemVertical);

  // 2) デザインを編集する
  const itemEdit = document.createElement("button");
  itemEdit.textContent = "編集する";
  itemEdit.addEventListener("click", async (e) => {
    e.stopPropagation();
    openEditScenarioModal(scenario.scenarioId);
  });
  dropdownPortalEl.appendChild(itemEdit);

  // 3) 読む
  const itemRead = document.createElement("button");
  itemRead.textContent = "読む";
  itemRead.addEventListener("click", async (e) => {
    e.stopPropagation();
    scenario.hideFromHistoryFlag = false;
    await updateScenario(scenario);
    window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
  });
  dropdownPortalEl.appendChild(itemRead);

  dropdownPortalEl.classList.add("open");
}

/**
 * ドロップダウンを閉じる
 */
function closeDropdownPortal() {
  if (!dropdownPortalEl) return;
  dropdownPortalEl.classList.remove("open");
  dropdownPortalEl.innerHTML = "";
  currentDropdownScenarioId = null;
}

/* =========================================
   リスト表示
========================================= */
function renderBookshelfList(scenarios) {
  const listContainer = document.getElementById("bookshelf-list-container");
  listContainer.innerHTML = "";

  if (!scenarios || scenarios.length === 0) {
    listContainer.textContent = "本棚は空です。";
    return;
  }

  for (const sc of scenarios) {
    const div = document.createElement("div");
    div.className = "scenario-list";
    div.style.padding = "20px 10px";
    div.style.transition = "background-color 0.3s";
    div.setAttribute("data-scenario-id", sc.scenarioId);

    const infoDiv = document.createElement("div");
    infoDiv.className = "info";
    infoDiv.textContent = `ID:${sc.scenarioId} / ${sc.title} (更新:${sc.updatedAt})`;
    div.appendChild(infoDiv);

    const buttonsDiv = document.createElement("div");
    buttonsDiv.className = "buttons";

    // ダウンロード
    const btnShare = document.createElement("button");
    btnShare.textContent = "ダウンロード";
    btnShare.className = "left-button";
    btnShare.addEventListener("click", () => {
      onOpenDownloadConfirm(sc);
    });
    buttonsDiv.appendChild(btnShare);

    // 読む
    const btnContinue = document.createElement("button");
    btnContinue.textContent = "読む";
    btnContinue.addEventListener("click", async () => {
      sc.hideFromHistoryFlag = false;
      await updateScenario(sc);
      window.location.href = `scenario.html?scenarioId=${sc.scenarioId}`;
    });
    buttonsDiv.appendChild(btnContinue);

    // コピー
    const btnCopy = document.createElement("button");
    btnCopy.textContent = "コピーする";
    btnCopy.addEventListener("click", () => {
      onConfirmCopyScenario(sc);
    });
    buttonsDiv.appendChild(btnCopy);

    // 編集
    const btnEdit = document.createElement("button");
    btnEdit.textContent = "編集";
    btnEdit.addEventListener("click", () => {
      openEditScenarioModal(sc.scenarioId);
    });
    buttonsDiv.appendChild(btnEdit);

    // 削除
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "削除";
    btnDelete.style.backgroundColor = "rgb(244, 67, 54)";
    btnDelete.addEventListener("click", () => {
      onConfirmDeleteScenario(sc);
    });
    buttonsDiv.appendChild(btnDelete);

    div.appendChild(buttonsDiv);
    listContainer.appendChild(div);
  }
}

/** リストをハイライトし、スクロールして見せる */
function focusBookshelfListItem(scenarioId) {
  const listContainer = document.getElementById("bookshelf-list-container");
  listContainer.querySelectorAll(".scenario-list.selected").forEach(el => {
    el.classList.remove("selected");
  });
  const item = listContainer.querySelector(`[data-scenario-id="${scenarioId}"]`);
  if (item) {
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.classList.add("selected");
    item.style.backgroundColor = "#444";
    setTimeout(() => {
      item.style.backgroundColor = "";
    }, 1500);
  }
}

/* =========================================
   multiModalで削除確認
========================================= */
function onConfirmDeleteScenario(scenario) {
  multiModal.open({
    title: "シナリオ削除の確認",
    contentHtml: "<p>このシナリオを削除します。よろしいですか？</p>",
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    okLabel: "OK",
    cancelLabel: "キャンセル",
    onOk: async () => {
      try {
        await deleteScenarioById(scenario.scenarioId);
        refreshBookshelfView();
      } catch (e) {
        console.error(e);
        alert("削除に失敗しました。");
      }
    }
  });
}

/* =========================================
   multiModalでコピー確認
========================================= */
function onConfirmCopyScenario(scenario) {
  multiModal.open({
    title: "シナリオコピーの確認",
    contentHtml: "<p>このシナリオをコピーします。よろしいですか？</p>",
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    okLabel: "OK",
    cancelLabel: "キャンセル",
    onOk: async () => {
      try {
        await copyScenario(scenario.scenarioId);
        showToast("シナリオをコピーしました。");
        refreshBookshelfView();
      } catch (e) {
        console.error(e);
        alert("コピーに失敗しました。");
      }
    }
  });
}
/** シナリオをコピー */
async function copyScenario(originalScenarioId) {
  const original = await getScenarioById(originalScenarioId);
  if (!original) throw new Error("コピー元が見つかりません");

  const newTitle = original.title + " (copy)";
  const newScenarioId = await createNewScenario(original.wizardData, newTitle);

  const newScenario = await getScenarioById(newScenarioId);
  newScenario.bookShelfFlag = true;
  newScenario.hideFromHistoryFlag = true;
  newScenario.bookFacingFront = false;

  if (typeof original.useCoverImage === "undefined") {
    newScenario.useCoverImage = true;
  } else {
    newScenario.useCoverImage = original.useCoverImage;
  }
  await updateScenario(newScenario);

  const entries = await getSceneEntriesByScenarioId(originalScenarioId);
  for (const e of entries) {
    const newEntry = {
      scenarioId: newScenarioId,
      type: e.type,
      content: e.content,
      content_en: e.content_en,
      dataUrl: e.dataUrl,
      prompt: e.prompt,
      sceneId: e.sceneId
    };
    await addSceneEntry(newEntry);
  }
}

/* =========================================
   ドラッグ＆ドロップによる本棚の並べ替え
========================================= */
function handleDragStart(event) {
  const scenarioId = event.currentTarget.getAttribute("data-scenario-id");
  event.dataTransfer.setData("text/plain", scenarioId);
  event.dataTransfer.effectAllowed = "move";
  event.currentTarget.classList.add("dragging");
}
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}
function handleDragEnter(event) {
  event.preventDefault();
  const target = event.currentTarget;
  target.dragCounter = (target.dragCounter || 0) + 1;
  target.classList.add("drag-over");
}
function handleDragLeave(event) {
  const target = event.currentTarget;
  target.dragCounter = (target.dragCounter || 0) - 1;
  if (target.dragCounter <= 0) {
    target.classList.remove("drag-over");
    target.dragCounter = 0;
  }
}
function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  event.currentTarget.dragCounter = 0;

  const draggedScenarioId = event.dataTransfer.getData("text/plain");
  const shelfContainer = document.getElementById("bookshelf-container");
  const draggedEl = shelfContainer.querySelector(`[data-scenario-id="${draggedScenarioId}"]`);
  const dropTarget = event.currentTarget;
  if (!draggedEl || draggedEl === dropTarget) return;

  const rect = dropTarget.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  if (offsetX < rect.width / 2) {
    shelfContainer.insertBefore(draggedEl, dropTarget);
  } else {
    shelfContainer.insertBefore(draggedEl, dropTarget.nextSibling);
  }
  updateBookshelfOrder();
}
function handleDragEnd(event) {
  const target = event.currentTarget;
  target.classList.remove("dragging");
  target.classList.remove("drag-over");
  target.dragCounter = 0;
}
async function updateBookshelfOrder() {
  const shelfContainer = document.getElementById("bookshelf-container");
  const wrappers = Array.from(shelfContainer.children);
  const total = wrappers.length;
  for (let i = 0; i < total; i++) {
    const scenarioId = wrappers[i].getAttribute("data-scenario-id");
    const newOrder = total - i;
    try {
      const scenario = await getScenarioById(Number(scenarioId));
      scenario.shelfOrder = newOrder;
      await updateScenario(scenario, true);
    } catch (err) {
      console.error("shelfOrder 更新エラー (scenarioId:", scenarioId, "):", err);
    }
  }
}

/* =========================================
   ダウンロード確認 (3つのボタン: 画像あり / 画像なし / キャンセル)
========================================= */
function onOpenDownloadConfirm(scenario) {
  multiModal.open({
    title: "ダウンロードの確認",
    contentHtml: `
      <p>画像を含めるとサイズが大きくなる可能性があります。<br>
      画像を含めたシナリオをダウンロードしますか？</p>
    `,
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    // 3つのボタン
    additionalButtons: [
      {
        label: "画像付き",
        onClick: async () => {
          await exportScenarioAsZip(scenario, true);
        }
      },
      {
        label: "画像なし",
        onClick: async () => {
          await exportScenarioAsZip(scenario, false);
        }
      }
    ],
    cancelLabel: "キャンセル"
  });
}

/* =========================================
   シナリオをエクスポート(Zip)
========================================= */
async function exportScenarioAsZip(scenario, includeImages) {
  const zip = new JSZip();
  const scenarioObj = { ...scenario };
  const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
  let entriesToExport = includeImages
    ? entries
    : entries.filter(e => e.type !== "image");

  zip.file("scenario.json", JSON.stringify(scenarioObj, null, 2));
  zip.file("sceneEntries.json", JSON.stringify(entriesToExport, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = (scenario.title || "scenario").replace(/[\\\/:*?"<>|]/g, "");
  saveBlob(blob, filename + ".zip");
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* =========================================
   シナリオのインポート(アップロード)
========================================= */
function setupScenarioUpload() {
  const uploadButton = document.querySelector("#upload button");
  const fileInput = document.getElementById("scenario-upload-input");
  if (!uploadButton || !fileInput) return;

  uploadButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const scenarioFile = zip.file("scenario.json");
      const entriesFile = zip.file("sceneEntries.json");
      if (!scenarioFile || !entriesFile) {
        throw new Error("ZIPにscenario.jsonまたはsceneEntries.jsonがありません。");
      }

      const scenarioText = await scenarioFile.async("string");
      const scenarioJson = JSON.parse(scenarioText);
      const entriesText = await entriesFile.async("string");
      const entriesJson = JSON.parse(entriesText);

      const newScenarioId = await createNewScenario(
        scenarioJson.wizardData || {},
        scenarioJson.title || "無題"
      );
      const newScenario = await getScenarioById(newScenarioId);
      newScenario.bookShelfFlag = true;
      newScenario.updatedAt = new Date().toISOString();

      if (typeof scenarioJson.useCoverImage === "undefined") {
        newScenario.useCoverImage = true;
      } else {
        newScenario.useCoverImage = scenarioJson.useCoverImage;
      }
      await updateScenario(newScenario);

      for (const entry of entriesJson) {
        const newEntry = { ...entry };
        delete newEntry.entryId;
        newEntry.scenarioId = newScenarioId;
        await addSceneEntry(newEntry);
      }

      showToast("シナリオをアップロードしました。");
      refreshBookshelfView();
    } catch (err) {
      console.error("シナリオのアップロードに失敗:", err);
      alert("シナリオのアップロードに失敗しました: " + err.message);
    } finally {
      evt.target.value = "";
    }
  });
}

/* =========================================
   シナリオ編集モーダル
========================================= */
async function openEditScenarioModal(scenarioId) {
  try {
    const sc = await getScenarioById(scenarioId);
    if (!sc) {
      alert("シナリオが見つかりません。");
      return;
    }
    scenarioToEdit = sc;

    // multiModalでフォームを表示
    multiModal.open({
      title: "本編集",
      contentHtml: `
        <div class="edit-scenario-modal-content">
          <!-- タイトル入力 -->
          <div class="edit-row">
            <label for="edit-scenario-title">タイトル</label>
            <input type="text" id="edit-scenario-title" style="width:80%;" />
          </div>
          <!-- 装丁色 -->
          <div class="edit-row" style="margin-top:10px; display:flex; gap:15px;">
            <div>
              <label for="edit-scenario-covercolor1">装丁色1</label>
              <input type="color" id="edit-scenario-covercolor1" />
            </div>
            <div>
              <label for="edit-scenario-covercolor2">装丁色2</label>
              <input type="color" id="edit-scenario-covercolor2" />
            </div>
          </div>
          <!-- 画像のON/OFFチップ -->
          <div class="edit-row" style="margin-top:10px;">
            <label>装丁画像:</label>
          </div>
          <div class="edit-row" style="margin-bottom:10px;">
            <div class="chips-container" id="cover-image-choice">
              <div class="chip chip-mini" data-value="on">あり</div>
              <div class="chip chip-mini" data-value="off">なし</div>
            </div>
          </div>
          <!-- 左右の間隔 -->
          <div class="edit-row">
            <label for="edit-scenario-coverspacing">左右の間隔(px)</label>
            <input type="number" id="edit-scenario-coverspacing" style="width:80px;" />
          </div>
        </div>
      `,
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true,
      okLabel: "OK",
      cancelLabel: "キャンセル",
      onOpen: () => {
        // フォーム初期値をセット
        document.getElementById("edit-scenario-title").value = sc.title || "";
        document.getElementById("edit-scenario-covercolor1").value = sc.coverColor1 || "#004755";
        document.getElementById("edit-scenario-covercolor2").value = sc.coverColor2 || "#00d0ff";

        const coverSpacingInput = document.getElementById("edit-scenario-coverspacing");
        coverSpacingInput.value = (typeof sc.coverSpacing === "number") ? sc.coverSpacing : 5;

        // チップに選択をセット
        const coverImageChoice = document.getElementById("cover-image-choice");
        const chipOn = coverImageChoice.querySelector('.chip[data-value="on"]');
        const chipOff = coverImageChoice.querySelector('.chip[data-value="off"]');
        chipOn.classList.remove('selected');
        chipOff.classList.remove('selected');
        if (sc.useCoverImage) chipOn.classList.add('selected');
        else chipOff.classList.add('selected');

        // チップクリックイベント
        coverImageChoice.querySelectorAll(".chip").forEach(chip => {
          chip.addEventListener("click", () => {
            coverImageChoice.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
            chip.classList.add("selected");
          });
        });
      },
      onOk: async () => {
        // 入力値を読み取り
        const newTitle = document.getElementById("edit-scenario-title").value.trim();
        const newColor1 = document.getElementById("edit-scenario-covercolor1").value;
        const newColor2 = document.getElementById("edit-scenario-covercolor2").value;
        const coverSpacingInput = document.getElementById("edit-scenario-coverspacing");
        const newCoverSpacing = parseInt(coverSpacingInput.value, 10) || 0;

        const coverImageChoice = document.getElementById("cover-image-choice");
        const selectedChip = coverImageChoice.querySelector(".chip.selected");
        let newUseCoverImage = true;
        if (selectedChip && selectedChip.dataset.value === "off") {
          newUseCoverImage = false;
        }

        // 更新してDB保存
        scenarioToEdit.title = newTitle;
        scenarioToEdit.coverColor1 = newColor1;
        scenarioToEdit.coverColor2 = newColor2;
        scenarioToEdit.useCoverImage = newUseCoverImage;
        scenarioToEdit.coverSpacing = newCoverSpacing;
        await updateScenario(scenarioToEdit);
        scenarioToEdit = null;
        refreshBookshelfView();
      }
    });
  } catch (err) {
    console.error(err);
    alert("編集情報の取得に失敗しました。");
  }
}


/* =========================================
   アコーディオン
========================================= */
function initBookshelfListAccordion() {
  const header = document.getElementById("bookshelf-list-header");
  const content = document.getElementById("bookshelf-list-content");
  if (!header || !content) return;

  const savedState = localStorage.getItem("bookshelfListAccordionState");
  if (savedState === "open") {
    content.classList.add("open");
  }

  header.addEventListener("click", () => {
    content.classList.toggle("open");
    if (content.classList.contains("open")) {
      localStorage.setItem("bookshelfListAccordionState", "open");
    } else {
      localStorage.setItem("bookshelfListAccordionState", "closed");
    }
  });
}

/* =========================================
   ページ起動時
========================================= */
window.addEventListener("DOMContentLoaded", async () => {
  await initIndexedDB();
  await initBackground("bookshelf");
  initBookshelfPage();
  setupScenarioUpload();
});
