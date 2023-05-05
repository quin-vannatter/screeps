const { Manager } = require("./manager")

function ChatManager() {

}

ChatManager.prototype = {
    ...Manager.prototype,

}

module.exports = {
    ChatManager: new ChatManager()
}
