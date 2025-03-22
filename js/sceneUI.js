/********************************
 * sceneUI.js
 * UI関連のイベント・表示更新など
 ********************************/

window.addEventListener("DOMContentLoaded", () => {
  // 初期化：カルーセルのセルクローンのID削除
  setTimeout(() => {
    initCarousel();
    removeDuplicateIDs();
  }, 500);

  // --------------------------------------------------
  // ▼ アプリケーションバーに各種ボタンを動的追加
  // --------------------------------------------------
  const applicationBar = document.querySelector(".application-bar");

  // セーブボタンを基本として左に追加していく
  const baseButton = document.getElementById("save-load-button");
  if (applicationBar && baseButton) {
    // 履歴ボタン
    const historyBtn = document.createElement("button");
    historyBtn.id = "toggle-history-button";
    historyBtn.innerHTML = '<div class="iconmoon icon-newspaper"></div>履歴';
    applicationBar.insertBefore(historyBtn, baseButton);
    historyBtn.addEventListener("click", toggleHistory);

    // PTボタン
    const partyButton = document.createElement("button");
    partyButton.id = "show-party-button";
    partyButton.innerHTML = '<div class="iconmoon icon-strategy"></div>PT';
    applicationBar.insertBefore(partyButton, baseButton);
    partyButton.addEventListener("click", showPartyModal);

    // 情報ボタン (アイテム/人物一覧)
    const infoButton = document.createElement("button");
    infoButton.id = "info-button";
    infoButton.innerHTML = '<div class="iconmoon icon-info"></div>情報';
    applicationBar.insertBefore(infoButton, baseButton);
    infoButton.addEventListener("click", openEntitiesModal); // sceneExtras.js
  }

  // --------------------------------------------------
  // ▼ トークン調整ボタン関連 (multiModal化)
  // --------------------------------------------------
  const tokenAdjustBtn = document.getElementById("token-adjust-button");
  if (tokenAdjustBtn) {
    tokenAdjustBtn.addEventListener("click", onOpenTokenAdjustModal);
  }

  // tokenAdjustOk / tokenAdjustCancel ボタンは不要になったので削除

  function onOpenTokenAdjustModal() {
    let missingCount = window.scenes.filter(sc => !sc.content_en).length;
    const msg = `${missingCount}件のシーン/アクションに内部英語データがありません。生成しますか？`;

    // multiModalで開く
    multiModal.open({
      title: "トークン調整",
      // contentHtmlに「進行状況」を表示する <p>を用意
      contentHtml: `
      <p id="token-adjust-message" style="margin-bottom:1em;">${DOMPurify.sanitize(msg)}</p>
      <p id="token-adjust-progress" style="min-height:1.5em;"></p>
    `,
      showCloseButton: true,
      closeOnOutsideClick: true,
      appearanceType: "center",
      // キャンセル/OKボタン
      cancelLabel: "キャンセル",
      okLabel: "OK",
      onOk: async () => {
        await onConfirmTokenAdjust();
        // モーダルはonOk後に自動close
      }
    });
  }

  async function onConfirmTokenAdjust() {
    const progressEl = document.getElementById("token-adjust-progress");

    let targets = window.scenes.filter(sc => !sc.content_en || !sc.content_en.trim());
    if (!window.apiKey) {
      alert("APIキー未設定");
      return;
    }
    if (targets.length === 0) {
      alert("不足はありません。");
      return; // ここでモーダルは自然に閉じる
    }

    let doneCount = 0;
    const total = targets.length;
    for (const sceneObj of targets) {
      doneCount++;
      if (progressEl) {
        progressEl.textContent = `${doneCount}/${total}件処理中...`;
      }
      const tr = await generateEnglishTranslation(sceneObj.content);
      sceneObj.content_en = tr;

      // DB更新
      const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
      const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
      if (sceneRec) {
        sceneRec.content_en = tr;
        await updateSceneEntry(sceneRec);
      }
    }
    if (progressEl) {
      progressEl.textContent = `${total}/${total}件完了`;
    }
    alert("英語データ生成が完了しました。");
  }

  // --------------------------------------------------
  // ▼ セーブ/ロードモーダルのセーブボタン
  // --------------------------------------------------
  const doSaveButton = document.getElementById("do-save-button");
  if (doSaveButton) {
    doSaveButton.style.display = "block";
  }
  // --------------------------------------------------
  // ▼ ネタバレボタン (multiModal化)
  // --------------------------------------------------
  const spoilerButton = document.getElementById("spoiler-button");
  if (spoilerButton) {
    spoilerButton.addEventListener("click", () => {
      multiModal.open({
        title: "ネタバレ注意",
        contentHtml: `<p id="clear-condition-text" style="white-space:pre-wrap;"></p>`,
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: "center",
        // 下部に閉じるボタンを出したければ:
        cancelLabel: "閉じる"
        // → これで右下に「閉じる」ボタンが表示される
      });
    });
  }

  // 「カードを取得する」ボタン (multiModal化)
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    getCardButton.addEventListener("click", async () => {
      // ここで summary などを取得
      const summary = await getLastSceneSummary();
      if (!summary) {
        alert("最新シーンがありません");
        return;
      }

      // multiModal でモーダルを開く
      multiModal.open({
        title: "カードプレビュー",
        // contentHtmlにプレビュー内容を組み立て
        contentHtml: `
        <div id="preview-card-container">
          <p style="white-space:pre-wrap;">${DOMPurify.sanitize(summary)}</p>
        </div>
      `,
        showCloseButton: true,    // 右上×で閉じる
        closeOnOutsideClick: true,
        appearanceType: "center",
        // ボタン
        cancelLabel: "キャンセル",
        okLabel: "倉庫に追加",
        onOk: async () => {
          // 「倉庫に追加」処理
          alert("ガチャ箱に追加しました。（仮）");
        }
        // onCancel も必要なら書く
      });
    });
  }

  // --------------------------------------------------
  // ▼ 回答候補のチェックボックス
  // --------------------------------------------------
  const autoGenCbx = document.getElementById("auto-generate-candidates-checkbox");
  if (autoGenCbx) {
    autoGenCbx.addEventListener("change", () => {
      if (autoGenCbx.checked) {
        onGenerateActionCandidates();
      }
    });
  }

  // --------------------------------------------------
  // ▼ アイテム使用ボタン
  // --------------------------------------------------
  const useItemBtn = document.getElementById("use-item-button");
  if (useItemBtn) {
    useItemBtn.addEventListener("click", () => {
      getNextScene(true); // sceneManager.js
    });
  }

  // ▼ 全セクション閲覧ボタン (multiModal化)
  const viewAllSectionsBtn = document.getElementById("view-all-sections-button");
  if (viewAllSectionsBtn) {
    viewAllSectionsBtn.addEventListener("click", showAllSectionsModal);
  }
  function showAllSectionsModal() {
    // ここで scenario.wizardData.sections などから一覧を作る
    multiModal.open({
      title: "全セクション一覧",
      contentHtml: `
        <div id="all-sections-container" style="max-height:60vh; overflow:auto;"></div>
      `,
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true,
      cancelLabel: "閉じる",
      onOpen: () => {
        renderAllSections();
      }
    });
  }

  function renderAllSections() {
    const container = document.getElementById("all-sections-container");
    if (!container) return;
    container.innerHTML = "";

    // 例えば
    const wd = window.currentScenario?.wizardData;
    if (!wd || !wd.sections) {
      container.textContent = "セクション情報がありません。";
      return;
    }
    const sorted = [...wd.sections].sort((a, b) => a.number - b.number);
    sorted.forEach(sec => {
      const p = document.createElement("p");
      const clearedText = sec.cleared ? "【済】" : "【未】";
      p.textContent = `${sec.number} : ${clearedText} ${decompressCondition(sec.conditionZipped)}`;
      container.appendChild(p);
    });
  }

  // --------------------------------------------------
  // ▼ エンディングボタン (type='bad', 'clear')
  // --------------------------------------------------
  const endingBtn = document.getElementById("ending-button");
  if (endingBtn) {
    endingBtn.addEventListener("click", () => {
      showEndingModal("bad"); // sceneExtras.js
    });
  }
  const clearEndingBtn = document.getElementById("clear-ending-button");
  if (clearEndingBtn) {
    clearEndingBtn.addEventListener("click", () => {
      showEndingModal("clear");
    });
  }

  // エンディングモーダルのボタン
  const endingModalClose = document.getElementById("ending-modal-close-button");
  if (endingModalClose) {
    endingModalClose.addEventListener("click", () => {
      const m = document.getElementById("ending-modal");
      if (m) m.classList.remove("active");
    });
  }
  const endingModalRegen = document.getElementById("ending-modal-regenerate-button");
  if (endingModalRegen) {
    endingModalRegen.addEventListener("click", onClickRegenerateEnding); // sceneExtras.js
  }

  // --------------------------------------------------
  // ▼ メニューに戻るボタン
  // --------------------------------------------------
  const backMenuBtn = document.getElementById("back-to-menu");
  if (backMenuBtn) {
    backMenuBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // ▼ 情報ボタン (multiModal化)
  const infoButton = document.getElementById("info-button");
  if (infoButton) {
    infoButton.addEventListener("click", openEntitiesModal);
  }

  // 既存の info-close-button, info-modal は削除し、HTMLから <div id="info-modal"> も削除

  function openEntitiesModal() {
    // 「情報モーダル」を multiModal で開く
    multiModal.open({
      title: "情報",
      contentHtml: `
      <div style="margin-bottom:10px;">
        <button id="entity-update-button">シナリオから取得</button>
      </div>
      <div id="entity-candidate-list" style="margin-bottom:20px; padding:5px;"></div>
      <div id="entity-list-container" style="margin-bottom:20px; padding:5px;"></div>
    `,
      showCloseButton: true,       // 右上×で閉じる
      closeOnOutsideClick: true,   // モーダル外クリックでも閉じる
      cancelLabel: "閉じる",       // 下部に「閉じる」ボタン
      appearanceType: "center",
      // モーダルが開いた後にDOMが生成されるので onOpen でイベントなど付与
      onOpen: () => {
        renderEntitiesList();
        // 「シナリオから取得」ボタン
        const entityUpdateBtn = document.getElementById("entity-update-button");
        if (entityUpdateBtn) {
          entityUpdateBtn.addEventListener("click", onUpdateEntitiesFromAllScenes);
        }

        // 必要なら、候補一覧や既存一覧の描画
        // 例: 
        //   document.getElementById("entity-candidate-list").textContent = "候補なし";
        //   document.getElementById("entity-list-container").textContent = "エンティティ一覧";
      }
    });
  }


  // --------------------------------------------------
  // ▼ カスタム画像生成モーダル
  // --------------------------------------------------
  const promptModalBtn = document.getElementById("image-prompt-modal-button");
  if (promptModalBtn) {
    promptModalBtn.addEventListener('click', () => {
      openImagePromptModal();
    });
  }
  const customGenBtn = document.getElementById('image-custom-generate-button');
  if (customGenBtn) {
    customGenBtn.addEventListener('click', () => {
      onCustomImageGenerate();
    });
  }
  const customCancelBtn = document.getElementById('image-custom-cancel-button');
  if (customCancelBtn) {
    customCancelBtn.addEventListener('click', () => {
      closeImagePromptModal();
    });
  }
});


