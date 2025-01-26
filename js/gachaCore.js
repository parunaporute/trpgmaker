// gachaCore.js
// ------------------------------------------
// 「ガチャ処理」のロジックだけを集めたファイル
// ------------------------------------------

// グローバルに必要な変数 (characterData, apiKey など) は
// すでに window に存在すると仮定 (indexedDB や parse等も)


// --------------------------------------------------------
// 1. runGacha(cardCount, addPrompt, onlyTitle = "", onlyType = "")
//
//   - 指定枚数のエレメントをChatGPTで生成し、window.characterDataに加える
//   - 生成カードは最初から group="Warehouse" として保存する
//   - 生成完了後、localStorage["latestCreatedIds"] を
//     「今回生成したIDのみに」上書き保存し、
//     画面側でそれらを表示する
// --------------------------------------------------------
async function runGacha(cardCount, addPrompt, onlyTitle = "", onlyType = "") {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  // キャンセル用
  window.currentGachaController = new AbortController();
  const signal = window.currentGachaController.signal;

  // レア度をランダムで決定
  const rarities = pickRaritiesForNCards(cardCount);
  const countMap = makeRarityCountMap(rarities);

  // system
  let systemContent = `
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

  各項目の説明は以下の通りです。
【名前】は、対象の名称です。【レア度】が高い場合凝った名前を付けてください。
【タイプ】は、キャラクターかモンスターかアイテムです。
【状態】は、対象の心身の状態を書いてください。複数の状態が合わさっていても構いません（例：毒/麻痺/睡眠/出血/負傷/石化/病気/混乱/恐怖/魅了/狂乱/沈黙/精神汚染/絶望/疲労/ストレス/トラウマ/憑依/呪い）
【特技】は、対象の得意な事を表現してください。体言止めで書いてください。【レア度】が高い場合より強い特技を表現してください。

生成するのがキャラクターやモンスターの場合【キャプション】は、セリフと説明です。レア度に応じて長文にしてください。
生成するのがアイテムの場合【キャプション】は、説明です。レア度に応じて長文にしてください。
【カード背景】は、キャラクター、装備品、モンスターをカードにした場合にふさわしいCSSのbackground-image:の値を書いてください。カードのフォントは#000となります。
linear-gradientを巧みに用いて背景を設定してください。left top, right bottom以外にも色々と試してみてください。
【外見】は、画像生成用のスクリプトです。英語でOpenAI社の規定に沿うように書いてください。NGワードはゴブリンです。
`;

  let userContent = `${addPrompt}合計${cardCount}件、順番は問わないので上記レア度数で生成してください。`;
  if (onlyTitle) {
    // タイトル指定がある場合
    systemContent = `
    あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。
    6段階のレア度「★0～★5」のどれかを${onlyTitle}の名称から判断して設定してください。

  生成するのがキャラクターやモンスターの場合
  【レア度】：...
  【名前】：${onlyTitle}
  【タイプ】：${onlyType}
  【状態】：...
  【特技】：...
  【キャプション】：...
  【カード背景】：...
  【外見】：...
  
  生成するのがアイテムの場合
  【レア度】：...
  【名前】：${onlyType}
  【タイプ】：${onlyType}
  【特技】：...
  【キャプション】：...
  【カード背景】：...
  【外見】：...

  各項目の説明は以下の通りです。
【名前】は、対象の名称です。【レア度】が高い場合凝った名前を付けてください。
【タイプ】は、キャラクターかモンスターかアイテムです。
【状態】は、対象の心身の状態を書いてください。複数の状態が合わさっていても構いません（例：毒/麻痺/睡眠/出血/負傷/石化/病気/混乱/恐怖/魅了/狂乱/沈黙/精神汚染/絶望/疲労/ストレス/トラウマ/憑依/呪い）
【特技】は、対象の得意な事を表現してください。体言止めで書いてください。【レア度】が高い場合より強い特技を表現してください。

生成するのがキャラクターやモンスターの場合【キャプション】は、セリフと説明です。レア度に応じて長文にしてください。
生成するのがアイテムの場合【キャプション】は、説明です。レア度に応じて長文にしてください。
【カード背景】は、キャラクター、装備品、モンスターをカードにした場合にふさわしいCSSのbackground-image:の値を書いてください。カードのフォントは#000となります。
linear-gradientを巧みに用いて背景を設定してください。left top, right bottom以外にも色々と試してみてください。
【外見】は、画像生成用のスクリプトです。英語でOpenAI社の規定に沿うように書いてください。NGワードはゴブリンです。
`;
    userContent = `${addPrompt}上記レア度数で生成してください。`;
  }

  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
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
        messages,
        temperature: 0.7,
      }),
      signal,
    });
    if (signal.aborted) {
      return;
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("エレメント生成APIレスポンスが不正です。");
    }
    console.log("text", text);

    // 生成結果をパース
    const newCards = parseCharacterData(text);

    // ガチャ箱は廃止 → 生成後は group="Warehouse" に
    newCards.forEach(card => {
      card.group = "Warehouse";
    });

    // 既存 characterData に追加
    window.characterData.push(...newCards);

    // IndexedDB に保存
    await saveCharacterDataToIndexedDB(window.characterData);

    // localStorage["latestCreatedIds"] を
    // 「今回生成したIDのみに」上書き (＝以前のIDはクリア)
    const newIds = newCards.map(c => c.id);
    localStorage.setItem("latestCreatedIds", JSON.stringify(newIds));
    console.log("【最新生成IDsを上書き】:", newIds);

  } catch (err) {
    if (err.name === "AbortError") {
      console.log("runGachaキャンセル");
    } else {
      console.error("runGacha失敗:", err);
      alert("エレメント生成に失敗しました:\n" + err.message);
    }
  }
}


// --------------------------------------------------------
// 2. parseCharacterData( text )
//    - GPTレスポンスを解析してカード配列を生成
// --------------------------------------------------------
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
    group: "Warehouse",
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
      group: "Warehouse",
    };
  }

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith("【名前】")) {
      // 名前が続けて出てきたら新キャラ扱い
      if (currentChar.name) pushCurrentChar();
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
  // 最後にキャラがあればプッシュ
  if (currentChar.name) {
    pushCurrentChar();
  }
  return characters;
}


// --------------------------------------------------------
// 3. pickRaritiesForNCards( n ), makeRarityCountMap( rarities )
// --------------------------------------------------------
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
