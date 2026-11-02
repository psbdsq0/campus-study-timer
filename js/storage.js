

const STORAGE_KEY = 'campus_study_timer_data';

export const loadData = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
        totalSeconds: 0,
        today: new Date().toLocaleDateString(),
        goalSeconds: 3600 * 3, // 기본 목표 3시간
        theme: 'light'
    };
};

export const saveData = (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const updateStudyTime = (additionalSeconds) => {
    const data = loadData();
    const today = new Date().toLocaleDateString();

    // 날짜가 바뀌었으면 초기화 (간단한 일일 기록 로직)
    if (data.today !== today) {
        data.totalSeconds = additionalSeconds;
        data.today = today;
    } else {
        data.totalSeconds += additionalSeconds;
    }

    saveData(data);
    return data;
};