/* ===========================================================
   シーン履歴表示、最新シーン表示など UI更新系関数
=========================================================== */
/** 履歴表示を更新 */
window.updateSceneHistory = function () {
  const his = document.getElementById("scene-history");
  if (!his) return;
  his.innerHTML = "";

  // シナリオ/セクション情報
  const wd = window.currentScenario?.wizardData;
  let sections = [];
  if (wd && wd.sections) {
    sections = wd.sections;
  }
  const sorted = [...sections].sort((a, b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);

  if (!firstUncleared && sorted.length > 0) {
    // 全部クリア済み
    const tile = document.createElement("div");
    tile.className = "history-tile summary title";
    tile.textContent = "シナリオ達成!";
    his.appendChild(tile);
  }

  for (const s of sorted) {
    const t = document.createElement("div");
    if (s.number < (firstUncleared?.number || Infinity)) {
      t.className = "history-tile summary";
      t.textContent = `${decompressCondition(s.conditionZipped)}(クリア済み)`;
    } else if (s.number === firstUncleared?.number) {
      t.className = "history-tile summary";
      t.textContent = `セクション${s.number} (未クリア)`;
    }
    his.appendChild(t);
  }
  let tile = document.createElement("div");
  tile.className = "history-tile summary separator";
  his.appendChild(tile);

  // シナリオ概要
  const scenarioSummaryEl = document.createElement("div");
  scenarioSummaryEl.id = "scenario-summary";
  scenarioSummaryEl.innerHTML = wd?.scenarioSummary || "";
  his.appendChild(scenarioSummaryEl);

  // 全シーンの描画 (最後の1件は下で別表示)
  const lastScene = [...window.scenes].slice(-1)[0] || null;
  const skipId = lastScene ? lastScene.sceneId : null;
  const toShow = window.scenes.filter(sc => sc.sceneId !== skipId);

  for (const scn of toShow) {
    const tile = document.createElement("div");
    tile.className = "history-tile";

    // アクション
    if (scn.action?.content) {
      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(scn.action.content, DOMPURIFY_CONFIG);
      at.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(scn, at.innerHTML.trim(), true);
      });
      tile.appendChild(at);
    }

    // シーン本文
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(scn.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(scn, st.innerHTML.trim(), false);
    });
    tile.appendChild(st);

    // 画像一覧
    const scImages = scn.images || [];
    scImages.forEach((imgRec, index) => {
      const img = document.createElement("img");
      img.src = imgRec.dataUrl;
      img.alt = "生成画像";
      img.style.maxHeight = "350px";
      img.style.width = "100%";
      img.style.objectFit = "contain";

      img.addEventListener("click", () => {
        openImageViewer(scn, index);
      });
      tile.appendChild(img);
    });

    // シーン操作ドロップダウン
    const c = document.createElement("div");
    const dropdown = document.createElement("div");
    dropdown.className = "scene-dropdown-menu";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <button class="dropdown-item scene-delete">
        <div class="iconmoon icon-bin"></div>シーンを削除
      </button>
      <button class="dropdown-item scene-illustration">
        <div class="iconmoon icon-picture"></div>挿絵を生成
      </button>
    `;
    c.appendChild(dropdown);

    c.className = "r-flexbox";
    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
    c.appendChild(wandBtn);

    wandBtn.addEventListener("click", () => {
      dropdown.style.display = (dropdown.style.display === "none") ? "flex" : "none";
    });

    const delBtn = dropdown.querySelector(".scene-delete");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(scn);
      });
    }
    const illustBtn = dropdown.querySelector(".scene-illustration");
    if (illustBtn) {
      illustBtn.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await generateImageForScene(scn);
      });
    }

    tile.appendChild(c);
    his.appendChild(tile);
  }
  his.scrollTop = his.scrollHeight;
};

/** 最新シーン表示 */
window.showLastScene = function () {
  const storyDiv = document.getElementById("story");
  const lastSceneImagesDiv = document.getElementById("last-scene-images");
  const lastSceneAdded = document.getElementById("last-scene-added");

  if (!storyDiv || !lastSceneImagesDiv) return;

  const nextSceneBtn = document.getElementById("next-scene");
  const playerInput = document.getElementById("player-input");
  const playerActionLabel = document.getElementById("player-action");

  const lastScene = [...window.scenes].slice(-1)[0] || null;
  if (lastScene) {
    storyDiv.innerHTML = "";
    lastSceneAdded.innerHTML = "";

    // プレイヤーアクション
    if (lastScene.action?.content) {
      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(lastScene.action.content, DOMPURIFY_CONFIG);
      at.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(lastScene, at.innerHTML.trim(), true);
      });
      storyDiv.appendChild(at);
    }

    // シーン本文
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(lastScene, st.innerHTML.trim(), false);
    });
    storyDiv.appendChild(st);

    // ドロップダウン
    const dropdown = document.createElement("div");
    dropdown.className = "scene-dropdown-menu";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <button class="dropdown-item last-scene-delete">
        <div class="iconmoon icon-bin"></div>シーンを削除
      </button>
      <button class="dropdown-item last-scene-illustration">
        <div class="iconmoon icon-picture"></div>挿絵を生成
      </button>
    `;
    lastSceneAdded.appendChild(dropdown);

    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
    lastSceneAdded.appendChild(wandBtn);

    wandBtn.addEventListener("click", () => {
      dropdown.style.display = (dropdown.style.display === "none") ? "block" : "none";
    });

    const delItem = dropdown.querySelector(".last-scene-delete");
    if (delItem) {
      delItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(lastScene);
      });
    }
    const illustItem = dropdown.querySelector(".last-scene-illustration");
    if (illustItem) {
      illustItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await generateImageForScene(lastScene);
      });
    }

    // 画像一覧
    lastSceneImagesDiv.innerHTML = "";
    lastScene.images.forEach((imgObj, index) => {
      const div = document.createElement("div");
      div.className = "image-container";

      const imgEl = document.createElement("img");
      imgEl.src = imgObj.dataUrl;
      imgEl.alt = "生成画像";
      imgEl.style.maxHeight = "50vh";
      imgEl.style.objectFit = "contain";
      imgEl.addEventListener("click", () => {
        openImageViewer(lastScene, index);
      });

      div.appendChild(imgEl);
      lastSceneImagesDiv.appendChild(div);
    });

    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "inline-block";
      playerActionLabel.textContent = "プレイヤーの行動を入力してください";
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  } else {
    // シーンが無い場合（導入前）
    storyDiv.innerHTML = "";
    lastSceneImagesDiv.innerHTML = "";
    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "最初のシーン(導入)を作成します。";
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  }
};


