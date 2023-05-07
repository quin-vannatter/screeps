const { ManagerContainer } = require("./manager");
const { TaskManager } = require("./task-manager");
const { CreepManager } = require("./creep-manager");
const { SpawnManager } = require("./spawn-manager");
const { ControllerManager } = require("./controller-manager");
const { StructureManager } = require("./structure-manager");
const { MemoryManager } = require("./memory-manager");

// The order of this list determines execution order.
const managerContainer = new ManagerContainer([
    MemoryManager,
    StructureManager,
    ControllerManager,
    CreepManager,
    SpawnManager,
    TaskManager
])

managerContainer.init();

module.exports.loop = () => {
    MemoryManager.load();
    managerContainer.run();
    MemoryManager.save();
};