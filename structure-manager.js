const { Manager } = require("./manager")

function StructureManager() {
    Manager.call(this, StructureManager.name);
}

StructureManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.TaskManager.registerTasks({
            buildStructure: {
                executeFunction: (creep, destination) => {
                    return creep.build(destination);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] > 0;
                },
                isCompleteFunction: (creep, destination) => {
                    return destination.progressTotal == destination.progress;
                },
                getTasksForRequirementsFunction: (creep, destination) => {
                    return [this.CreepManager.getHarvestClosestSourceTask(destination)];
                },
                bodyParts: [WORK, CARRY],
                range: 3,
                priority: 2 
            }
        });
    },
    run: function() {
        this.getConstructionSites().forEach(constructionSite => {
            this.TaskManager.getAndSubmitTask("buildStructure", { destination: constructionSite });
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