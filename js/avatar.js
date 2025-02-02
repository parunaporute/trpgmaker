/***********************************************
 * avatar.js
 * あなたの分身(アバター)管理用スクリプト
 ***********************************************/

(function () {
  let avatarModal = null;
  let avatarPreviewModal = null;
  let currentAvatarData = null; // IndexedDBからロードしたデータを保持
  const AVATAR_STORE_KEY = "myAvatar"; // 本サンプルでは常に1件想定

  /**
   * 初期化：ページ読み込み後に呼び出し
   */
  function initAvatar() {
    // モーダルDOMが無ければ生成
    ensureAvatarModalExists();

    // 「あなたの分身」ボタンを押すとモーダルを開く
    const btn = document.getElementById("you-avatar-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        await openAvatarModal();
      });
    }
  }

  /**
   * モーダルDOMを用意（なければ生成）
   */
  function ensureAvatarModalExists() {
    if (document.getElementById("avatar-modal")) {
      avatarModal = document.getElementById("avatar-modal");
      avatarPreviewModal = document.getElementById("avatar-image-preview-modal");
      return;
    }

    // チップUIに置き換えたHTML
    const modalHTML = `
<div id="avatar-modal" class="modal">
  <div class="modal-content">
    <h2>あなたの分身</h2>
    <div class="l-flexbox mobile-col">
        <!-- カード表示プレビュー -->
        <div id="avatar-card-preview-container" style="margin-bottom:20px;"></div>

        <div id="avatar-form-container">
        <!-- フォームエリア -->
        <label>名前</label>
        <input type="text" id="avatar-name" placeholder="名前を入力" />

        <label>性別</label>
        <!-- ▼ 性別チップ表示 -->
        <div id="avatar-gender-chips" class="chips-container" style="margin-bottom:20px;">
            <!-- ここに後でJSでチップを生成して挿入します -->
        </div>

        <label>特技</label>
        <textarea id="avatar-skill" rows="1"></textarea>

        <label>カードのセリフ</label>
        <textarea id="avatar-serif" rows="2"></textarea>

        <label>レア度</label>
        <!-- ▼ レア度チップ表示 -->
        <div id="avatar-rarity-chips" class="chips-container" style="margin-bottom:20px;">
            <!-- ここに後でJSでチップを生成して挿入します -->
        </div>

        <div class="c-flexbox">
            <button id="avatar-save-btn">保存</button>
            <button id="avatar-close-btn" class="btn-close-modal">閉じる</button>
        </div>
        </div>
    </div>
  </div>
</div>

<!-- 画像プレビュー用モーダル -->
<div id="avatar-image-preview-modal" class="modal">
  <div class="modal-content">
    <img id="avatar-preview-img" src="" alt="avatar image" style="max-width:95vw; max-height:95vh;" />
    <button id="avatar-preview-close-btn" style="margin-top:10px;">閉じる</button>
  </div>
</div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    avatarModal = document.getElementById("avatar-modal");
    avatarPreviewModal = document.getElementById("avatar-image-preview-modal");

    // イベント設定
    // 閉じる
    document.getElementById("avatar-close-btn").addEventListener("click", closeAvatarModal);
    avatarModal.addEventListener("click", (e) => {
      if (e.target === avatarModal) {
        closeAvatarModal();
      }
    });

    // 保存
    document.getElementById("avatar-save-btn").addEventListener("click", onSaveAvatar);

    // プレビュー閉じる
    document.getElementById("avatar-preview-close-btn").addEventListener("click", () => {
      avatarPreviewModal.classList.remove("active");
    });
    avatarPreviewModal.addEventListener("click", (e) => {
      if (e.target === avatarPreviewModal) {
        avatarPreviewModal.classList.remove("active");
      }
    });
  }

  /**
   * モーダルを開く
   */
  async function openAvatarModal() {
    // IndexedDBから既存データを読み込み
    currentAvatarData = await loadAvatarData(AVATAR_STORE_KEY);
    if (!currentAvatarData) {
      // 既存が無いなら新規オブジェクトを仮作成
      currentAvatarData = {
        id: AVATAR_STORE_KEY,
        name: "",
        gender: "男",   // 初期値
        skill: "",
        serif: "",
        rarity: "★1", // 初期値
        imageData: "",   // 生成画像をbase64で保持
        imagePrompt: "", // 画像生成用プロンプト(必要なら)
      };
    }

    // フォームに反映
    document.getElementById("avatar-name").value = currentAvatarData.name || "";
    document.getElementById("avatar-skill").value = currentAvatarData.skill || "";
    document.getElementById("avatar-serif").value = currentAvatarData.serif || "";

    // チップUI生成
    setupChips("avatar-gender-chips", ["男","女","不定"], currentAvatarData.gender, (val) => {
      currentAvatarData.gender = val;
    });
    setupChips("avatar-rarity-chips", ["★1","★2","★3","★4","★5"], currentAvatarData.rarity, (val) => {
      currentAvatarData.rarity = val;
    });

    // カードプレビュー描画
    renderAvatarCardPreview();

    // モーダルを表示
    avatarModal.classList.add("active");
  }

  /**
   * チップUIの共通セットアップ
   * @param {string} containerId チップを入れる要素のID
   * @param {string[]} valueList 表示する候補文字列
   * @param {string} currentValue 現在選択中の値
   * @param {function} onChange 選択が変わった時のコールバック
   */
  function setupChips(containerId, valueList, currentValue, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // いったんクリア
    container.innerHTML = "";

    // 候補ごとにchip要素を生成
    valueList.forEach(val => {
      const chip = document.createElement("div");
      chip.className = "chip chip-mini";
      chip.textContent = val;
      chip.setAttribute("data-value", val);

      // 既存データと一致すれば選択状態
      if (val === currentValue) {
        chip.classList.add("selected");
      }

      // イベント
      chip.addEventListener("click", () => {
        // 他のチップの selected を外す
        container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
        // 自分を selected に
        chip.classList.add("selected");

        // コールバックで値を返す
        onChange(val);
      });

      container.appendChild(chip);
    });
  }

  /**
   * モーダルを閉じる
   */
  function closeAvatarModal() {
    avatarModal.classList.remove("active");
    avatarPreviewModal.classList.remove("active");
  }

  /**
   * 保存ボタンクリック
   */
  async function onSaveAvatar() {
    // フォームから取得（チップ選択分は currentAvatarData に既に入っている）
    currentAvatarData.name = document.getElementById("avatar-name").value.trim();
    currentAvatarData.skill = document.getElementById("avatar-skill").value.trim();
    currentAvatarData.serif = document.getElementById("avatar-serif").value.trim();

    // IndexedDBへ保存
    await saveAvatarData(currentAvatarData);

    showToast("保存しました。");

    // カードプレビュー更新
    renderAvatarCardPreview();
  }

  /**
   * カードプレビューを描画
   */
  function renderAvatarCardPreview() {
    const previewContainer = document.getElementById("avatar-card-preview-container");
    if (!previewContainer) return;

    // いったんクリア
    previewContainer.innerHTML = "";

    // 未保存(または保存済みでもデータが無い)場合
    if (!currentAvatarData) return;

    // カード要素
    // 既存styles.cssのカード風デザインを踏襲
    const rarityNum = parseInt((currentAvatarData.rarity || "").replace("★", ""), 10) || 1;
    const cardEl = document.createElement("div");
    cardEl.className = "card rarity" + rarityNum;

    // 回転(裏面)は無い想定なら固定でOK
    const cardInner = document.createElement("div");
    cardInner.className = "card-inner";

    // 表面
    const cardFront = document.createElement("div");
    cardFront.className = "card-front";
    cardFront.innerHTML = `<div class='bezel rarity${rarityNum}'></div>`;

    // タイプ表示は「分身」的にしてみる
    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = "アバター";
    cardFront.appendChild(typeEl);

    // 画像部分
    const imageContainer = document.createElement("div");
    imageContainer.className = "card-image";
    if (currentAvatarData.imageData) {
      // 画像あり → クリックで拡大
      const imgEl = document.createElement("img");
      imgEl.src = currentAvatarData.imageData;
      imgEl.alt = currentAvatarData.name || "avatar";
      imgEl.addEventListener("click", () => {
        openAvatarImagePreview(currentAvatarData.imageData);
      });
      imageContainer.appendChild(imgEl);
    } else {
      // 生成ボタン
      const genBtn = document.createElement("button");
      genBtn.className = "gen-image-btn";
      genBtn.textContent = "画像生成";
      genBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await generateAvatarImage(currentAvatarData, genBtn);
      });
      imageContainer.appendChild(genBtn);
    }
    cardFront.appendChild(imageContainer);

    // カード下部の情報
    const infoContainer = document.createElement("div");
    infoContainer.className = "card-info";

    // 名前
    const nameEl = document.createElement("p");
    nameEl.innerHTML = `<h3>${DOMPurify.sanitize(currentAvatarData.name || "")}</h3>`;
    infoContainer.appendChild(nameEl);

    // 性別
    const genderEl = document.createElement("p");
    genderEl.innerHTML = `<strong>性別：</strong>${DOMPurify.sanitize(currentAvatarData.gender || "")}`;
    infoContainer.appendChild(genderEl);

    // 特技
    if (currentAvatarData.skill) {
      const skillEl = document.createElement("p");
      skillEl.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(currentAvatarData.skill)}`;
      infoContainer.appendChild(skillEl);
    }

    // セリフ
    if (currentAvatarData.serif) {
      const serifEl = document.createElement("p");
      serifEl.innerHTML = `<span>${DOMPurify.sanitize(currentAvatarData.serif)}</span>`;
      infoContainer.appendChild(serifEl);
    }

    cardFront.appendChild(infoContainer);

    // 裏面(使わないなら簡素でOK)
    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>アバター</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);

    previewContainer.appendChild(cardEl);

    // 画像削除ボタン（画像がある場合のみ表示）
    if (currentAvatarData.imageData) {
      const delBtn = document.createElement("button");
      delBtn.style.marginTop = "10px";
      delBtn.textContent = "画像削除";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        currentAvatarData.imageData = "";
        await saveAvatarData(currentAvatarData);
        renderAvatarCardPreview();
      });
      previewContainer.appendChild(delBtn);
    }
  }

  /**
   * 画像プレビューを拡大表示
   */
  function openAvatarImagePreview(dataUrl) {
    const imgEl = document.getElementById("avatar-preview-img");
    if (!imgEl) return;
    imgEl.src = dataUrl;
    avatarPreviewModal.classList.add("active");
  }

  /**
   * 画像生成
   */
  async function generateAvatarImage(avatar, btnElement) {
    const apiKey = window.apiKey || localStorage.getItem("apiKey");
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }
    if (btnElement) btnElement.disabled = true;
    showToast("画像を生成しています...");

    // レア度でサイズ分岐 (★3以上は縦長)
    const rarityNum = parseInt((avatar.rarity || "").replace("★", ""), 10) || 0;
    const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";

    // 画像生成用の英語スクリプト
    // （NGワード "goblin" を含まないよう注意）
    const promptForImage = buildAvatarPrompt(avatar);

    const promptText =
      "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
      "Please do not include text in illustrations for any reason." +
      "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
      promptForImage;

    try {
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
          size,
          response_format: "b64_json",
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const base64 = data.data[0].b64_json;
      const dataUrl = "data:image/png;base64," + base64;

      // DB更新
      avatar.imageData = dataUrl;
      await saveAvatarData(avatar);

      showToast("画像の生成が完了しました");
      renderAvatarCardPreview();
    } catch (err) {
      console.error(err);
      showToast("画像生成に失敗しました:\n" + err.message);
    } finally {
      if (btnElement) btnElement.disabled = false;
    }
  }

  /**
   * アバター専用の英語プロンプトを組み立て
   */
  function buildAvatarPrompt(avatar) {
    return `
Name is ${avatar.name}.
Gender is ${avatar.gender}.
Skill is ${avatar.skill}.
Serif is ${avatar.serif}.
Rarity is ${avatar.rarity}.
(Do not use the word 'goblin'.)
`.trim();
  }

  /**
   * IndexedDB関連：保存/読み込み
   */
  function saveAvatarData(avatarObj) {
    return new Promise((resolve, reject) => {
      if (!db) {
        console.error("IndexedDB未初期化です。");
        resolve();
        return;
      }
      const tx = db.transaction("avatarData", "readwrite");
      const store = tx.objectStore("avatarData");
      const req = store.put(avatarObj);
      req.onsuccess = () => resolve();
      req.onerror = (err) => reject(err);
    });
  }

  function loadAvatarData(id) {
    return new Promise((resolve, reject) => {
      if (!db) {
        console.error("IndexedDB未初期化です。");
        resolve(null);
        return;
      }
      const tx = db.transaction("avatarData", "readonly");
      const store = tx.objectStore("avatarData");
      const getReq = store.get(id);
      getReq.onsuccess = (evt) => {
        resolve(evt.target.result || null);
      };
      getReq.onerror = (err) => {
        reject(err);
      };
    });
  }

  /**
   * 簡易トースト
   */
  function showToast(message) {
    const oldToast = document.getElementById("avatar-toast-message");
    if (oldToast) {
      oldToast.remove();
    }

    const toast = document.createElement("div");
    toast.id = "avatar-toast-message";
    toast.textContent = message;

    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 20px";
    toast.style.borderRadius = "4px";
    toast.style.fontSize = "14px";
    toast.style.zIndex = "9999";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });

    // 3秒後に消す
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.addEventListener("transitionend", () => {
        toast.remove();
      });
    }, 3000);
  }

  // グローバル公開
  window.initAvatar = initAvatar;

})();
