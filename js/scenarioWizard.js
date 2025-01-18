/********************************
 * scenarioWizard.js
 * 新しいシナリオ作成ウィザード
 ********************************/

let wizardData = {
    genre: "",
    scenarioType: "",          // "objective" or "exploration"
    clearCondition: "",        // 目的達成型ならChatGPTから取得
    scenarioSummary: ""        // 全体のシナリオ要約
  };
  
  window.addEventListener("load", async function(){
    await initIndexedDB();
    // ローカルに保存してたら読み込み（ユーザーが再度ウィザード画面に戻った場合）
    loadWizardDataFromLocalStorage();
  
    // イベント設定
    document.getElementById("generate-genre-button").addEventListener("click", onGenerateGenre);
    document.getElementById("type-objective-btn").addEventListener("click", onSelectScenarioTypeObjective);
    document.getElementById("type-exploration-btn").addEventListener("click", onSelectScenarioTypeExploration);
    document.getElementById("start-scenario-button").addEventListener("click", onStartScenario);
  
    document.getElementById("cancel-request-button").addEventListener("click", onCancelFetch);
  });
  
  /** ステップ1：ジャンル候補をChatGPTで生成 */
  async function onGenerateGenre(){
    const genreListDiv = document.getElementById("genre-list");
    genreListDiv.innerHTML = "";
    wizardData.genre = ""; //リセット
  
    const apiKey = localStorage.getItem("apiKey") || "";
    if(!apiKey){
      alert("APIキーが設定されていません。");
      return;
    }
  
    showLoadingModal(true);
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
  
    try {
      // ChatGPT呼び出し
      const messages = [
        { role: "system", content: "あなたはTRPGのプロです。ジャンルを5つ提案してください。" },
        { role: "user", content: "SF, 中世ファンタジー, 現代など、TRPGに使いやすいジャンル候補を5つ、箇条書きで出してください。" }
      ];
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:"gpt-4",
          messages: messages,
          temperature: 0.7
        }),
        signal
      });
  
      const data = await response.json();
      if(data.error){
        throw new Error(data.error.message);
      }
  
      const content = data.choices[0].message.content;
      // 例: 「1. SF\n2. 中世ファンタジー\n3. ...」のように返ってくる想定
      const lines = content.split("\n").map(l=>l.trim()).filter(l=>l);
      // UIに表示
      lines.forEach(line=>{
        const btn = document.createElement("button");
        btn.textContent = line.replace(/^\d+\.\s*/, ""); // 「1. 」を除去
        btn.style.display = "block";
        btn.style.margin = "5px 0";
        btn.addEventListener("click", ()=>{
          wizardData.genre = btn.textContent;
          // 選択状態を視覚化
          const allButtons = genreListDiv.querySelectorAll("button");
          allButtons.forEach(b => b.style.backgroundColor = "");
          btn.style.backgroundColor = "#8BC34A";
          // 保存
          saveWizardDataToLocalStorage();
          // ステップ2へ進む
          document.getElementById("wizard-step1").style.display = "none";
          document.getElementById("wizard-step2").style.display = "block";
        });
        genreListDiv.appendChild(btn);
      });
    } catch(err) {
      if(err.name === "AbortError"){
        console.log("ジャンル生成キャンセル");
      } else {
        console.error(err);
        alert("ジャンル生成に失敗しました。: " + err.message);
      }
    } finally {
      showLoadingModal(false);
    }
  }
  
  /** キャンセル */
  function onCancelFetch(){
    if(window.currentRequestController){
      window.currentRequestController.abort();
    }
    showLoadingModal(false);
  }
  
  /** ステップ2：目的達成型を選択 */
  async function onSelectScenarioTypeObjective(){
    wizardData.scenarioType = "objective";
    wizardData.clearCondition = ""; // 取得前は空
    await generateScenarioSummaryAndClearCondition();
    // ステップ2終了→ステップ3
    document.getElementById("wizard-step2").style.display = "none";
    document.getElementById("wizard-step3").style.display = "block";
  }
  
  /** ステップ2：探索型を選択 */
  async function onSelectScenarioTypeExploration(){
    wizardData.scenarioType = "exploration";
    wizardData.clearCondition = ""; // 探索型なので不要
    await generateScenarioSummary();
    // ステップ2終了→ステップ3
    document.getElementById("wizard-step2").style.display = "none";
    document.getElementById("wizard-step3").style.display = "block";
  }
  
  /** ステップ3へ移行する際に、シナリオ要約をChatGPTから生成する (探索型) */
  async function generateScenarioSummary(){
    wizardData.scenarioSummary = "";
    saveWizardDataToLocalStorage();
  
    const apiKey = localStorage.getItem("apiKey") || "";
    if(!apiKey){
      alert("APIキーが設定されていません。");
      return;
    }
  
    showLoadingModal(true);
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
  
    try {
      const prompt = `
  あなたはTRPG用のシナリオ作成に長けたアシスタントです。
  ジャンルは「${wizardData.genre}」、シナリオタイプは「探索型」です。
  探索型はストーリー内でエレメントを手に入れることができるようにしてください。
  ストーリーは短い概要だけでOKですが、プレイヤーキャラが興味を持ちそうな情報を盛り込んでください。
      `;
  
      const messages = [
        { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
        { role: "user", content: prompt }
      ];
  
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:"gpt-4",
          messages,
          temperature:0.7
        }),
        signal
      });
      const data = await response.json();
      if(data.error){
        throw new Error(data.error.message);
      }
      const text = data.choices[0].message.content;
      wizardData.scenarioSummary = text;
    } catch(err){
      if(err.name === "AbortError"){
        console.log("探索型シナリオ生成キャンセル");
      } else {
        console.error(err);
        alert("探索型シナリオ生成に失敗:\n" + err.message);
      }
    } finally {
      showLoadingModal(false);
      saveWizardDataToLocalStorage();
      updateSummaryUI();
    }
  }
  
  /** ステップ3へ移行する際に、シナリオ要約とクリア条件をChatGPTから生成する (目的達成型) */
  async function generateScenarioSummaryAndClearCondition(){
    wizardData.scenarioSummary = "";
    wizardData.clearCondition = "";
    saveWizardDataToLocalStorage();
  
    const apiKey = localStorage.getItem("apiKey") || "";
    if(!apiKey){
      alert("APIキーが設定されていません。");
      return;
    }
  
    showLoadingModal(true);
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
  
    try {
      const prompt = `
  あなたはTRPG用のシナリオ作成に長けたアシスタントです。
  ジャンルは「${wizardData.genre}」、シナリオタイプは「目的達成型」です。
  以下を生成してください：
  1. シナリオの概要（短め）。
  2. このシナリオのクリア条件（【クリア条件】という見出しで書いてください）。
     ただし、【クリア条件】の内容はプレイヤーに公開しません。
      `;
  
      const messages = [
        { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
        { role: "user", content: prompt }
      ];
  
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:"gpt-4",
          messages,
          temperature:0.7
        }),
        signal
      });
      const data = await response.json();
      if(data.error){
        throw new Error(data.error.message);
      }
      const text = data.choices[0].message.content;
      // 例:「シナリオ概要: ...\n【クリア条件】...」など
      // クリア条件の部分だけ取り出す
      // 簡易的に split
      let clearConditionPart = "";
      let summaryPart = text;
      if(text.includes("【クリア条件】")){
        const arr = text.split("【クリア条件】");
        summaryPart = arr[0].trim();
        clearConditionPart = arr[1] ? arr[1].trim() : "";
      }
  
      wizardData.scenarioSummary = summaryPart;
      wizardData.clearCondition = clearConditionPart;
    } catch(err){
      if(err.name === "AbortError"){
        console.log("目的達成型シナリオ生成キャンセル");
      } else {
        console.error(err);
        alert("目的達成型シナリオ生成に失敗:\n" + err.message);
      }
    } finally {
      showLoadingModal(false);
      saveWizardDataToLocalStorage();
      updateSummaryUI();
    }
  }
  
  /** ステップ3：サマリ表示 */
  function updateSummaryUI(){
    const summaryDiv = document.getElementById("scenario-summary");
    const scenario = wizardData.scenarioSummary || "（シナリオ概要なし）";
    summaryDiv.textContent = scenario;
  }
  
  /** 「このシナリオで始める」ボタン */
  function onStartScenario(){
    // wizardDataを localStorage に保存 → scenario.html で読めるように
    saveWizardDataToLocalStorage();
    // シナリオ開始ページへ遷移
    window.location.href = "scenario.html?fromWizard=true";
  }
  
  /** LocalStorageへの保存 */
  function saveWizardDataToLocalStorage(){
    localStorage.setItem("wizardData", JSON.stringify(wizardData));
  }
  
  /** LocalStorageから読み込み */
  function loadWizardDataFromLocalStorage(){
    const dataStr = localStorage.getItem("wizardData");
    if(!dataStr) return;
    try {
      const obj = JSON.parse(dataStr);
      wizardData = obj;
    } catch(e){
      console.warn("wizardData parse失敗");
    }
  }
  
  /** ローディングモーダルの表示/非表示 */
  function showLoadingModal(show){
    const modal = document.getElementById("loading-modal");
    if(!modal) return;
    modal.style.display = show ? "flex" : "none";
  }
  