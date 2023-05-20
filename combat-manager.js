const { Manager } = require("./manager");

function CombatManager() {
    Manager.call(this, CombatManager.name);
}

CombatManager.prototype = {
    ...Manager.prototype,
    
}

module.exports = {
    CombatManager: new CombatManager()
}