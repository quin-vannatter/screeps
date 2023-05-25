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
    run: function() {

        // Build construction sites.
        this.e.constructionSites.forEach(constructionSite => 
            this.TaskManager.getAndSubmitTask("buildStructure", { destination: constructionSite }));

        // Repair structures.
        this.e.structures.filter(structure => (structure.hits / structure.hitsMax * 100) < REPAIR_THRESHOLD).forEach(structure => 
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
    }
}

module.exports = {
    StructureManager: new StructureManager()
}