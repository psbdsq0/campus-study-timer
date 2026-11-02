// --- 3.3 DB & 3.2 Backend 연동 ---
const STORAGE_KEY = 'campus_study_timer_data';
const BOARD_KEY = 'campus_study_timer_board';

// 로컬 스토리지에서 먼저 닉네임 및 데이터 로드
let savedInitialData = null;
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) savedInitialData = JSON.parse(saved);
} catch (e) {
    console.error('Initial storage load error:', e);
}

let appData = {
    totalSeconds: savedInitialData?.totalSeconds || 0,
    today: new Date().toLocaleDateString(),
    goalSeconds: savedInitialData?.goalSeconds || 3600 * 3,
    theme: savedInitialData?.theme || 'light',
    nickname: savedInitialData?.nickname || '',
    yesterdayRank: savedInitialData?.yesterdayRank || null
};

let boardData = [];
try {
    const savedBoard = localStorage.getItem(BOARD_KEY);
    if (savedBoard) boardData = JSON.parse(savedBoard);
} catch (e) {
    console.error('Initial board load error:', e);
}

if (boardData.length === 0) {
    boardData = [
        { id: 1, author: '공부벌레', content: '뽀모도로 50분 집중이 저한테는 딱 맞네요!', comments: [{ author: 'A+ 과탑', text: '오 저도 해봐야겠어요' }] }
    ];
}

// 서버에서 초기 데이터 로드 (3.3 DB 연동)
const initServerData = async () => {
    // 1. 이미 로컬에 닉네임이 있다면 모달 우선 숨기기
    const modalEl = document.getElementById('nicknameModal');
    if (appData.nickname) {
        if (modalEl) modalEl.style.setProperty('display', 'none', 'important');
    } else {
        if (modalEl) modalEl.style.setProperty('display', 'flex', 'important');
    }

    try {
        // file:/// 프로토콜인 경우 서버 fetch 시도를 건너뜀
        if (!window.location.protocol.startsWith('http')) {
            updateUI();
            renderBoard();
            return;
        }

        const res = await fetch('/api/data');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const db = await res.json();
        
        if (db.study_records && db.study_records.user) {
            const serverUser = db.study_records.user;
            // 서버 데이터와 병합하되, 로컬에 이미 닉네임이 있으면 로컬 닉네임 유지
            appData = { 
                ...appData, 
                ...serverUser, 
                nickname: serverUser.nickname || appData.nickname 
            };
        }
        if (db.board_posts && db.board_posts.length > 0) {
            boardData = db.board_posts;
        }
    } catch (e) {
        console.log('서버 연결 실패 또는 file:// 환경, 로컬 스토리지 데이터 사용');
    }

    // 최종 모달 상태 결정
    const finalModalEl = document.getElementById('nicknameModal');
    if (appData.nickname) {
        if (finalModalEl) finalModalEl.style.setProperty('display', 'none', 'important');
    } else {
        if (finalModalEl) finalModalEl.style.setProperty('display', 'flex', 'important');
    }
    updateUI();
    renderBoard();
};

const saveData = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    localStorage.setItem(BOARD_KEY, JSON.stringify(boardData));
    
    // file:/// 프로토콜이거나 서버가 꺼져있는 경우 fetch 요청을 안전하게 건너뜀
    if (!window.location.protocol.startsWith('http')) {
        return;
    }

    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                study_records: { user: appData },
                board_posts: boardData
            })
        });
    } catch (e) {
        console.log('서버 동기화 실패 (로컬 스토리지에만 저장됨)');
    }
};

// --- timer.js 로직 통합 ---
class Timer {
    constructor(onTick, onComplete) {
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.timeLeft = 25 * 60;
        this.timerId = null;
        this.isRunning = false;
        this.mode = 'work';
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.timerId = setInterval(() => {
            this.timeLeft--;
            this.onTick(this.timeLeft);
            if (this.timeLeft <= 0) {
                this.stop();
                this.onComplete(this.mode);
            }
        }, 1000);
    }

    pause() { this.stop(); }
    stop() { clearInterval(this.timerId); this.isRunning = false; }
    reset(minutes = 25) {
        this.stop();
        this.timeLeft = minutes * 60;
        this.onTick(this.timeLeft);
    }
    setMode(mode) {
        this.mode = mode;
        this.reset(mode === 'work' ? 25 : 5);
    }
}

// --- ranking.js 로직 고도화 ---
const FAKE_USERS = [
    { name: '김회장', time: 3600 * 5 + 120, isStudying: true },
    { name: '아레나의 신 박준성', time: 3600 * 4 + 1800, isStudying: true },
    { name: '실버 니달리 류현수', time: 3600 * 2 + 300, isStudying: false },
    { name: '뿌링클 김건우', time: 3600 * 6 + 450, isStudying: true },
    { name: '북항사자 손인혁', time: 3600 * 3 + 900, isStudying: false }
];

