/****************************************
 * bookshelfPage.js
 * 1回の背表紙クリックでリストをハイライト + 3D表紙を表示
 * さらに、本棚上でのドラッグ・アンド・ドロップによる並び替えを実装
 ****************************************/

let scenarioToDelete = null;
let scenarioToCopy = null;

/**
 * 「ダウンロード」ボタン押下時に使用する
 * どのシナリオをダウンロードするかを一時保持
 */
let scenarioToDownload = null;

/** 編集対象のシナリオを一時的に保持 */
let scenarioToEdit = null;

/**
 * 初期化
 */
async function initBookshelfPage() {
  const backBtn = document.getElementById("back-to-menu");
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // --- 削除モーダル関連 ---
  const deleteModalOk = document.getElementById("delete-scenario-ok");
  const deleteModalCancel = document.getElementById("delete-scenario-cancel");
  deleteModalOk.addEventListener("click", onConfirmDeleteScenario);
  deleteModalCancel.addEventListener("click", onCancelDeleteScenario);

  // --- コピー用モーダル関連 ---
  const copyOkBtn = document.getElementById("copy-scenario-ok");
  const copyCancelBtn = document.getElementById("copy-scenario-cancel");

  copyOkBtn.addEventListener("click", async () => {
    if (!scenarioToCopy) {
      closeCopyModal();
      return;
    }
    try {
      await copyScenario(scenarioToCopy.scenarioId);
      alert("シナリオをコピーしました。");
    } catch (e) {
      console.error(e);
      alert("コピーに失敗しました。");
    } finally {
      scenarioToCopy = null;
      closeCopyModal();
      refreshBookshelfView();
    }
  });

  copyCancelBtn.addEventListener("click", () => {
    scenarioToCopy = null;
    closeCopyModal();
  });

  // --- ダウンロード用モーダル関連 ---
  const dlYesBtn = document.getElementById("download-images-yes");
  const dlNoBtn = document.getElementById("download-images-no");
  const dlCancelBtn = document.getElementById("download-images-cancel");

  dlYesBtn.addEventListener("click", async () => {
    closeDownloadModal();
    if (scenarioToDownload) {
      await exportScenarioAsZip(scenarioToDownload, true); // 画像含む
      scenarioToDownload = null;
    }
  });
  dlNoBtn.addEventListener("click", async () => {
    closeDownloadModal();
    if (scenarioToDownload) {
      await exportScenarioAsZip(scenarioToDownload, false); // 画像除外
      scenarioToDownload = null;
    }
  });
  dlCancelBtn.addEventListener("click", () => {
    // 何もせずに閉じる
    closeDownloadModal();
    scenarioToDownload = null;
  });

  // --- 編集モーダルのOK/キャンセルボタン ---
  document.getElementById("edit-scenario-ok").addEventListener("click", onSaveEditScenario);
  document.getElementById("edit-scenario-cancel").addEventListener("click", closeEditScenarioModal);

  // --- シナリオ一覧を取得して描画 ---
  let allScenarios = [];
  try {
    allScenarios = await listAllScenarios();
  } catch (err) {
    console.error("シナリオ一覧の取得失敗:", err);
    return;
  }

  // ここで useCoverImage が未設定ならデフォルト true をセット
  // （DBへ保存するかはケースによりますが、画面表示上はここで一律設定します）
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
}

