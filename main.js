const { ManagerContainer } = require("./manager");
const { TaskManager } = require("./task-manager");
const { CreepManager } = require("./creep-manager");
const { SpawnManager } = require("./spawn-manager");
const { ControllerManager } = require("./controller-manager");
const { StructureManager } = require("./structure-manager");
const { MemoryManager } = require("./memory-manager");
const { CommuteManager } = require("./commute-manager");
const { e } = require("./entity-manager");
const { CombatManager } = require("./combat-manager");
const { log } = require("./utils");

const DISABLE_RUNNING = 0;
const DISABLE_MEMORY = 0;
const DISABLE_SPEAKING = 0;
const DISABLE_PUBLIC_SPEAKING = 1;

// The order of this list determines execution order.
const managerContainer = new ManagerContainer([
    MemoryManager,
    CommuteManager,
    StructureManager,
    ControllerManager,
    CreepManager,
    SpawnManager,
    CombatManager,
    TaskManager
], e);

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
        if (!DISABLE_RUNNING) {
            managerContainer.run();
        }
        if(!DISABLE_MEMORY) {
            MemoryManager.save();
        }
    } catch(exception) {
        MemoryManager.clear();
        throw exception;
    }
};