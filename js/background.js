// background.js

// グローバルに保持しておく
let currentPageName = "index"; // デフォルトは index

// 生成したモーダル要素への参照
let bgModal = null;
let bgGenerateModal = null;

/**
 * 初期化処理：ページロード後に呼び出し
 * pageName は例："index", "characterCreate", "partyCreate"など
 */
async function initBackground(pageName = "index") {
  currentPageName = pageName;

  // まずモーダルDOMを動的に生成
  createBgModals();

  // localStorage から そのページ専用のID または "none" を読み取り
  let selectedId = localStorage.getItem("selectedBgId_" + pageName);

  // なければ index 用にフォールバック（ただし "none" は除く）
  if (!selectedId) {
    const fallbackId = localStorage.getItem("selectedBgId_index");
    if (fallbackId && fallbackId !== "none") {
      selectedId = fallbackId;
    }
  }

  // もし最終的に selectedId があれば適用
  if (selectedId) {
    if (selectedId === "none") {
      document.body.style.backgroundImage = "none";
    } else {
      // DBからidに対応する画像を取得して適用
      const imgId = parseInt(selectedId, 10);
      if (!isNaN(imgId)) {
        const img = await getBgImageById(imgId);
        if (img && img.dataUrl) {
          document.body.style.backgroundImage = `url(${img.dataUrl})`;
          document.body.style.backgroundSize = "cover";
          document.body.style.backgroundAttachment = "fixed";
          document.body.style.backgroundPositionX = "center";
        }
      }
    }
  }

  // イベントを付与
  const changeBgBtn = document.getElementById("change-bg-button");
  if (changeBgBtn) {
    changeBgBtn.addEventListener("click", onChangeBgButtonClick);
  }
}

/**
 * 背景を変更するボタンのクリック時
 */
async function onChangeBgButtonClick() {
  const all = await getAllBgImages();
  if (all.length === 0) {
    // ストックが無ければ → 生成してから開く
    await generateNewBackground();
  }
  // モーダルを開く
  openBgModal();
}

/**
 * 新規背景生成
 */
