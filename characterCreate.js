// characterCreate.js

// グローバル変数
window.apiKey = localStorage.getItem("apiKey") || "";

// ※キャラクタ情報の保存形式は [{name, state, special, caption, imageData?}, ...]

// キャラクタ関連ストレージ（IndexedDB）の読み込み
window.characterData = [];

window.addEventListener("load", async function () {
    // IndexedDBの初期化を待ってからキャラクターデータをロード
    await initIndexedDB();
    const stored = await loadCharacterDataFromIndexedDB();
    if (stored) {
        window.characterData = stored;
        displayCharacterCards(window.characterData);
    }
});

/** キャラクタ関連データをクリア */
document.getElementById("clear-character-btn").addEventListener("click", async function () {
    const ok = confirm("キャラクタ情報をクリアします。よろしいですか？");
    if (ok) {
        window.characterData = [];
        // IndexedDB からも削除
        await saveCharacterDataToIndexedDB(window.characterData);
        document.getElementById("card-container").innerHTML = "";
        alert("キャラクタ情報をクリアしました。");
    }
});

/** ガチャボタン押下 */
document.getElementById("gacha-btn").addEventListener("click", function () {
    // モーダル表示
    document.getElementById("gacha-modal").style.display = "flex";
    // 呼び出し処理（キャンセル制御用にAbortControllerを利用）
    generateCharacters();
});

/** キャンセルボタン */
document.getElementById("cancel-gacha-btn").addEventListener("click", function () {
    if (window.currentGachaController) {
        window.currentGachaController.abort();
    }
    hideGachaModal();
});

/** ガチャ処理：ChatGPT APIへリクエストしてキャラクタ候補を10件取得 */
// ガチャ処理などで IndexedDB に保存するタイミングも同様に
async function generateCharacters() {
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        hideGachaModal();
        return;
    }
    window.currentGachaController = new AbortController();
    const signal = window.currentGachaController.signal;

    const messages = [
        {
            role: "system",
            content:
                "あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。以下のフォーマットで10件生成してください。\n\n生成するのがキャラクタやモンスターであれば【名前】：...\n【タイプ】：キャラクタまたはモンスター\n【状態】：...\n【特技】：...\n【キャプション】：...\n生成するのがアイテムであれば【名前】：...\n【タイプ】：アイテム\n【特技】：...\n【キャプション】：...\n",
        },
        { role: "user", content: "10件生成してください。" },
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
        const text = data.choices[0].message.content;
        const characters = parseCharacterData(text);
        window.characterData = characters;
        await saveCharacterDataToIndexedDB(window.characterData);
        displayCharacterCards(window.characterData);
    } catch (err) {
        if (err.name === "AbortError") {
            console.log("ガチャキャンセル");
        } else {
            console.error("キャラクタ生成失敗:", err);
            alert("キャラクタ生成に失敗しました:\n" + err.message);
        }
    } finally {
        hideGachaModal();
    }
}

/** ガチャモーダルを非表示 */
function hideGachaModal() {
    document.getElementById("gacha-modal").style.display = "none";
}

/** 取得した文字列からキャラクタ情報をパースする関数  
    各項目は「【名前】：」「【状態】：」「【特技】：」「【キャプション】：」で区切られている前提 */
function parseCharacterData(text) {
    const lines = text.split("\n");
    const characters = [];
    let currentChar = { type: "", name: "", state: "", special: "", caption: "" };
    lines.forEach((line) => {
        line = line.trim();
        if (line.startsWith("【名前】")) {
            if (currentChar.name) {
                characters.push({ ...currentChar });
                currentChar = { type: "", name: "", state: "", special: "", caption: "" };
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
        }
    });

    if (currentChar.name) {
        characters.push({ ...currentChar });
    }
    return characters;
}

/** 保存済みキャラクタ情報を元にカード作成して表示 */
function displayCharacterCards(characters) {
    const container = document.getElementById("card-container");
    container.innerHTML = "";
    if (!characters || characters.length === 0) {
        container.textContent = "キャラクタが生成されていません。";
        return;
    }
    characters.forEach((char, idx) => {
        // 外枠のカード要素（flip効果用）
        const card = document.createElement("div");
        card.className = "card";
        // クリックでカード裏面へ切り替え
        card.addEventListener("click", () => {
            card.classList.toggle("flipped");
        });

        // 内部要素（表裏を内包する要素）
        const cardInner = document.createElement("div");
        cardInner.className = "card-inner";

        /* ====================
           表面 (Front)
           ==================== */
        const cardFront = document.createElement("div");
        cardFront.className = "card-front";

        // タイプ（左上固定）
        const typeEl = document.createElement("div");
        typeEl.className = "card-type";
        typeEl.innerHTML = "<strong>" + DOMPurify.sanitize(char.type) + "</strong>";
        cardFront.appendChild(typeEl);

        // 画像表示エリア
        const imageContainer = document.createElement("div");
        imageContainer.className = "card-image";
        // すでに画像がある場合
        if (char.imageData) {
            const imageEl = document.createElement("img");
            imageEl.src = char.imageData;
            imageEl.alt = char.name;
            imageContainer.appendChild(imageEl);
        } else {
            // プレースホルダー＋画像生成ボタン（画像が無い場合）
            const genImgBtn = document.createElement("button");
            genImgBtn.className = "gen-image-btn";
            genImgBtn.textContent = "画像生成";
            genImgBtn.addEventListener("click", (e) => {
                // クリックイベントがカード反転に伝播しないように
                e.stopPropagation();
                generateCharacterImage(char, idx);
            });
            imageContainer.appendChild(genImgBtn);
        }
        cardFront.appendChild(imageContainer);

        // 下部情報（状態、特技、キャプション）
        const infoContainer = document.createElement("div");
        infoContainer.className = "card-info";

        if (char.state) {
            const stateEl = document.createElement("p");
            stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(char.state);
            infoContainer.appendChild(stateEl);
        }
        const specialEl = document.createElement("p");
        specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(char.special);
        infoContainer.appendChild(specialEl);

        const captionEl = document.createElement("p");
        captionEl.textContent = char.caption;
        infoContainer.appendChild(captionEl);

        cardFront.appendChild(infoContainer);

        /* ====================
           裏面 (Back)
           ==================== */
        const cardBack = document.createElement("div");
        cardBack.className = "card-back";
        // 裏面に表示する内容。ここではキャラクター名など、好みに応じてアレンジしてください。
        cardBack.innerHTML = `<strong>${DOMPurify.sanitize(char.type)}</strong>`;

        // 組み立て
        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        card.appendChild(cardInner);
        container.appendChild(card);
    });
}


/** 画像生成処理：DALL·E APIなどを利用 */
async function generateCharacterImage(char, index) {
    if (!window.apiKey) {
        alert("APIキーが設定されていません。");
        return;
    }
    const promptText = `${char.caption}というキャラクタだけを描いてください。絶対に文字を入れないでください。アイテムはお任せのスタイルで。キャラクタは可能な限り親しみやすいアニメ調にしてください。`;
    try {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${window.apiKey}`
            },
            body: JSON.stringify({
                model: "dall-e-3", // 必要に応じて調整
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
        // キャラクターデータに画像をセット
        window.characterData[index].imageData = dataUrl;
        // IndexedDB に保存
        await saveCharacterDataToIndexedDB(window.characterData);
        // 再表示
        displayCharacterCards(window.characterData);
    } catch (err) {
        console.error("画像生成失敗:", err);
        alert("画像生成に失敗しました:\n" + err.message);
    }
}
