const { Manager } = require("./manager");

const FETCH_AMOUNT_THRESHOLD = 10;
const IDLE_TICK_THRESHOLD = 100;

function CreepManager(...services) {
    Manager.call(this, CreepManager.name, services);
}

CreepManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.creeps = this.MemoryManager.register("creeps", {
            template: {
                isIdle: self => !this.TaskManager.tasks.entries.some(task => task.creep == self.creep)
            },
            defaults: {
                creep: {},
                idleTicks: 0,
                hits: 0
            }
        }).single();
    },
    afterInit: function() {
        this.TaskManager.tasks.register({
            harvestEnergy: {
                template: {
                    execute: self => self.creep.harvest(self.destination),
                    canExecute: (self, creep) => {
                        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return (freeCapacity == null || freeCapacity > 0) && self.destination.energy > 0
                    },
                    isComplete: self => {
                        const freeCapacity = self.creep.store.getFreeCapacity(RESOURCE_ENERGY);
                        return (freeCapacity != null && freeCapacity === 0) && self.destination.energy == 0
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
                        if (this.e.exists(self.destination)) {
                            const amount = self.destination.amount != undefined ? self.destination.amount : self.destination && self.destination.store[RESOURCE_ENERGY];
                            return (freeCapacity > 0 || freeCapacity == null) && (amount / freeCapacity * 100) >= FETCH_AMOUNT_THRESHOLD;
                        } else {
                            return false;
                        }
                    },
                    isComplete: self => !this.e.exists(self.destination) || self.destination.amount == 0,
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
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0 && (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) > 0),
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
                    canExecute: (self, creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && (self.destination.store != undefined && self.destination.store[RESOURCE_ENERGY] > 0),
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => (self.destination.store != undefined && self.destination.store[RESOURCE_ENERGY] == 0) || self.creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0,
                    bodyParts: [
                        CARRY
                    ],
                    getMessage: () => "Withdraw"
                }
            },
            explore: {
                template: {
                    isComplete: self => self.room != self.creep.room,
                    getMessage: () => "Leaving",
                    range: 0
                }
            }
        });
    },
    run: function(room) {
        // Check to see if there's resources on the ground somewhere.
        const droppedResources = this.e.droppedResources.concat(this.e.tombstones.filter(tombstone => tombstone.pos != undefined && tombstone.store[RESOURCE_ENERGY] > 0))
            .reduce((a, b) => a.concat(b), []).filter(target => target.room == room);

        droppedResources.forEach(resource => this.TaskManager.getAndSubmitTask("fetchDroppedResource", { destination: resource }));

        // Ensure we remove dead creeps from our memory and add new creeps.
        this.creeps.entries = this.creeps.entries.filter(creep => this.e.exists(creep) && creep.my);

        this.creeps.entries.push(...this.e.creeps.filter(creep => !this.creeps.entries.some(x => x.creep == creep) && creep.my)
            .map(creep => this.creeps.create({ creep, hits: creep.hits })));

        // Record any attacks
        this.creeps.entries.filter(entry => entry.hits > entry.creep.hits).forEach(entry => this.CommuteManager.recordAttack(entry.creep));

        // Update hits.
        this.creeps.entries.forEach(entry => entry.hits = entry.creep.hits);

        // Increment idle ticks if creep is idle.
        this.creeps.entries.forEach(entry => {
            if (entry.isIdle()) {
                entry.idleTicks++;
            } else {
                entry.idleTicks = 0;
            }
        });
    },
    get: function(creep) {
        return this.creeps.entries.find(entry => entry.creep == creep);
    },
    doAfter: function(time, fn) {
        this.creeps.entries.filter(entry => entry.isIdle() && entry.idleTicks > time && this.e.exists(entry.creep)).forEach(entry => fn(entry.creep));
    },
    requestWork: function(creep) {

        const activeTasks = this.TaskManager.activeTasks(creep.room);

        // Idle creeps can harvest if there's room.
        const task = this.getHarvestClosestSourceTask(creep);
        if (this.TaskManager.submitTask(task, creep)) {
            return true;
        }

        // Transferring energy to working creeps is something idle creeps can do.
        const workingCreeps = activeTasks.filter(task => task.isWorkingTask).map(task => task.creep)
            .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY));
        if (workingCreeps.length > 0 && !workingCreeps.some(x => x == creep)) {
            const task = this.TaskManager.getTask("depositEnergy", { destination: workingCreeps[0] });
            if (this.TaskManager.submitTask(task, creep)) {
                return true;
            }
        }

        // Grabbing energy from harvesting creeps is something idle creeps can do.
        const harvestingCreeps = activeTasks.filter(task => task.name === "harvestEnergy").map(task => task.creep)
            .sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
        if (harvestingCreeps.length > 0) {
            const task = this.TaskManager.getTask("withdrawEnergy", { destination: harvestingCreeps[0] });
            if (this.TaskManager.submitTask(task, creep)) {
                return true;
            }
        }

        const exitZones = this.CommuteManager.getZones(creep.room, "exits");
        const positions = exitZones.map(zone => zone.getPositions()).reduce((a, b) => a.concat(b), []).map(position => position.toRoomPosition());
        if (positions.length > 0) {
            const randomExit = positions[Math.floor(Math.random() * positions.length)];
            const task = this.TaskManager.getTask("explore", { destination: randomExit, room: creep.room });
            if (this.TaskManager.submitTask(task, creep)) {
                return true;
            }
        }

        return false;
    },
    getHarvestClosestSourceTask: function(destination) {
        const sources = this.e.sources.filter(source => {
            const zone = this.CommuteManager.getSafeZone(source);
            return zone === undefined || !zone.isFull();
        }).sort((a, b) => a.pos.getRangeTo(destination) - b.pos.getRangeTo(destination));

        if (sources.length > 0) {
            return this.TaskManager.getTask("harvestEnergy", { destination: sources[0] });
        }
    }
}

module.exports = {
    CreepManager: new CreepManager()
}