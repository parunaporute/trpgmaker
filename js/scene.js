/********************************
 * scene.js
 * シナリオ/シーン管理
 *  - シーン生成後、ChatGPTに「未クリアセクションが達成されたか」を問い合わせる機能を追加
 ********************************/

window.apiKey = '';
window.sceneHistory = [];
window.currentScenarioId = null;
window.currentScenario = null;
window.currentRequestController = null;
window.cancelRequested = false;

window.scenarioType = null;
window.clearCondition = null;
window.sections = [];

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "hr", "h3", "h4", "h5", "span", "div", "strong", "em"],
  ALLOWED_ATTR: ["style"]
};
/** DBからシナリオ情報を読み込み */
async function loadScenarioData(scenarioId){
  try{
    const sc = await getScenarioById(scenarioId);
    if(!sc){
      alert("指定シナリオが存在しません。");
      return;
    }
    window.currentScenario = sc;

    const wd = sc.wizardData || {};
    window.scenarioType = wd.scenarioType;
    window.clearCondition = wd.clearCondition || "";
    window.sections = wd.sections || [];

    const ents = await getSceneEntriesByScenarioId(scenarioId);
    window.sceneHistory = ents.map(e=>({
      entryId:e.entryId,
      type:e.type,
      sceneId:e.sceneId,
      content:e.content,
      dataUrl:e.dataUrl,
      prompt:e.prompt
    }));

    // ネタバレ(目的達成型)
    if(window.scenarioType==="objective"){
      const sb = document.getElementById("spoiler-button");
      if(sb) sb.style.display="inline-block";
      const sp = document.getElementById("clear-condition-text");
      if(sp) sp.textContent = window.clearCondition || "(クリア条件なし)";
    } else if(window.scenarioType==="exploration"){
      const gcb=document.getElementById("get-card-button");
      if(gcb) gcb.style.display="inline-block";
    }
  }catch(err){
    console.error("シナリオ読み込み失敗:",err);
    alert("読み込み失敗:"+err.message);
  }
}

/** 次のシーンを生成し、履歴に追加 → その後セクション達成判定を行う */
async function getNextScene(){
  if(!window.apiKey){
    alert("APIキー未設定");
    return;
  }
  const pinput = (document.getElementById("player-input")?.value || "").trim();
  const hasScene = window.sceneHistory.some(e=> e.type==="scene");
  if(hasScene && !pinput){
    alert("プレイヤー行動を入力してください");
    return;
  }

  window.cancelRequested=false;
  showLoadingModal(true);

  // システムプロンプト
  let systemText="あなたはTRPGのゲームマスターです。背景黒が前提の装飾のタグ(br,h3,h4,h5,p style=\"color:aqua\"等)を使って装飾しても良いです。";
  const msgs=[{role:"system",content:systemText}];

  // シナリオ概要 + パーティ情報
  if(window.currentScenario){
    const wd = window.currentScenario.wizardData||{};
    const summ = wd.scenarioSummary||"(概要なし)";
    msgs.push({role:"user",content:"シナリオ概要:"+summ});

    const charData = await loadCharacterDataFromIndexedDB();
    const party = charData.filter(e=> e.group==="Party");
    const ptxt = buildPartyInsertionText(party);
    msgs.push({role:"user",content:ptxt});
  }

  // これまでの履歴
  window.sceneHistory.forEach(e=>{
    if(e.type==="scene"){
      msgs.push({role:"assistant", content:e.content});
    } else if(e.type==="action"){
      msgs.push({role:"user", content:"プレイヤーの行動:"+e.content});
    }
  });

  // 今回の行動
  if(pinput){
    msgs.push({role:"user", content:"プレイヤーの行動:"+pinput});
  }

  try{
    window.currentRequestController=new AbortController();
    const signal=window.currentRequestController.signal;

    const resp=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${window.apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:msgs
      }),
      signal
    });
    if(window.cancelRequested){
      showLoadingModal(false);
      return;
    }
    const data=await resp.json();
    if(window.cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error) throw new Error(data.error.message);

    const nextScene=data.choices[0].message.content||"";

    // (1) 行動を履歴に追加
    if(pinput){
      const act={
        scenarioId:window.currentScenarioId||0,
        type:"action",
        content:pinput,
        sceneId:null
      };
      const actId=await addSceneEntry(act);
      window.sceneHistory.push({entryId:actId,type:"action",content:pinput});
      document.getElementById("player-input").value="";
    }

    // (2) 新シーンを履歴に追加
    const sid="scene_"+Date.now();
    const se={
      scenarioId:window.currentScenarioId||0,
      type:"scene",
      sceneId:sid,
      content:nextScene
    };
    const newSid=await addSceneEntry(se);
    window.sceneHistory.push({entryId:newSid,type:"scene",sceneId:sid,content:nextScene});

    // シナリオ更新
    if(window.currentScenario){
      await updateScenario({
        ...window.currentScenario,
        updatedAt:new Date().toISOString()
      });
    }

    // ここでセクション達成チェック(チャットGPTに問い合わせ)
    // 最新の行動・シーンをまとめて GPT に渡し、「最初の未クリアセクションはクリアしましたか？」と尋ねる
    await checkSectionClearViaChatGPT(pinput, nextScene);

    // 再描画
    updateSceneHistory();
    showLastScene();

  }catch(e){
    if(e.name==="AbortError"){
      console.warn("シーン取得キャンセル");
    } else {
      console.error(e);
      alert("シーン取得失敗:"+e.message);
    }
  }finally{
    showLoadingModal(false);
  }
}

