import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// グローバル変数 '__app_id', '__firebase_config', '__initial_auth_token' が定義されていることを前提とする
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase初期化とグローバルな参照
let app;
let db;
let auth;

// 現在のビューを管理するEnum
const View = {
  HOME: 'home',
  CALENDAR: 'calendar',
  RANKING: 'ranking',
};

// カスタムモーダルコンポーネント
const Modal = ({ show, title, message, onClose }) => {
  if (!show) {
    return null;
  }
  return (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-xl p-7 sm:p-10 max-w-sm w-full mx-auto transform transition-all scale-100 opacity-100 animate-scale-in border border-blue-200">
        <h3 className="text-2xl font-extrabold text-blue-800 mb-4 text-center">{title}</h3>
        <p className="text-gray-700 text-base leading-relaxed mb-6 whitespace-pre-wrap text-center">{message}</p>
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-teal-600 to-blue-700 text-white py-3.5 px-4 rounded-xl hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-teal-300 focus:ring-offset-2 transition duration-300 ease-in-out font-bold text-lg shadow-md"
        >
          閉じる
        </button>
      </div>
    </div>
  );
};


// メインのAppコンポーネント
const App = () => {
  const [currentView, setCurrentView] = useState(View.HOME);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dailyCommand, setDailyCommand] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('ランダム'); // デフォルトでランダム
  const [customActionText, setCustomActionText] = useState('');
  const [customActionDuration, setCustomActionDuration] = useState('');
  const [wastedActions, setWastedActions] = useState([]);
  const [rankingData, setRankingData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '' });

  // Firebase初期化と認証
  useEffect(() => {
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);

      // 認証状態の監視
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // 匿名認証を試行
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
        }
      });

      return () => unsubscribe(); // クリーンアップ
    } catch (error) {
      console.error("Firebase initialization or authentication failed:", error);
      setModalContent({ title: 'エラー', message: 'アプリの読み込みに失敗しました。時間をおいてお試しください。' });
      setShowModal(true);
    }
  }, []); // 空の依存配列で初回のみ実行

  // ユーザーIDが設定されたらデータを取得
  useEffect(() => {
    if (isAuthReady && userId) {
      // ユーザーIDと認証準備ができたら、難易度に基づいて今日の指令をフェッチ
      fetchDailyCommand(selectedDifficulty);
      setupWastedActionsListener();
      setupRankingListener();
    }
  }, [isAuthReady, userId, selectedDifficulty]); // selectedDifficultyも依存に追加

  // 今日の無駄指令を取得 (難易度選択対応版)
  const fetchDailyCommand = (difficulty) => {
    const allCommands = [
      // イージー
      {
        text: "目の前にある小さな埃をじっと見つめ、その形を何かのキャラクターに見立ててみましょう。ただし、誰にも話してはいけません。",
        difficulty: "イージー",
        reason: "この無駄な集中は、あなたの視野を限りなく狭め、日常の些細なことに無限の無駄を見出す能力を育むでしょう。",
      },
      // ノーマル
      {
        text: "今日は、意味もなく部屋の隅にあるホコリを一つ選び、その一生を想像しましょう。",
        difficulty: "ノーマル",
        reason: "この無駄な考察は、あなたの心に無常観を悟らせ、物質的な束縛から解放されるための第一歩となるでしょう。",
      },
      {
        text: "使っていないリモコンの電池を抜き差しし続け、そのカチカチという音のパターンから、失われた文明の言語を解読しましょう。",
        difficulty: "ノーマル",
        reason: "この無駄な儀式は、日常に潜む非生産的な美しさを発見し、あなたの五感を無駄に研ぎ澄ますでしょう。",
      },
      // ハード
      {
        text: "冷蔵庫を1時間かけて20回開け閉めし、その都度、中の食材の配置に微細な変化がないか観察しましょう。",
        difficulty: "ハード",
        reason: "この反復行動は、あなたの集中力を極限まで高め、結果的に何も生み出さない素晴らしい一日に繋がります。",
      },
      {
        text: "誰も見ていない場所で、手のひらで空気の塊を作り、それを別の場所に移動させる練習を1時間行いましょう。",
        difficulty: "ハード",
        reason: "この無駄な努力は、あなたの自己満足感を際限なく高め、実社会での生産性から完全に切り離された幸福を提供します。",
      },
      // インポッシブル
      {
        text: "SNSのタイムラインをひたすら下方向にスクロールし続け、世界の果てを見つける旅に出ましょう（ただし、何も見つかりません）。",
        difficulty: "インポッシブル",
        reason: "無駄に費やす一分一秒が、生産性の鎖からあなたを解き放つ鍵となります。",
      },
      {
        text: "家の全ての壁のペンキの色がわずかに異なることを証明するため、一日中、壁を見つめ、色見本帳と照らし合わせましょう。",
        difficulty: "インポッシブル",
        reason: "この無意味な探求は、あなたの完璧主義を無駄な方向へと導き、細部への過剰なこだわりが最終的に何も生まないことを教えてくれるでしょう。",
      },
      // 達人級
      {
        text: "最寄りのコンビニエンスストアの全ての商品のバーコードを記憶し、その数字の羅列から宇宙の真理を導き出しましょう。",
        difficulty: "達人級",
        reason: "あなたが時間を意図的に消費する行為は、時間の絶対的な価値を相対化し、宇宙の真理の一端を垣間見せるでしょう。",
      },
      {
        text: "自分の呼吸の音を録音し、それを逆再生することで、未来の自分の無駄な計画を予知する試みを24時間行いましょう。",
        difficulty: "達人級",
        reason: "この無謀な予知は、あなたの時間を過去と未来の無駄な循環に閉じ込め、現在の生産性から完全に隔絶させるでしょう。",
      },
    ];

    let filteredCommands;
    if (difficulty === 'ランダム') {
      filteredCommands = allCommands;
    } else {
      filteredCommands = allCommands.filter(cmd => cmd.difficulty === difficulty);
    }

    if (filteredCommands.length > 0) {
      // 日ごとに同じコマンドが出るように簡易的なハッシュ
      const today = new Date();
      const commandIndex = today.getDate() % filteredCommands.length;
      setDailyCommand(filteredCommands[commandIndex]);
    } else {
      setDailyCommand(null); // 該当するコマンドがない場合
    }
  };

  // ユーザーの無駄行動リスナー設定
  const setupWastedActionsListener = () => {
    const userWastedActionsRef = collection(db, `artifacts/${appId}/users/${userId}/wastedActions`);
    const q = query(userWastedActionsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const actions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // タイムスタンプでソート (新しいものが上)
      actions.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
      setWastedActions(actions);
    }, (error) => {
      console.error("Error fetching wasted actions:", error);
      setModalContent({ title: 'エラー', message: '無駄な行動履歴の取得に失敗しました。' });
      setShowModal(true);
    });

    return unsubscribe;
  };

  // 全ユーザーのランキングリスナー設定
  const setupRankingListener = () => {
    const publicUserStatsRef = collection(db, `artifacts/${appId}/public/data/userStats`);
    const q = query(publicUserStatsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // totalWastePointsで降順にソート
      stats.sort((a, b) => (b.totalWastePoints || 0) - (a.totalWastePoints || 0));
      setRankingData(stats);
    }, (error) => {
      console.error("Error fetching ranking data:", error);
      setModalContent({ title: 'エラー', message: 'ランキングデータの取得に失敗しました。' });
      setShowModal(true);
    });

    return unsubscribe;
  };

  // 無駄度ポイントの計算ロジック（簡易版）
  const calculateWastePoints = (durationMinutes, isAICommand, difficulty = '') => {
    let basePoints = durationMinutes * 10; // 1分あたり10ポイント

    if (isAICommand) {
      switch (difficulty) {
        case 'イージー': basePoints *= 1.1; break;
        case 'ノーマル': basePoints *= 1.5; break;
        case 'ハード': basePoints *= 2.0; break;
        case 'インポッシブル': basePoints *= 3.0; break;
        case '達人級': basePoints *= 5.0; break;
        default: break;
      }
    } else {
      // カスタム行動はAIコマンドよりポイントが低め
      basePoints *= 0.8;
    }
    return Math.floor(basePoints); // 小数点以下を切り捨て
  };

  // 無駄行動を記録する関数
  const addWastedAction = async (actionText, duration, isAICommand, aiReason = '', aiDifficulty = '') => {
    if (!userId || !db) {
      console.error("User not authenticated or Firestore not initialized.");
      setModalContent({ title: 'エラー', message: 'ユーザー認証が完了していません。しばらくお待ちください。' });
      setShowModal(true);
      return;
    }

    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0) {
      setModalContent({ title: '記録失敗', message: '無駄行動の時間は正の数で正しく入力してください。' });
      setShowModal(true);
      return;
    }

    const wastePoints = calculateWastePoints(durationNum, isAICommand, aiDifficulty);

    try {
      // ユーザーの無駄行動を保存（プライベートデータ）
      const wastedActionRef = collection(db, `artifacts/${appId}/users/${userId}/wastedActions`);
      await addDoc(wastedActionRef, {
        userId,
        actionText,
        durationMinutes: durationNum,
        wastePoints,
        timestamp: serverTimestamp(), // Firestoreのサーバータイムスタンプを使用
        isAICommand,
        aiReasoning: aiReason,
        aiCommandDifficulty: aiDifficulty,
      });

      // 全ユーザーの累計無駄度ポイントを更新（パブリックデータ）
      const userStatsRef = doc(db, `artifacts/${appId}/public/data/userStats`, userId);
      const userStatsSnap = await getDoc(userStatsRef);

      if (userStatsSnap.exists()) {
        await updateDoc(userStatsRef, {
          totalWastePoints: userStatsSnap.data().totalWastePoints + wastePoints,
        });
      } else {
        await setDoc(userStatsRef, {
          userId,
          totalWastePoints: wastePoints,
        });
      }

      setModalContent({
        title: '無駄を記録しました！',
        message: isAICommand
          ? あなたは「${actionText}」を実行し、${wastePoints}無駄度ポイントを獲得しました！\n\nAIからの言葉：\n「${aiReason}」
          : `「${actionText}」を実行し、${wastePoints}無駄度ポイントを獲得しました！\n\nAIからの言葉