/** 再描画 */
async function refreshBookshelfView() {
  try {
    const allScenarios = await listAllScenarios();
    // ここでも useCoverImage が未設定ならデフォルト true
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
 */
async function renderBooksOnShelf(scenarios) {
  const shelfContainer = document.getElementById("bookshelf-container");
  shelfContainer.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "bookshelf-board";
  const bookLeftMargin = 0;

  for (const scenario of scenarios) {
    const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
    const actionCount = entries.filter(e => e.type === "action").length;
    const spineWidth = 30 + actionCount;

    const shortTitle = scenario.title?.substring(0, 15) || "●●●";
    const images = entries.filter(e => e.type === "image");
    const coverImage = images.length > 0 ? images[images.length - 1] : null;

    // 3D ラッパ
    const wrapper = document.createElement("div");
    wrapper.classList.add("book-wrapper");
    wrapper.setAttribute("data-scenario-id", scenario.scenarioId);
    wrapper.setAttribute("draggable", "true");
    wrapper.addEventListener("dragstart", handleDragStart);
    wrapper.addEventListener("dragover", handleDragOver);
    wrapper.addEventListener("drop", handleDrop);
    wrapper.addEventListener("dragend", handleDragEnd);
    wrapper.addEventListener("dragenter", handleDragEnter);
    wrapper.addEventListener("dragleave", handleDragLeave);

    if (scenario.bookFacingFront) {
      wrapper.classList.add("facing-front");
      wrapper.style.paddingRight = (170 - spineWidth) + "px";
      setTimeout(() => {
        wrapper.style.marginLeft = bookLeftMargin + "px";
        wrapper.style.zIndex = 1000;
        if (wrapper.classList.contains("facing-front")) {
          wrapper.querySelector(".book-front").style.transform = `rotateY(90deg) translateZ(-${spineWidth}px)`;
          wrapper.querySelector(".book-front").style.transformOrigin = "0 " + spineWidth + "px";
        }
      }, 500);
    } else {
      wrapper.style.marginLeft = bookLeftMargin + "px";
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
    bookSpine.style.margin = "0";
    bookSpine.style.position = "relative";
    bookSpine.style.cursor = "pointer";
    bookSpine.style.justifyContent = "center";
    bookSpine.style.alignItems = "center";
    bookSpine.style.borderRadius = "0px";
    bookSpine.style.boxShadow = "inset 0 0 5px rgba(0,0,0,0.3)";

    // 装丁色(未設定時はデフォルト)
    const c1 = scenario.coverColor1 || "#004755";
    const c2 = scenario.coverColor2 || "#00d0ff";

    // ※ useCoverImage===true かつ画像があるなら、背表紙は画像を表示
    if (scenario.useCoverImage && coverImage) {
      bookSpine.style.backgroundImage = `url(${coverImage.dataUrl})`;
      bookSpine.style.backgroundSize = "cover";
      bookSpine.style.backgroundPosition = "center";
      bookSpine.style.backgroundBlendMode = "multiply";
    } else {
      // 画像なしの場合は色グラデーション
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
    bookSpine.appendChild(titleEl);

    const noUpdateDateTimeFlag = true;
    // ---------- 背表紙クリック ----------
    bookSpine.addEventListener("click", async () => {
      focusBookshelfListItem(scenario.scenarioId);
      scenario.bookFacingFront = true;
      await updateScenario(scenario, noUpdateDateTimeFlag);
      wrapper.classList.add("facing-front");
      wrapper.style.paddingRight = (170 - spineWidth - bookLeftMargin + bookLeftMargin) + "px";
      wrapper.style.marginLeft = bookLeftMargin + "px";
      setTimeout(() => {
        if (wrapper.classList.contains("facing-front")) {
          wrapper.querySelector(".book-front").style.transform = `rotateY(90deg) translateZ(-${spineWidth}px)`;
          wrapper.querySelector(".book-front").style.transformOrigin = "0 " + spineWidth + "px";
        }
      }, 500);
      wrapper.style.zIndex = 1000;
    });

    // ===== 正面 (.book-front) =====
    const bookFront = document.createElement("div");
    bookFront.classList.add("book-front");
    bookFront.style.left = spineWidth + "px";
    bookFront.style.transformOrigin = "0 " + spineWidth + "px";

    if (scenario.useCoverImage && coverImage) {
      // 画像ありの場合
      const frontImg = document.createElement("img");
      frontImg.src = coverImage.dataUrl;
      // 必要に応じてサイズ調整
      bookFront.appendChild(frontImg);
    } else {
      // 画像なしの場合 → 色のグラデーション
      bookFront.style.backgroundImage = `linear-gradient(45deg, ${c1}, ${c2})`;
    }

    const frontTitle = document.createElement("div");
    frontTitle.classList.add("book-front-title");
    frontTitle.textContent = scenario.title || "(無題)";
    bookFront.appendChild(frontTitle);

    bookFront.addEventListener("click", async () => {
      scenario.bookFacingFront = false;
      await updateScenario(scenario, noUpdateDateTimeFlag);
      wrapper.classList.remove("facing-front");
      wrapper.querySelector(".book-front").style.transform = `rotateY(90deg)`;
      wrapper.querySelector(".book-front").style.transformOrigin = "0 " + bookLeftMargin + "px";
      wrapper.style.marginLeft = bookLeftMargin + "px";
      setTimeout(() => {
        wrapper.style.paddingRight = 0;
        wrapper.style.zIndex = 0;
      }, 500);
    });

    inner.appendChild(bookSpine);
    inner.appendChild(bookFront);
    shelfContainer.appendChild(wrapper);
  }
}

/**
 * リスト表示
 */
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

    // ▼ ダウンロードボタン
    const btnShare = document.createElement("button");
    btnShare.textContent = "ダウンロード";
    btnShare.className = "left-button";
    btnShare.addEventListener("click", () => {
      // ダウンロード用モーダルを表示するために対象シナリオを保持
      scenarioToDownload = sc;
      openDownloadModal();
    });
    buttonsDiv.appendChild(btnShare);

    // 読むボタン
    const btnContinue = document.createElement("button");
    btnContinue.textContent = "読む";
    btnContinue.addEventListener("click", async () => {
      sc.hideFromHistoryFlag = false;
      await updateScenario(sc);
      window.location.href = `scenario.html?scenarioId=${sc.scenarioId}`;
    });
    buttonsDiv.appendChild(btnContinue);

    // コピーするボタン
    const btnCopy = document.createElement("button");
    btnCopy.textContent = "コピーする";
    btnCopy.addEventListener("click", () => {
      scenarioToCopy = sc;
      const copyModal = document.getElementById("copy-scenario-modal");
      copyModal.classList.add("active");
    });
    buttonsDiv.appendChild(btnCopy);

    // ★ 編集ボタン (シナリオ編集モーダルを開く)
    const btnEdit = document.createElement("button");
    btnEdit.textContent = "編集";
    btnEdit.addEventListener("click", () => {
      openEditScenarioModal(sc.scenarioId);
    });
    buttonsDiv.appendChild(btnEdit);

    // 削除ボタン
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "削除";
    btnDelete.style.backgroundColor = "rgb(244, 67, 54)";
    btnDelete.addEventListener("click", () => {
      scenarioToDelete = sc;
      const modal = document.getElementById("delete-scenario-modal");
      modal.classList.add("active");
    });
    buttonsDiv.appendChild(btnDelete);

    div.appendChild(buttonsDiv);
    listContainer.appendChild(div);
  }
}

/**
 * 背表紙クリック → リスト項目をハイライト
 */
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

/** シナリオコピー */
async function copyScenario(originalScenarioId) {
  const original = await getScenarioById(originalScenarioId);
  if (!original) throw new Error("コピー元が見つかりません");

  const newTitle = original.title + " (copy)";
  const newScenarioId = await createNewScenario(original.wizardData, newTitle);

  const newScenario = await getScenarioById(newScenarioId);
  newScenario.bookShelfFlag = true;
  newScenario.hideFromHistoryFlag = true;
  newScenario.bookFacingFront = false;

  // ★ default: useCoverImage=true
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

/** 削除モーダル: OK */
async function onConfirmDeleteScenario() {
  if (!scenarioToDelete) {
    closeDeleteModal();
    return;
  }
  try {
    await deleteScenarioById(scenarioToDelete.scenarioId);
    refreshBookshelfView();
  } catch (e) {
    console.error(e);
    alert("削除に失敗しました。");
  } finally {
    scenarioToDelete = null;
    closeDeleteModal();
  }
}
function onCancelDeleteScenario() {
  scenarioToDelete = null;
  closeDeleteModal();
}
function closeDeleteModal() {
  const modal = document.getElementById("delete-scenario-modal");
  modal.classList.remove("active");
}
function closeCopyModal() {
  const modal = document.getElementById("copy-scenario-modal");
  modal.classList.remove("active");
}

/* ======================
   ダウンロード用モーダル
 ====================== */
function openDownloadModal() {
  const modal = document.getElementById("download-with-images-modal");
  if (!modal) return;
  modal.classList.add("active");
}
function closeDownloadModal() {
  const modal = document.getElementById("download-with-images-modal");
  if (!modal) return;
  modal.classList.remove("active");
}

/* ======================
   ドラッグ＆ドロップ
 ====================== */
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

/**
 * 並び順を更新
 */
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
   ダウンロード処理本体
 ========================================== */
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

/**
 * 指定したシナリオについて ZIP を生成＆ダウンロード
 * includeImages === true なら画像も含む
 * false なら画像を除外
 */
async function exportScenarioAsZip(scenario, includeImages) {
  const zip = new JSZip();

  // シナリオ情報
  const scenarioObj = { ...scenario };
  // シーンエントリ
  const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);

  let entriesToExport;
  if (includeImages) {
    entriesToExport = entries; // そのまま
  } else {
    // 画像(type==="image")を除外
    entriesToExport = entries.filter(e => e.type !== "image");
  }

  zip.file("scenario.json", JSON.stringify(scenarioObj, null, 2));
  zip.file("sceneEntries.json", JSON.stringify(entriesToExport, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = (scenario.title || "scenario").replace(/[\\\/:*?"<>|]/g, "");
  saveBlob(blob, filename + ".zip");
}

/* =========================================
   アップロード処理
 ========================================== */
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

      // useCoverImage が未設定ならデフォルト true
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

      alert("シナリオをアップロードしました。");
      refreshBookshelfView();
    } catch (err) {
      console.error("シナリオのアップロードに失敗:", err);
      alert("シナリオのアップロードに失敗しました: " + err.message);
    } finally {
      evt.target.value = "";
    }
  });
}

/* =======================
   シナリオ編集モーダル関連
 ======================= */
/**
 * 編集モーダルを開き、既存のシナリオ情報をフォームにセット
 */
async function openEditScenarioModal(scenarioId) {
  try {
    const sc = await getScenarioById(scenarioId);
    if (!sc) {
      alert("シナリオが見つかりません。");
      return;
    }
    scenarioToEdit = sc;
    // タイトル
    document.getElementById("edit-scenario-title").value = sc.title || "";

    // 装丁色(未設定時はデフォルトで #004755, #00d0ff)
    document.getElementById("edit-scenario-covercolor1").value = sc.coverColor1 || "#004755";
    document.getElementById("edit-scenario-covercolor2").value = sc.coverColor2 || "#00d0ff";

    // ▼ 装丁画像チップを初期化
    const coverImageChoice = document.getElementById("cover-image-choice");
    const chipOn = coverImageChoice.querySelector('.chip[data-value="on"]');
    const chipOff = coverImageChoice.querySelector('.chip[data-value="off"]');

    // いったんselectedを外す
    chipOn.classList.remove('selected');
    chipOff.classList.remove('selected');  // useCoverImage が true なら "on" を selected に
    // false なら "off" を selected に
    if (sc.useCoverImage) {
      chipOn.classList.add('selected');
    } else {
      chipOff.classList.add('selected');
    }


    document.getElementById("edit-scenario-modal").classList.add("active");
  } catch (err) {
    console.error(err);
    alert("編集情報の取得に失敗しました。");
  }
}
function setupChipEvents() {
  const coverImageChoice = document.getElementById("cover-image-choice");
  const chips = coverImageChoice.querySelectorAll(".chip");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      // 全ての chip から selected を外す
      chips.forEach((c) => c.classList.remove("selected"));
      // クリックされた chip のみに selected を付与
      chip.classList.add("selected");
    });
  });
}

