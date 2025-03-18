// background.js

// グローバルに保持しておく
let currentPageName = "index"; // デフォルトは index

/**
 * 初期化処理：ページロード後に呼び出し
 * pageName は例："index", "characterCreate", "partyCreate"など
 */
async function initBackground(pageName = "index") {
  currentPageName = pageName;

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
  // 1) 「背景画像を生成中...」のモーダルを開く
  let generatingModal = multiModal.open({
    title: "背景画像を生成中",
    contentHtml: `<p>しばらくお待ちください...</p>`,
    showCloseButton: false,
    closeOnOutsideClick: false
  });

  try {
    const apiKey = localStorage.getItem("apiKey") || "";
    if (!apiKey) {
      // APIキー未設定なら警告モーダルを出す
      generatingModal.close();
      multiModal.open({
        title: "エラー",
        contentHtml: "<p>APIキーが設定されていません。</p>",
        cancelLabel: "閉じる"
      });
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
        Authorization: `Bearer ${apiKey}`
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
    generatingModal.close(); // 一旦閉じる
    // エラーダイアログ
    multiModal.open({
      title: "背景生成失敗",
      contentHtml: `<p>${DOMPurify.sanitize(err.message)}</p>`,
      cancelLabel: "閉じる"
    });
  } finally {
    // 成功・失敗に関係なく、生成中モーダルを閉じる
    if (generatingModal && generatingModal.isOpen) {
      generatingModal.close();
    }
  }
}

/**
 * 背景選択モーダルを開く
 */
async function openBgModal() {
  // multiModalで「背景選択」モーダルを開く
  multiModal.open({
    title: "背景選択",
    contentHtml: `
      <div id="bg-stock-container" class="bg-stock-grid" style="margin-bottom:10px;"></div>
      <div class="c-flexbox" style="margin-bottom:10px;">
        <button id="bg-none-button">背景無し</button>
        <button id="bg-generate-button">生成する</button>
      </div>
    `,
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    cancelLabel: "閉じる",
    onOpen: async () => {
      // モーダル生成後に要素がDOMに存在する → ここでイベント＆表示更新
      const container = document.getElementById("bg-stock-container");
      if (!container) return;

      const noneBtn = document.getElementById("bg-none-button");
      const genBtn = document.getElementById("bg-generate-button");

      // ボタンイベント付与
      if (noneBtn) {
        noneBtn.addEventListener("click", () => {
          onBgNoneButton();
        });
      }
      if (genBtn) {
        genBtn.addEventListener("click", async () => {
          await generateNewBackground();
          // 再描画
          await refreshBgStock(container);
        });
      }

      // ストック一覧を初回表示
      await refreshBgStock(container);
    }
  });
}

/**
 * 背景一覧を container に再描画
 */
async function refreshBgStock(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  const all = await getAllBgImages();
  if (all.length === 0) {
    containerEl.textContent = "ストックが空です。";
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
      // confirm代わりに multiModal を使用
      multiModal.open({
        title: "背景削除確認",
        contentHtml: `<p>この背景を削除しますか？</p>`,
        showCloseButton: true,
        appearanceType: "center",
        closeOnOutsideClick: true,
        okLabel: "OK",
        cancelLabel: "キャンセル",
        onOk: async () => {
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
          await refreshBgStock(containerEl);
        }
      });
    });
    wrap.appendChild(delBtn);

    containerEl.appendChild(wrap);
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

/* -----------------------------------------
   ここからは IndexedDB 関連など、背景画像管理のヘルパー
----------------------------------------- */

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
