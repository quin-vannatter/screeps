const { Manager } = require("./manager")

function ControllerManager() {
    Manager.call(this, ControllerManager.name);
}

ControllerManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.TaskManager.registerTasks({
            updateController: {
                executeFunction: (creep, destination) => {
                    return creep.upgradeController(destination);
                },
                meetsRequirementsFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] > 0;
                },
                getTasksForRequirementsFunction: (creep, destination) => {
                    return [this.CreepManager.getHarvestClosestSourceTask(destination)];
                },
                isCompleteFunction: (creep, destination) => {
                    return creep.store[RESOURCE_ENERGY] == 0 || (destination.store != undefined && destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0);
                },
                bodyParts: [
                    WORK,
                    CARRY
                ],
                priority: 1
            }
        });
    },
    run: function() {
        this.getControllers().forEach(controller => this.TaskManager.getAndSubmitTask("updateController", { destination: controller }));
    },
    getControllers: function() {
        return Object.values(Game.creeps).concat(Object.values(Game.spawns)).map(entity => entity.room.controller)
        .filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
    },
    requestWork: function(creep) {
        this.getControllers().forEach(controller => {
            const task = this.TaskManager.getTask("updateController", { destination: controller });
            if (task.meetsRequirements(creep)) {
                task.assign(creep);
                this.TaskManager.submitTask(task, true);
                return true;
            }
            return false;
        });
    }
}


module.exports = {
    ControllerManager: new ControllerManager()
}