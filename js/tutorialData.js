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
      // 省略
    ]
  }
];
