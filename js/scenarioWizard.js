/********************************
 * scenarioWizard.js
 * 新しいシナリオ作成ウィザード
 *  - シナリオ概要
 *  - 導入シーン(冒頭部分)
 *  - セクション生成(2〜5個ランダム)
 *    * 達成条件は「動詞を使った形式(～を入手する/～に行く 等)」で生成するようプロンプトを修正
 ********************************/

let wizardData = {
  genre: "",
  scenarioType: "",
  clearCondition: "",
  scenarioSummary: "",
  introScene: "",   // ★冒頭シーン
  party: [],
  sections: []      // セクション配列
};

window.addEventListener("load", async function () {
  // IndexedDB初期化
  await initIndexedDB();

  // 既存wizardDataあればロード
  const storedWizard = await loadWizardDataFromIndexedDB();
  if (storedWizard) {
    wizardData = storedWizard;
  }

  // 画面更新
  updateSelectedGenreDisplay();
  updateSummaryUI();

  // イベント設定
  document.getElementById("generate-genre-button").addEventListener("click", onGenerateGenre);
  document.getElementById("clear-genre-button").addEventListener("click", onClearGenre);
  document.getElementById("confirm-genre-button").addEventListener("click", onConfirmGenre);

  document.getElementById("type-objective-btn").addEventListener("click", () => onSelectScenarioType("objective"));
  document.getElementById("type-exploration-btn").addEventListener("click", () => onSelectScenarioType("exploration"));

  document.getElementById("back-to-step1-button").addEventListener("click", onBackToStep1);
  document.getElementById("back-to-step2-button").addEventListener("click", onBackToStep2FromStep3);

  document.getElementById("start-scenario-button").addEventListener("click", onStartScenario);
  document.getElementById("cancel-request-button").addEventListener("click", onCancelFetch);

  document.getElementById("confirm-scenario-ok").addEventListener("click", onConfirmScenarioModalOK);
  document.getElementById("confirm-scenario-cancel").addEventListener("click", onConfirmScenarioModalCancel);
});

/* ---------------------------
   ステップ1：ジャンル選択
--------------------------- */
async function onGenerateGenre() {
  const genreListDiv = document.getElementById("genre-list");
  const apiKey = localStorage.getItem("apiKey") || "";
  if (!apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  genreListDiv.innerHTML = "";

  try {
    const messages = [
      { role: "system", content: "あなたはTRPGのプロ。ジャンルを5つ提案してください。" },
      {
        role: "user",
        content: "SF, 中世ファンタジー, 現代などTRPGに使えるジャンル候補を5つ、箇条書きで。"
      }
    ];
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
        temperature: 0.7
      }),
      signal
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content;
    const lines = content.split("\n").map(l=>l.trim()).filter(l=>l);

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.classList.add("candidate-button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");
      btn.style.display = "block";
      btn.style.margin = "5px 0";

      btn.addEventListener("click", async () => {
        wizardData.genre = btn.textContent;
        await saveWizardDataToIndexedDB(wizardData);
        highlightSelectedButton(genreListDiv, btn);

        document.getElementById("wizard-step1").style.display = "none";
        document.getElementById("wizard-step2").style.display = "block";
        updateSelectedGenreDisplay();
      });
      genreListDiv.appendChild(btn);
    });
  } catch(err) {
    console.error(err);
    alert("ジャンル生成に失敗: " + err.message);
  } finally {
    showLoadingModal(false);
  }
}

async function onClearGenre(){
  const genreListDiv = document.getElementById("genre-list");
  genreListDiv.innerHTML = "";
  wizardData.genre = "";
  await saveWizardDataToIndexedDB(wizardData);
  document.getElementById("free-genre-input").value = "";
}

async function onConfirmGenre(){
  const freeInput = document.getElementById("free-genre-input");
  const val = (freeInput.value || "").trim();
  if(!val){
    alert("ジャンルを入力してください。");
    return;
  }
  wizardData.genre = val;
  await saveWizardDataToIndexedDB(wizardData);

  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
  updateSelectedGenreDisplay();
}