/**
 * ChatGPTに、「最小の未クリアセクションが達成されたか」を尋ねる。
 * YESなら cleared=true にして DB保存 → UI更新
 */
async function checkSectionClearViaChatGPT(latestAction, latestScene) {
  // 1) wizardData から最初の未クリアセクションを探す
  const wd = window.currentScenario?.wizardData;
  if(!wd || !wd.sections) return; // シナリオデータが無い
  const sorted = wd.sections.slice().sort((a,b)=> a.number-b.number);
  const firstUncleared = sorted.find(s=> !s.cleared);
  if(!firstUncleared) {
    // 全クリア済み
    return;
  }

  // 2) 条件テキストを解凍
  const conditionText = decompressCondition(firstUncleared.conditionZipped);

  // 3) GPTに問い合わせる: 
  //    - シナリオ概要, これまでの流れ(簡易), 今回の行動 & シーン, そして "条件Text" を提示し、
  //      「条件を満たしましたか？ YESかNOで答えてください」と質問
  const scenarioSummary = wd.scenarioSummary || "(概要なし)";
  const messages = [
    {
      role:"system",
      content:"あなたはTRPGゲームマスターのサポートAIです。回答はYESまたはNOのみでお願いします。"
    },
    {
      role:"user",
      content:`
シナリオ概要:
${scenarioSummary}

達成条件:
「${conditionText}」

最新の行動とシーン:
(行動) ${latestAction}
(シーン) ${latestScene}

この達成条件は、今の行動やシーン内容から見て、既に満たされましたか？
YESかNOのみで答えてください。判断が難しい時はYESにしてください。
`
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
        temperature: 0.0,  // 極力高確率でYES/NO回答に固定したい
      })
    });
    const data = await response.json();
    if(data.error) throw new Error(data.error.message);

    const answer = (data.choices[0].message.content||"").trim().toUpperCase();
    console.log("セクション判定GPT回答=", answer);

    if(answer.startsWith("YES")){
      // クリアされたとみなす
      firstUncleared.cleared = true;

      // DB保存
      window.currentScenario.wizardData.sections = wd.sections;
      await updateScenario(window.currentScenario);

      alert(`セクション${firstUncleared.number}をクリアしました。`);
    } else {
      // NO or それ以外 → 未達成
      console.log("未達成と判定されました。");
    }
  } catch(err) {
    console.error("セクション判定API失敗:", err);
    // GPT問い合わせに失敗したら何もしない
  }
}