const simulateOtherUsers = () => {
    FAKE_USERS.forEach(user => {
        if (user.isStudying) {
            if (Math.random() > 0.1) user.time += 1;
            if (Math.random() > 0.995) user.isStudying = !user.isStudying;
        } else {
            if (Math.random() > 0.99) user.isStudying = true;
        }
    });
};

const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// --- app.js 메인 로직 ---
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const timerStatusEl = document.getElementById('timerStatus');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const totalStudyTimeEl = document.getElementById('totalStudyTime');
const goalProgressEl = document.getElementById('goalProgress');
const progressPercentEl = document.getElementById('progressPercent');
const rankingListEl = document.getElementById('rankingList');
const themeBtn = document.getElementById('themeBtn');
const workDurationInput = document.getElementById('workDuration');
const yesterdayRankContainer = document.getElementById('yesterdayRankContainer');
const yesterdayMyRankEl = document.getElementById('yesterdayMyRank');

const postInput = document.getElementById('postInput');
const addPostBtn = document.getElementById('addPostBtn');
const postList = document.getElementById('postList');

const nicknameModal = document.getElementById('nicknameModal');
const nicknameInput = document.getElementById('nicknameInput');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');

const updateUI = () => {
    totalStudyTimeEl.textContent = formatTime(appData.totalSeconds);
    const progress = Math.min((appData.totalSeconds / appData.goalSeconds) * 100, 100);
    goalProgressEl.style.width = `${progress}%`;
    progressPercentEl.textContent = Math.round(progress);
    
    // 랭킹 렌더링
    const allUsers = [...FAKE_USERS, { name: appData.nickname || '나', time: appData.totalSeconds, isMe: true, isStudying: true }]
        .sort((a, b) => b.time - a.time);
    
    rankingListEl.innerHTML = allUsers.map((user, index) => `
        <li class="ranking-item ${user.isMe ? 'me' : ''}">
            <div class="rank-info">
                <span class="rank-number">${index + 1}</span>
                <span class="rank-name">${user.name} ${user.isStudying ? '<span class="study-dot">🟢</span>' : ''}</span>
            </div>
            <span class="rank-time">${formatTime(user.time)}</span>
        </li>
    `).join('');

    if (appData.yesterdayRank) {
        yesterdayRankContainer.style.display = 'block';
        yesterdayMyRankEl.textContent = appData.yesterdayRank;
    }
};

const renderBoard = () => {
    postList.innerHTML = boardData.map(post => `
        <div class="post-item">
            <div class="post-meta">작성자: ${post.author}</div>
            <div class="post-content">${post.content}</div>
            <div class="comment-section">
                <ul class="comment-list">
                    ${post.comments.map(c => `<li class="comment-item"><span class="comment-author">${c.author}:</span>${c.text}</li>`).join('')}
                </ul>
                <div class="comment-form">
                    <input type="text" placeholder="댓글 입력..." id="cmt-${post.id}">
                    <button class="secondary" onclick="addComment(${post.id})">달기</button>
                </div>
            </div>
        </div>
    `).join('');
};

window.addComment = (postId) => {
    const input = document.getElementById(`cmt-${postId}`);
    const text = input.value.trim();
    if (!text) return;
    const post = boardData.find(p => p.id === postId);
    post.comments.push({ author: appData.nickname || '익명', text });
    saveData();
    renderBoard();
};

addPostBtn.addEventListener('click', () => {
    const content = postInput.value.trim();
    if (!content) return;
    boardData.unshift({
        id: Date.now(),
        author: appData.nickname || '익명',
        content,
        comments: []
    });
    saveData();
    postInput.value = '';
    renderBoard();
});

const timer = new Timer(
    (timeLeft) => {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        minutesEl.textContent = String(m).padStart(2, '0');
        secondsEl.textContent = String(s).padStart(2, '0');
        if (timer.mode === 'work') {
            appData.totalSeconds += 1;
            saveData();
        }
    },
    (mode) => {
        if (mode === 'work') {
            alert('집중 종료!');
            timer.setMode('break');
        } else {
            alert('휴식 종료!');
            timer.setMode('work');
            timer.reset(parseInt(workDurationInput.value) || 25);
        }
    }
);

startBtn.addEventListener('click', () => { 
    const modalEl = document.getElementById('nicknameModal');
    const isModalVisible = modalEl && window.getComputedStyle(modalEl).display !== 'none';

    if (isModalVisible || !appData.nickname) {
        const name = (nicknameInput ? nicknameInput.value.trim() : '') || appData.nickname || '익명';
        appData.nickname = name;
        saveData();
        if (modalEl) {
            modalEl.style.setProperty('display', 'none', 'important');
        }
        updateUI();
    }
    timer.start(); 
    startBtn.disabled = true; 
    pauseBtn.disabled = false; 
});
pauseBtn.addEventListener('click', () => { timer.pause(); startBtn.disabled = false; pauseBtn.disabled = true; });
resetBtn.addEventListener('click', () => { timer.reset(parseInt(workDurationInput.value) || 25); startBtn.disabled = false; });

