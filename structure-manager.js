const { Manager } = require("./manager")

function StructureManager() {
    Manager.call(this, StructureManager.name);
}

StructureManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.collection.register({
            buildStructure: {
                template: {
                    execute: self => self.creep.build(self.destination),
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    isComplete: self => self.destination.progressTotal == self.destination.progress,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    bodyParts: [WORK, CARRY],
                    range: 3
                },
                defaults: {
                    priority: 2 
                }
            },
            repair: {
                template: {
                    execute: self => self.creep.repair(self.destination),
                    isComplete: self => self.destination.hits == self.destination.hitsMax,
                    bodyParts: [WORK, CARRY],
                    range: 3
                }
            }
        });
    },
    run: function() {

        // Build construction sites.
        this.getConstructionSites().forEach(constructionSite => {
            this.TaskManager.getAndSubmitTask("buildStructure", { destination: constructionSite });
        });

        // Repair structures.
        Object.values(Game.structures).filter(structure => structure.hits < structure.hitsMax).forEach(structure => {
            this.TaskManager.getAndSubmitTask("repairStructure", {destination: structure });
        });

    },
    getConstructionSites: function() {
        return Object.values(Game.spawns).map(spawn => spawn.room.find(FIND_MY_CONSTRUCTION_SITES)).reduce((a, b) => a.concat(b), []);
    },
    requestWork: function(creep) {
        this.getConstructionSites().forEach(constructionSite => {
            const task = this.TaskManager.getTask("buildStructure", { destination: constructionSite });
            if (task.meetsRequirements(creep)) {
                task.assign(creep);
                this.TaskManager.submitTask(task, true);
                return true;
            }
        });
        return false;
    },
    buildCloseTo(target, structureType) {
        const room = target.room;
        const roomTerrain = room.getTerrain();
        const structures = Object.values(Game.structures).concat(Object.values(Game.constructionSites)).filter(structure => structure.room === room);
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