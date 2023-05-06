const { Manager } = require("./manager");

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.taskCollection.register({
            harvestEnergy: {
                execute: () => this.creep.harvest(this.destination),
                meetsRequirements: creep => {
                    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    return freeCapacity > 0 || freeCapacity == null;
                },
                isComplete: () => this.creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0,
                bodyParts: [
                    WORK
                ]
            },
            fetchDroppedResource: {
                execute: () => this.creep.pickup(this.destination),
                meetsRequirements: creep => {
                    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    return freeCapacity > 0 || freeCapacity == null;
                },
                isComplete: () => this.creep.store.getFreeCapacity(this.destination.resourceType) == 0 || this.destination == undefined || this.destination.amount == 0,
                bodyParts: [
                    CARRY
                ]
            },
            depositEnergy: {
                execute: () => this.creep.transfer(this.destination, RESOURCE_ENERGY),
                meetsRequirements: creep => creep.store[RESOURCE_ENERGY] > 0,
                getTasksForRequirements: () => [this.CreepManager.getHarvestClosestSourceTask(this.destination)],
                isCompleteFunction: () => this.creep.store[RESOURCE_ENERGY] == 0 || (this.destination.store != undefined && this.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                bodyParts: [
                    CARRY
                ]
            },
            transferEnergy: {
                executeFunction: () => this.destination.transfer(this.creep, RESOURCE_ENERGY),
                meetsRequirementsFunction: () => this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                getTasksForRequirementsFunction: () => [this.CreepManager.getHarvestClosestSourceTask(this.destination)],
                isCompleteFunction: () => this.creep.store[RESOURCE_ENERGY] == 0 || (this.destination.store != undefined && this.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
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
    getHarvestClosestSourceTask: function(destination) {
        const source = destination.pos.findClosestByPath(FIND_SOURCES) || destination.room.find(FIND_SOURCES)[0];
        return this.TaskManager.getTask("harvestEnergy", { destination: source });
    }
}

module.exports = {
    CreepManager: new CreepManager()
}