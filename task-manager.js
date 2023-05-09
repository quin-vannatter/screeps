const { Manager } = require("./manager");

// Task Manager. Should be loaded last so all tasks can be registered.
function TaskManager() {
    Manager.call(this, TaskManager.name);
}

TaskManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.tasks = this.MemoryManager.register("tasks", {
            template: {
                getTasksForRequirements: () => [],
                assign: (self, creep) => self.creep = creep,
                unassign: self => self.creep = {},
                hasBodyParts: (self, creep) => self.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart)),
                meetsRequirements: (self, creep) => self.hasBodyParts(creep) && self.canExecute(creep),
                canExecute: () => true,
                range: 1
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

        // Purge tasks that don't have a destination.
        let noCreepAvailable = true;
        const assignedCreeps = [];

        this.tasks.entries = this.tasks.entries.sort((a, b) => a.priority - b.priority);
        this.queuedTasks().forEach(task => {
            const creeps = idleCreeps.filter(creep => 
                !assignedCreeps.some(x => x.id == creep.id) &&
                task.hasBodyParts(creep));

            if (creeps.length > 0) {
                const creep = creeps.map(x => [x, x.pos.getRangeTo(task)]).sort((a, b) => a[1] - b[1]).map(x => x[0]).find(creep => task.meetsRequirements(creep));
                if (creep != undefined) {
                    noCreepAvailable = false;
                    console.log(`${creep} assigned task ${task.name}`)
                    task.assign(creep);
                    assignedCreeps.push(creep);
                } else {
                    noCreepAvailable = false;
                    const newTasks = task.getTasksForRequirements(creep);
                    if (newTasks.length > 0) {
                        console.log(`No creeps meet requirements for ${task.name}. Creating tasks to meet requirements`);
                        this.submitTasks(newTasks, true);
                    }
                }
            }
        });

        if (idleCreeps.length != assignedCreeps.length) {
            console.log("There are creeps idle, requesting work.");
            const remainingCreeps = idleCreeps.filter(creep => !assignedCreeps.some(x => x.id === creep.id));
            const managers = this.ManagerContainer.getAll(this);
            remainingCreeps.forEach(creep => {
                const workFound = managers.some(manager => manager.requestWork(creep));
                if (workFound) {
                    console.log(`Found work for idle creep ${creep.name}`);
                } else {
                    if (creep.memory.inactiveTicks == undefined) {
                        creep.memory.inactiveTicks = 0;
                    }
                    creep.inactiveTicks++;
                }
            });
        }

        // Get queued tasks that haven't been assigned and create creeps.
        if (noCreepAvailable) {
            this.SpawnManager.requestCreep(this.queuedTasks());
        }

        this.activeTasks().forEach(task => {
            if (!task.isComplete()) {
                task.inRange = task.inRange || (task.destination.id != undefined && task.creep.pos.inRangeTo(task.destination, task.range)) || task.destination.id == undefined;
                if (!task.inRange) {
                    task.creep.moveTo(task.destination)
                } else {
                    const result = task.execute();
                    if (result == ERR_NOT_IN_RANGE) {
                        task.inRange = false;
                    } else if(result != OK) {
                        task.unassign();
                    }
                }
            }
        });

        this.tasks.entries = this.tasks.entries.filter(task => (task.creep.id == undefined || !task.isComplete()) && task.destination.pos != undefined && !task.abandoned);
    },
    getIdleCreeps: function() {
        return Object.values(Game.creeps).filter(creep => !this.tasks.entries.some(task => task.creep.id === creep.id));
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
            console.log(`Task queued: ${task.name}`)
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
