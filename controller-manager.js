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
                    canExecute: (self, creep) => creep.store[RESOURCE_ENERGY] > 0 && self.destination.my,
                    getTasksForRequirements: self => [this.CreepManager.getHarvestClosestSourceTask(self.destination)],
                    isComplete: self => self.creep.store[RESOURCE_ENERGY] == 0 || (self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) == 0),
                    bodyParts: [
                        WORK,
                        CARRY
                    ],
                    range: 3,
                    getMessage: () => "Upgrading",
                    isWorkingTask: true
                }
            },
            claimController: {
                template: {
                    execute: self => self.creep.claimController(self.destination),
                    isComplete: self => self.destination.my,
                    bodyParts: [
                        CLAIM
                    ],
                    range: 1,
                    getMessage: () => "Claiming"
                }
            }
        });
    },
    run: function(room) {
        this.e.controllers.filter(controller => controller.room == room && controller.my).forEach(controller => this.TaskManager.getAndSubmitTask("updateController", { destination: controller }));
        if (this.e.controllers.filter(controller => controller.my).length < Game.gcl.level) {
            this.e.controllers.filter(controller => !controller.my)
                .forEach(controller => {
                    if (!this.TaskManager.tasks.entries.some(task => task.destination == controller && task.name === "claimController")) {
                        this.TaskManager.getAndSubmitTask("claimController", { destination: controller });
                    }
                });
        }
    },
    requestWork: function(creep) {
        this.e.controllers.forEach(controller => {
            const zone = this.CommuteManager.getSafeZone(controller);
            if (zone != undefined && !zone.isFull()) {
                const task = this.TaskManager.getTask("updateController", { destination: controller });
                if (this.TaskManager.submitTask(task, creep)) {
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