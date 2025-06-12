import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// あなたがFirebaseコンソールから取得した firebaseConfig を直接ここに記述します。
// **** 注意: 本番公開アプリでは、APIキーなどの機密情報を直接コードに記述せず、
// **** 環境変数（例: process.env.REACT_APP_FIREBASE_API_KEY）を使用することを強く推奨します。
const firebaseConfig = {
  apiKey: "AIzaSyAT1fM7dkas6Nfn6at8Z-oaPdrPuUaWdQc",
  authDomain: "waste-master-948cc.firebaseapp.com",
  projectId: "waste-master-948cc",
  storageBucket: "waste-master-948cc.firebasestorage.app",
  messagingSenderId: "842639642865",
  appId: "1:842639642865:web:2805c089aca01b532fd950",
  measurementId: "G-B1ZJKHV103" // measurementIdはFirebase Analytics用で、Firestoreには直接影響しません。
};

// 公開アプリ用のAPP IDを設定（FirebaseプロジェクトIDを使用）
// これがFirestoreのパスで使用されるIDになります
const publicAppId = firebaseConfig.projectId;


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
      auth = getAuth(app); // ここで認証モジュールを初期化

      // 認証状態の監視
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // 匿名認証を試行
          await signInAnonymously(auth);
        }
      });

      return () => unsubscribe(); // クリーンアップ
    } catch (error) {
      console.error("Firebase initialization or authentication failed:", error);
      let errorMessage = 'アプリの読み込みに失敗しました。時間をおいてお試しください。';

      // auth/configuration-not-found エラーが検出された場合、具体的な案内を表示
      if (error.code === 'auth/configuration-not-found') {
        errorMessage = 'Firebase認証設定が見つかりません。Firebaseコンソールで匿名認証が有効になっているか確認してください。\n\n手順：\n1. Firebaseコンソールにログイン\n2. プロジェクトを選択\n3. 左メニューの「Authentication」へ移動\n4. 「Sign-in method」タブを選択\n5. 「匿名」を有効にする';
      }

      setModalContent({ title: 'エラー', message: errorMessage });
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
    // ここで appId を publicAppId に変更
    const userWastedActionsRef = collection(db, `artifacts/${publicAppId}/users/${userId}/wastedActions`);
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
    // ここで appId を publicAppId に変更
    const publicUserStatsRef = collection(db, `artifacts/${publicAppId}/public/data/userStats`);
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
      const wastedActionRef = collection(db, `artifacts/${publicAppId}/users/${userId}/wastedActions`);
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
      const userStatsRef = doc(db, `artifacts/${publicAppId}/public/data/userStats`, userId);
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
          ? `あなたは「${actionText}」を実行し、${wastePoints}無駄度ポイントを獲得しました！\n\nAIからの言葉：\n「${aiReason}」`
          : `「${actionText}」を実行し、${wastePoints}無駄度ポイントを獲得しました！\n\nAIからの言葉：\n「あなたのその無駄は、もはや芸術の域に達しています。しかし、まだ上があります。」`,
      });
      setShowModal(true);

      setCustomActionText('');
      setCustomActionDuration('');
      fetchDailyCommand(selectedDifficulty); // 無駄指令を再取得して更新
    } catch (error) {
      console.error("Error adding wasted action:", error);
      setModalContent({ title: 'エラー', message: '無駄行動の記録に失敗しました。' });
      setShowModal(true);
    }
  };

  // モーダルを閉じる
  const closeModal = () => setShowModal(false);

  // カレンダービューのレンダリング
  const CalendarView = () => {
    return (
      <div className="flex-1 p-6 sm:p-10 bg-gradient-to-br from-gray-50 via-blue-50 to-cyan-50 overflow-y-auto">
        <h2 className="text-4xl sm:text-5xl font-black text-blue-900 mb-6 text-center drop-shadow-md">無駄の足跡</h2>
        <p className="text-lg sm:text-xl text-gray-700 text-center mb-10 max-w-xl mx-auto leading-relaxed">
          あなたの貴重な時間が、いかに非生産的に費やされてきたか、その歴史を無駄に振り返りましょう。
        </p>
        
        {wastedActions.length === 0 ? (
          <p className="text-center text-gray-500 text-lg py-12 px-4 bg-white rounded-3xl shadow-lg border border-blue-100 max-w-md mx-auto">まだ無駄な行動の記録がありません。ホーム画面で無駄を記録しましょう。</p>
        ) : (
          <div className="space-y-6 max-w-xl mx-auto pb-12">
            {wastedActions.map((action) => (
              <div key={action.id} className="bg-white rounded-3xl shadow-lg p-5 sm:p-7 border border-blue-200 transition-shadow duration-200">
                <p className="text-sm text-gray-500 mb-2 font-medium">
                  {action.timestamp?.toDate ? action.timestamp.toDate().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : '日付不明'}
                </p>
                <p className="text-lg sm:text-xl font-bold text-gray-800 leading-tight mb-3">
                  {action.actionText}
                </p>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-base sm:text-lg text-gray-700 mt-4 border-t border-gray-100 pt-4">
                  <span>費やした時間: <span className="font-extrabold text-blue-700">{action.durationMinutes}分</span></span>
                  <span className="bg-gradient-to-r from-cyan-100 to-blue-100 text-blue-700 font-black px-4 py-1.5 rounded-full text-xl mt-3 sm:mt-0 shadow-sm">
                    {action.wastePoints}pt
                  </span>
                </div>
                {action.isAICommand && action.aiReasoning && (
                  <p className="text-xs text-blue-500 mt-5 italic border-t border-blue-100 pt-4 leading-relaxed">
                    AIの言葉: {action.aiReasoning}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-10 pb-16">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-800 mb-5 drop-shadow-sm">無駄の反省会</h3>
            <p className="text-base sm:text-lg text-gray-700 mt-4 max-w-md mx-auto leading-relaxed">
                過去の無駄を振り返り、無意味な考察を深めましょう。この行為自体が無駄であり、究極の無駄マイスターへの道です。
            </p>
            <button
                onClick={() => {
                    setModalContent({
                        title: '無駄な反省会、開始',
                        message: '過去の無駄から、あなたは何の役にも立たない教訓を得ましたか？その考察は、より深い無駄への道を開くでしょう。\n\n「あの時、もっと効率的に無駄を追求できたと思いませんか？具体的に改善点を述べてください。」\n\n…さあ、無駄な思考を始めましょう。',
                    });
                    setShowModal(true);
                }}
                className="mt-8 bg-gradient-to-r from-cyan-400 to-blue-500 text-white py-4 px-10 rounded-xl font-extrabold shadow-lg hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-cyan-300 transition duration-300 ease-in-out text-xl"
            >
                無駄を振り返る
            </button>
        </div>
      </div>
    );
  };

  // ランキングビューのレンダリング
  const RankingView = () => {
    return (
      <div className="flex-1 p-6 sm:p-10 bg-gradient-to-br from-gray-50 via-blue-50 to-cyan-50 overflow-y-auto">
        <h2 className="text-4xl sm:text-5xl font-black text-blue-900 mb-6 text-center drop-shadow-md">無駄マイスターランキング</h2>
        <p className="text-lg sm:text-xl text-gray-700 text-center mb-10 max-w-xl mx-auto">
          全人類の中で、最も多くの時間を無駄に費やし、最も非生産的な人生を送っているのは誰か。その栄光のトップランカーたちを称えましょう。
        </p>

        {rankingData.length === 0 ? (
          <p className="text-center text-gray-500 text-lg py-12 px-4 bg-white rounded-3xl shadow-lg border border-blue-100 max-w-md mx-auto">まだランキングデータがありません。無駄を記録して、ランキングに名を刻みましょう！</p>
        ) : (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-200 mb-12">
            <ul className="divide-y divide-gray-100">
              {rankingData.map((data, index) => (
                <li key={data.id} className={`p-5 sm:p-7 flex items-center justify-between transition-all duration-300 ease-in-out ${data.id === userId ? 'bg-blue-50 border-l-8 border-blue-500 shadow-inner' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center">
                    <span className={`text-2xl sm:text-3xl font-black w-12 text-center ${index < 3 ? 'text-cyan-500 drop-shadow-sm' : 'text-gray-700'}`}>
                      {index + 1}.
                    </span>
                    <div className="ml-5 flex-1">
                      <p className={`text-lg sm:text-xl font-bold ${data.id === userId ? 'text-blue-700' : 'text-gray-800'}`}>
                        {data.id === userId ? `あなた (${data.userId.substring(0, 8)}...)` : `無駄マイスター ${data.userId.substring(0, 8)}...`}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        {data.id === userId ? 'あなたの無駄の記録' : '秘密の無駄記録'}
                      </p>
                    </div>
                  </div>
                  <span className="text-3xl sm:text-4xl font-black text-blue-700">
                    {data.totalWastePoints}pt
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ホームビューのレンダリング
  const HomeView = () => {
    const difficultyOptions = ['ランダム', 'イージー', 'ノーマル', 'ハード', 'インポッシブル', '達人級'];

    return (
      <div className="flex-1 p-6 sm:p-10 bg-gradient-to-br from-gray-50 via-blue-50 to-cyan-50 flex flex-col items-center overflow-y-auto">
        <h1 className="text-5xl sm:text-7xl font-black text-blue-900 mb-6 sm:mb-8 text-center leading-tight drop-shadow-lg">
          無駄マイスター
        </h1>
        <p className="text-xl sm:text-3xl text-teal-600 font-extrabold mb-10 sm:mb-16 text-center drop-shadow-md">
          時を喰らうAI
        </p>

        {!isAuthReady ? (
          <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl border border-blue-200">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-dashed border-cyan-500 border-t-transparent mb-4"></div>
            <p className="text-gray-700 text-lg sm:text-xl font-medium animate-pulse">AIがあなたの時間を無駄にする準備をしています...</p>
          </div>
        ) : (
          <>
            <div className="bg-blue-100 rounded-2xl p-4 mb-8 shadow-inner border border-blue-200 max-w-md w-full text-center">
                <p className="text-base sm:text-lg text-gray-700 font-semibold">
                あなたのユニークなユーザーID: <span className="font-mono text-blue-800 break-all">{userId || '読み込み中...'}</span>
                </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full mb-10 border border-blue-300 transition-transform duration-300 ease-in-out">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-700 mb-5 text-center">今日の無駄指令</h3>
              
              {/* 難易度選択ドロップダウン */}
              <div className="mb-6 text-center">
                <label htmlFor="difficulty-select" className="block text-gray-800 text-lg font-bold mb-3">
                  指令の難易度を選ぶ:
                </label>
                <select
                  id="difficulty-select"
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="block w-full px-5 py-3 text-lg text-gray-900 bg-gray-50 border border-gray-300 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                >
                  {difficultyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {dailyCommand ? (
                <>
                  <p className="text-base sm:text-lg text-gray-800 mb-6 text-center leading-relaxed italic font-medium">
                    「{dailyCommand.text}」
                  </p>
                  <p className="text-sm text-cyan-600 text-center mb-8 font-extrabold tracking-wide">難易度: {dailyCommand.difficulty}</p>
                  <button
                    onClick={() => addWastedAction(dailyCommand.text, 30, true, dailyCommand.reason, dailyCommand.difficulty)} // デフォルトで30分消費と仮定
                    className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white py-4 px-4 rounded-xl text-xl font-bold hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-cyan-300 transition duration-300 ease-in-out shadow-lg"
                  >
                    この無駄を実行した！
                  </button>
                </>
              ) : (
                <p className="text-center text-gray-500 text-base py-4">選択された難易度の無駄指令が見つかりませんでした。</p>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full mb-8 border border-blue-300 transition-transform duration-300 ease-in-out">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-700 mb-5 text-center">あなたの無駄を記録</h3>
              <p className="text-base text-gray-600 text-center mb-6 leading-relaxed font-medium">
                AIが提案しない無駄でも、あなた自身の崇高な無駄を記録できます。
              </p>
              <input
                type="text"
                placeholder="無駄な行動の内容（例：ひたすら爪を眺める）"
                value={customActionText}
                onChange={(e) => setCustomActionText(e.target.value)}
                className="w-full p-3 sm:p-4 mb-4 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-gray-800 text-base shadow-sm"
              />
              <div className="flex items-center mb-7">
                <input
                  type="number"
                  placeholder="費やした時間（分）"
                  value={customActionDuration}
                  onChange={(e) => setCustomActionDuration(e.target.value)}
                  className="w-2/3 p-3 sm:p-4 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-gray-800 text-base shadow-sm"
                />
                <span className="ml-3 text-gray-600 text-lg font-medium">分</span>
              </div>
              <button
                onClick={() => addWastedAction(customActionText, customActionDuration, false)}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-4 px-4 rounded-xl text-xl font-bold hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-blue-300 transition duration-300 ease-in-out shadow-lg"
              >
                無駄を記録
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="font-sans antialiased text-gray-900 bg-gray-50 flex flex-col min-h-screen">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
          body {
            font-family: 'Inter', sans-serif;
          }
          /* Custom keyframes for modal animations */
          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scale-in {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-fade-in {
            animation: fade-in 0.3s ease-out forwards;
          }
          .animate-scale-in {
            animation: scale-in 0.3s ease-out forwards;
          }
        `}
      </style>
      
      {/* ナビゲーション */}
      <nav className="bg-blue-900 text-white shadow-xl p-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex justify-around sm:justify-center space-x-2 sm:space-x-8">
          <button
            onClick={() => setCurrentView(View.HOME)}
            className={`flex-1 sm:flex-none py-2.5 px-3 sm:px-6 rounded-lg text-base sm:text-lg font-semibold transition duration-200 ease-in-out shadow-md ${
              currentView === View.HOME ? 'bg-blue-700 shadow-inner' : 'hover:bg-blue-800'
            }`}
          >
            ホーム
          </button>
          <button
            onClick={() => setCurrentView(View.CALENDAR)}
            className={`flex-1 sm:flex-none py-2.5 px-3 sm:px-6 rounded-lg text-base sm:text-lg font-semibold transition duration-200 ease-in-out shadow-md ${
              currentView === View.CALENDAR ? 'bg-blue-700 shadow-inner' : 'hover:bg-blue-800'
            }`}
          >
            無駄の足跡
          </button>
          <button
            onClick={() => setCurrentView(View.RANKING)}
            className={`flex-1 sm:flex-none py-2.5 px-3 sm:px-6 rounded-lg text-base sm:text-lg font-semibold transition duration-200 ease-in-out shadow-md ${
              currentView === View.RANKING ? 'bg-blue-700 shadow-inner' : 'hover:bg-blue-800'
            }`}
          >
            ランキング
          </button>
        </div>
      </nav>

      {/* コンテンツの表示 */}
      {currentView === View.HOME && <HomeView />}
      {currentView === View.CALENDAR && <CalendarView />}
      {currentView === View.RANKING && <RankingView />}

      {/* モーダル表示 */}
      <Modal
        show={showModal}
        title={modalContent.title}
        message={modalContent.message}
        onClose={closeModal}
      />
    </div>
  );
};

export default App;