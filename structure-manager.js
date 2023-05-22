const { Manager } = require("./manager")

const REPAIR_THRESHOLD = 40;

function StructureManager() {
    Manager.call(this, StructureManager.name);
}

StructureManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {

        // Register tasks
        this.TaskManager.tasks.register({
            buildStructure: {
                template: {
                    execute: self => self.creep.build(self.destination),
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    isComplete: self => self.destination.progressTotal == self.destination.progress,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    bodyParts: [WORK, CARRY],
                    range: 3,
                    getMessage: () => "Building",
                    isWorkingTask: true
                }
            },
            repairStructure: {
                template: {
                    execute: self => self.creep.repair(self.destination),
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    isComplete: self => self.destination.hits == self.destination.hitsMax,
                    bodyParts: [WORK, CARRY],
                    range: 3,
                    getMessage: () => "Repairing",
                    isWorkingTask: true
                },
                defaults: {
                    priority: 2
                }
            }
        });
    },
    run: function(room) {

        // Build construction sites.
        this.e.constructionSites.filter(constructionSite => constructionSite.room == room).forEach(constructionSite => 
            this.TaskManager.getAndSubmitTask("buildStructure", { destination: constructionSite }));

        // Repair structures.
        this.e.structures.filter(constructionSite => constructionSite.room == room).filter(structure => (structure.hits / structure.hitsMax * 100) < REPAIR_THRESHOLD).forEach(structure => 
            this.TaskManager.getAndSubmitTask("repairStructure", {destination: structure }));

    },
    requestWork: function(creep) {
        this.e.constructionSites.forEach(constructionSite => {
            const task = this.TaskManager.getTask("buildStructure", { destination: constructionSite });
            if (this.TaskManager.submitTask(task, creep)) {
                return true;
            }
        });
        return false;
    },
    buildCloseTo: function(target, structureType) {
        const room = target.room;
        const roomTerrain = room.getTerrain();
        const structures = this.e.structures.concat(this.e.constructionSites).filter(structure => structure.room === room);
        const pos = target.pos;
        let spotFound = false;
        let range = 1;
        let newPos = undefined;
        while(!spotFound && range < 25) {
            const size = 1 + (range * 2);
            const start = [pos.x - range, pos.y - range];
            for(let i = 0; i < size*size; i++) {
                newPos = [start[0] + (i % size), start[1] + Math.floor(i / size)];
                spotFound = newPos[0] < 50 && newPos[1] < 50 && roomTerrain.get(newPos[0], newPos[1]) != 1 && 
                    !structures.some(structure => structure.pos.x == newPos[0] && structure.pos.y == newPos[1]);
                if (spotFound) {
                    break;
                }
            }
            if (!spotFound) {
                range++;
            }
        }
        if (newPos != undefined) {
            room.createConstructionSite(...newPos, structureType);
        }
    }
}

module.exports = {
    StructureManager: new StructureManager()
}