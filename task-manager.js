const { Manager } = require("./manager");

// Task Manager. Should be loaded last so all tasks can be registered.
function TaskManager() {
    Manager.call(this, TaskManager.name);
}

TaskManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.taskCollection = this.MemoryManager.register("tasks", {
            creep: {},
            destination: {},
            range: 1,
            getTasksForRequirementsFunction: () => [],
            assign: (self, creep) => self.creep = creep,
            unassign: self => delete self.creep,
            hasBodyParts: (self, creep) => self.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart)),
            canExecute: (self, creep) => self.hasBodyParts(creep) && self.meetsRequirements(creep)
        }, {
            inRange: false,
            priority: 0
        });
    },
    afterInit: function() {
        this.tasks = this.taskCollection.entries;
    },
    run: function() {
        const idleCreeps = this.getIdleCreeps();

        // Purge tasks that don't have a destination.
        let noCreepAvailable = true;
        const assignedCreeps = [];
        this.tasks = this.tasks.sort((a, b) => a.priority - b.priority);
        this.queuedTasks().forEach(task => {
            const creeps = idleCreeps.filter(creep => 
                !assignedCreeps.some(x => x.id == creep.id) &&
                task.hasBodyParts(creep));

            if (creeps.length > 0) {
                const creep = creeps.find(creep => task.canExecute(creep));
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
                    task.creep.moveTo(task.destination);
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

        this.tasks = this.tasks.filter(task => (task.creep.id == undefined || !task.isComplete()) && task.destination.pos != undefined);
        this.taskCollection.entries = tasks;
    },
    getIdleCreeps: function() {
        return Object.values(Game.creeps).filter(creep => !this.tasks.some(task => task.creep.id === creep.id));
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
            this.tasks.push(task);
        }
    },
    getTask: function(name, options) {
        return this.taskCollection.create(name, options);
    },
    meetsThreshold: function(task) {
        return this.tasks.filter(x => x.name === task.name && task.destination.id === x.destination.id).length <= Object.keys(Game.creeps).length;
    },
    taskExists: function(task) {
        return this.tasks.some(x => x.name === task.name && task.destination.id === x.destination.id);
    },
    queuedTasks: function() {
        return this.tasks.filter(task => task.creep.id == undefined);
    },
    activeTasks: function() {
        return this.tasks.filter(task => task.creep.id != undefined);
    }
}

module.exports = {
    TaskManager: new TaskManager()
}