const handleSaveNickname = () => {
    const modalEl = document.getElementById('nicknameModal');
    const name = (nicknameInput ? nicknameInput.value.trim() : '') || appData.nickname || '익명';
    appData.nickname = name;
    saveData();
    if (modalEl) {
        modalEl.style.setProperty('display', 'none', 'important');
    }
    updateUI();
};

saveNicknameBtn.addEventListener('click', handleSaveNickname);
nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSaveNickname();
    }
});

setInterval(() => { simulateOtherUsers(); updateUI(); }, 1000);

// --- 3.4 챗봇 통신 로직 (백엔드 프록시 연동) ---
const chatHistoryEl = document.getElementById('chatHistory');
const chatInputEl = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatLoadingEl = document.getElementById('chatLoading');
const chatErrorEl = document.getElementById('chatError');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyStatusEl = document.getElementById('apiKeyStatus');

const savedApiKey = localStorage.getItem('gemini_api_key') || '';
if (apiKeyInput) {
    apiKeyInput.value = savedApiKey;
}

if (saveApiKeyBtn && apiKeyInput) {
    saveApiKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            localStorage.removeItem('gemini_api_key');
            if (apiKeyStatusEl) {
                apiKeyStatusEl.style.display = 'block';
                apiKeyStatusEl.style.color = 'orange';
                apiKeyStatusEl.textContent = '⚠️ API 키가 삭제되었습니다.';
            }
            return;
        }

        if (apiKeyStatusEl) {
            apiKeyStatusEl.style.display = 'block';
            apiKeyStatusEl.style.color = 'var(--primary-color)';
            apiKeyStatusEl.textContent = '⏳ API 키 유효성 확인 중...';
        }

        try {
            const res = await fetch('/api/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (res.ok && data.valid) {
                localStorage.setItem('gemini_api_key', key);
                if (apiKeyStatusEl) {
                    apiKeyStatusEl.style.color = 'green';
                    apiKeyStatusEl.textContent = data.message || '✅ 유효한 API 키입니다! (정상 확인됨)';
                }
            } else {
                if (apiKeyStatusEl) {
                    apiKeyStatusEl.style.color = 'red';
                    apiKeyStatusEl.textContent = `❌ ${data.error || '유효하지 않은 API 키입니다.'}`;
                }
            }
        } catch (err) {
            console.error('API key verification error:', err);
            if (apiKeyStatusEl) {
                apiKeyStatusEl.style.color = 'red';
                apiKeyStatusEl.textContent = '❌ API 키 검증 중 서버 통신 실패';
            }
        }
    });
}

const appendMessage = (role, text) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.textContent = text;
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
};

const showChatError = (msg) => {
    chatErrorEl.textContent = `⚠️ 오류: ${msg}`;
    chatErrorEl.style.display = 'block';
    setTimeout(() => { chatErrorEl.style.display = 'none'; }, 5000);
};

const handleChat = async () => {
    const question = chatInputEl.value.trim();
    if (!question) return;

    appendMessage('user', question);
    chatInputEl.value = '';
    chatLoadingEl.style.display = 'flex';
    sendChatBtn.disabled = true;

    const chatLoadingTextEl = document.getElementById('chatLoadingText');
    let elapsedSeconds = 0;
    if (chatLoadingTextEl) {
        chatLoadingTextEl.textContent = `답변 생성 중... (0초)`;
    }
    const timerInterval = setInterval(() => {
        elapsedSeconds++;
        if (chatLoadingTextEl) {
            chatLoadingTextEl.textContent = `답변 생성 중... (${elapsedSeconds}초)`;
        }
    }, 1000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120초 타임아웃

    try {
        const apiKey = ((apiKeyInput ? apiKeyInput.value : '') || localStorage.getItem('gemini_api_key') || '').trim();

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, apiKey }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            throw new Error(`서버 응답 파싱 실패 (오류 코드: ${response.status})`);
        }

        if (!response.ok) {
            const errCode = data.error_code || response.status;
            const errMsg = data.error || `서버 응답 지연 (오류 코드: ${errCode})`;
            throw new Error(errMsg);
        }

        appendMessage('bot', data.answer || "답변을 생성했습니다.");
    } catch (error) {
        console.error('Chat error:', error);
        let errorMsg = "서버 응답 지연 (오류 코드: 500)";
        if (error.name === 'AbortError') {
            errorMsg = "서버 응답 지연 (오류 코드: 504 - 요청 시간 초과 (120초))";
        } else if (error.message) {
            errorMsg = error.message;
        }
        showChatError(errorMsg);
        appendMessage('bot', `⚠️ 챗봇 오류: ${errorMsg}\n(잠시 후 다시 시도해 주세요.)`);
    } finally {
        clearTimeout(timeoutId);
        clearInterval(timerInterval);
        chatLoadingEl.style.display = 'none';
        sendChatBtn.disabled = false;
    }
};

sendChatBtn.addEventListener('click', handleChat);
chatInputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});

const init = () => {
    if (!appData.nickname) nicknameModal.style.display = 'flex';
    initServerData();
};
init();
