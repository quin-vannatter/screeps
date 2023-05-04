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
                    creep.build(destination);
                },
                getRequirementsFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] > 0;
                },
                isCompleteFunction: (creep, destination) => {
                    return destination.totalProgress == destination.progress;
                },
                getTasksForRequirementsFunction: (creep, destination) => {
                    return [this.CreepManager.getHarvestClosestSourceTask(destination)];
                },
                bodyParts: [WORK, CARRY],
                range: 3
            }
        });
    }
}

module.exports = {
    StructureManager: new StructureManager()
}