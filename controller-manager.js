const { Manager } = require("./manager")

function ControllerManager() {
    Manager.call(this, ControllerManager.name);
}

ControllerManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.collection.register({
            updateController: {
                template: {
                    execute: self => self.creep.upgradeController(self.destination),
                    meetsRequirements: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => self.creep.store[RESOURCE_ENERGY] == 0 || (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                    bodyParts: [
                        WORK,
                        CARRY
                    ]
                },
                defaults: {
                    priority: 1
                }
            }
        });
    },
    run: function() {
        this.getControllers().forEach(controller => this.TaskManager.getAndSubmitTask("updateController", { destination: controller }));
    },
    getControllers: function() {
        return Object.values(Game.creeps).concat(Object.values(Game.spawns))
        .filter(entity => entity.room.controller.my)
        .map(entity => entity.room.controller)
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