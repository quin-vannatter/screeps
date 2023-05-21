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

const DISABLE_RUNNING = false;
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
    CombatManager,
    TaskManager
]);

Creep.prototype._say = Creep.prototype.say;
Creep.prototype.say = function(message, isPublic) {
    if (!DISABLE_SPEAKING) {
        this._say(message, DISABLE_PUBLIC_SPEAKING ? false : isPublic);
    }
}

managerContainer.init();
let usedCpu = 0;

module.exports.loop = function() {
    try {
        if(!DISABLE_MEMORY) {
            MemoryManager.load();
        } else {
            MemoryManager.clear();
            e.clearCache();
        }
        if (!DISABLE_RUNNING) {
            if (usedCpu < Game.cpu.limit) {
                managerContainer.run();
            } else {
                log("CPU Limit Reached", `${Math.round(usedCpu / Game.cpu.limit * 100)}%`);
            }
        }
        if(!DISABLE_MEMORY) {
            MemoryManager.save();
        }
    } catch(exception) {
        MemoryManager.clear();
        e.clearCache();
        throw exception;
    } finally {
        usedCpu = Game.cpu.getUsed();
    }
};