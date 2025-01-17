// グローバル変数
window.apiKey = localStorage.getItem("apiKey") || "";

// キャラクタ情報の保存形式: [{ id, name, state, special, caption, imageData?, rarity, backgroundcss, imageprompt, type, group }, ...]
// group: "GachaBox" | "Warehouse" | "Party" など
window.characterData = [];

// 選択モードフラグ
let isSelectionMode = false;

// ページ読み込み時
window.addEventListener("load", async function () {
    await initIndexedDB();
    const stored = await loadCharacterDataFromIndexedDB();
    if (stored) {
        window.characterData = stored;
    }
    displayCharacterCards(window.characterData);

    // クリアボタン
    document.getElementById("clear-character-btn").addEventListener("click", onClearCharacter);

    // ガチャボタン
    document.getElementById("gacha-btn").addEventListener("click", onGachaButton);

    // ガチャ箱 → 倉庫 移動ボタン
    document.getElementById("move-gacha-to-warehouse-btn").addEventListener("click", onMoveGachaToWarehouse);

    // 選択モード切り替えボタン
    document.getElementById("toggle-selection-mode-btn").addEventListener("click", toggleSelectionMode);

    // 「選択したものを倉庫に送る」ボタン
    document.getElementById("move-selected-to-warehouse-btn").addEventListener("click", moveSelectedCardsToWarehouse);
});

/** キャラクリア処理 */
async function onClearCharacter() {
    const ok = confirm("キャラクタ情報をクリアします。よろしいですか？");
    if (ok) {
        window.characterData = [];
        await saveCharacterDataToIndexedDB(window.characterData);
        document.getElementById("card-container").innerHTML = "";
        alert("キャラクタ情報をクリアしました。");
    }
}

/** ガチャボタン押下 */
function onGachaButton() {
    const confirmModal = document.getElementById("gacha-confirm-modal");
    confirmModal.style.display = "flex";

    const okBtn = document.getElementById("gacha-confirm-ok");
    const cancelBtn = document.getElementById("gacha-confirm-cancel");

    okBtn.onclick = async () => {
        confirmModal.style.display = "none";
        clearGachaBox();
        runGacha();
    };

    cancelBtn.onclick = () => {
        confirmModal.style.display = "none";
    };
}

/** ガチャ箱クリア */
function clearGachaBox() {
    window.characterData = window.characterData.filter(card => card.group !== "GachaBox");
}

/** ガチャ実行 */
async function runGacha() {
    document.getElementById("gacha-modal").style.display = "flex";
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        hideGachaModal();
        return;
    }
    window.currentGachaController = new AbortController();
    const signal = window.currentGachaController.signal;
    const cardCount = 10;

    // レア度をランダムで決定
    const rarities = pickRaritiesForNCards(cardCount);
    const countMap = makeRarityCountMap(rarities);

    // systemプロンプト
    const systemContent = `
あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。
以下の6段階のレア度「★0～★5」のうち、
今回の${cardCount}件では以下の内訳を厳密に守って生成してください：
- ★0: ${countMap["★0"]}件
- ★1: ${countMap["★1"]}件
- ★2: ${countMap["★2"]}件
- ★3: ${countMap["★3"]}件
- ★4: ${countMap["★4"]}件
- ★5: ${countMap["★5"]}件

生成するのがキャラクターやモンスターの場合
【レア度】：...
【名前】：...
【タイプ】：キャラクターまたはモンスター
【状態】：...
【特技】：...
【キャプション】：...
【カード背景】：...
【外見】：...

生成するのがアイテムの場合
【レア度】：...
【名前】：...
【タイプ】：アイテム
【特技】：...
【キャプション】：...
【カード背景】：...
【外見】：...
  `;

    const messages = [
        { role: "system", content: systemContent },
        { role: "user", content: `合計${cardCount}件、順番は問わないので上記レア度数で生成してください。` },
    ];

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${window.apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: messages,
                temperature: 0.7,
            }),
            signal,
        });
        if (signal.aborted) return;

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }

        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== "string") {
            throw new Error("キャラクター生成APIレスポンスが不正です。");
        }

        const newCards = parseCharacterData(text);
        newCards.forEach(card => {
            card.group = "GachaBox";
        });
        window.characterData.push(...newCards);
        await saveCharacterDataToIndexedDB(window.characterData);
        displayCharacterCards(window.characterData);
    } catch (err) {
        if (err.name === "AbortError") {
            console.log("ガチャキャンセル");
        } else {
            console.error("キャラクター生成失敗:", err);
            alert("キャラクター生成に失敗しました:\n" + err.message);
        }
    } finally {
        hideGachaModal();
    }
}

