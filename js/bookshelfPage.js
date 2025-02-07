/****************************************
 * bookshelfPage.js
 * 1回の背表紙クリックでリストをハイライト + 3D表紙を表示
 * さらに、本棚上でのドラッグ・アンド・ドロップによる並び替えを実装
 ****************************************/

let scenarioToDelete = null;
let scenarioToCopy = null;

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

  // --- シナリオ一覧を取得して描画 ---
  let allScenarios = [];
  try {
    allScenarios = await listAllScenarios();
  } catch (err) {
    console.error("シナリオ一覧の取得失敗:", err);
    return;
  }
  const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag);
  // ★ 新専用並び順: shelfOrder（未設定なら新規とみなして Infinity とし、降順にする）
  shelfScenarios.sort((a, b) => {
    const orderA = (typeof a.shelfOrder === "number") ? a.shelfOrder : Infinity;
    const orderB = (typeof b.shelfOrder === "number") ? b.shelfOrder : Infinity;
    if (orderA > orderB) return -1;
    if (orderA < orderB) return 1;
    // 同じ場合は作成日時で降順（新しいものが先頭）にする
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  renderBooksOnShelf(shelfScenarios);
  renderBookshelfList(shelfScenarios);
}

/** 再描画 */
async function refreshBookshelfView() {
  try {
    const allScenarios = await listAllScenarios();
    const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag);
    // ★ 再描画時も新専用並び順でソート
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
 * - シナリオの actionCount で背表紙の厚みを変える
 * - 最後の画像を背表紙 & 表紙に流用
 * - 背表紙クリックで (1) リスト項目をハイライト、(2) scenario.bookFacingFront = true で正面表示
 * - ★ ドラッグ・アンド・ドロップで並び替え可能に（各本のラッパに draggable 属性とイベントを設定）
 */
async function renderBooksOnShelf(scenarios) {
  const shelfContainer = document.getElementById("bookshelf-container");
  shelfContainer.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "bookshelf-board";
  // マージン
  const bookLeftMargin = 0;
  for (const scenario of scenarios) {
    // アクション数で背表紙の幅を決定
    const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
    const actionCount = entries.filter(e => e.type === "action").length;
    const spineWidth = 30 + actionCount;

    const shortTitle = scenario.title?.substring(0, 15) || "●●●";
    const images = entries.filter(e => e.type === "image");
    const coverImage = images.length > 0 ? images[images.length - 1] : null;

    // 3D ラッパ
    const wrapper = document.createElement("div");
    wrapper.classList.add("book-wrapper");
    // ★ ドラッグ＆ドロップ用：シナリオID を属性に設定し draggable にする
    wrapper.setAttribute("data-scenario-id", scenario.scenarioId);
    wrapper.setAttribute("draggable", "true");
    wrapper.addEventListener("dragstart", handleDragStart);
    wrapper.addEventListener("dragover", handleDragOver);
    wrapper.addEventListener("drop", handleDrop);
    wrapper.addEventListener("dragend", handleDragEnd);
    // ★ 以下の2イベントで、内部の子要素に入ったときも drag-over クラスを維持する
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

    // 3D 内部
    const inner = document.createElement("div");
    inner.classList.add("book-inner");
    wrapper.appendChild(inner);

    // ===== 背表紙 (.book) =====
    const bookSpine = document.createElement("div");
    bookSpine.className = "book";
    // 既存の背表紙スタイルを JS 側に記述
    bookSpine.style.display = "inline-flex";
    bookSpine.style.verticalAlign = "bottom";
    bookSpine.style.height = "200px";
    bookSpine.style.width = spineWidth + "px";
    bookSpine.style.margin = "0";

    bookSpine.style.backgroundColor = "#774400";
    bookSpine.style.position = "relative";
    bookSpine.style.cursor = "pointer";
    bookSpine.style.justifyContent = "center";
    bookSpine.style.alignItems = "center";
    bookSpine.style.borderRadius = "4px";
    bookSpine.style.boxShadow = "inset 0 0 5px rgba(0,0,0,0.3)";

    if (coverImage) {
      bookSpine.style.backgroundImage = `url(${coverImage.dataUrl})`;
      bookSpine.style.backgroundSize = "cover";
      bookSpine.style.backgroundPosition = "center";
      bookSpine.style.backgroundBlendMode = "multiply";
    } else {
      bookSpine.style.backgroundImage = `linear-gradient(45deg, #004755, rgb(0 208 255))`;
    }

    // 縦書きタイトル
    const titleEl = document.createElement("div");
    titleEl.textContent = shortTitle;
    titleEl.style.position = "relative";
    titleEl.style.boxSizing = "border-box";
    titleEl.style.color = "rgb(255 255 255 / 90%)";
    titleEl.style.fontSize = "0.75rem";
    titleEl.style.writingMode = "vertical-rl";
    titleEl.style.textOrientation = "upright";
    titleEl.style.backgroundColor = "#00000080";
    titleEl.style.padding = "0 5px";
    bookSpine.appendChild(titleEl);

    const noUpdateDateTimeFlag = true;
    // ---------- 背表紙クリック ----------
    bookSpine.addEventListener("click", async () => {
      // (1) リスト項目ハイライト
      focusBookshelfListItem(scenario.scenarioId);
      // (2) 正面表示へ切替
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
    bookFront.style.transform = "translateZ(" + spineWidth + "px);";
    if (coverImage) {
      const frontImg = document.createElement("img");
      frontImg.src = coverImage.dataUrl;
      bookFront.appendChild(frontImg);
    } else {
      bookFront.style.backgroundImage = `linear-gradient(45deg, #004755, rgb(0 208 255))`;
    }

    // 横書きタイトル
    const frontTitle = document.createElement("div");
    frontTitle.classList.add("book-front-title");
    frontTitle.textContent = scenario.title || "(無題)";
    bookFront.appendChild(frontTitle);

    // 正面クリック → 背表紙に戻す
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

    // 3D構造に背表紙 & 表紙を追加
    inner.appendChild(bookSpine);
    inner.appendChild(bookFront);

    // shelfContainer に配置
    shelfContainer.appendChild(wrapper);
  }
}

/**
 * リスト表示 (従来通り)
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

    const btnContinue = document.createElement("button");
    btnContinue.textContent = "読む";
    btnContinue.addEventListener("click", async () => {
      sc.hideFromHistoryFlag = false;
      await updateScenario(sc);
      window.location.href = `scenario.html?scenarioId=${sc.scenarioId}`;
    });
    div.appendChild(btnContinue);

    const btnCopy = document.createElement("button");
    btnCopy.textContent = "コピーする";
    btnCopy.addEventListener("click", () => {
      scenarioToCopy = sc;
      const copyModal = document.getElementById("copy-scenario-modal");
      copyModal.classList.add("active");
    });
    div.appendChild(btnCopy);

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "削除";
    btnDelete.style.backgroundColor = "rgb(244, 67, 54)";
    btnDelete.addEventListener("click", () => {
      scenarioToDelete = sc;
      const modal = document.getElementById("delete-scenario-modal");
      modal.classList.add("active");
    });
    div.appendChild(btnDelete);

    listContainer.appendChild(div);
  }
}

/**
 * 背表紙クリック → リスト項目をハイライト
 */
function focusBookshelfListItem(scenarioId) {
  const listContainer = document.getElementById("bookshelf-list-container");

  // 既に selected クラスが付いているものを除去
  listContainer.querySelectorAll(".scenario-list.selected").forEach(el => {
    el.classList.remove("selected");
  });

  // 対象の item を探す
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

/** 削除モーダル: キャンセル */
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

/* ===== ドラッグ・アンド・ドロップ用 イベントハンドラ ===== */

/**
 * ドラッグ開始時
 */
function handleDragStart(event) {
  // ドラッグ対象のシナリオIDを設定
  const scenarioId = event.currentTarget.getAttribute("data-scenario-id");
  event.dataTransfer.setData("text/plain", scenarioId);
  event.dataTransfer.effectAllowed = "move";
  event.currentTarget.classList.add("dragging");
}

/**
 * ドラッグ中（ドロップ許可のため）
 */
function handleDragOver(event) {
  event.preventDefault(); // ドロップを許可するため必須
  event.dataTransfer.dropEffect = "move";
}

/**
 * ドラッグ対象の要素に入った時の処理
 * ※ dragenter/dragleave イベントは子要素間の移動でも発火するため、カウンターで管理
 */
function handleDragEnter(event) {
  event.preventDefault();
  const target = event.currentTarget;
  target.dragCounter = (target.dragCounter || 0) + 1;
  target.classList.add("drag-over");
}

/**
 * ドラッグ対象の要素から離れた時の処理
 */
function handleDragLeave(event) {
  const target = event.currentTarget;
  target.dragCounter = (target.dragCounter || 0) - 1;
  if (target.dragCounter <= 0) {
    target.classList.remove("drag-over");
    target.dragCounter = 0;
  }
}

/**
 * ドロップ時の処理
 */
function handleDrop(event) {
  event.preventDefault();
  // ドロップ先からビジュアル用クラスを除去
  event.currentTarget.classList.remove("drag-over");
  // ドロップ時にはカウンターをリセット
  event.currentTarget.dragCounter = 0;

  const draggedScenarioId = event.dataTransfer.getData("text/plain");
  const shelfContainer = document.getElementById("bookshelf-container");
  const draggedEl = shelfContainer.querySelector(`[data-scenario-id="${draggedScenarioId}"]`);
  const dropTarget = event.currentTarget;
  if (!draggedEl || draggedEl === dropTarget) return;

  // ドロップ先の要素の矩形を取得し、マウス位置に応じて前後に挿入
  const rect = dropTarget.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  if (offsetX < rect.width / 2) {
    shelfContainer.insertBefore(draggedEl, dropTarget);
  } else {
    shelfContainer.insertBefore(draggedEl, dropTarget.nextSibling);
  }
  // 並び替え後、各シナリオの shelfOrder を更新
  updateBookshelfOrder();
}

/**
 * ドラッグ終了時（見た目の解除とカウンターのリセット）
 */
function handleDragEnd(event) {
  const target = event.currentTarget;
  target.classList.remove("dragging");
  target.classList.remove("drag-over");
  target.dragCounter = 0;
}

/**
 * 現在の本棚上の並び順に基づき、各シナリオの shelfOrder を更新する
 * 左端（最上位）の本に最大値、右端（下位）の本に小さい値を設定する
 */
async function updateBookshelfOrder() {
  const shelfContainer = document.getElementById("bookshelf-container");
  const wrappers = Array.from(shelfContainer.children);
  const total = wrappers.length;
  // 各本について新しい並び順を設定（左端が highest）
  for (let i = 0; i < total; i++) {
    const scenarioId = wrappers[i].getAttribute("data-scenario-id");
    const newOrder = total - i; // 左端：total, 右端：1
    try {
      const scenario = await getScenarioById(Number(scenarioId));
      scenario.shelfOrder = newOrder;
      // 更新日時は変更しない（noUpdateDateTimeFlag=true）
      await updateScenario(scenario, true);
    } catch (err) {
      console.error("shelfOrder 更新エラー (scenarioId:", scenarioId, "):", err);
    }
  }
}

// 公開
window.initBookshelfPage = initBookshelfPage;
