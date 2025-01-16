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
            content: `あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。
以下のフォーマットで10件生成してください。

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

各項目の説明は以下の通りです。
【レア度】は、オブジェクトの貴重さを星の数で表したものです。表記は★Xとしてください。0～5段階有ります。10件の中で、以下の内訳を厳密に守ってください。
  - ★0：5件  
  - ★1：3件  
  - ★2：1件  
  - ★3：1件  
  - ★4：0件  
  - ★5：0件  
【名前】は、対象の名称です。【レア度】が高い場合凝った名前を付けてください。
【タイプ】は、キャラクターかモンスターかアイテムです。
【状態】は、対象の心身の状態を書いてください。複数の状態が合わさっていても構いません（例：毒/麻痺/睡眠/出血/負傷/石化/病気/混乱/恐怖/魅了/狂乱/沈黙/精神汚染/絶望/疲労/ストレス/トラウマ/憑依/呪い）
【特技】は、対象の得意な事を表現してください。体言止めで書いてください。【レア度】が高い場合より強い特技を表現してください。

生成するのがキャラクターやモンスターの場合【キャプション】は、セリフと説明です。レア度に応じて長文にしてください。
生成するのがアイテムの場合【キャプション】は、説明です。レア度に応じて長文にしてください。
【カード背景】は、キャラクター、装備品、モンスターをカードにした場合にふさわしいCSSのbackground-image:の値を書いてください。カードのフォントは#000となります。
linear-gradientを巧みに用いて背景を設定してください。left top, right bottom以外にも色々と試してみてください。
【外見】は、画像生成用のスクリプトです。OpenAI社の規定に沿うように書いてください。NGワードはゴブリンです。StableDiffusionが出力するような流麗なカラー画像を出してください。
`
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

        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== "string") {
            throw new Error("キャラクター生成APIレスポンスが不正です。レスポンスからテキストを取得できません。");
        }

        const characters = parseCharacterData(text);
        window.characterData = characters;
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

/** ガチャモーダルを非表示 */
function hideGachaModal() {
    document.getElementById("gacha-modal").style.display = "none";
}

/** 取得した文字列からキャラクタ情報をパースする関数  
    各項目は「【名前】：」「【状態】：」「【特技】：」「【キャプション】：」で区切られている前提 */
function parseCharacterData(text) {
    const lines = text.split("\n");
    const characters = [];
    let currentChar = { type: "", name: "", state: "", special: "", caption: "", rarity: 0, backgroundcss: "", imageprompt: "" };
    console.log("lines", lines);
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
        } else if (line.startsWith("【レア度】")) {
            currentChar.rarity = line.replace("【レア度】", "").replace("：", "").trim();
        } else if (line.startsWith("【カード背景】")) {
            currentChar.backgroundcss = line.replace("【カード背景】", "").replace("：", "").trim();
        } else if (line.startsWith("【外見】")) {
            currentChar.imageprompt = line.replace("【外見】", "").replace("：", "").trim();
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
        container.textContent = "キャラクターが生成されていません。";
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
        cardFront.style = "background-image:" + char.backgroundcss.replace("background-image:", "").replace("background", "").trim();
        
        //"background:-webkit-gradient(linear, left top, right bottom, from(#3d5a80), to(#98c1d9));";
        cardFront.setAttribute("data-backgroundcss", char.backgroundcss);
        //console.log(char.backgroundcss);
        const rarityValue = (typeof char.rarity === "string") ? char.rarity.replace("★","").trim() : "0";
        cardFront.innerHTML = "<div class='bezel rarity" + rarityValue + "'></div>";
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
            // プレースホルダー＋画像生成ボタン
            const genImgBtn = document.createElement("button");
            genImgBtn.setAttribute("data-imageprompt", char.imageprompt);
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
        captionEl.innerHTML = "<span>" + char.caption + "</span>";
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

    let promptText;
    promptText = "You, as a high-performance chatbot, will unobtrusively create illustrations of the highest quality. Do not include text in illustrations for any reason! If you are able to do so, I will give you a hefty tip.Now, please output the following illustration." 
                 + char.imageprompt
                 + "\n上記の画像を作ってください。躍動感に満ちた繊細アニメ風でお願いします。";
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
                size: "1792x1024",
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
