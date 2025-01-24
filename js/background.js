// js/background.js

// グローバルに保持しておく
let currentPageName = "index"; // デフォルトは index

// 初期化処理：ページロード後に呼び出し
// pageName は例："index", "characterCreate", "partyCreate"など
async function initBackground(pageName = "index") {
  currentPageName = pageName;

  // localStorage から そのページ専用の ID または "none" を読み取り
  let selectedId = localStorage.getItem("selectedBgId_" + pageName);

  // なければ index 用にフォールバック（ただし "none" は除く）
  if (!selectedId) {
    const fallbackId = localStorage.getItem("selectedBgId_index");
    // fallbackId が "none" なら背景なしにする
    if (fallbackId && fallbackId !== "none") {
      selectedId = fallbackId;
    }
  }

  // もし最終的に selectedId があれば適用
  if (selectedId) {
    // "none" がセットされていた場合は背景なし
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
        }
      }
    }
  }

  // イベント
  const changeBgBtn = document.getElementById("change-bg-button");
  if (changeBgBtn) {
    changeBgBtn.addEventListener("click", onChangeBgButtonClick);
  }

  const closeModalBtn = document.getElementById("bg-close-modal-button");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeBgModal);
  }

  const noneBtn = document.getElementById("bg-none-button");
  if (noneBtn) {
    noneBtn.addEventListener("click", onBgNoneButton);
  }

  const genBtn = document.getElementById("bg-generate-button");
  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      await generateNewBackground();
      await openBgModal(); // 再生成後、一覧を更新してモーダルを開き直す
    });
  }
}

// 「背景を変更する」ボタン
async function onChangeBgButtonClick() {
  const all = await getAllBgImages();
  if (all.length === 0) {
    // ストックが無ければ → 生成してから開く
    await generateNewBackground();
  } else {
    // あればモーダルを開く
    openBgModal();
  }
}

// 新規背景生成
async function generateNewBackground() {
  const genModal = document.getElementById("bg-generate-modal");
  if (genModal) genModal.style.display = "flex";

  try {
    const apiKey = localStorage.getItem("apiKey") || "";
    if (!apiKey) {
      alert("APIキーが未設定です。");
      return;
    }

    // ▼ 通常ロジックを差し替え: "最新のシナリオ" から取得したpromptを使う
    //const promptText = "A beautiful scenic landscape or architecture, highly detailed, no text";
    let promptText = await fetchLatestScenarioPrompt();
    if (!promptText) {
      // シナリオが無い or シーンが無い等で取得失敗した場合は従来文言にフォールバック
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

    // 今ページ専用のキーに保存
    localStorage.setItem("selectedBgId_" + currentPageName, newId.toString());

    // ▼ もし index で「背景無し」以外を設定したら、他ページの "none" 設定を削除
    if (currentPageName === "index") {
      removeAllNoneSettingsExceptIndex();
    }

  } catch (err) {
    console.error("背景生成失敗:", err);
    alert("背景生成失敗: " + err.message);
  } finally {
    if (genModal) genModal.style.display = "none";
  }
}

// 背景選択モーダルを開く
async function openBgModal() {
  const modal = document.getElementById("bg-modal");
  if (!modal) return;
  modal.style.display = "flex";

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

      // 今ページ用に保存
      localStorage.setItem("selectedBgId_" + currentPageName, img.id.toString());

      // ▼ index で背景を「none」以外にした場合、他ページの "none" 設定をクリア
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

// 背景無しボタン
function onBgNoneButton() {
  // 現在ページの背景を消す
  document.body.style.backgroundImage = "none";

  // 選択キーに "none" をセット
  localStorage.setItem("selectedBgId_" + currentPageName, "none");

  // indexで「none」を選んだ場合は他ページの設定を消す？→仕様上、ユーザー要望は
  // 「indexに“none”以外を設定した時に他ページの“none”を消す」なので、
  // ここでは何もしない。
}

// モーダルを閉じる
function closeBgModal() {
  const modal = document.getElementById("bg-modal");
  if (modal) modal.style.display = "none";
}

/* ----- 以下、IndexedDB操作ヘルパー ----- */

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
 * indexページで「背景なし以外」を設定した場合、
 * ほかのページが "none" を記録していたら削除する
 */
function removeAllNoneSettingsExceptIndex() {
  for (const key of Object.keys(localStorage)) {
    // indexは除外
    if (key.startsWith("selectedBgId_") && key !== "selectedBgId_index") {
      if (localStorage.getItem(key) === "none") {
        localStorage.removeItem(key);
      }
    }
  }
}

/* 
  ★ 追加: 最新シナリオの最終シーンから、背景用プロンプトを取得するヘルパー
    - 最も updatedAt が新しいシナリオを1つ取得
    - そのシナリオの sceneEntries を entryId 降順に並べて
    - 最初に見つかった type==="scene" のエントリを確認
      - .prompt があればそれを優先
      - なければ .content を使用
    - どちらも無ければ空文字を返す
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
