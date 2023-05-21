const CONSOLE_COLOURS = [
    "#ffb8b3",
    "#fffeb3",
    "#d4ffb3",
    "#b3e8ff",
    "#b9b3ff",
    "#fcb3ff",
    "#ffb3d1",
]

module.exports = {
    log: (...args) => {
        const seed = args.length > 0 ? (args[0].split("").map(x => x.charCodeAt(0)).reduce((a, b) => a + b, 0) % CONSOLE_COLOURS.length) : 0;
        args = args.map((arg, i) => `<span style="color:${CONSOLE_COLOURS[((i+1)*seed) % CONSOLE_COLOURS.length]}">${arg}</span>`);
        console.log(`[${args.shift()}]: ${args.join(" ")}`)
    },
    after: (freq, fn) => {
        if(!(Game.time % freq)) {
            fn();
        }
    }
}