/* ---------------------------
   ステップ2：シナリオタイプ
--------------------------- */
async function onSelectScenarioType(type){
  wizardData.scenarioType = type;
  await saveWizardDataToIndexedDB(wizardData);

  const textEl = document.getElementById("confirm-genre-type-text");
  textEl.textContent = `ジャンル:${wizardData.genre}\nシナリオタイプ:${type}`;

  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "flex";
}

function onConfirmScenarioModalCancel(){
  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "none";
}

async function onConfirmScenarioModalOK(){
  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "none";

  // シナリオ要約生成前にパーティ情報を取り込む
  await storePartyInWizardData();

  // シナリオ概要
  if(wizardData.scenarioType==="objective"){
    await generateScenarioSummaryAndClearCondition();
  } else {
    await generateScenarioSummary();
  }

  // セクション(達成条件)生成
  await generateSections();

  // 導入文
  await generateIntroScene();

  // ステップ2→ステップ3
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step3").style.display = "block";
}

function onBackToStep1(){
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

/* ---------------------------
   ステップ3：最終確認(シナリオ要約表示)
--------------------------- */
function onBackToStep2FromStep3(){
  document.getElementById("wizard-step3").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
}

async function onStartScenario(){
  try {
    let title = wizardData.genre || "新シナリオ";
    const scenarioId = await createNewScenario(wizardData, title);

    // ★もし冒頭文があれば最初のsceneとして登録
    if(wizardData.introScene && wizardData.introScene.trim()){
      const firstScene = {
        scenarioId,
        type:"scene",
        sceneId: "intro_"+Date.now(),
        content: wizardData.introScene
      };
      await addSceneEntry(firstScene);
    }

    window.location.href = `scenario.html?scenarioId=${scenarioId}`;
  } catch(err) {
    console.error("シナリオ作成失敗:", err);
    alert("シナリオ開始失敗: " + err.message);
  }
}

/* ---------------------------
   GPT呼び出しで概要やセクション達成条件、導入文を生成
--------------------------- */
async function generateScenarioSummaryAndClearCondition(){
  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  try {
    const apiKey = localStorage.getItem("apiKey")||"";
    if(!apiKey) throw new Error("APIキーが未設定");

    wizardData.scenarioSummary = "";
    wizardData.clearCondition = "";

    const prompt = `
      あなたはTRPG用のシナリオ作成に長けたアシスタントです。
      ジャンル:${wizardData.genre}, タイプ:目的達成型。
      1) シナリオ概要(短め)
      2) 【クリア条件】(非公開,プレイヤー非表示)。必ず明示してください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオメーカーです。" },
          { role:"user", content: prompt }
        ],
        temperature:0.7
      }),
      signal
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message);

    const text = data.choices[0].message.content||"";
    let sum = text;
    let cc = "";
    if(text.includes("【クリア条件】")){
      const arr = text.split("【クリア条件】");
      sum = arr[0].trim();
      cc = arr[1]? arr[1].trim() : "";
    }
    wizardData.scenarioSummary = sum;
    wizardData.clearCondition = cc;

    await saveWizardDataToIndexedDB(wizardData);
    updateSummaryUI();
  } catch(err){
    console.error(err);
    alert("目的達成型シナリオ生成失敗: "+err.message);
  } finally {
    showLoadingModal(false);
  }
}

async function generateScenarioSummary(){
  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  try {
    const apiKey = localStorage.getItem("apiKey")||"";
    if(!apiKey) throw new Error("APIキーが未設定");

    wizardData.scenarioSummary = "";

    const prompt = `
      あなたはTRPGシナリオ作成のプロ。ジャンル:${wizardData.genre}, タイプ:探索型。
      エレメント取得可能。短めの概要を作ってください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオメーカーです。" },
          { role:"user", content: prompt }
        ],
        temperature:0.7
      }),
      signal
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message);

    wizardData.scenarioSummary = data.choices[0].message.content||"(概要なし)";
    await saveWizardDataToIndexedDB(wizardData);
    updateSummaryUI();
  } catch(err){
    console.error(err);
    alert("探索型シナリオ生成失敗: "+err.message);
  } finally {
    showLoadingModal(false);
  }
}

/**
 * セクション(達成条件)を生成 (2〜5個)
 * ※必ず動詞を用いた条件文にするようにプロンプトを修正
 */
