// characterCreate.js

// トースト表示用の簡易関数
function showToast(message) {
    // 既存トーストがあれば削除
    const oldToast = document.getElementById("toast-message");
    if (oldToast) {
        oldToast.remove();
    }

    // 新規トースト要素を作成
    const toast = document.createElement("div");
    toast.id = "toast-message";
    toast.textContent = message;

    // スタイルを付与
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

// キャラクタ情報 [{ id, ... }, ...]
window.characterData = [];
let isSelectionMode = false;  // 選択モードフラグ

// 「舞台」は複数 => 配列にする
// 「テーマ」は単一だが非表示 => 文字列1つ
// 「雰囲気」は単一 => 文字列1つ
let storedStageArr = [];  // 舞台の配列
let storedTheme = "";     // テーマ(非表示)
let storedMood = "";      // 雰囲気(単一)

window.addEventListener("load", async function () {
    // 1) IndexedDB初期化 & キャラデータロード
    await initIndexedDB();
    const storedChars = await loadCharacterDataFromIndexedDB();
    if (storedChars) {
        window.characterData = storedChars;
    }
    displayCharacterCards(window.characterData);

    // 2) localStorage から読み込み
    // 舞台は配列を JSON文字列 で保存している想定
    const stageJson = localStorage.getItem("elementStageArr");
    if (stageJson) {
      try {
        storedStageArr = JSON.parse(stageJson);
      } catch(e) {
        storedStageArr = [];
      }
    } else {
      storedStageArr = []; // 初期状態
    }
    storedTheme = localStorage.getItem("elementTheme") || "アクション / 冒険"; 
    storedMood  = localStorage.getItem("elementMood")  || "ライト / ポップ";

    // 3) UIイベント登録
    document.getElementById("gacha-btn").addEventListener("click", onGachaButton);
    document.getElementById("move-gacha-to-warehouse-btn").addEventListener("click", onMoveGachaToWarehouse);
    document.getElementById("toggle-selection-mode-btn").addEventListener("click", toggleSelectionMode);
    document.getElementById("move-selected-to-warehouse-btn").addEventListener("click", moveSelectedCardsToWarehouse);

    // モーダルのOK/Cancel
    document.getElementById("genre-setting-ok-btn").addEventListener("click", onGenreSettingOk);
    document.getElementById("genre-setting-cancel-btn").addEventListener("click", onGenreSettingCancel);

    // 4) 舞台/テーマ/雰囲気 用のチップを生成
    initStageChips();
    initThemeChips(); // 非表示だけど初期化
    initMoodChips();
});

/** 「舞台」チップを生成 (複数選択可) */
function initStageChips() {
    const stageCandidates = [
      "ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク"
    ];
    const container = document.getElementById("stage-chips-container");
    container.innerHTML = "";  // クリア

    stageCandidates.forEach(label => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = label;
      // 既に storedStageArr に含まれていれば selected表示
      if (storedStageArr.includes(label)) {
        chip.classList.add("selected");
      }
      chip.addEventListener("click", () => {
        // toggle
        if (chip.classList.contains("selected")) {
          chip.classList.remove("selected");
          // 配列から削除
          storedStageArr = storedStageArr.filter(x => x !== label);
        } else {
          chip.classList.add("selected");
          // 配列に追加
          storedStageArr.push(label);
        }
      });
      container.appendChild(chip);
    });
}

/** 「テーマ」チップを生成 (単一選択, ただしUIは非表示) */
function initThemeChips() {
    const themeCandidates = [
      "アクション / 冒険",
      "ミステリー / サスペンス",
      "ロマンス / ドラマ",
      "コメディ / ほのぼの",
      "ホラー / スリラー"
    ];
    const container = document.getElementById("theme-chips-container");
    container.innerHTML = "";

    themeCandidates.forEach(label => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = label;

      if (storedTheme === label) {
        chip.classList.add("selected");
      }
      // 単一なので、クリックされたら他を解除
      chip.addEventListener("click", () => {
        // いったん全部クリア
        const allChips = container.querySelectorAll(".chip");
        allChips.forEach(c => c.classList.remove("selected"));
        // 自分だけON
        chip.classList.add("selected");
        storedTheme = label;
      });
      container.appendChild(chip);
    });
}

/** 「雰囲気」チップを生成 (単一選択) */
function initMoodChips() {
    const moodCandidates = [
      "ライト / ポップ",
      "中間 / バランス型",
      "ダーク / シリアス"
    ];
    const container = document.getElementById("mood-chips-container");
    container.innerHTML = "";

    moodCandidates.forEach(label => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = label;

      if (storedMood === label) {
        chip.classList.add("selected");
      }
      // 単一なので、クリックされたら他を解除
      chip.addEventListener("click", () => {
        const allChips = container.querySelectorAll(".chip");
        allChips.forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        storedMood = label;
      });
      container.appendChild(chip);
    });
}

