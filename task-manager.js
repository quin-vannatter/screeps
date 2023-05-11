const { Manager } = require("./manager");
const { userFriendlyList } = require('./logger-utils');

// Task Manager. Should be loaded last so all tasks can be registered.
function TaskManager() {
    Manager.call(this, TaskManager.name);
}

TaskManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.tasks = this.MemoryManager.register("tasks", true, {
            template: {
                getTasksForRequirements: () => [],
                assign: (self, creep) => {
                    self.creep = creep;
                    console.log(`${creep.name} will ${self.getTaskName()}.`)
                    creep.say(self.getMessage(), true);
                },
                unassign: self => self.creep = {},
                hasBodyParts: (self, creep) => self.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart)),
                meetsRequirements: (self, creep) => self.hasBodyParts(creep) && self.canExecute(creep),
                canExecute: () => true,
                getTaskName: self => self.name.split("").map((x, i) => (x.toUpperCase() == x) ? ` ${x.toLowerCase()}` : x).join("").trim(),
                range: 1,
                getMessage: () => "Doing task",
                isWorkingTask: false
            },
            defaults: {
                creep: {},
                destination: {},
                inRange: false,
                priority: 0
            }
        });
    },
    run: function() {

        const idleCreeps = this.getIdleCreeps();

        this.tasks.entries = this.tasks.entries.sort((a, b) => a.priority - b.priority);

        this.handleQueuedTasks(idleCreeps);
        this.handleIdleCreeps(idleCreeps);
        this.handleActiveTasks();

        this.tasks.entries = this.tasks.entries.filter(task => (task.creep.id == undefined || !task.isComplete()));
    },
    getIdleCreeps: function() {
        return Object.values(Game.creeps).filter(creep => !this.tasks.entries.some(task => task.creep.id === creep.id && task.meetsRequirements(creep)));
    },
    handleQueuedTasks: function(idleCreeps) {

        // Purge tasks that don't have a destination.
        let noCreepAvailable = true;
        const queuedTasks = this.queuedTasks();

        queuedTasks.forEach(task => {
            const creeps = idleCreeps.filter(creep => task.hasBodyParts(creep));

            if (creeps.length > 0) {
                const creep = creeps.map(x => [x, x.pos.getRangeTo(task)])
                    .sort((a, b) => a[1] - b[1]).map(x => x[0])
                    .find(creep => task.meetsRequirements(creep));
                noCreepAvailable = false;
                if (creep != undefined) {
                    task.assign(creep);

                    queuedTasks.splice(queuedTasks.indexOf(task), 1);
                    idleCreeps.splice(idleCreeps.indexOf(creep), 1);

                } else {
                    const newTasks = task.getTasksForRequirements(creep);
                    if (newTasks.length > 0) {
                        console.log(`No creeps can ${task.getTaskName()}.`);
                        this.submitTasks(newTasks, true);
                    }
                }
            }
        });

        // Get queued tasks that haven't been assigned and create creeps.
        if (noCreepAvailable) {
            console.log("Requesting more people.");
            this.SpawnManager.requestCreep(queuedTasks);
        }
    },
    handleIdleCreeps: function(idleCreeps) {
        if (idleCreeps.length > 0) {
            console.log(`${userFriendlyList(idleCreeps.map(creep => creep.name))} ${idleCreeps.length == 1 ? "is" : "are"} looking for tasks.`);
            idleCreeps.forEach(creep => creep.say("Idle", true));
            const managers = this.ManagerContainer.getAll(this);
            idleCreeps.forEach(creep => managers.some(manager => manager.requestWork(creep)));
        }
    },
    handleActiveTasks: function() {
        this.activeTasks().forEach(task => {
            if (task.meetsRequirements(task.creep)) {
                if (!task.isComplete()) {
                    task.inRange = task.inRange || (task.destination.id != undefined && task.creep.pos.inRangeTo(task.destination, task.range));
                    if (!task.inRange) {
                        task.creep.moveTo(task.destination);
                    } else {
                        const result = task.execute();
                        if (result == ERR_NOT_IN_RANGE) {
                            task.inRange = false;
                        } else if(result != OK) {
                            task.unassign();
                        }
                    }
                } else {
                    task.creep.say("Complete", true);
                }
            }
        });
    },
    getAndSubmitTask: function(name, options, allowDuplicateTasks) {
        this.submitTask(this.getTask(name, options), allowDuplicateTasks);
    },
    submitTasks: function(tasks, allowDuplicateTasks) {
        tasks.forEach(task => this.submitTask(task, allowDuplicateTasks));
    },
    submitTask: function(task, allowDuplicateTasks) {
        const exists = this.taskExists(task);
        if (!exists || (allowDuplicateTasks && this.meetsThreshold(task))) {
            console.log(`Someone needs to ${task.getTaskName()}.`)
            this.tasks.entries.push(task);
        }
    },
    getTask: function(name, data) {
        const task = this.tasks.create(name, data);
        return task;
    },
    meetsThreshold: function(task) {
        return this.tasks.entries.filter(x => x.name === task.name && task.destination.id === x.destination.id).length <= Object.keys(Game.creeps).length;
    },
    taskExists: function(task) {
        return this.tasks.entries.some(x => x.name === task.name && task.destination.id === x.destination.id);
    },
    queuedTasks: function() {
        return this.tasks.entries.filter(task => task.creep.id == undefined);
    },
    activeTasks: function() {
        return this.tasks.entries.filter(task => task.creep.id != undefined);
    }
}

module.exports = {
    TaskManager: new TaskManager()
}
