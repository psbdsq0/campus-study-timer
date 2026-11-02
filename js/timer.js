export class Timer {
    constructor(onTick, onComplete) {
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.timeLeft = 25 * 60; // 25분 기본
        this.timerId = null;
        this.isRunning = false;
        this.mode = 'work'; // 'work' or 'break'
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

    pause() {
        this.stop();
    }

    stop() {
        clearInterval(this.timerId);
        this.isRunning = false;
    }

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
