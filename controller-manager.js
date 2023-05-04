const { Manager } = require("./manager")

function ControllerManager() {
    Manager.call(this, ControllerManager.name);
}

ControllerManager.prototype = {
    ...Manager.prototype,
    run: function() {
        Object.values(Game.creeps).concat(Object.values(Game.spawns)).map(entity => entity.room.controller)
            .filter((x, i, a) => a.findIndex(y => y.id === x.id) === i)
            .forEach(controller => this.TaskManager.getAndSubmit("depositEnergy", { destination: controller }));
    }
}


module.exports = {
    ControllerManager: new ControllerManager()
}