/* ===========================================================
   シーンテキスト編集、履歴トグル、アイテムchips表示 など
=========================================================== */
/** シーンorアクションのテキストを編集 */
window.onSceneOrActionContentEdited = async function (sceneObj, newText, isActionEdit) {
  if (!window.apiKey) return;
  const oldText = isActionEdit ? sceneObj.action.content : sceneObj.content;
  if (newText.trim() === oldText.trim()) {
    return;
  }
  showLoadingModal(true);
  try {
    // 英訳
    const en = await generateEnglishTranslation(newText);
    if (isActionEdit) {
      sceneObj.action.content = newText;
      sceneObj.action.content_en = en;
    } else {
      sceneObj.content = newText;
      sceneObj.content_en = en;
    }
    // DB更新
    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
    if (sceneRec) {
      sceneRec.content = sceneObj.content;
      sceneRec.content_en = sceneObj.content_en;
      sceneRec.actionContent = sceneObj.action.content;
      sceneRec.actionContent_en = sceneObj.action.content_en;
      await updateSceneEntry(sceneRec);
    }
  } catch (err) {
    console.error("再翻訳失敗:", err);
  } finally {
    showLoadingModal(false);
  }
};

/** 履歴表示のトグル */
window.toggleHistory = async function () {
  if (!window.currentScenario) return;
  const hist = document.getElementById("scene-history");
  if (!hist) return;

  window.currentScenario.showHistory = !window.currentScenario.showHistory;
  hist.style.display = window.currentScenario.showHistory ? 'block' : 'none';

  await updateScenario(window.currentScenario);
};

