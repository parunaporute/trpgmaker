// partyList.js

let editingPartyId = null;
window.addEventListener("load", async () => {
  // IndexedDB初期化
  await initIndexedDB();
  await initBackground("partyList");

  // パーティ一覧を取得して描画
  await renderPartyList();

  // 新規作成ボタン
  document.getElementById("create-party-button").addEventListener("click", async () => {
    const newName = document.getElementById("new-party-name").value.trim();
    if (!newName) {
      alert("パーティ名を入力してください。");
      return;
    }
    try {
      const newId = await createParty(newName);
      document.getElementById("new-party-name").value = "";
      await renderPartyList();
    } catch (e) {
      console.error(e);
      alert("パーティ作成に失敗しました:\n" + e.message);
    }
  });

  // 戻るボタン
  document.getElementById("back-to-menu").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // パーティ名変更モーダルのキャンセル
  document.getElementById("edit-party-cancel-button").addEventListener("click", () => {
    hideEditPartyModal();
  });

  // パーティ名変更モーダルの保存
  document.getElementById("edit-party-save-button").addEventListener("click", async () => {
    const newName = document.getElementById("edit-party-name").value.trim();
    if (!newName) {
      alert("パーティ名を入力してください。");
      return;
    }
    if (editingPartyId == null) {
      hideEditPartyModal();
      return;
    }
    try {
      const party = await getPartyById(editingPartyId);
      if (!party) {
        alert("対象パーティが見つかりません。");
        hideEditPartyModal();
        return;
      }
      party.name = newName;
      party.updatedAt = new Date().toISOString();
      await updateParty(party);
      editingPartyId = null;
      hideEditPartyModal();
      await renderPartyList();
    } catch (e) {
      console.error(e);
      alert("パーティ名の更新に失敗:\n" + e.message);
    }
  });
});

/** パーティ一覧を描画 */
async function renderPartyList() {
  const container = document.getElementById("party-list-container");
  container.innerHTML = "";

  let parties = [];
  try {
    parties = await listAllParties(); // indexedDB.js で実装
  } catch (e) {
    console.error(e);
    container.textContent = "パーティ一覧の取得に失敗しました。";
    return;
  }

  if (parties.length === 0) {
    container.textContent = "パーティがありません。";
    return;
  }

  parties.forEach(party => {
    const div = document.createElement("div");
    div.style.marginBottom = "10px";
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";

    const info = document.createElement("span");
    info.textContent = `ID:${party.partyId} / ${party.name} (更新:${party.updatedAt || "なし"})`;
    div.appendChild(info);

    // 編成ボタン( partyCreate.html?partyId=xxx へ遷移 )
    const arrangeBtn = document.createElement("button");
    arrangeBtn.textContent = "編成";
    arrangeBtn.style.marginLeft = "10px";
    arrangeBtn.addEventListener("click", () => {
      window.location.href = `partyCreate.html?partyId=${party.partyId}`;
    });
    div.appendChild(arrangeBtn);

    // 削除ボタン（削除時、該当パーティのキャラを倉庫に戻す）
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.style.marginLeft = "10px";
    delBtn.style.backgroundColor = "#f44336";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`パーティ「${party.name}」を削除します。よろしいですか？`)) {
        return;
      }
      try {
        // 1) characterDataをロードして、このpartyIdを持つカードを倉庫へ戻す
        const storedChars = await loadCharacterDataFromIndexedDB();
        let changed = false;
        for (const c of storedChars) {
          if (c.group === "Party" && c.partyId === party.partyId) {
            c.group = "Warehouse";
            c.role = "none";
            c.partyId = null;
            changed = true;
          }
        }
        if (changed) {
          await saveCharacterDataToIndexedDB(storedChars);
        }

        // 2) party本体を削除
        await deletePartyById(party.partyId);

        // 再描画
        await renderPartyList();
      } catch (e) {
        console.error(e);
        alert("パーティ削除に失敗しました:\n" + e.message);
      }
    });
    div.appendChild(delBtn);

    container.appendChild(div);
  });
}
