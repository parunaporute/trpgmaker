// characterCreate.js

// トースト表示用の簡易関数
function showToast(message) {
  // 既存トーストがあれば削除
  const oldToast = document.getElementById("toast-message");
  if (oldToast) {
    oldToast.remove();
  }
  // 新規トースト要素
  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  // スタイル適用
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

  // フェードイン
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // 3秒後にフェードアウトして削除
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

// グローバル変数
window.apiKey = localStorage.getItem("apiKey") || "";
window.characterData = [];

// 「舞台」は複数 => 配列
// 「雰囲気」は単一
let storedStageArr = [];
let storedMood = "";

// カスタム候補
let customStageChips = [];
let customMoodChips = [];

// 「その他」モーダルで現在操作中のカテゴリ
let currentOtherCategory = "";

// 削除確認用
let deletingChipLabel = "";
let deletingChipCategory = "";

// ページ読み込み時
window.addEventListener("load", async function () {
  // 1) IndexedDB初期化 & キャラデータロード
  await initIndexedDB();
  const storedChars = await loadCharacterDataFromIndexedDB();
  if (storedChars) {
    window.characterData = storedChars;
  }

  // 2) localStorage から読み込み(舞台, 雰囲気)
  const stageJson = localStorage.getItem("elementStageArr");
  if (stageJson) {
    try {
      storedStageArr = JSON.parse(stageJson);
    } catch (e) {
      storedStageArr = [];
    }
  } else {
    storedStageArr = [];
  }
  storedMood = localStorage.getItem("elementMood") || "";

  // カスタムチップ読み込み
  customStageChips = loadCustomChipsFromLocalStorage("customStageChips");
  customMoodChips = loadCustomChipsFromLocalStorage("customMoodChips");

  // 3) UIイベント登録
  document.getElementById("gacha-btn").addEventListener("click", onGachaButton);
  document.getElementById("genre-setting-ok-btn").addEventListener("click", onGenreSettingOk);
  document.getElementById("genre-setting-cancel-btn").addEventListener("click", onGenreSettingCancel);

  // 「その他」モーダル
  document.getElementById("other-generate-btn").addEventListener("click", onOtherGenerate);
  document.getElementById("other-ok-btn").addEventListener("click", onOtherOk);
  document.getElementById("other-cancel-btn").addEventListener("click", onOtherCancel);

  // 「削除」確認モーダル
  document.getElementById("delete-confirm-ok").addEventListener("click", onDeleteConfirmOk);
  document.getElementById("delete-confirm-cancel").addEventListener("click", onDeleteConfirmCancel);

  // 「すべて見る」ボタン
  document.getElementById("see-all-btn").addEventListener("click", onSeeAllCards);

  // プレビュー用モーダルの「閉じる」ボタン
  const previewCloseBtn = document.getElementById("card-preview-close-btn");
  previewCloseBtn.addEventListener("click", () => {
    const modal = document.getElementById("card-image-preview-modal");
    modal.classList.remove("active");
  });

  // ★ モーダル外側クリックで閉じる
  const cardPreviewModal = document.getElementById("card-image-preview-modal");
  cardPreviewModal.addEventListener("click", (e) => {
    if (e.target === cardPreviewModal) {
      cardPreviewModal.classList.remove("active");
    }
  });

  // 4) チップ表示
  initStageChips();
  initMoodChips();

  // 5) 「選んだジャンルの出力例」 ラベル更新
  updateGenreResultLabel();

  // 6) ローカルストレージに記録されている「直近生成カード」一覧を表示
  const storedIdsStr = localStorage.getItem("latestCreatedIds") || "[]";
  let storedIds = [];
  try {
    storedIds = JSON.parse(storedIdsStr);
  } catch (e) {
    storedIds = [];
  }
  displayRecentlyCreatedCards(storedIds);

  // 画面リサイズ時に再度「直近生成カード」を描画し直す
  window.addEventListener("resize", () => {
    const reIdsStr = localStorage.getItem("latestCreatedIds") || "[]";
    let reIds = [];
    try {
      reIds = JSON.parse(reIdsStr);
    } catch (e) {
      reIds = [];
    }
    displayRecentlyCreatedCards(reIds);
  });
});

/** 「その他」カスタムチップ用 */
function loadCustomChipsFromLocalStorage(key) {
  try {
    const j = localStorage.getItem(key);
    if (!j) return [];
    return JSON.parse(j);
  } catch (e) {
    return [];
  }
}
function saveCustomChipsToLocalStorage(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

/* -------------------------
   チップ生成・表示
------------------------- */
function initStageChips() {
  const defaultStageCandidates = [
    "ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク"
  ];
  const container = document.getElementById("stage-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const allStageChips = [...defaultStageCandidates, ...customStageChips, "その他"];
  allStageChips.forEach(label => {
    const chip = createChipElement(label, "stage");
    container.appendChild(chip);
  });
}

function initMoodChips() {
  const defaultMoodCandidates = [
    "ライト / ポップ",
    "中間 / バランス型",
    "ダーク / シリアス"
  ];
  const container = document.getElementById("mood-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const allMoodChips = [...defaultMoodCandidates, ...customMoodChips, "その他"];
  allMoodChips.forEach(label => {
    const chip = createChipElement(label, "mood");
    container.appendChild(chip);
  });
}

function createChipElement(label, category) {
  const isOther = (label === "その他");

  const chip = document.createElement("div");
  chip.className = "chip";
  chip.textContent = label;

  // 選択状態
  if (category === "stage") {
    if (storedStageArr.includes(label)) {
      chip.classList.add("selected");
    }
  } else if (category === "mood") {
    if (storedMood === label) {
      chip.classList.add("selected");
    }
  }

  // クリック動作
  chip.addEventListener("click", () => {
    if (isOther) {
      openOtherModal(category);
      return;
    }
    if (category === "stage") {
      // 複数選択
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        storedStageArr = storedStageArr.filter(x => x !== label);
      } else {
        chip.classList.add("selected");
        storedStageArr.push(label);
      }
      localStorage.setItem("elementStageArr", JSON.stringify(storedStageArr));
    } else if (category === "mood") {
      // 単一
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        storedMood = "";
        localStorage.setItem("elementMood", "");
      } else {
        const container = document.getElementById("mood-chips-container");
        const all = container.querySelectorAll(".chip");
        all.forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        storedMood = label;
        localStorage.setItem("elementMood", storedMood);
      }
    }
    updateGenreResultLabel();
  });

  // カスタム削除ボタン
  if (!isOther) {
    if (category === "stage" && customStageChips.includes(label)) {
      addRemoveButton(chip, label, "stage");
    } else if (category === "mood" && customMoodChips.includes(label)) {
      addRemoveButton(chip, label, "mood");
    }
  }

  return chip;
}

function addRemoveButton(chip, label, category) {
  const span = document.createElement("span");
  span.textContent = "×";
  span.style.marginLeft = "4px";
  span.style.cursor = "pointer";
  span.style.color = "red";
  span.addEventListener("click", (e) => {
    e.stopPropagation();
    deletingChipLabel = label;
    deletingChipCategory = category;
    document.getElementById("delete-confirm-modal").classList.add("active");
  });
  chip.appendChild(span);
}

/** 「その他」モーダル */
function openOtherModal(category) {
  currentOtherCategory = category;
  document.getElementById("other-input-modal-category").textContent =
    (category === "stage") ? "舞台に追加する「その他」" : "雰囲気に追加する「その他」";
  document.getElementById("other-input-text").value = "";
  document.getElementById("other-input-modal").classList.add("active");
}
async function onOtherGenerate() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  let existingList = [];
  if (currentOtherCategory === "stage") {
    existingList = ["ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク", ...customStageChips];
  } else {
    existingList = ["ライト / ポップ", "中間 / バランス型", "ダーク / シリアス", ...customMoodChips];
  }

  const gachaModal = document.getElementById("gacha-modal");
  gachaModal.classList.add("active");
  try {
    const systemPrompt = "あなたは創造力豊かなアシスタントです。回答は1つだけ。";
    const userPrompt = `既存候補:${existingList.join(" / ")}\nこれらに無い新しい案を1つ提案してください。`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const newCandidate = (data.choices[0].message.content || "").trim();
    document.getElementById("other-input-text").value = newCandidate;
  } catch (err) {
    console.error(err);
    showToast("その他生成失敗:\n" + err.message);
  } finally {
    gachaModal.classList.remove("active");
  }
}
function onOtherOk() {
  const text = document.getElementById("other-input-text").value.trim();
  document.getElementById("other-input-modal").classList.remove("active");
  if (!text) return;

  if (currentOtherCategory === "stage") {
    if (!customStageChips.includes(text)) {
      customStageChips.push(text);
      saveCustomChipsToLocalStorage("customStageChips", customStageChips);
    }
    initStageChips();
  } else {
    if (!customMoodChips.includes(text)) {
      customMoodChips.push(text);
      saveCustomChipsToLocalStorage("customMoodChips", customMoodChips);
    }
    initMoodChips();
  }
}
function onOtherCancel() {
  document.getElementById("other-input-modal").classList.remove("active");
}

/** 削除確認モーダル */
function onDeleteConfirmOk() {
  document.getElementById("delete-confirm-modal").classList.remove("active");

  if (deletingChipCategory === "stage") {
    customStageChips = customStageChips.filter(c => c !== deletingChipLabel);
    saveCustomChipsToLocalStorage("customStageChips", customStageChips);
    storedStageArr = storedStageArr.filter(x => x !== deletingChipLabel);
    localStorage.setItem("elementStageArr", JSON.stringify(storedStageArr));
    initStageChips();
  } else {
    customMoodChips = customMoodChips.filter(c => c !== deletingChipLabel);
    saveCustomChipsToLocalStorage("customMoodChips", customMoodChips);
    if (storedMood === deletingChipLabel) {
      storedMood = "";
      localStorage.setItem("elementMood", "");
    }
    initMoodChips();
  }
  deletingChipLabel = "";
  deletingChipCategory = "";
  updateGenreResultLabel();
}
function onDeleteConfirmCancel() {
  deletingChipLabel = "";
  deletingChipCategory = "";
  document.getElementById("delete-confirm-modal").classList.remove("active");
}

/** ジャンルラベル更新 */
function updateGenreResultLabel() {
  let stagePart = storedStageArr.length > 0 ? "【舞台】" + storedStageArr.join(" / ") : "";
  let moodPart = storedMood ? "【雰囲気】" + storedMood : "";
  document.getElementById("genre-result-text").textContent = stagePart + moodPart;
}

/* -------------------------
   ガチャ関連
------------------------- */
function onGachaButton() {
  // ジャンル選択モーダルを開く
  initStageChips();
  initMoodChips();
  document.getElementById("element-genre-modal").classList.add("active");
}
function onGenreSettingOk() {
  document.getElementById("element-genre-modal").classList.remove("active");

  const axisPrompt = buildAxisPrompt();
  const gachaModal = document.getElementById("gacha-modal");
  gachaModal.classList.add("active");

  runGacha(10, axisPrompt).then(() => {
    gachaModal.classList.remove("active");

    // 生成後、最新のIDリストを再取得
    const storedIdsStr = localStorage.getItem("latestCreatedIds") || "[]";
    let storedIds = [];
    try {
      storedIds = JSON.parse(storedIdsStr);
    } catch (e) {
      storedIds = [];
    }
    displayRecentlyCreatedCards(storedIds);

    // レア度3以上の flipped カードがあれば「すべて見る」ボタンを表示
    showSeeAllButtonIfNeeded(storedIds);
  }).catch(err => {
    console.error(err);
    gachaModal.classList.remove("active");
  });
}
function onGenreSettingCancel() {
  document.getElementById("element-genre-modal").classList.remove("active");
}
function buildAxisPrompt() {
  const lines = [];
  if (storedStageArr.length > 0) {
    lines.push("【舞台】" + storedStageArr.join(" / "));
  }
  if (storedMood) {
    lines.push("【雰囲気】" + storedMood);
  }
  return lines.join("\n");
}

/** すべて見るボタンの表示可否 */
function showSeeAllButtonIfNeeded(newIds) {
  const seeAllBtn = document.getElementById("see-all-btn");
  if (!seeAllBtn) return;
  const hasFlipped = window.characterData.some(c => newIds.includes(c.id) && c.flipped);
  seeAllBtn.style.display = hasFlipped ? "inline-block" : "none";
}

/**
 * 「すべて見る」押下
 * -> flipped状態を順番に外すアニメーション
 */
async function onSeeAllCards() {
  const seeAllBtn = document.getElementById("see-all-btn");
  seeAllBtn.style.display = "none";

  const storedIdsStr = localStorage.getItem("latestCreatedIds") || "[]";
  let storedIds = [];
  try {
    storedIds = JSON.parse(storedIdsStr);
  } catch (e) {
    storedIds = [];
  }

  // フリップされているカードだけ取り出す
  const flippedCards = window.characterData.filter(c => storedIds.includes(c.id) && c.flipped);

  // 順番に1枚ずつフリップを外す
  for (let i = 0; i < flippedCards.length; i++) {
    const c = flippedCards[i];
    c.flipped = false; // データ更新

    // DOM上の該当カードを検索して flippedクラスを外す
    const cardEl = document.querySelector(`.card[data-id="${c.id}"]`);
    if (cardEl && cardEl.classList.contains("flipped")) {
      cardEl.classList.remove("flipped");
    }

    // 100ms ずつディレイを入れて順番に外す
    // (数値はお好みで変更)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 全部外したら保存して再描画
  if (flippedCards.length > 0) {
    await saveCharacterDataToIndexedDB(window.characterData);
  }
  displayRecentlyCreatedCards(storedIds);
}

/** 直近生成したカードを表示 */
function displayRecentlyCreatedCards(cardIds) {
  const container = document.getElementById("card-container");
  if (!container) return;
  container.innerHTML = "";

  if (!cardIds || cardIds.length === 0) {
    container.textContent = "まだエレメントが生成されていません。";
    return;
  }

  const toShow = window.characterData.filter(c => cardIds.includes(c.id));
  if (toShow.length === 0) {
    container.textContent = "まだエレメントが生成されていません。";
    return;
  }

  toShow.forEach(ch => {
    const cardEl = createCardElement(ch);
    container.appendChild(cardEl);
  });
  fillDummyItemsForLastRow(container, toShow.length);
}

/** カードDOM生成 */
function createCardElement(char) {
  const card = document.createElement("div");
  card.className = "card rarity" + char.rarity.replace("★", "").trim();
  card.setAttribute("data-id", char.id);

  if (char.flipped) {
    card.classList.add("flipped");
  }

  card.addEventListener("click", () => {
    if (card.classList.contains("flipped")) {
      card.classList.remove("flipped");
      char.flipped = false;
      const idx = window.characterData.findIndex(c => c.id === char.id);
      if (idx !== -1) {
        window.characterData[idx].flipped = false;
      }
      saveCharacterDataToIndexedDB(window.characterData);
    } else {
      if (char.imageData) {
        openCardPreview(char.imageData);
      } else {
        showToast("画像がありません");
      }
    }
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  const rarityValue = (typeof char.rarity === "string")
    ? char.rarity.replace("★", "").trim()
    : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  // 背景CSS
  const bgStyle = (char.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bgStyle) {
    cardFront.style.backgroundImage = bgStyle;
  }

  // タイプ
  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = char.type || "不明";
  cardFront.appendChild(typeEl);

  // 画像
  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if (char.imageData) {
    const imageEl = document.createElement("img");
    imageEl.src = char.imageData;
    imageEl.alt = char.name;
    imageContainer.appendChild(imageEl);
  } else {
    const genImgBtn = document.createElement("button");
    genImgBtn.className = "gen-image-btn";
    genImgBtn.textContent = "画像生成";
    genImgBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      generateCharacterImage(char, genImgBtn);
    });
    imageContainer.appendChild(genImgBtn);
  }
  cardFront.appendChild(imageContainer);

  // 情報
  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = `<h3>${DOMPurify.sanitize(char.name)}</h3>`;
  infoContainer.appendChild(nameEl);

  if (char.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(char.state)}`;
    infoContainer.appendChild(stateEl);
  }
  const specialEl = document.createElement("p");
  specialEl.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(char.special)}`;
  infoContainer.appendChild(specialEl);

  const captionEl = document.createElement("p");
  captionEl.innerHTML = `<span>${DOMPurify.sanitize(char.caption)}</span>`;
  infoContainer.appendChild(captionEl);

  cardFront.appendChild(infoContainer);

  // 裏面
  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(char.type)}</strong>`;

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  card.appendChild(cardInner);

  return card;
}

/** 画像プレビューを表示 */
function openCardPreview(imageUrl) {
  const modal = document.getElementById("card-image-preview-modal");
  const imgEl = document.getElementById("card-preview-img");
  imgEl.src = imageUrl;
  modal.classList.add("active");
}

/** 画像生成 */
async function generateCharacterImage(char, btnElement) {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  if (btnElement) {
    btnElement.disabled = true;
  }
  showToast("画像を生成しています...");

  const promptText =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
    (char.imageprompt || "");

  const rarityNum = parseInt(char.rarity.replace("★", "").trim()) || 0;
  const size = (rarityNum >= 3) ? "1024x1792" : "1792x1024";

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`,
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
    if (data.error) {
      throw new Error(data.error.message);
    }
    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // 更新
    const idx = window.characterData.findIndex(c => c.id === char.id);
    if (idx !== -1) {
      window.characterData[idx].imageData = dataUrl;
      await saveCharacterDataToIndexedDB(window.characterData);
    }

    showToast("画像の生成が完了しました");
    // 再描画
    const storedIdsStr = localStorage.getItem("latestCreatedIds") || "[]";
    let storedIds = [];
    try {
      storedIds = JSON.parse(storedIdsStr);
    } catch (e) {
      storedIds = [];
    }
    displayRecentlyCreatedCards(storedIds);
  } catch (err) {
    console.error("画像生成失敗:", err);
    showToast("画像生成に失敗しました:\n" + err.message);
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
    }
  }
}

/* 最終行ダミー埋め */
function fillDummyItemsForLastRow(container, realCount) {
  const firstCard = container.querySelector(".card:not(.dummy)");
  if (!firstCard) return;

  const style = getComputedStyle(firstCard);
  const cardWidth = parseFloat(style.width);
  const containerWidth = container.clientWidth;
  if (containerWidth <= 0 || isNaN(cardWidth)) return;

  const containerStyle = getComputedStyle(container);
  const gapStr = containerStyle.columnGap || containerStyle.gap || "0";
  const gap = parseFloat(gapStr) || 0;

  let itemsPerRow = 1;
  for (let n = 1; n < 999; n++) {
    const total = n * cardWidth + (n - 1) * gap;
    if (total <= containerWidth) {
      itemsPerRow = n;
    } else {
      break;
    }
  }

  const remainder = realCount % itemsPerRow;
  if (remainder === 0) return;
  const dummyCount = itemsPerRow - remainder;
  for (let i = 0; i < dummyCount; i++) {
    const dummyEl = document.createElement("div");
    dummyEl.className = "card dummy";
    container.appendChild(dummyEl);
  }
}
