const { Manager } = require("./manager");
const { Task } = require("./task-manager");

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.TaskManager.registerTasks({
            harvestEnergy: {
                executeFunction: (creep, destination) => {
                    return creep.harvest(destination);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                },
                isCompleteFunction: creep => {
                    return creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0;
                },
                bodyParts: [
                    WORK
                ]
            },
            depositEnergy: {
                executeFunction: (creep, destination) => {
                    if (destination instanceof StructureController) {
                        return creep.upgradeController(destination);
                    } else {
                        return creep.transfer(destination, RESOURCE_ENERGY);
                    }
                },
                meetsRequirementsFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] > 0;
                },
                getTasksForRequirementsFunction: (creep, destination) => {
                    return [this.getHarvestClosestSourceTask(destination)];
                },
                isCompleteFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] == 0 || (destination.store != undefined && destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0);
                },
                bodyParts: [
                    CARRY
                ]
            }
        });
    },
    getHarvestClosestSourceTask: function(destination) {
        const source = destination.pos.findClosestByPath(FIND_SOURCES) || destination.room.find(FIND_SOURCES)[0];
        return this.TaskManager.getTask("harvestEnergy", { destination: source });
    }
}

module.exports = {
    CreepManager: new CreepManager()
}