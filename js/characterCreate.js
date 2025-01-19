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

// 選択モードフラグ
let isSelectionMode = false;

window.addEventListener("load", async function () {
    await initIndexedDB();
    const stored = await loadCharacterDataFromIndexedDB();
    if (stored) {
        window.characterData = stored;
    }
    displayCharacterCards(window.characterData);

    // ▼ ボタン要素があればイベント登録
    const gachaBtn = document.getElementById("gacha-btn");
    if (gachaBtn) {
        gachaBtn.addEventListener("click", onGachaButton);
    }

    const moveGachaBtn = document.getElementById("move-gacha-to-warehouse-btn");
    if (moveGachaBtn) {
        moveGachaBtn.addEventListener("click", onMoveGachaToWarehouse);
    }

    const toggleModeBtn = document.getElementById("toggle-selection-mode-btn");
    if (toggleModeBtn) {
        toggleModeBtn.addEventListener("click", toggleSelectionMode);
    }

    const moveSelectedBtn = document.getElementById("move-selected-to-warehouse-btn");
    if (moveSelectedBtn) {
        moveSelectedBtn.addEventListener("click", moveSelectedCardsToWarehouse);
    }
});

/** ガチャボタン押下 */
function onGachaButton() {
    const confirmModal = document.getElementById("gacha-confirm-modal");
    confirmModal.style.display = "flex";

    const okBtn = document.getElementById("gacha-confirm-ok");
    const cancelBtn = document.getElementById("gacha-confirm-cancel");

    okBtn.onclick = async () => {
        confirmModal.style.display = "none";
        clearGachaBox();
        // gachaCore.js の runGacha() を使う
        document.getElementById("gacha-modal").style.display = "flex";
        await runGacha(10, "ランダムで");
        hideGachaModal();
        displayCharacterCards(window.characterData);
    };

    cancelBtn.onclick = () => {
        confirmModal.style.display = "none";
    };
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

/** カード表示更新 */
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
    const bgStyle = char.backgroundcss
        .replace("background-image:", "")
        .replace("background", "")
        .trim();
    cardFront.style = "background-image:" + bgStyle;

    const rarityValue = (typeof char.rarity === "string") ? char.rarity.replace("★", "").trim() : "0";
    cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

    const typeEl = document.createElement("div");
    typeEl.className = "card-type";
    typeEl.textContent = char.type || "不明";
    cardFront.appendChild(typeEl);

    const imageContainer = document.createElement("div");
    imageContainer.className = "card-image";
    if (char.imageData) {
        // すでに画像がある場合
        const imageEl = document.createElement("img");
        imageEl.src = char.imageData;
        imageEl.alt = char.name;
        imageContainer.appendChild(imageEl);
    } else {
        // 画像がまだ無い場合、生成ボタンを設置
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

    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    cardBack.innerHTML = `<strong>${DOMPurify.sanitize(char.type)}</strong>`;

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    card.appendChild(cardInner);

    return card;
}

/**
 * 画像生成関数
 * 押下されたボタンが終わるまで無効化し、適宜トーストを表示
 */
async function generateCharacterImage(char, index, btnElement) {
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        return;
    }

    // ボタンを無効化
    if (btnElement) {
        btnElement.disabled = true;
    }
    // 生成開始トースト
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

        // 生成完了トースト
        showToast("画像の生成が完了しました");
        displayCharacterCards(window.characterData);

    } catch (err) {
        console.error("画像生成失敗:", err);
        showToast("画像生成に失敗しました:\n" + err.message);
    } finally {
        // ボタン再度有効化
        if (btnElement) {
            btnElement.disabled = false;
        }
    }
}


/* ===== 以下、選択モード関連処理 ===== */

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
