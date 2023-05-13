const { Manager } = require("./manager");

const FETCH_AMOUNT_THRESHOLD = 10;

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.tasks.register({
            harvestEnergy: {
                template: {
                    execute: self => self.creep.harvest(self.destination),
                    canExecute: (self, creep) => {
                        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return freeCapacity == null || freeCapacity > 0
                    },
                    isComplete: self => {
                        const freeCapacity = self.creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return freeCapacity != null && freeCapacity === 0;
                    },
                    bodyParts: [
                        WORK
                    ],
                    getMessage: () => "Harvesting"
                }
            },
            fetchDroppedResource: {
                template: {
                    execute: self => {
                        if (self.destination.amount != undefined) {
                            return self.creep.pickup(self.destination)
                        } else if(self.destination.store[RESOURCE_ENERGY] > 0) {
                            return self.creep.withdraw(self.destination, RESOURCE_ENERGY);
                        }
                        return -1;
                    },
                    canExecute: (self, creep) => {
                        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        if (Object.keys(self.destination).length > 0) {
                            const amount = self.destination.amount != undefined ? self.destination.amount : self.destination.store[RESOURCE_ENERGY];
                            return (freeCapacity > 0 || freeCapacity == null) && (amount / freeCapacity * 100) >= FETCH_AMOUNT_THRESHOLD;
                        } else {
                            return false;
                        }
                    },
                    isComplete: self => Object.keys(self.destination).length == 0 || self.destination.amount == 0,
                    bodyParts: [
                        CARRY
                    ],
                    getMessage: () => "Fetching"
                },
                defaults: {
                    priority: 3
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
                    ],
                    getMessage: () => "Depositing"
                }
            },
            withdrawEnergy: {
                template: {
                    execute: self => self.destination.transfer(self.creep, RESOURCE_ENERGY),
                    canExecute: (self, creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => (self.destination.store != undefined && self.destination.store[RESOURCE_ENERGY] == 0) || self.creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0,
                    bodyParts: [
                        CARRY,
                        WORK
                    ],
                    getMessage: () => "Withdraw"
                }
            }
        });
    },
    run: function(Game) {
        // Check to see if there's resources on the ground somewhere.
        const droppedResources = Object.values(Game.rooms).map(room => room.find(FIND_DROPPED_RESOURCES).concat(room.find(FIND_TOMBSTONES)
            .filter(tombstone => tombstone.pos != undefined && tombstone.store[RESOURCE_ENERGY] > 0))).reduce((a, b) => a.concat(b), []);
        droppedResources.forEach(resource => this.TaskManager.getAndSubmitTask("fetchDroppedResource", { destination: resource }, true));
    },
    requestWork: function(creep) {

        // Harvesting is something idle creeps can do.
        const task = this.getHarvestClosestSourceTask(creep);
        if (task.meetsRequirements(creep)) {
            task.assign(creep);
            this.TaskManager.submitTask(task, true);
            return true;
        }

        const activeTasks = this.TaskManager.activeTasks();

        // Transferring energy to working creeps is something idle creeps can do.
        const workingCreeps = activeTasks.filter(task => task.isWorkingTask).map(task => task.creep)
            .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY));
        if (workingCreeps.length > 0 && !workingCreeps.some(x => x.id === creep.id)) {
            const task = this.TaskManager.getTask("depositEnergy", { destination: workingCreeps[0] });
            if (task.meetsRequirements(creep)) {
                task.assign(creep);
                this.TaskManager.submitTask(task, true);
                return true;
            }
        }

        // Grabbing energy from harvesting creeps is something idle creeps can do.
        const harvestingCreeps = activeTasks.filter(task => task.name === "harvestEnergy").map(task => task.creep)
            .sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY));
        if (harvestingCreeps.length > 0) {
            const task = this.TaskManager.getTask("withdrawEnergy", { destination: harvestingCreeps[0] });
            if (task.meetsRequirements(creep)) {
                task.assign(creep);
                this.TaskManager.submitTask(task, true);
                return true;
            }
        }

        return false;
    },
    getHarvestClosestSourceTask: function(destination) {
        const sources = destination.room.find(FIND_SOURCES);
        const source = sources[Math.floor(Math.random() * sources.length)];
        if (source != undefined) {
            return this.TaskManager.getTask("harvestEnergy", { destination: source });
        }
    }
}

module.exports = {
    CreepManager: new CreepManager()
}