/***********************************************
 * avatar.js
 * あなたの分身(アバター)管理用スクリプト
 ***********************************************/

(function () {
  let currentAvatarData = null; // IndexedDBからロードしたデータを保持
  const AVATAR_STORE_KEY = "myAvatar"; // 本サンプルでは常に1件想定

  /**
   * 初期化：ページ読み込み後に呼び出し
   */
  function initAvatar() {
    // 「あなたの分身」ボタンを押すと multiModal で開く
    const btn = document.getElementById("you-avatar-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        await openAvatarModal();
      });
    }
  }

  /**
   * モーダルを開く (multiModal)
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
        job: "",
        serif: "",
        rarity: "★1", // 初期値
        imageData: "",   // 生成画像をbase64で保持
        imagePrompt: "", // 画像生成用プロンプト(必要なら)
      };
    }

    // multiModalでフォームUIを動的に表示
    multiModal.open({
      title: "あなたの分身",
      contentHtml: buildAvatarModalHtml(currentAvatarData),
      appearanceType: "center",
      showCloseButton: true,         // 右上×ボタン
      closeOnOutsideClick: true,
      // 「閉じる」をキャンセルボタンとする
      cancelLabel: "閉じる",
      // 追加ボタンに「保存」を用意
      additionalButtons: [
        {
          label: "保存",
          onClick: () => onSaveAvatar()
        }
      ],
      onOpen: () => {
        // モーダルが表示されたあとでイベント紐付け
        // 性別チップ表示
        setupChips(
          "avatar-gender-chips",
          ["男", "女", "不定"],
          currentAvatarData.gender,
          (val) => { currentAvatarData.gender = val; }
        );
        // レア度チップ表示
        setupChips(
          "avatar-rarity-chips",
          ["★1", "★2", "★3", "★4", "★5"],
          currentAvatarData.rarity,
          (val) => { currentAvatarData.rarity = val; }
        );
        // プレビューを描画
        renderAvatarCardPreview();
      }
    });
  }

  /**
   * フォームHTMLを組み立て
   */
  function buildAvatarModalHtml(avatarData) {
    return `
<div class="l-flexbox mobile-col">
  <!-- カード表示プレビュー -->
  <div id="avatar-card-preview-container" style="margin-bottom:20px;"></div>

  <div id="avatar-form-container">
    <!-- フォームエリア -->
    <label>名前</label>
    <input type="text" id="avatar-name" placeholder="名前を入力" value="${DOMPurify.sanitize(avatarData.name)}" />

    <label>性別</label>
    <!-- ▼ 性別チップ表示 -->
    <div id="avatar-gender-chips" class="chips-container" style="margin-bottom:20px;"></div>

    <label>特技</label>
    <textarea id="avatar-skill" rows="1">${DOMPurify.sanitize(avatarData.skill)}</textarea>

    <label>職業</label>
    <textarea id="avatar-job" rows="1">${DOMPurify.sanitize(avatarData.job)}</textarea>

    <label>カードのセリフ</label>
    <textarea id="avatar-serif" rows="2">${DOMPurify.sanitize(avatarData.serif)}</textarea>

    <label>レア度</label>
    <!-- ▼ レア度チップ表示 -->
    <div id="avatar-rarity-chips" class="chips-container" style="margin-bottom:20px;"></div>

    <!-- 「保存」「閉じる」ボタンは multiModalの additionalButtons, cancelLabel に任せる -->
  </div>
</div>
`;
  }

  /**
   * 性別やレア度のチップUIをセットアップ
   */
  function setupChips(containerId, valueList, currentValue, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    valueList.forEach(val => {
      const chip = document.createElement("div");
      chip.className = "chip chip-mini";
      chip.textContent = val;
      chip.setAttribute("data-value", val);
      if (val === currentValue) {
        chip.classList.add("selected");
      }
      chip.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        onChange(val);
      });
      container.appendChild(chip);
    });
  }

  /**
   * 「保存」ボタン処理
   */
  async function onSaveAvatar() {
    // フォームから取得
    const nameEl = document.getElementById("avatar-name");
    const skillEl = document.getElementById("avatar-skill");
    const jobEl = document.getElementById("avatar-job");
    const serifEl = document.getElementById("avatar-serif");

    if (!nameEl || !skillEl || !jobEl || !serifEl) {
      showToast("フォーム要素が見つかりません。");
      return;
    }
    currentAvatarData.name = nameEl.value.trim();
    currentAvatarData.skill = skillEl.value.trim();
    currentAvatarData.job = jobEl.value.trim();
    currentAvatarData.serif = serifEl.value.trim();

    // DB保存
    await saveAvatarData(currentAvatarData);

    showToast("保存しました。");

    // 再描画
    renderAvatarCardPreview();
  }

  /**
   * カードプレビュー描画
   */
  function renderAvatarCardPreview() {
    const previewContainer = document.getElementById("avatar-card-preview-container");
    if (!previewContainer) return;

    previewContainer.innerHTML = "";

    if (!currentAvatarData) return;
    const rarityNum = parseInt((currentAvatarData.rarity || "").replace("★", ""), 10) || 1;

    // カード要素
    const cardEl = document.createElement("div");
    cardEl.className = "card rarity" + rarityNum;

    const cardInner = document.createElement("div");
    cardInner.className = "card-inner";

    // front
    const cardFront = document.createElement("div");
    cardFront.className = "card-front";
    cardFront.innerHTML = `<div class="bezel rarity${rarityNum}"></div>`;

    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = "アバター";
    cardFront.appendChild(typeEl);

    // 画像
    const imageContainer = document.createElement("div");
    imageContainer.className = "card-image";
    if (currentAvatarData.imageData) {
      // 画像あり -> クリックでプレビュー
      const imgEl = document.createElement("img");
      imgEl.src = currentAvatarData.imageData;
      imgEl.alt = currentAvatarData.name || "avatar";
      imgEl.addEventListener("click", () => {
        openAvatarImagePreview(currentAvatarData.imageData);
      });
      imageContainer.appendChild(imgEl);
    } else {
      // 画像生成ボタン
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

    // 下部情報
    const infoContainer = document.createElement("div");
    infoContainer.className = "card-info";
    // 名前
    const nameP = document.createElement("p");
    nameP.innerHTML = `<h3>${DOMPurify.sanitize(currentAvatarData.name || "")}</h3>`;
    infoContainer.appendChild(nameP);
    // 性別
    const genderP = document.createElement("p");
    genderP.innerHTML = `<strong>性別：</strong>${DOMPurify.sanitize(currentAvatarData.gender || "")}`;
    infoContainer.appendChild(genderP);
    // 特技
    if (currentAvatarData.skill) {
      const skillP = document.createElement("p");
      skillP.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(currentAvatarData.skill)}`;
      infoContainer.appendChild(skillP);
    }
    // 職業
    if (currentAvatarData.job) {
      const jobP = document.createElement("p");
      jobP.innerHTML = `<strong>職業：</strong>${DOMPurify.sanitize(currentAvatarData.job)}`;
      infoContainer.appendChild(jobP);
    }
    // セリフ
    if (currentAvatarData.serif) {
      const serifP = document.createElement("p");
      serifP.innerHTML = `<span>${DOMPurify.sanitize(currentAvatarData.serif)}</span>`;
      infoContainer.appendChild(serifP);
    }

    cardFront.appendChild(infoContainer);

    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>アバター</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);

    previewContainer.appendChild(cardEl);

    // 画像削除ボタン (画像がある場合のみ)
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
   * 画像プレビュー (multiModal で開く / ボタンなし)
   */
  function openAvatarImagePreview(dataUrl) {
    multiModal.open({
      title: "アバター画像プレビュー",
      contentHtml: `
        <div style="text-align:center; background-color:#000; padding:10px;">
          <img src="${DOMPurify.sanitize(dataUrl)}" 
               style="max-width:95vw; max-height:95vh; object-fit:contain;" />
        </div>
      `,
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true
    });
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
    const twStyele = (rarityNum >= 3) ? "tall image" : "wide image";
    const promptForImage = buildAvatarPrompt(avatar);
    const promptText = `As a high-performance chatbot, you create the highest quality illustrations discreetly.
Please do not include text in illustrations for any reason.
Now generate the next anime ${twStyele}.
↓↓↓↓↓↓
` + (promptForImage || "");

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

  function buildAvatarPrompt(avatar) {
    return `
p;ease generate an image of the character.
Job is ${avatar.job} . gender is ${avatar.gender}.
Special Skills is ${avatar.skill}.
{Please do not enter any characters}
`.trim();
  }

  /**
   * IndexedDB保存
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

  // グローバル公開
  window.initAvatar = initAvatar;

})();