/** ガチャモーダルを隠す */
function hideGachaModal() {
    document.getElementById("gacha-modal").style.display = "none";
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

/** テキストをパースして配列に格納 */
function parseCharacterData(text) {
    const lines = text.split("\n");
    const characters = [];
    let currentChar = {
        id: "",
        type: "",
        name: "",
        state: "",
        special: "",
        caption: "",
        rarity: "★0",
        backgroundcss: "",
        imageprompt: "",
        group: "GachaBox",
    };

    function pushCurrentChar() {
        currentChar.id = "card_" + Date.now() + "_" + Math.random().toString(36).substring(2);
        characters.push({ ...currentChar });
        currentChar = {
            id: "",
            type: "",
            name: "",
            state: "",
            special: "",
            caption: "",
            rarity: "★0",
            backgroundcss: "",
            imageprompt: "",
            group: "GachaBox",
        };
    }

    lines.forEach((line) => {
        line = line.trim();
        if (line.startsWith("【名前】")) {
            if (currentChar.name) {
                pushCurrentChar();
            }
            currentChar.name = line.replace("【名前】", "").replace("：", "").trim();
        } else if (line.startsWith("【タイプ】")) {
            currentChar.type = line.replace("【タイプ】", "").replace("：", "").trim();
        } else if (line.startsWith("【状態】")) {
            currentChar.state = line.replace("【状態】", "").replace("：", "").trim();
        } else if (line.startsWith("【特技】")) {
            currentChar.special = line.replace("【特技】", "").replace("：", "").trim();
        } else if (line.startsWith("【キャプション】")) {
            currentChar.caption = line.replace("【キャプション】", "").replace("：", "").trim();
        } else if (line.startsWith("【レア度】")) {
            currentChar.rarity = line.replace("【レア度】", "").replace("：", "").trim();
        } else if (line.startsWith("【カード背景】")) {
            currentChar.backgroundcss = line.replace("【カード背景】", "").replace("：", "").trim();
        } else if (line.startsWith("【外見】")) {
            currentChar.imageprompt = line.replace("【外見】", "").replace("：", "").trim();
        }
    });
    if (currentChar.name) {
        pushCurrentChar();
    }
    return characters;
}

/** カード表示更新 */
function displayCharacterCards(characters) {
    const container = document.getElementById("card-container");
    container.innerHTML = "";
    // 倉庫以外（Party, GachaBoxなど）を表示
    const visibleCards = characters.filter(card => card.group !== "Warehouse");
    if (visibleCards.length === 0) {
        container.textContent = "キャラクターが生成されていません。";
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

    // 選択モード中のクリックで選択トグル
    card.addEventListener("click", (e) => {
        if (isSelectionMode) {
            e.stopPropagation();
            card.classList.toggle("selected");
            updateMoveSelectedButtonVisibility();
        } else {
            // 通常時（選択モードオフ）はカードの表裏反転のみ
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
        // 画像がまだ無い場合、生成ボタンを設置
        const genImgBtn = document.createElement("button");
        genImgBtn.setAttribute("data-imageprompt", char.imageprompt);
        genImgBtn.className = "gen-image-btn";
        genImgBtn.textContent = "画像生成";
        genImgBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            generateCharacterImage(char, index);
        });
        imageContainer.appendChild(genImgBtn);
    }
    cardFront.appendChild(imageContainer);

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

/** 画像生成 */
async function generateCharacterImage(char, index) {
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        return;
    }
    const promptText =
        "You, as a high-performance chatbot, will unobtrusively create illustrations of the highest quality. " +
        "Do not include text in illustrations for any reason! " +
        "Now, please output the following illustration.\n" +
        char.imageprompt +
        "\n上記の画像を作ってください。躍動感に満ちた繊細アニメ風でお願いします。";

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
        displayCharacterCards(window.characterData);
    } catch (err) {
        console.error("画像生成失敗:", err);
        alert("画像生成に失敗しました:\n" + err.message);
    }
}

/** レア度計算 */
function pickRaritiesForNCards(n) {
    const rarityDist = [
        { star: "★0", probability: 0.50 },
        { star: "★1", probability: 0.20 },
        { star: "★2", probability: 0.15 },
        { star: "★3", probability: 0.10 },
        { star: "★4", probability: 0.045 },
        { star: "★5", probability: 0.005 },
    ];
    const results = [];
    for (let i = 0; i < n; i++) {
        const rand = Math.random();
        let cum = 0;
        for (const r of rarityDist) {
            cum += r.probability;
            if (rand <= cum) {
                results.push(r.star);
                break;
            }
        }
    }
    return results;
}

function makeRarityCountMap(rarities) {
    const counts = { "★0": 0, "★1": 0, "★2": 0, "★3": 0, "★4": 0, "★5": 0 };
    rarities.forEach((r) => {
        counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
}

/* ===== 以下、選択モード関連処理 ===== */

/** 選択モードの切り替え */
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    const btn = document.getElementById("toggle-selection-mode-btn");
    if (isSelectionMode) {
        btn.textContent = "選択モード解除";
    } else {
        btn.textContent = "選択モード";
        // 選択が残っていたら解除
        const selectedCards = document.querySelectorAll("#card-container .card.selected");
        selectedCards.forEach(card => card.classList.remove("selected"));
    }
    updateMoveSelectedButtonVisibility();
}

/** 選択中のカードがあれば「選択したものを倉庫に送る」ボタンを表示 */
function updateMoveSelectedButtonVisibility() {
    const selectedCards = document.querySelectorAll("#card-container .card.selected");
    const moveBtn = document.getElementById("move-selected-to-warehouse-btn");
    if (isSelectionMode && selectedCards.length > 0) {
        moveBtn.style.display = "inline-block";
    } else {
        moveBtn.style.display = "none";
    }
}

/** 選択したカードを倉庫に送る */
async function moveSelectedCardsToWarehouse() {
    const selectedCards = document.querySelectorAll("#card-container .card.selected");
    if (selectedCards.length === 0) {
        alert("カードが選択されていません。");
        return;
    }
    // 選択されたカードを倉庫へ
    selectedCards.forEach(el => {
        const cardId = el.getAttribute("data-id");
        const realIndex = window.characterData.findIndex(c => c.id === cardId);
        if (realIndex !== -1) {
            window.characterData[realIndex].group = "Warehouse";
        }
    });
    await saveCharacterDataToIndexedDB(window.characterData);

    // 選択解除 & 再描画
    selectedCards.forEach(card => card.classList.remove("selected"));
    displayCharacterCards(window.characterData);
    updateMoveSelectedButtonVisibility();
}