/** アイテムチップスを表示 */
window.renderItemChips = async function () {
  const container = document.getElementById("item-chips-container");
  if (!container) return;
  container.innerHTML = "";

  if (!window.currentScenario) return;
  const scenarioId = window.currentScenarioId;
  if (!scenarioId) return;

  // DB側アイテム
  const ents = await getEntitiesByScenarioId(scenarioId);
  const acquiredItems = ents.filter(e => e.category === "item" && e.acquired);

  // wizardDataのパーティアイテム
  const pArr = window.currentScenario?.wizardData?.party || [];
  const partyItems = pArr.filter(c => c.type === "アイテム");

  const result = [];
  const addedNames = new Set();

  // 1) パーティアイテム
  for (const it of partyItems) {
    const nm = it.name || "無名アイテム";
    if (addedNames.has(nm)) continue;
    addedNames.add(nm);

    result.push({
      name: nm,
      description: it.caption || "(説明不明)",
      imageData: it.imageData || ""
    });
  }
  // 2) DB取得アイテム
  for (const it of acquiredItems) {
    const nm = it.name || "無名アイテム";
    if (addedNames.has(nm)) continue;
    addedNames.add(nm);

    result.push({
      name: nm,
      description: it.description || "(説明不明)",
      imageData: it.imageData || ""
    });
  }

  if (result.length === 0) {
    container.textContent = "使用可能なアイテムはありません。";
    return;
  }

  let currentSelectedChip = null;
  result.forEach(item => {
    const chip = document.createElement("div");
    chip.className = "chip chip-withimage";
    // 画像表示
    if (item.imageData) {
      const im = document.createElement("img");
      im.src = item.imageData;
      im.alt = item.name;
      chip.appendChild(im);
    }
    // 名前
    const lbl = document.createElement("span");
    lbl.textContent = item.name;
    chip.appendChild(lbl);

    // 選択ハイライト
    chip.onclick = () => {
      if (currentSelectedChip && currentSelectedChip !== chip) {
        currentSelectedChip.classList.remove("selected");
      }
      const wasActive = chip.classList.contains("selected");
      if (wasActive) {
        chip.classList.remove("selected");
        window.selectedItem = null;
      } else {
        chip.classList.add("selected");
        window.selectedItem = item;
      }
      currentSelectedChip = wasActive ? null : chip;
    };
    container.appendChild(chip);
  });

  // 「更新」チップを最後に配置 ---
  const updateChip = document.createElement("div");
  updateChip.className = "chip chip-withimage";
  updateChip.textContent = "更新";
  updateChip.onclick = () => {
    onUpdateEntitiesFromAllScenes();
  };
  container.appendChild(updateChip);
};

