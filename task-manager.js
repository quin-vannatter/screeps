const { Manager } = require("./manager");

// Task Manager. Should be loaded last so all tasks can be registered.
function TaskManager() {
    Manager.call(this, TaskManager.name);
    this.taskMap = {};
}

TaskManager.prototype = {
    ...Manager.prototype,
    load: function() {
        // Since the task manager is last to be loaded, if any other manager has tasks to be registered, they should be in the task map.
        // Load the queued and active tasks.
        this.tasks = this.fromMemory(this.m.tasks);
    },
    run: function() {
        const idleCreeps = Object.values(Game.creeps).filter(creep => !this.tasks.some(task => task.worker.id === creep.id));

        // Purge tasks that don't have a destination.
        this.tasks = this.tasks.filter(task => task.destination != undefined && task.destination.id != undefined);
        let noCreepAvailable = true;
        this.queuedTasks().forEach(task => {
            const creeps = idleCreeps.filter(creep => 
                task.bodyParts.every(part => creep.body.filter(x => x.hits > 0).some(x => x.type == part)));
            
            if (creeps.length > 0) {
                noCreepAvailable = false;
                const creep = creeps.filter(creep => task.meetsRequirements(creep, task.destination));
                if (creep != undefined) {
                    task.assign(creep);
                } else {
                    this.submitTasks(task.getTasksForRequirements(creeps[0], task.destination));
                }
            }
        });

        // Get queued tasks that haven't been assigned and create creeps.
        if (noCreepAvailable) {
            this.SpawnManager.requestCreep(this.queuedTasks());
        }

        this.activeTasks().forEach(tasks => {
            if (tasks.length > 0) {
                const task = tasks[0];
                if (!task.isComplete()) {
                    task.inRange = task.inRange || task.worker.pos.inRangeTo(task.destination, task.range);
                    if (!task.inRange) {
                        task.worker.moveTo(task.destination);
                    } else {
                        if (task.execute() == ERR_NOT_IN_RANGE) {
                            task.inRange = false;
                        };
                    }
                } else {
                    tasks.shift();
                }
            }
        });
        this.tasks = this.tasks.filter(task => task.length > 0);
    },
    save: function() {

        // Convert current data to memory safe values.
        //this.m.tasks = this.toMemory(this.tasks);
    },

    fromMemory: function(rawTasks) {
        return rawTasks != undefined ? 
            rawTasks.map(rawTask => {
                const taskMap = this.taskMap[rawTask[0]];
                if (taskMap != undefined) {
                    const value = taskMap.fromMemory(rawTask);
                    return value;
                }
            }).filter(task => task != undefined) : [];
    },
    toMemory: function(tasks) {
        return tasks.map(task => task.toMemory()).filter(task => task != undefined);
    },
    getAndSubmit: function(name, options) {
        this.submitTask(this.getTask(name, options));
    },
    submitTasks: function(tasks, allowDuplicateTasks) {
        tasks.forEach(task => this.submitTask(task, allowDuplicateTasks));
    },
    submitTask: function(task, allowDuplicateTasks) {
        if (!this.taskExists(task) || allowDuplicateTasks) {
            this.tasks.push(task);
        }
    },
    getTask: function(name, options) {
        const baseTask = this.taskMap[name];
        if (baseTask != undefined) {
            return baseTask.create(options);
        }
    },
    taskExists: function(task) {
        console.log(task)
        return this.tasks.some(x => x.name === task.name && task.destination.id === x.destination.id);
    },
    registerTask: function(name, options) {
        this.taskMap[name] = new Task(name, options);
    },
    registerTasks: function(tasks) {
        Object.keys(tasks).forEach(key => {
            const entry = tasks[key];
            this.taskMap[key] = new Task(key, entry);
        });
    },
    queuedTasks: function() {
        return this.tasks.filter(task => task.worker.id == undefined);
    },
    activeTasks: function() {
        return this.tasks.filter(task => task.worker.id != undefined);
    }
}

// Task.
// Every task function should assume the creep is already at the location.
function Task(name, options) {
    options = { ...this.DEFAULT_PROPERTIES, ...options };
    Object.keys(options).forEach(key => this[key] = options[key]);
    this.name = name;
}

Task.prototype = {
    STATIC_PROPERTIES: [
        "executeFunction",
        "meetsRequirementsFunction",
        "getTasksForRequirementsFunction",
        "isCompleteFunction",
        "bodyParts",
        "priority"
    ],
    DEFAULT_PROPERTIES: {
        worker: {},
        destination: {},
        range: 1,
        inRange: false,
        priority: 0,
        getTasksForRequirementsFunction: () => [],
        triggerCompleteFunction: () => {}
    },
    create: function(options) {
        const task = new Task(
            this.name,
            this
        );
        Object.keys(options).filter(key => !this.STATIC_PROPERTIES.includes(key)).forEach(key => task[key] = options[key]);
        return task;
    },
    unassign: function() {
        this.worker = this.DEFAULT_PROPERTIES.worker;
    },
    assign: function(worker) {
        this.worker = worker;
    },
    fromMemory: function(data) {
        const options = this.getSaveableProperties().map((x ,i) => [x, i]).reduce((a, b) => {
            let value = data[b[1]];
            if (/[a-f0-9]{15}/.test(value)) {
                value = Game.getObjectById(value);
            }
            return value != undefined ? {
                ...a,
                [b[0]]: value
            } : a;
        }, {});
        return this.create({ ...this.DEFAULT_PROPERTIES, ...options });
    },
    toMemory: function() {
        return this.getSaveableProperties().map(key => {
            if (typeof(this[key]) == "object" && this[key] != undefined) {
                return this[key].id
            }
            return this[key];
        });
    },
    getSaveableProperties: function() {
        return Object.keys(this).filter(key => !this.STATIC_PROPERTIES.includes(key))
            .sort((a, b) => {
                if (a === "name" || b === "name") {
                    return a === "name" ? -1 : 1;
                }
                return a < b ? -1 : 1;
            });
    },
    meetsRequirements: function(creep) {
        return this.meetsRequirementsFunction(creep, this.destination);
    },
    execute: function() {
        return this.executeFunction(this.worker, this.destination);
    },
    isComplete: function() {
        return this.isCompleteFunction(this.worker, this.destination);
    }
}

module.exports = {
    TaskManager: new TaskManager(),
    Task
}