async function generateSections(){
  wizardData.sections = [];
  const count = Math.floor(Math.random()*4)+2; //2..5

  // ★修正: 「動詞で書いてください」と強制
  const systemPrompt = `
あなたはTRPGシナリオを小分けにして目標を作るエキスパートです。
絶対に動詞を用いた条件文で書いてください(例:「XXを発見する」「XXを調べる」「XXと会う」など)。
セクション数:${count}個、それぞれ1行ずつ動詞で始まるようお願いします。`;

  const userPrompt = `
ジャンル:${wizardData.genre}, シナリオタイプ:${wizardData.scenarioType} 用のセクション達成条件:
- 例：「封印を解く」「古文書を読む」「ボスを倒す」etc
必ず動詞～で書いてください。${count}個分、箇条書きで。`;

  try {
    const apiKey = localStorage.getItem("apiKey")||"";
    if(!apiKey) throw new Error("APIキーが未設定");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content: systemPrompt },
          { role:"user", content: userPrompt }
        ],
        temperature:0.7
      })
    });

    const d = await r.json();
    if(d.error) throw new Error(d.error.message);

    const text = d.choices[0].message.content||"";
    const lines = text.split("\n").map(v=>v.trim()).filter(v=>v);
    for(let i=0;i<count;i++){
      const raw = lines[i]||(`セクション${i+1}のダミー条件(動詞)`);
      wizardData.sections.push({
        number:(i+1),
        conditionZipped: zipString(raw),
        cleared:false
      });
    }
  } catch(err){
    console.error("セクション生成失敗:",err);
    // ダミー
    for(let i=0;i<count;i++){
      wizardData.sections.push({
        number:(i+1),
        conditionZipped: zipString(`セクション${i+1}のダミー(動詞形)`),
        cleared:false
      });
    }
  }
  await saveWizardDataToIndexedDB(wizardData);
}

/** pakoでZIP圧縮→Base64 */
function zipString(str){
  const utf8 = new TextEncoder().encode(str);
  const def = pako.deflate(utf8);
  return btoa(String.fromCharCode(...def));
}

/** 導入シーン(冒頭)を生成 */
async function generateIntroScene(){
  const apiKey = localStorage.getItem("apiKey")||"";
  if(!apiKey){
    console.warn("APIキー無し → 導入シーン生成スキップ");
    wizardData.introScene = "(導入生成失敗)";
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }

  try{
    const pro = `
      あなたはTRPGのゲームマスターです。
      次のシナリオ概要を踏まえ、プレイヤーが行動したくなる導入シーン(300字程度)を作ってください。
      シナリオ概要:
      ${wizardData.scenarioSummary}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオライターです。" },
          { role:"user", content: pro }
        ],
        temperature:0.7
      })
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message);

    wizardData.introScene = data.choices[0].message.content||"(導入空)";
  } catch(err){
    console.error(err);
    wizardData.introScene="(導入生成失敗)";
  }
  await saveWizardDataToIndexedDB(wizardData);
}

/* ---------------------------
   汎用
--------------------------- */
function updateSelectedGenreDisplay(){
  const el = document.getElementById("selected-genre-display");
  if(!el)return;
  el.textContent = wizardData.genre||"(未選択)";
}

function updateSummaryUI(){
  const el = document.getElementById("scenario-summary");
  if(!el)return;
  el.textContent = wizardData.scenarioSummary||"(シナリオ概要なし)";
}

async function storePartyInWizardData(){
  const charData = await loadCharacterDataFromIndexedDB();
  if(!charData)return;

  const party = charData.filter(c=>c.group==="Party");
  // imageDataなどを落としておく
  const stripped = party.map(c=>({
    id:c.id, name:c.name, type:c.type,
    rarity:c.rarity, state:c.state, special:c.special,
    caption:c.caption, backgroundcss:c.backgroundcss
  }));
  wizardData.party = stripped;
  await saveWizardDataToIndexedDB(wizardData);
}

function highlightSelectedButton(container, targetBtn){
  const all = container.querySelectorAll(".candidate-button");
  all.forEach(b=>b.style.backgroundColor="");
  targetBtn.style.backgroundColor="#8BC34A";
}

function showLoadingModal(show){
  const modal = document.getElementById("loading-modal");
  if(!modal)return;
  modal.style.display = show?"flex":"none";
}

function onCancelFetch(){
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