/** シーン削除 */
window.deleteScene = async function (sceneObj) {
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const scRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (scRec) {
    await deleteSceneEntry(scRec.entryId);
  }
  const imgs = allEntries.filter(e => e.type === "image" && e.sceneId === sceneObj.sceneId);
  for (const iRec of imgs) {
    await deleteSceneEntry(iRec.entryId);
  }
  window.scenes = window.scenes.filter(s => s.sceneId !== sceneObj.sceneId);

  updateSceneHistory();
  showLastScene();
};

/** 挿絵生成 */
window.generateImageForScene = async function (sceneObj) {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const sRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (!sRec) {
    alert("シーンレコードが見つかりません。");
    return;
  }
  let promptText = sRec.prompt || "";
  if (!promptText.trim()) {
    promptText = await generateImagePromptFromScene(sceneObj.content);
    sRec.prompt = promptText;
    await updateSceneEntry(sRec);
  }
  if (!promptText) {
    alert("生成に必要なプロンプトが得られませんでした。");
    return;
  }

  const finalPrompt =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    promptText;

  try {
    showLoadingModal(true);
    window.cancelRequested = false;
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      }),
      signal
    });
    const data = await resp.json();
    if (window.cancelRequested) {
      return;
    }
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    const newImgRec = {
      scenarioId: sceneObj.scenarioId,
      type: "image",
      sceneId: sceneObj.sceneId,
      content: "",
      content_en: "",
      dataUrl,
      prompt: promptText
    };
    const newEntryId = await addSceneEntry(newImgRec);

    sceneObj.images.push({
      entryId: newEntryId,
      dataUrl,
      prompt: promptText
    });

    updateSceneHistory();
    showLastScene();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("画像生成キャンセル");
    } else {
      console.error("画像生成失敗:", err);
      alert("画像生成に失敗:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
  }
};


