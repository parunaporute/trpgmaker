// characterCreate.js

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
        // ★ 以前はrunGacha(10,"...")を自前で定義していたが
        //   今回は gachaCore.js からインポートされた runGacha() を呼ぶ
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
    if(m) m.style.display = "none";
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
    if(!container) return;

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
        const imageEl = document.createElement("img");
        imageEl.src = char.imageData;
        imageEl.alt = char.name;
        imageContainer.appendChild(imageEl);
    } else {
        // 画像がまだ無い場合（省略）
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
