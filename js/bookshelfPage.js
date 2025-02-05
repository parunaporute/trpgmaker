/****************************************
 * bookshelfPage.js
 * 本棚画面の初期化やUI操作
 ****************************************/

// グローバルに削除対象シナリオを格納する
let scenarioToDelete = null;
let scenarioToCopy = null; // ← 追加（コピー用）

async function initBookshelfPage() {
  // 「メニューへ戻る」ボタン
  const backBtn = document.getElementById("back-to-menu");
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // ---- 削除モーダルのボタン動作を設定
  const deleteModalOk = document.getElementById("delete-scenario-ok");
  const deleteModalCancel = document.getElementById("delete-scenario-cancel");
  deleteModalOk.addEventListener("click", onConfirmDeleteScenario);
  deleteModalCancel.addEventListener("click", onCancelDeleteScenario);

  // ---- コピー用モーダルのボタン処理
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
      // ---- ここで再描画 ----
      refreshBookshelfView();
    }
  });

  copyCancelBtn.addEventListener("click", () => {
    scenarioToCopy = null;
    closeCopyModal();
  });

  function closeCopyModal() {
    const modal = document.getElementById("copy-scenario-modal");
    modal.classList.remove("active");
  }

  // シナリオ一覧を取得 & 初回描画
  let allScenarios = [];
  try {
    allScenarios = await listAllScenarios();
  } catch (err) {
    console.error("シナリオ一覧の取得失敗:", err);
    return;
  }
  const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag === true);

  renderBooksOnShelf(shelfScenarios);
  renderBookshelfList(shelfScenarios);
}

/**
 * 全体を再描画するヘルパー
 */
async function refreshBookshelfView() {
  try {
    // 1) 全シナリオを再取得
    const allScenarios = await listAllScenarios();
    // 2) 本棚フラグ == true のものだけ
    const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag === true);

    // 3) 本棚(横スクロール)を再描画
    renderBooksOnShelf(shelfScenarios);
    // 4) 本一覧を再描画
    renderBookshelfList(shelfScenarios);
  } catch (err) {
    console.error("Error refreshing the bookshelf view:", err);
  }
}

/**
 * 本棚(横スクロール)
 *  - シナリオの「アクション数」を元に背表紙の厚みを変える
 *  - 「最後に追加された画像」をカバーに擬似利用
 */
async function renderBooksOnShelf(scenarios) {
  const shelfContainer = document.getElementById("bookshelf-container");
  shelfContainer.innerHTML = "";

  for (const scenario of scenarios) {
    const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
    const actionCount = entries.filter(e => e.type === "action").length;
    const spineWidth = 30 + actionCount;

    const shortTitle = scenario.title?.substring(0, 15) || "(無題)";

    const images = entries.filter(e => e.type === "image");
    let coverImage = null;
    if (images.length > 0) {
      coverImage = images[images.length - 1];
    }

    const bookSpine = document.createElement("div");
    bookSpine.className = "book";
    bookSpine.style.display = "inline-flex";
    bookSpine.style.verticalAlign = "bottom";
    bookSpine.style.height = "200px";
    bookSpine.style.width = spineWidth + "px";
    bookSpine.style.margin = "0 0 0 3px";
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

    // クリックでリストの当該シナリオを強調スクロール
    bookSpine.addEventListener("click", () => {
      focusBookshelfListItem(scenario.scenarioId);
    });

    shelfContainer.appendChild(bookSpine);
  }
}

/**
 * リスト表示（本一覧）
 *  - 「続きへ」「コピーする」「削除」ボタンを追加
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

    // タイトルなどの情報
    const infoDiv = document.createElement("div");
    infoDiv.className = "info";
    infoDiv.textContent = `ID:${sc.scenarioId} / ${sc.title} (更新:${sc.updatedAt})`;
    div.appendChild(infoDiv);

    // --- 「続きへ」ボタン ---
    const btnContinue = document.createElement("button");
    btnContinue.textContent = "続きへ";
    btnContinue.addEventListener("click", async () => {
      sc.bookShelfFlag = false;
      sc.hideFromHistoryFlag = false;
      await updateScenario(sc);
      window.location.href = `scenario.html?scenarioId=${sc.scenarioId}`;
    });
    div.appendChild(btnContinue);

    // --- 「コピーする」ボタン ---
    const btnCopy = document.createElement("button");
    btnCopy.textContent = "コピーする";
    btnCopy.addEventListener("click", () => {
      // グローバル変数にコピー対象をセット
      scenarioToCopy = sc;
      // モーダルを表示
      const copyModal = document.getElementById("copy-scenario-modal");
      copyModal.classList.add("active");
    });
    div.appendChild(btnCopy);

    // --- 「削除」ボタン ---
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "削除";
    btnDelete.style.backgroundColor="rgb(244, 67, 54)";
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
 * 本棚の背表紙クリック → リストの該当箇所へスクロール＋軽くハイライト
 */
function focusBookshelfListItem(scenarioId) {
  const listContainer = document.getElementById("bookshelf-list-container");

  // 1) すでに付与されている selected を全て除去
  listContainer.querySelectorAll(".scenario-list.selected").forEach(el => {
    el.classList.remove("selected");
  });

  // 2) 該当の item を探す
  const item = listContainer.querySelector(`[data-scenario-id="${scenarioId}"]`);
  if (item) {
    // スクロール → selected を付与
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.classList.add("selected");
    item.style.backgroundColor = "#444";
    setTimeout(() => {
      item.style.backgroundColor = "";
    }, 1500);
  }
}


/** シナリオをコピー（シナリオ本体＋シーン履歴） */
async function copyScenario(originalScenarioId) {
  const original = await getScenarioById(originalScenarioId);
  if (!original) throw new Error("コピー元が見つかりません");

  const newTitle = original.title + " (copy)";
  const newScenarioId = await createNewScenario(original.wizardData, newTitle);

  // コピー直後の新シナリオを本棚フラグONに
  const newScenario = await getScenarioById(newScenarioId);
  newScenario.bookShelfFlag = true;
  newScenario.hideFromHistoryFlag = true;
  await updateScenario(newScenario);

  // 履歴を複製
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

/** 削除モーダル: OKボタン */
async function onConfirmDeleteScenario() {
  if (!scenarioToDelete) {
    closeDeleteModal();
    return;
  }
  try {
    await deleteScenarioById(scenarioToDelete.scenarioId);
    // --- ここで再描画を呼び出す ---
    await refreshBookshelfView();
  } catch (e) {
    console.error(e);
    alert("削除に失敗しました。");
  } finally {
    scenarioToDelete = null;
    closeDeleteModal();
  }
}

/** 削除モーダル: キャンセルボタン */
function onCancelDeleteScenario() {
  scenarioToDelete = null;
  closeDeleteModal();
}

/** モーダル閉じる共通 */
function closeDeleteModal() {
  const modal = document.getElementById("delete-scenario-modal");
  modal.classList.remove("active");
}

// 公開
window.initBookshelfPage = initBookshelfPage;