function closeEditScenarioModal() {
  document.getElementById("edit-scenario-modal").classList.remove("active");
  scenarioToEdit = null;
}

/**
 * OKボタン押下: 入力内容を保存してモーダルを閉じる
 */
async function onSaveEditScenario() {
  if (!scenarioToEdit) {
    closeEditScenarioModal();
    return;
  }
  try {
    // フォームの内容を取得
    const newTitle = document.getElementById("edit-scenario-title").value.trim() || "";
    const newColor1 = document.getElementById("edit-scenario-covercolor1").value;
    const newColor2 = document.getElementById("edit-scenario-covercolor2").value;

    // チップ選択の状態を読み取り
    const coverImageChoice = document.getElementById("cover-image-choice");
    const selectedChip = coverImageChoice.querySelector('.chip.selected');
    let newUseCoverImage = true;
    if (selectedChip && selectedChip.dataset.value === "on") {
      newUseCoverImage = true;
    }

    // scenarioToEdit オブジェクトを更新して保存
    scenarioToEdit.useCoverImage = newUseCoverImage;
    await updateScenario(scenarioToEdit);


    // シナリオオブジェクトを更新
    scenarioToEdit.title = newTitle;
    scenarioToEdit.coverColor1 = newColor1;
    scenarioToEdit.coverColor2 = newColor2;
    scenarioToEdit.useCoverImage = newUseCoverImage;

    await updateScenario(scenarioToEdit);
    closeEditScenarioModal();
    refreshBookshelfView();
  } catch (err) {
    console.error(err);
    alert("シナリオの保存に失敗しました。");
  }
}
setupChipEvents();
window.initBookshelfPage = initBookshelfPage;
