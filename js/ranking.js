const FAKE_USERS = [
    { name: '공부하는 코끼리', time: 3600 * 5 + 120 },
    { name: 'A+ 과탑이목표', time: 3600 * 4 + 1800 },
    { name: '졸린 대학생', time: 3600 * 2 + 300 },
    { name: '도서관 지킴이', time: 3600 * 6 + 450 },
    { name: '새벽반 전사', time: 3600 * 3 + 900 }
];

export const getRankings = (mySeconds) => {
    const allUsers = [
        ...FAKE_USERS,
        { name: '나 (psbdsq0)', time: mySeconds, isMe: true }
    ];

    // 시간순 내림차순 정렬
    return allUsers.sort((a, b) => b.time - a.time);
};

export const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const renderRankings = (container, mySeconds) => {
    const rankings = getRankings(mySeconds);
    container.innerHTML = rankings.map((user, index) => `
        <li class="ranking-item ${user.isMe ? 'me' : ''}">
            <div class="rank-info">
                <span class="rank-number">${index + 1}</span>
                <span class="rank-name">${user.name}</span>
            </div>
            <span class="rank-time">${formatTime(user.time)}</span>
        </li>
    `).join('');
};