/** ガチャボタン押下時 → 3軸モーダルを開く */
function onGachaButton() {
    openGenreModal();
}

/** 3軸モーダルを開く */
function openGenreModal() {
    // 一度、現在のチップ状態を反映(念のため再描画)
    initStageChips();
    initThemeChips();
    initMoodChips();

    document.getElementById("element-genre-modal").style.display = "flex";
}

/** 3軸モーダル: OK */
function onGenreSettingOk() {
    // 1) 現在の舞台（複数）を localStorage に JSON保存
    localStorage.setItem("elementStageArr", JSON.stringify(storedStageArr));
    // 2) テーマ/雰囲気も保存
    localStorage.setItem("elementTheme", storedTheme);
    localStorage.setItem("elementMood", storedMood);

    // モーダル閉じる
    document.getElementById("element-genre-modal").style.display = "none";

    // ガチャ確認モーダルを開く
    const confirmModal = document.getElementById("gacha-confirm-modal");
    confirmModal.style.display = "flex";

    const okBtn = document.getElementById("gacha-confirm-ok");
    const cancelBtn = document.getElementById("gacha-confirm-cancel");

    okBtn.onclick = async () => {
        confirmModal.style.display = "none";
        clearGachaBox();

        // プロンプト組み立て
        // 舞台が複数の場合、つなげて表現する or 箇条書きにする
        // 例："ファンタジー / SF / 現代" など
        let stageLine = "";
        if (storedStageArr.length > 0) {
          stageLine = "【舞台】" + storedStageArr.join(" / ");
        }

        let themeLine = "";
        if (storedTheme) {
          themeLine = "【テーマ】" + storedTheme;
        }

        let moodLine = "";
        if (storedMood) {
          moodLine = "【雰囲気】" + storedMood;
        }

        const lines = [];
        if (stageLine) lines.push(stageLine);
        if (themeLine) lines.push(themeLine);
        if (moodLine)  lines.push(moodLine);

        const axisPrompt = lines.join("\n");

        // ガチャ実行
        document.getElementById("gacha-modal").style.display = "flex";
        await runGacha(10, axisPrompt);
        hideGachaModal();

        displayCharacterCards(window.characterData);
    };

    cancelBtn.onclick = () => {
        confirmModal.style.display = "none";
    };
}

/** 3軸モーダル: キャンセル */
function onGenreSettingCancel() {
    document.getElementById("element-genre-modal").style.display = "none";
}


/** ガチャ箱クリア */
function clearGachaBox() {
    window.characterData = window.characterData.filter(card => card.group !== "GachaBox");
}

/** ガチャモーダルを隠す */
function hideGachaModal() {
    const m = document.getElementById("gacha-modal");
    if (m) m.style.display = "none";
}

/** ガチャ箱のカードを倉庫へ */
async function onMoveGachaToWarehouse() {
    let changed = false;
    window.characterData.forEach(card => {
        if (card.group === "GachaBox") {
            card.group = "Warehouse";
            changed = true;
        }
    });
    if (changed) {
        await saveCharacterDataToIndexedDB(window.characterData);
        displayCharacterCards(window.characterData);
        alert("ガチャ箱のカードを倉庫に移動しました。");
    } else {
        alert("ガチャ箱にカードがありません。");
    }
}

/** エレメント一覧の表示 */
function displayCharacterCards(characters) {
    const container = document.getElementById("card-container");
    if (!container) return;

    container.innerHTML = "";
    const visibleCards = characters.filter(
        card => card.group !== "Warehouse" && card.group !== "Party"
    );
    if (visibleCards.length === 0) {
        container.textContent = "エレメントが生成されていません。";
        return;
    }
    visibleCards.forEach((ch) => {
        const realIndex = window.characterData.findIndex(c => c.id === ch.id);
        const cardEl = createCardElement(ch, realIndex);
        container.appendChild(cardEl);
    });
}

