const { Manager } = require("./manager")

function ControllerManager() {
    Manager.call(this, ControllerManager.name);
}

ControllerManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.tasks.register({
            updateController: {
                template: {
                    execute: self => self.creep.upgradeController(self.destination),
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => self.creep.store[RESOURCE_ENERGY] == 0 || (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                    bodyParts: [
                        WORK,
                        CARRY
                    ],
                    range: 3,
                    getMessage: () => "Upgrading",
                    isWorkingTask: true
                },
                defaults: {
                    priority: 1
                }
            }
        });
    },
    run: function() {
        this.e.controllers.forEach(controller => this.TaskManager.getAndSubmitTask("updateController", { destination: controller }));
    },
    requestWork: function(creep) {
        this.e.controllers.forEach(controller => {
            const zone = this.CommuteManager.getSafeZone(controller);
            if (zone != undefined && !zone.isFull()) {
                const task = this.TaskManager.getTask("updateController", { destination: controller });
                if (task.meetsRequirements(creep)) {
                    task.assign(creep);
                    this.TaskManager.submitTask(task, true);
                    return true;
                }
            }
        });
        return false;
    }
}


module.exports = {
    ControllerManager: new ControllerManager()
}