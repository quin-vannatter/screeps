const { ManagerContainer } = require("./manager");
const { TaskManager } = require("./task-manager");
const { CreepManager } = require("./creep-manager");
const { SpawnManager } = require("./spawn-manager");
const { ControllerManager } = require("./controller-manager");
const { StructureManager } = require("./structure-manager");
const { MemoryManager } = require("./memory-manager");
const { CommuteManager } = require("./commute-manager");

const DISABLE_MEMORY = false;

// The order of this list determines execution order.
const managerContainer = new ManagerContainer([
    MemoryManager,
    CommuteManager,
    StructureManager,
    ControllerManager,
    CreepManager,
    SpawnManager,
    TaskManager
])

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