/* ===========================================================
   回答候補生成、トークン調整、カスタム画像生成モーダル 等
=========================================================== */
/** 回答候補を生成 */
window.onGenerateActionCandidates = async function () {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  const lastScene = [...window.scenes].slice(-1)[0];
  if (!lastScene) {
    alert("まだ導入シーンがありません。");
    return;
  }
  const lastSceneText = lastScene.content || "(シーン無し)";

  const wd = window.currentScenario?.wizardData;
  let conditionText = "";
  if (wd && wd.sections && wd.sections.length > 0) {
    const sorted = wd.sections.slice().sort((a, b) => a.number - b.number);
    const firstUncleared = sorted.find(sec => !sec.cleared);
    if (firstUncleared) {
      conditionText = decompressCondition(firstUncleared.conditionZipped);
    }
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const prompt = `
あなたはTRPGのGMです。
下記シーンとセクションクリア条件を踏まえ、プレイヤーが可能な行動案を4つ提案してください。
１：セクションのクリアに関係しそうなものを1つ
２：妥当なものを2つ
３：少し頭がおかしい行動案を1つ
合計４行構成にしてください。
順番はシャッフルしてください。
言葉の表現でどれがクリアに関係しそうなのかわからないようにしてください。
---
シーン：
${lastSceneText}
---
クリア条件：
${conditionText}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": 'Bearer ' + window.apiKey
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGアシスタント" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
      signal
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content || "";
    const lines = content.split("\n").map(l => l.trim()).filter(l => l);

    const container = document.getElementById("action-candidates-container");
    if (!container) return;
    container.innerHTML = "";

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");
      btn.style.display = "block";
      btn.style.textAlign = "left";
      btn.style.margin = "0";
      btn.addEventListener("click", () => {
        const playerInput = document.getElementById("player-input");
        if (playerInput) {
          playerInput.value = btn.textContent;
        }
      });
      container.appendChild(btn);
    });
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("候補生成キャンセル");
    } else {
      console.error(e);
      alert("候補生成失敗:" + e.message);
    }
  } finally {
    showLoadingModal(false);
  }
};

/** トークン調整ボタン押下 */
window.onOpenTokenAdjustModal = function () {
  let missingCount = window.scenes.filter(sc => !sc.content_en).length;
  const msg = `${missingCount}件のシーン/アクションに内部英語データがありません。生成しますか？`;
  document.getElementById("token-adjust-message").textContent = msg;
  document.getElementById("token-adjust-progress").textContent = "";
  const mod = document.getElementById("token-adjust-modal");
  mod.classList.add("active");
};

/** トークン調整 (英語データ生成) の実行 */
window.onConfirmTokenAdjust = async function () {
  const mod = document.getElementById("token-adjust-modal");
  const prog = document.getElementById("token-adjust-progress");

  let targets = window.scenes.filter(sc => !sc.content_en || !sc.content_en.trim());
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  if (targets.length === 0) {
    alert("不足はありません。");
    mod.classList.remove("active");
    return;
  }

  let doneCount = 0;
  const total = targets.length;
  for (const sceneObj of targets) {
    doneCount++;
    prog.textContent = `${doneCount}/${total}件処理中...`;
    const tr = await generateEnglishTranslation(sceneObj.content);
    sceneObj.content_en = tr;

    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
    if (sceneRec) {
      sceneRec.content_en = tr;
      await updateSceneEntry(sceneRec);
    }
  }
  prog.textContent = `${total}/${total}件完了`;
  alert("英語データ生成が完了しました。");
  mod.classList.remove("active");
};

/** カスタム画像生成モーダルを開く */
window.openImagePromptModal = function (scenePrompt = "", index = null) {
  const ip = document.getElementById("image-custom-prompt");
  if (ip) {
    ip.value = scenePrompt || "";
  }
  const modal = document.getElementById("image-prompt-modal");
  if (modal) {
    modal.classList.add("active");
  }
};

/** カスタム画像生成モーダルを閉じる */
window.closeImagePromptModal = function () {
  const modal = document.getElementById("image-prompt-modal");
  if (modal) {
    modal.classList.remove("active");
  }
};

/** カスタム画像を生成 */
window.onCustomImageGenerate = async function () {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  const userPromptText = (document.getElementById("image-custom-prompt")?.value || "").trim();
  if (!userPromptText) {
    alert("プロンプトが空です。");
    return;
  }

  const finalPrompt =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    userPromptText;

  showLoadingModal(true);
  closeImagePromptModal();

  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // 最新シーンが無ければ挿入できない
    const lastScene = [...window.scenes].slice(-1)[0];
    if (!lastScene) {
      showLoadingModal(false);
      alert("シーンがありません。");
      return;
    }

    // DBに保存
    const imgRec = {
      scenarioId: lastScene.scenarioId,
      type: "image",
      sceneId: lastScene.sceneId,
      content: "",
      content_en: "",
      dataUrl,
      prompt: userPromptText
    };
    const newId = await addSceneEntry(imgRec);
    lastScene.images.push({
      entryId: newId,
      dataUrl,
      prompt: userPromptText
    });

    updateSceneHistory();
    showLastScene();
  } catch (e) {
    console.error("カスタム画像生成失敗:", e);
    alert("カスタム画像生成失敗:\n" + e.message);
  } finally {
    showLoadingModal(false);
  }
};


/* ===========================================================
   画像ビューワ (拡大スワイプ表示) 関連
=========================================================== */
window.imageViewerState = {
  sceneObj: null,
  currentIndex: 0,
  images: [],
  isOpen: false,

  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  isDragging: false,
  hasMoved: false,
  tapThreshold: 10
};

/** ビューワを開く */
window.openImageViewer = function (sceneObj, startIndex) {
  window.imageViewerState.sceneObj = sceneObj;
  window.imageViewerState.currentIndex = startIndex;
  window.imageViewerState.images = sceneObj.images || [];
  window.imageViewerState.isOpen = true;

  const viewerModal = document.getElementById("image-viewer-modal");
  const imgEl = document.getElementById("viewer-image-element");

  // ポートレートorランドスケープを判定しサイズ調整
  const orientationPortrait = (window.innerHeight >= window.innerWidth);
  if (orientationPortrait) {
    imgEl.style.width = "100%";
    imgEl.style.height = "auto";
  } else {
    imgEl.style.width = "auto";
    imgEl.style.height = "100%";
  }
  showImageInViewer();

  const controls = document.getElementById("viewer-controls");
  if (controls) controls.classList.add("hidden");
  viewerModal.classList.add("active");

  addViewerTouchEvents(imgEl);

  // 削除/ダウンロード/閉じる
  const delBtn = document.getElementById("viewer-delete-button");
  if (delBtn) delBtn.onclick = onClickViewerDelete;
  const dlBtn = document.getElementById("viewer-download-button");
  if (dlBtn) dlBtn.onclick = onClickViewerDownload;
  const closeBtn = document.getElementById("viewer-close-button");
  if (closeBtn) closeBtn.onclick = closeImageViewer;
};

function showImageInViewer() {
  const { images, currentIndex } = window.imageViewerState;
  const viewerImg = document.getElementById("viewer-image-element");
  if (!viewerImg) return;
  if (!images[currentIndex]) return;

  viewerImg.src = images[currentIndex].dataUrl;
  viewerImg.style.transform = "translateX(0px)";
}

/** スワイプイベント */
function addViewerTouchEvents(imgEl) {
  imgEl.onpointerdown = (e) => {
    e.preventDefault();
    window.imageViewerState.isDragging = true;
    window.imageViewerState.hasMoved = false;
    window.imageViewerState.startX = e.clientX;
    window.imageViewerState.startY = e.clientY;
    window.imageViewerState.currentX = e.clientX;
    window.imageViewerState.currentY = e.clientY;
    imgEl.setPointerCapture(e.pointerId);
  };
  imgEl.onpointermove = (e) => {
    if (!window.imageViewerState.isDragging) return;
    e.preventDefault();
    const dx = e.clientX - window.imageViewerState.startX;
    const dy = e.clientY - window.imageViewerState.startY;
    window.imageViewerState.currentX = e.clientX;
    window.imageViewerState.currentY = e.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > window.imageViewerState.tapThreshold) {
      window.imageViewerState.hasMoved = true;
    }
    imgEl.style.transform = `translateX(${dx}px)`;
  };
  imgEl.onpointerup = (e) => {
    if (!window.imageViewerState.isDragging) return;
    e.preventDefault();
    imgEl.releasePointerCapture(e.pointerId);
    finishSwipeOrTap(false);
  };
  imgEl.onpointercancel = (e) => {
    if (!window.imageViewerState.isDragging) return;
    imgEl.releasePointerCapture(e.pointerId);
    finishSwipeOrTap(true);
  };
}

/** スワイプorタップ判定 */
function finishSwipeOrTap(isCancel) {
  const imgEl = document.getElementById("viewer-image-element");
  const s = window.imageViewerState;
  s.isDragging = false;

  if (!imgEl) return;
  if (isCancel) {
    resetImagePosition(imgEl);
    return;
  }
  // タップ判定
  if (!s.hasMoved) {
    toggleViewerControls();
    return;
  }

  // スワイプ量判定
  const dx = s.currentX - s.startX;
  const threshold = window.innerWidth * 0.3;
  if (Math.abs(dx) < threshold) {
    resetImagePosition(imgEl);
  } else {
    if (dx < 0) {
      goNextImage();
    } else {
      goPrevImage();
    }
  }
}

/** バウンスバック */
function resetImagePosition(imgEl) {
  imgEl.style.transition = "transform 0.2s";
  imgEl.style.transform = "translateX(0px)";
  setTimeout(() => {
    imgEl.style.transition = "";
  }, 200);
}

/** 次へ */
function goNextImage() {
  const s = window.imageViewerState;
  if (s.currentIndex < s.images.length - 1) {
    animateSwipeTransition(-window.innerWidth);
    s.currentIndex++;
  } else {
    bounceBack(-1);
  }
}

/** 前へ */
function goPrevImage() {
  const s = window.imageViewerState;
  if (s.currentIndex > 0) {
    animateSwipeTransition(window.innerWidth);
    s.currentIndex--;
  } else {
    bounceBack(1);
  }
}

/** スワイプアニメ後に差し替え */
function animateSwipeTransition(offset) {
  const imgEl = document.getElementById("viewer-image-element");
  if (!imgEl) return;
  imgEl.style.transition = "transform 0.2s";
  imgEl.style.transform = `translateX(${offset}px)`;
  setTimeout(() => {
    showImageInViewer();
    imgEl.style.transition = "none";
  }, 200);
}

/** 端で弾く */
function bounceBack(direction) {
  const imgEl = document.getElementById("viewer-image-element");
  if (!imgEl) return;
  imgEl.style.transition = "transform 0.2s";
  imgEl.style.transform = `translateX(${direction * 60}px)`;
  setTimeout(() => {
    imgEl.style.transform = "translateX(0px)";
  }, 200);
  setTimeout(() => {
    imgEl.style.transition = "";
  }, 400);
}

/** タップ時のコントロール表示切替 */
function toggleViewerControls() {
  const controls = document.getElementById("viewer-controls");
  if (!controls) return;
  controls.classList.toggle("hidden");
}

/** 画像削除 */
function onClickViewerDelete() {
  const s = window.imageViewerState;
  const { currentIndex, images } = s;
  if (!images[currentIndex]) return;
  if (!confirm("この画像を削除します。よろしいですか？")) return;

  const entryId = images[currentIndex].entryId;
  deleteSceneEntry(entryId)
    .then(() => {
      images.splice(currentIndex, 1);
      if (images.length === 0) {
        closeImageViewer();
        updateSceneHistory();
        showLastScene();
        return;
      }
      if (currentIndex >= images.length) {
        s.currentIndex = images.length - 1;
      }
      showImageInViewer();
      updateSceneHistory();
      showLastScene();
    })
    .catch(err => {
      console.error("Delete error:", err);
      alert("削除に失敗しました: " + err.message);
    });
}

/** 画像ダウンロード */
function onClickViewerDownload() {
  const s = window.imageViewerState;
  const { images, currentIndex } = s;
  if (!images[currentIndex]) return;

  const link = document.createElement("a");
  link.href = images[currentIndex].dataUrl;
  link.download = "image.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** ビューワを閉じる */
function closeImageViewer() {
  window.imageViewerState.isOpen = false;
  const viewerModal = document.getElementById("image-viewer-modal");
  if (viewerModal) {
    viewerModal.classList.remove("active");
  }
}
