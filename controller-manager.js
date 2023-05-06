const { Manager } = require("./manager")

function ControllerManager() {
    Manager.call(this, ControllerManager.name);
}

ControllerManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.registerTasks({
            updateController: {
                execute: () => this.creep.upgradeController(destination),
                meetsRequirements: creep => creep.store[RESOURCE_ENERGY] > 0,
                getTasksForRequirements: () => [this.CreepManager.getHarvestClosestSourceTask(this.destination)],
                isComplete: () => this.creep.store[RESOURCE_ENERGY] == 0 || (this.destination.store != undefined && this.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                priority: 1,
                bodyParts: [
                    WORK,
                    CARRY
                ]
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