/** カードDOM生成 */
function createCardElement(char, index) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-id", char.id);

    card.addEventListener("click", (e) => {
        if (isSelectionMode) {
            e.stopPropagation();
            card.classList.toggle("selected");
            updateMoveSelectedButtonVisibility();
        } else {
            card.classList.toggle("flipped");
        }
    });

    const cardInner = document.createElement("div");
    cardInner.className = "card-inner";

    const cardFront = document.createElement("div");
    cardFront.className = "card-front";
    const bgStyle = (char.backgroundcss || "")
        .replace("background-image:", "")
        .replace("background", "")
        .trim();
    cardFront.style = "background-image:" + bgStyle;

    // レア度
    const rarityValue = (typeof char.rarity === "string") ? char.rarity.replace("★", "").trim() : "0";
    cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

    // タイプ表示
    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = char.type || "不明";
    cardFront.appendChild(typeEl);

    // 画像
    const imageContainer = document.createElement("div");
    imageContainer.className = "card-image";
    if (char.imageData) {
        // すでに画像がある
        const imageEl = document.createElement("img");
        imageEl.src = char.imageData;
        imageEl.alt = char.name;
        imageContainer.appendChild(imageEl);
    } else {
        // 画像が無い → 生成ボタン
        const genImgBtn = document.createElement("button");
        genImgBtn.setAttribute("data-imageprompt", char.imageprompt);
        genImgBtn.className = "gen-image-btn";
        genImgBtn.textContent = "画像生成";

        // 画像生成ボタン押下時にトーストを表示＆ボタンを無効化する
        genImgBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            generateCharacterImage(char, index, genImgBtn);
        });
        imageContainer.appendChild(genImgBtn);
    }
    cardFront.appendChild(imageContainer);

    // 情報
    const infoContainer = document.createElement("div");
    infoContainer.className = "card-info";

    const nameEl = document.createElement("p");
    nameEl.innerHTML = "<h3>" + DOMPurify.sanitize(char.name) + "</h3>";
    infoContainer.appendChild(nameEl);

    if (char.state) {
        const stateEl = document.createElement("p");
        stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(char.state);
        infoContainer.appendChild(stateEl);
    }
    const specialEl = document.createElement("p");
    specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(char.special);
    infoContainer.appendChild(specialEl);

    const captionEl = document.createElement("p");
    captionEl.innerHTML = "<span>" + DOMPurify.sanitize(char.caption) + "</span>";
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

/** 画像生成 */
async function generateCharacterImage(char, index, btnElement) {
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        return;
    }
    // ボタンを無効化
    if (btnElement) {
        btnElement.disabled = true;
    }
    showToast("画像を生成しています...");

    const promptText =
        "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
        "Please do not include text in illustrations for any reason." +
        "If you can do that, I'll give you a super high tip." +
        "Now generate the next anime wide image.\n↓↓↓↓↓↓\n" +
        char.imageprompt;

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
                size: "1792x1024",
                response_format: "b64_json",
            }),
        });
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        const base64 = data.data[0].b64_json;
        const dataUrl = "data:image/png;base64," + base64;
        window.characterData[index].imageData = dataUrl;
        await saveCharacterDataToIndexedDB(window.characterData);

        showToast("画像の生成が完了しました");
        displayCharacterCards(window.characterData);

    } catch (err) {
        console.error("画像生成失敗:", err);
        showToast("画像生成に失敗しました:\n" + err.message);
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
        }
    }
}


/* ===== 選択モード関連 ===== */

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    const btn = document.getElementById("toggle-selection-mode-btn");
    if (isSelectionMode) {
        btn.textContent = "選択モード解除";
    } else {
        btn.textContent = "選択モード";
        const selectedCards = document.querySelectorAll("#card-container .card.selected");
        selectedCards.forEach(card => card.classList.remove("selected"));
    }
    updateMoveSelectedButtonVisibility();
}

function updateMoveSelectedButtonVisibility() {
    const selectedCards = document.querySelectorAll("#card-container .card.selected");
    const moveBtn = document.getElementById("move-selected-to-warehouse-btn");
    if (!moveBtn) return;
    if (isSelectionMode && selectedCards.length > 0) {
        moveBtn.style.display = "inline-block";
    } else {
        moveBtn.style.display = "none";
    }
}

async function moveSelectedCardsToWarehouse() {
    const selectedCards = document.querySelectorAll("#card-container .card.selected");
    if (selectedCards.length === 0) {
        alert("カードが選択されていません。");
        return;
    }
    selectedCards.forEach(el => {
        const cardId = el.getAttribute("data-id");
        const realIndex = window.characterData.findIndex(c => c.id === cardId);
        if (realIndex !== -1) {
            window.characterData[realIndex].group = "Warehouse";
        }
    });
    await saveCharacterDataToIndexedDB(window.characterData);
    selectedCards.forEach(card => card.classList.remove("selected"));
    displayCharacterCards(window.characterData);
    updateMoveSelectedButtonVisibility();
}
