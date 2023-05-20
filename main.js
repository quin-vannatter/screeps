const { ManagerContainer } = require("./manager");
const { TaskManager } = require("./task-manager");
const { CreepManager } = require("./creep-manager");
const { SpawnManager } = require("./spawn-manager");
const { ControllerManager } = require("./controller-manager");
const { StructureManager } = require("./structure-manager");
const { MemoryManager } = require("./memory-manager");
const { CommuteManager } = require("./commute-manager");
const { e } = require("./entity-manager");

const DISABLE_MEMORY = false;
const DISABLE_SPEAKING = false;
const DISABLE_PUBLIC_SPEAKING = true;

// The order of this list determines execution order.
const managerContainer = new ManagerContainer([
    e,

    MemoryManager,
    CommuteManager,
    StructureManager,
    ControllerManager,
    CreepManager,
    SpawnManager,
    TaskManager
]);

Creep.prototype._say = Creep.prototype.say;
Creep.prototype.say = function(message, isPublic) {
    if (!DISABLE_SPEAKING) {
        this._say(message, DISABLE_PUBLIC_SPEAKING ? false : isPublic);
    }
}

managerContainer.init();

module.exports.loop = function() {
    try {
        if(!DISABLE_MEMORY) {
            MemoryManager.load();
        } else {
            MemoryManager.clear();
        }
        managerContainer.run();
        if(!DISABLE_MEMORY) {
            MemoryManager.save();
        }
    } catch(e) {
        MemoryManager.clear();
        throw e;
    }
};