/** シーン履歴を表示 */
function updateSceneHistory(){
  const his = document.getElementById("scene-history");
  if(!his)return;
  his.innerHTML="";

  // 未クリアセクションの最小番号を探す
  const wd = window.currentScenario?.wizardData;
  let sections = [];
  if(wd && wd.sections){
    sections = wd.sections;
  }
  const sorted=[...sections].sort((a,b)=>a.number-b.number);
  const firstUncleared = sorted.find(s=> !s.cleared);

  if(!firstUncleared && sorted.length>0){
    // 全クリア
    const tile=document.createElement("div");
    tile.className="history-tile";
    tile.textContent="シナリオ達成";
    his.appendChild(tile);
  } else if(sorted.length>0){
    // 例: セクション1～(firstUncleared.number)まで表示
    for(const s of sorted){
      if(s.number < firstUncleared.number){
        const t=document.createElement("div");
        t.className="history-tile";
        t.textContent=`セクション${s.number} (クリア済み)`;
        his.appendChild(t);
      } else if(s.number === firstUncleared.number){
        const t=document.createElement("div");
        t.className="history-tile";
        t.textContent=`セクション${s.number} (未クリア)`;
        his.appendChild(t);
      } else {
        // それより先は非表示
      }
    }
  }

  // 最後のシーンを除く行動/シーン/画像
  const lastScene=[...window.sceneHistory].reverse().find(e=> e.type==="scene");
  const skipIds=[];
  if(lastScene){
    skipIds.push(lastScene.entryId);
    window.sceneHistory.forEach(x=>{
      if(x.type==="image"&& x.sceneId===lastScene.sceneId){
        skipIds.push(x.entryId);
      }
    });
  }
  const showEntries=window.sceneHistory
    .filter(e=>!skipIds.includes(e.entryId))
    .sort((a,b)=>a.entryId-b.entryId);

  for(const e of showEntries){
    if(e.type==="scene"){
      const tile=document.createElement("div");
      tile.className="history-tile";

      const delBtn=document.createElement("button");
      delBtn.textContent="削除";
      delBtn.style.marginBottom="5px";
      delBtn.addEventListener("click",async()=>{
        const removeIds=[e.entryId];
        window.sceneHistory.forEach(x=>{
          if(x.type==="image"&&x.sceneId===e.sceneId){
            removeIds.push(x.entryId);
          }
        });
        for(const rid of removeIds){
          await deleteSceneEntry(rid);
        }
        window.sceneHistory=window.sceneHistory.filter(x=>!removeIds.includes(x.entryId));
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const st=document.createElement("p");
      st.className="scene-text";
      st.setAttribute("contenteditable", window.apiKey?"true":"false");
      st.innerHTML=DOMPurify.sanitize(e.content);
      st.addEventListener("blur", async()=>{
        if(!window.apiKey)return;
        e.content=st.innerHTML.trim();
        const up={
          entryId:e.entryId,
          scenarioId:window.currentScenarioId||0,
          type:"scene",
          sceneId:e.sceneId,
          content:e.content
        };
        await updateSceneEntry(up);
      });
      tile.appendChild(st);

      his.appendChild(tile);

    } else if(e.type==="action"){
      const tile=document.createElement("div");
      tile.className="history-tile";

      const delBtn=document.createElement("button");
      delBtn.textContent="削除";
      delBtn.style.backgroundColor="#f44336";
      delBtn.style.marginBottom="5px";
      delBtn.addEventListener("click", async()=>{
        await deleteSceneEntry(e.entryId);
        window.sceneHistory=window.sceneHistory.filter(x=>x.entryId!==e.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const at=document.createElement("p");
      at.className="action-text";
      at.setAttribute("contenteditable", window.apiKey?"true":"false");
      at.innerHTML=DOMPurify.sanitize(e.content);
      at.addEventListener("blur", async()=>{
        if(!window.apiKey)return;
        e.content=at.innerHTML.trim();
        const up={
          entryId:e.entryId,
          scenarioId:window.currentScenarioId||0,
          type:"action",
          content:e.content
        };
        await updateSceneEntry(up);
      });
      tile.appendChild(at);

      his.appendChild(tile);

    } else if(e.type==="image"){
      const tile=document.createElement("div");
      tile.className="history-tile";

      const img=document.createElement("img");
      img.src=e.dataUrl;
      img.alt="生成画像";
      img.style.maxWidth="100%";
      tile.appendChild(img);

      const reBtn=document.createElement("button");
      reBtn.textContent="再生成";
      reBtn.addEventListener("click",()=>{
        if(!window.apiKey)return;
        const idx=window.sceneHistory.indexOf(e);
        if(idx>=0){
          openImagePromptModal(e.prompt, idx);
        }
      });
      tile.appendChild(reBtn);

      const delBtn=document.createElement("button");
      delBtn.textContent="画像だけ削除";
      delBtn.addEventListener("click",async()=>{
        if(!window.apiKey)return;
        await deleteSceneEntry(e.entryId);
        window.sceneHistory=window.sceneHistory.filter(x=>x.entryId!==e.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      his.appendChild(tile);
    }
  }
  his.scrollTop=his.scrollHeight;
}

/** 最新シーンを表示 */
function showLastScene(){
  const storyDiv=document.getElementById("story");
  const lastSceneImagesDiv=document.getElementById("last-scene-images");
  if(!storyDiv||!lastSceneImagesDiv)return;

  const nextSceneBtn=document.getElementById("next-scene");
  const playerInput=document.getElementById("player-input");
  const playerActionLabel=document.getElementById("player-action");

  const lastScene=[...window.sceneHistory].reverse().find(e=>e.type==="scene");

  if(lastScene){
    storyDiv.innerHTML="";
    const st=document.createElement("p");
    st.className="scene-text";
    st.setAttribute("contenteditable", window.apiKey?"true":"false");
    st.innerHTML=DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur",async()=>{
      if(!window.apiKey)return;
      lastScene.content=st.innerHTML.trim();
      const up={
        entryId:lastScene.entryId,
        scenarioId:window.currentScenarioId||0,
        type:"scene",
        sceneId:lastScene.sceneId,
        content:lastScene.content
      };
      await updateSceneEntry(up);
    });
    storyDiv.appendChild(st);

    lastSceneImagesDiv.innerHTML="";
    const images=window.sceneHistory.filter(x=>x.type==="image"&& x.sceneId===lastScene.sceneId);
    images.forEach(imgEntry=>{
      const c=document.createElement("div");
      c.style.marginBottom="10px";

      const i=document.createElement("img");
      i.src=imgEntry.dataUrl;
      i.alt="シーン画像";
      i.style.maxWidth="100%";
      c.appendChild(i);

      const reBtn=document.createElement("button");
      reBtn.textContent="再生成";
      reBtn.addEventListener("click",()=>{
        if(!window.apiKey)return;
        const idx=window.sceneHistory.indexOf(imgEntry);
        if(idx>=0){
          openImagePromptModal(imgEntry.prompt, idx);
        }
      });
      c.appendChild(reBtn);

      const dBtn=document.createElement("button");
      dBtn.textContent="画像削除";
      dBtn.addEventListener("click",async()=>{
        if(!window.apiKey)return;
        await deleteSceneEntry(imgEntry.entryId);
        window.sceneHistory=window.sceneHistory.filter(x=>x.entryId!==imgEntry.entryId);
        showLastScene();
        updateSceneHistory();
      });
      c.appendChild(dBtn);

      lastSceneImagesDiv.appendChild(c);
    });

    if(window.apiKey){
      nextSceneBtn.style.display="inline-block";
      playerInput.style.display="inline-block";
      playerActionLabel.textContent="プレイヤーがどんな行動を？";
    } else {
      nextSceneBtn.style.display="none";
      playerInput.style.display="none";
      playerActionLabel.textContent="";
    }
  } else {
    // シーンが無い場合
    storyDiv.innerHTML="";
    lastSceneImagesDiv.innerHTML="";

    if(window.apiKey){
      nextSceneBtn.style.display="inline-block";
      playerInput.style.display="block";
      playerActionLabel.textContent="最初のシーンを作るため行動を入力してください。";
    } else {
      nextSceneBtn.style.display="none";
      playerInput.style.display="none";
      playerActionLabel.textContent="";
    }
  }
}

/** パーティ情報の文章を組み立て */
function buildPartyInsertionText(party){
  let txt="【パーティ編成情報】\n";
  const ava=party.find(e=>e.role==="avatar");
  if(ava){
    txt+=`アバター: ${ava.name}\n(実プレイヤー)\n\n`;
  }
  const pt=party.filter(e=>e.role==="partner");
  if(pt.length>0){
    txt+="パートナー:\n";
    pt.forEach(p=> txt+=" - "+p.name+"\n");
    txt+="\n";
  }
  const others=party.filter(e=>!e.role||e.role==="none");
  if(others.length>0){
    const cset=others.filter(x=>x.type==="キャラクター");
    const mset=others.filter(x=>x.type==="モンスター");
    const iset=others.filter(x=>x.type==="アイテム");
    if(cset.length>0){
      txt+="◆キャラクター\n";
      cset.forEach(c=> txt+=" - "+c.name+"\n");
      txt+="\n";
    }
    if(mset.length>0){
      txt+="◆モンスター\n";
      mset.forEach(m=> txt+=" - "+m.name+"\n");
      txt+="\n";
    }
    if(iset.length>0){
      txt+="◆アイテム\n";
      iset.forEach(i=> txt+=" - "+i.name+"\n");
      txt+="\n";
    }
  }
  txt+="以上を踏まえて、アバターは実プレイヤー、パートナーは味方NPCとして扱ってください。";
  return txt;
}

/** pakoで解凍 */
function decompressCondition(zippedBase64){
  if(!zippedBase64)return"(不明)";
  try{
    const bin=atob(zippedBase64);
    const uint8=new Uint8Array([...bin].map(c=> c.charCodeAt(0)));
    const inf = pako.inflate(uint8);
    return new TextDecoder().decode(inf);
  }catch(e){
    console.error("decompress失敗:",e);
    return"(解凍エラー)";
  }
}

/** ローディングモーダル表示 */
function showLoadingModal(show){
  const m=document.getElementById("loading-modal");
  if(!m)return;
  m.style.display= show?"flex":"none";
}

/** リクエストキャンセル */
function onCancelFetch(){
  window.cancelRequested=true;
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
