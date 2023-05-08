const { Manager } = require("./manager");

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.collection.register({
            harvestEnergy: {
                template: {
                    execute: self => self.creep.harvest(self.destination),
                    canExecute: (self, creep) => {
                        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return freeCapacity > 0 || freeCapacity == null;
                    },
                    isComplete: self => self.creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0,
                    bodyParts: [
                        WORK
                    ]
                }
            },
            fetchDroppedResource: {
                template: {
                    execute: self => self.creep.pickup(self.destination),
                    canExecute: (self, creep) => {
                        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return freeCapacity > 0 || freeCapacity == null;
                    },
                    isComplete: self => self.creep.store.getFreeCapacity(self.destination.resourceType) == 0 || self.destination == undefined || self.destination.amount == 0,
                    bodyParts: [
                        CARRY
                    ]
                }
            },
            depositEnergy: {
                template: {
                    execute: self => self.creep.transfer(self.destination, RESOURCE_ENERGY),
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => self.creep.store[RESOURCE_ENERGY] == 0 || (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                    bodyParts: [
                        CARRY
                    ]
                }
            },
            transferEnergy: {
                template: {
                    execute: self => self.destination.transfer(self.creep, RESOURCE_ENERGY),
                    canExecute: self => self.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => self.creep.store[RESOURCE_ENERGY] == 0 || (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                    bodyParts: [
                        CARRY,
                        WORK
                    ]
                }
            }
        });
    },
    run: function(Game) {
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
        if (source != undefined) {
            return this.TaskManager.getTask("harvestEnergy", { destination: source });
        }
    }
}

module.exports = {
    CreepManager: new CreepManager()
}