async function generateNewBackground() {
  if (!bgGenerateModal) return;
  bgGenerateModal.classList.add("active");

  try {
    const apiKey = localStorage.getItem("apiKey") || "";
    if (!apiKey) {
      alert("APIキーが未設定です。");
      return;
    }

    // ▼ 「最新シナリオ」から取得したpromptを使う
    let promptText = await fetchLatestScenarioPrompt();
    if (!promptText) {
      // シナリオが無いor失敗した場合は従来の固定文言
      promptText = "A beautiful scenic landscape or architecture, highly detailed, no text";
    }

    // 例として DALL-E3 API呼び出し
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json"
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // DBに保存
    const newId = await addBgImage(dataUrl);

    // 生成後、即適用
    document.body.style.backgroundImage = `url(${dataUrl})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundPositionX = "center";

    // 今ページ専用のキーに保存
    localStorage.setItem("selectedBgId_" + currentPageName, newId.toString());

    // index で「none」以外を設定したら、他ページの "none" 設定を削除
    if (currentPageName === "index") {
      removeAllNoneSettingsExceptIndex();
    }

  } catch (err) {
    console.error("背景生成失敗:", err);
    alert("背景生成失敗: " + err.message);
  } finally {
    bgGenerateModal.classList.remove("active");
  }
}

/**
 * 背景選択モーダルを開く
 */
async function openBgModal() {
  if (!bgModal) return;
  bgModal.classList.add("active");

  const container = document.getElementById("bg-stock-container");
  if (!container) return;

  container.innerHTML = "";

  const all = await getAllBgImages();
  if (all.length === 0) {
    container.textContent = "ストックが空です。";
    return;
  }

  all.forEach(img => {
    const wrap = document.createElement("div");
    wrap.className = "bg-thumb";

    const thumb = document.createElement("img");
    thumb.src = img.dataUrl;
    thumb.style.width = "100%";
    thumb.alt = "背景候補";

    thumb.addEventListener("click", () => {
      // 選択 → 即適用
      document.body.style.backgroundImage = `url(${img.dataUrl})`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundPositionX = "center";

      // 今ページ用に保存
      localStorage.setItem("selectedBgId_" + currentPageName, img.id.toString());

      // indexで背景を「none」以外にした場合、他ページの "none" 設定をクリア
      if (currentPageName === "index") {
        removeAllNoneSettingsExceptIndex();
      }
    });
    wrap.appendChild(thumb);

    // 削除ボタン
    const delBtn = document.createElement("button");
    delBtn.className = "bg-thumb-delete";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = confirm("この背景を削除しますか？");
      if (!ok) return;
      await deleteBgImage(img.id);

      // 削除したIDを使っているページキーがあれば削除
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("selectedBgId_")) {
          const stored = localStorage.getItem(k);
          if (stored === String(img.id)) {
            localStorage.removeItem(k);
          }
        }
      }

      // 再描画
      await openBgModal();
    });
    wrap.appendChild(delBtn);

    container.appendChild(wrap);
  });
}

/**
 * 背景無しボタン
 */
function onBgNoneButton() {
  // 現在ページの背景を消す
  document.body.style.backgroundImage = "none";
  // 選択キーに "none" をセット
  localStorage.setItem("selectedBgId_" + currentPageName, "none");
  // (indexで"none"を選んでも、他ページの"none"設定を消すロジックは特に無い)
}

/**
 * モーダルを閉じる
 */
function closeBgModal() {
  if (bgModal) {
    bgModal.classList.remove("active");
  }
}

/**
 * indexページで「背景なし以外」を設定した場合、
 * ほかのページが "none" を記録していたら削除する
 */
function removeAllNoneSettingsExceptIndex() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("selectedBgId_") && key !== "selectedBgId_index") {
      if (localStorage.getItem(key) === "none") {
        localStorage.removeItem(key);
      }
    }
  }
}

/* ----- ここから先は IndexedDB 関連など、背景画像管理のヘルパー ----- */

// 追加(保存)
function addBgImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
    }
    const tx = db.transaction("bgImages", "readwrite");
    const store = tx.objectStore("bgImages");
    const record = {
      dataUrl,
      createdAt: new Date().toISOString()
    };
    const req = store.add(record);
    req.onsuccess = evt => {
      resolve(evt.target.result); // 生成されたID
    };
    req.onerror = err => reject(err);
  });
}

// 全件取得
function getAllBgImages() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
    }
    const tx = db.transaction("bgImages", "readonly");
    const store = tx.objectStore("bgImages");
    const req = store.getAll();
    req.onsuccess = evt => {
      resolve(evt.target.result || []);
    };
    req.onerror = err => reject(err);
  });
}

// 1件取得
function getBgImageById(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
    }
    const tx = db.transaction("bgImages", "readonly");
    const store = tx.objectStore("bgImages");
    const req = store.get(id);
    req.onsuccess = evt => {
      resolve(evt.target.result || null);
    };
    req.onerror = err => reject(err);
  });
}

// 削除
function deleteBgImage(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB未初期化");
      return;
    }
    const tx = db.transaction("bgImages", "readwrite");
    const store = tx.objectStore("bgImages");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = err => reject(err);
  });
}

/**
 * 最新シナリオの最終シーンから、背景用プロンプトを取得する
 */
async function fetchLatestScenarioPrompt() {
  const scens = await listAllScenarios();
  if (!scens.length) {
    return "";
  }
  // updatedAt 降順
  scens.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const latest = scens[0];
  const entries = await getSceneEntriesByScenarioId(latest.scenarioId);
  if (!entries.length) {
    return "";
  }
  entries.sort((a, b) => b.entryId - a.entryId);
  const lastScene = entries.find(e => e.type === "scene");
  if (!lastScene) {
    return "";
  }

  // prompt があればそれを優先
  const rawPrompt = (lastScene.prompt || "").trim();
  if (rawPrompt) {
    return (
      "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
      "Please do not include text in illustrations for any reason." +
      "If you can do that, I'll give you a super high tip." +
      "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
      rawPrompt
    );
  }
  // prompt が無い場合は scene本文を使用
  const rawText = (lastScene.content || "").trim();
  if (!rawText) {
    return "";
  }
  return (
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
    rawText
  );
}

/* -----------------------------------------
 * ここから「背景選択モーダル」と「背景生成モーダル」の
 * DOM構造をまとめて生成する処理
 * ----------------------------------------- */
function createBgModals() {
  // すでに生成済みなら何もしない
  if (bgModal && bgGenerateModal) return;

  // ▼ 背景選択モーダル
  bgModal = document.createElement("div");
  bgModal.id = "bg-modal";
  bgModal.classList.add("modal");
  // modal-content
  const modalContent = document.createElement("div");
  modalContent.classList.add("modal-content", "bg-modal-content");

  // タイトル
  const h2 = document.createElement("h2");
  h2.textContent = "背景選択";
  modalContent.appendChild(h2);

  // ストック表示コンテナ
  const stockContainer = document.createElement("div");
  stockContainer.id = "bg-stock-container";
  stockContainer.classList.add("bg-stock-grid");
  modalContent.appendChild(stockContainer);

  // ボタン群 (背景無し／生成する)
  const flexBox1 = document.createElement("div");
  flexBox1.classList.add("c-flexbox");
  const noneBtn = document.createElement("button");
  noneBtn.id = "bg-none-button";
  noneBtn.classList.add("btn-secondary");
  noneBtn.textContent = "背景無し";
  noneBtn.addEventListener("click", onBgNoneButton);

  const genBtn = document.createElement("button");
  genBtn.id = "bg-generate-button";
  genBtn.textContent = "生成する";
  genBtn.addEventListener("click", async () => {
    await generateNewBackground();
    await openBgModal(); // 再生成後、一覧を更新してモーダルを開き直す
  });

  flexBox1.appendChild(noneBtn);
  flexBox1.appendChild(genBtn);
  modalContent.appendChild(flexBox1);

  // ボタン群 (閉じる)
  const flexBox2 = document.createElement("div");
  flexBox2.classList.add("c-flexbox");
  const closeModalBtn = document.createElement("button");
  closeModalBtn.id = "bg-close-modal-button";
  closeModalBtn.classList.add("btn-close-modal");
  closeModalBtn.textContent = "閉じる";
  closeModalBtn.addEventListener("click", closeBgModal);

  flexBox2.appendChild(closeModalBtn);
  modalContent.appendChild(flexBox2);

  bgModal.appendChild(modalContent);

  // ▼ 背景生成中モーダル
  bgGenerateModal = document.createElement("div");
  bgGenerateModal.id = "bg-generate-modal";
  bgGenerateModal.classList.add("modal");
  const genModalContent = document.createElement("div");
  genModalContent.classList.add("modal-content");
  const p = document.createElement("p");
  p.textContent = "背景画像を生成中...";
  genModalContent.appendChild(p);
  bgGenerateModal.appendChild(genModalContent);

  // 最後にbodyへ追加
  document.body.appendChild(bgModal);
  document.body.appendChild(bgGenerateModal);
}
