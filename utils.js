const CONSOLE_COLOURS = [
    "#ff7d7d",
    "#8eff7d",
    "#957dff",
    "#fb7dff"
]

module.exports = {
    log: (...args) => {
        args = args.map((arg, i) => `<span style="color:${CONSOLE_COLOURS[CONSOLE_COLOURS.length % i]}">${arg}</span>`);
        console.log(`[${args.shift()}]: ${args.join(" - ")}`)
    }
}