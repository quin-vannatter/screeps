const { Manager } = require("./manager");
const { Task } = require("./task-manager");

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    load: function() {
        this.creeps = this.fromMemory(this.m.creeps);
    },
    init: function() {
        this.TaskManager.registerTasks({
            harvestEnergy: {
                executeFunction: (creep, destination) => {
                    return creep.harvest(destination);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    return freeCapacity > 0 || freeCapacity == null;
                },
                isCompleteFunction: creep => {
                    return creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0;
                },
                bodyParts: [
                    WORK
                ]
            },
            fetchDroppedResource: {
                executeFunction: (creep, destination) => {
                    return creep.pickup(destination);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    return freeCapacity > 0 || freeCapacity == null;
                },
                isCompleteFunction: (creep, destination) => {
                    return creep.store.getFreeCapacity(destination.resourceType) == 0 || destination == undefined || destination.amount == 0;
                },
                bodyParts: [
                    CARRY
                ]
            },
            depositEnergy: {
                executeFunction: (creep, destination) => {
                    return creep.transfer(destination, RESOURCE_ENERGY);
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
            },
            transferEnergy: {
                executeFunction: (creep, destination) => {
                    return destination.transfer(creep, RESOURCE_ENERGY);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                },
                getTasksForRequirementsFunction: (creep, destination) => {
                    return [this.getHarvestClosestSourceTask(destination)];
                },
                isCompleteFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] == 0 || (destination.store != undefined && destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0);
                },
                bodyParts: [
                    CARRY,
                    WORK
                ]
            }
        });
    },
    run: function() {
        // Check to see if there's resources on the ground somewhere.
        const droppedResources = Object.values(Game.spawns).map(spawn => spawn.room.find(FIND_DROPPED_RESOURCES).concat(spawn.room.find(FIND_TOMBSTONES)
            .filter(tombstone => tombstone.pos != undefined))).reduce((a, b) => a.concat(b), []);
        droppedResources.forEach(resource => this.TaskManager.getAndSubmitTask("fetchDroppedResource", { destination: resource }));

        // Check creep strikes.
        this.TaskManager.getIdleCreeps().forEach(creep => {
            if (creep.memory.inactiveTicks >= 60) {
                if (creep.store[RESOURCE_ENERGY] > 0) {
                    this.TaskManager.getAndSubmitTask("transferEnergy", { destination: creep });
                }
            } else if (creep.memory.inactiveTicks >= 120) {
                creep.suicide();
            }
        })
    },
    fromMemory: function (creeps) {
        return creeps != undefined && creeps.map()
    },
    getHarvestClosestSourceTask: function(destination) {
        const source = destination.pos.findClosestByPath(FIND_SOURCES) || destination.room.find(FIND_SOURCES)[0];
        return this.TaskManager.getTask("harvestEnergy", { destination: source });
    }
}

module.exports = {
    CreepManager: new CreepManager()
}