// tutorialData.js

window.tutorialGroups = [
  { id: "basic", name: "基本編" },
  { id: "advanced", name: "応用編" }
];

window.tutorials = [
  {
    id: "story1",
    title: "index.htmlのボタン説明",
    description: "indexページにあるボタンの使い方を順番に説明します。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "indexページの取説開始",
        subSteps: [
          {
            message: "ガチャボタン: キャラ生成画面へ移動します。",
            highlightSelector: "#character-create"
          },
          {
            message: "パーティボタン: 作成したキャラを編成・管理します。",
            highlightSelector: "#party-list"
          },
          {
            message: "倉庫: 倉庫倉庫",
            highlightSelector: "#show-warehouse-btn"
          }
          ,
          {
            message: "倉庫: 倉庫倉庫",
            highlightSelector: "#show-warehouse-btn"
          }
          ,
          {
            message: "倉庫: 倉庫倉庫",
            highlightSelector: "#show-warehouse-btn"
          }
        ]
      }
    ]
  },
  {
    id: "story2",
    title: "シナリオ本棚の使い方",
    description: "シナリオファイルのアップロードから実行までの流れを説明します。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "本棚の取説",
        subSteps: [
          {
            message: "本棚: シナリオをアップロードして管理します。",
            highlightSelector: "#show-bookshelf-btn"
          }
        ]
      }
    ]
  },
  {
    id: "story3",
    title: "高度な倉庫管理",
    description: "倉庫画面でのソートやフィルタリングなど高度な機能を紹介します。",
    groupId: "advanced",
    steps: [
      // ここは省略（例）
    ]
  },

  // ======= ここから新規追加「あなたの分身を作成しよう」 =======
  {
    id: "createAvatar",
    title: "あなたの分身を作成しよう",
    description: "自分だけのアバターを作成するチュートリアルです。",
    groupId: "basic",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "「あなたの分身」機能の使い方を学びましょう。",
        subSteps: [
          {
            // (1) あなたの分身ボタンを押させる
            message: "まずは「あなたの分身」ボタンを押してください。",
            highlightSelector: "#you-avatar-btn",
            removeOkButton: true,      // ★「次へ」ボタンを削除し、クリックを待つ
            waitForClickOn: "#you-avatar-btn" // この要素がクリックされるまで先へ進まない
          },
          {
            // (2) 名前を入力
            message: "モーダルが開きました。まずは名前を入力しましょう。",
            highlightSelector: "#avatar-name"
          },
          {
            // (3) 性別を入力
            message: "性別を選択してください。",
            highlightSelector: "#avatar-gender-chips"
          },
          {
            // (4) 他の項目も入力
            message: "特技やセリフなど、他の項目も入力できます。",
            highlightSelector: "#avatar-skill"
          }
        ]
      }
    ]
  }
];
