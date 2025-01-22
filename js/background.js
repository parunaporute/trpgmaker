// js/background.js

// グローバルに保持しておく
let currentPageName = "index"; // デフォルトは index

// 初期化処理：ページロード後に呼び出し
// pageName は例："index", "characterCreate", "partyCreate"など
async function initBackground(pageName = "index") {
    currentPageName = pageName; 

    // localStorage から そのページ専用の ID を読んでみる
    let selectedId = localStorage.getItem("selectedBgId_" + pageName);
    
    // なければ index 用にフォールバック
    if (!selectedId) {
      const fallbackId = localStorage.getItem("selectedBgId_index");
      if (fallbackId) {
        selectedId = fallbackId;
      }
    }

    // もし最終的に selectedId があれば 適用
    if (selectedId) {
      const img = await getBgImageById(parseInt(selectedId,10));
      if (img && img.dataUrl) {
        document.body.style.backgroundImage = `url(${img.dataUrl})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
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
        await openBgModal(); // 再生成後、一覧更新
      });
    }
}

// 背景を変更するボタン
async function onChangeBgButtonClick() {
    const all = await getAllBgImages();
    if (all.length === 0) {
      // ストックが無ければ → 生成
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
      // DALL-E3 API呼び出し（例）
      const promptText = "A beautiful scenic landscape or architecture, highly detailed, no text";
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
        // 今ページ用
        localStorage.setItem("selectedBgId_" + currentPageName, img.id.toString());
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

        // この背景が各ページ用で選択中だった場合→ それらのページキーから消すかどうかはお好み
        // （ここでは簡単に、選択中キーが同じIDなら削除）
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("selectedBgId_")) {
            const stored = localStorage.getItem(k);
            if (parseInt(stored,10) === img.id) {
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

// 背景無し
function onBgNoneButton() {
    document.body.style.backgroundImage = "none";
    // 今ページのキーを消す
    localStorage.removeItem("selectedBgId_" + currentPageName);
}

// モーダルを閉じる
function closeBgModal() {
    const modal = document.getElementById("bg-modal");
    if (modal) modal.style.display = "none";
}

/* ----- 以降、IndexedDB操作ヘルパー ----- */


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
            resolve(evt.target.result); // 生成ID
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
