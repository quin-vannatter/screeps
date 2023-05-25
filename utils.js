

const CONSOLE_COLOURS = [
    "#ffb8b3",
    "#fffeb3",
    "#d4ffb3",
    "#b3e8ff",
    "#b9b3ff",
    "#fcb3ff",
    "#ffb3d1",
];

const fns = {
    log: (...args) => {
        const seed = args.length > 0 ? (args[0].split("").map(x => x.charCodeAt(0)).reduce((a, b) => a + b, 0) % CONSOLE_COLOURS.length) : 0;
        args = args.map((arg, i) => `<span style="color:${CONSOLE_COLOURS[((i+seed)*seed) % CONSOLE_COLOURS.length]}">${arg}</span>`);
        console.log(`[${args.shift()}]: ${args.join(" ")}`)
    },
    after: (freq, fn) => {
        if(!(Game.time % freq)) {
            fn();
        }
    },
    cpuLimitReached: () => {
        const cpuUsed = Game.cpu.getUsed();
        const cpuTotal = Game.cpu.limit;
        const reachedLimit = cpuUsed >= cpuTotal;
        if (reachedLimit) {
            fns.log("CPU Limit Reached", `${Math.round(cpuUsed / cpuTotal * 100)}%`);
        }
        return reachedLimit;
    }
}

module.exports = fns;