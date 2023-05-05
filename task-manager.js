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
                const creep = creeps.find(creep => task.meetsRequirements(creep, task.destination));
                if (creep != undefined) {
                    noCreepAvailable = false;
                    console.log(`${creep} assigned task ${task.name}`)
                    task.assign(creep);
                    assignedCreeps.push(creep);
                } else {
                    noCreepAvailable = false;
                    const newTasks = task.getTasksForRequirements(creep, task.destination);
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
                task.inRange = task.inRange || (task.destination.id != undefined && task.worker.pos.inRangeTo(task.destination, task.range)) || task.destination.id == undefined;
                if (!task.inRange) {
                    task.worker.moveTo(task.destination);
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
        this.tasks = this.tasks.filter(task => (task.worker.id == undefined || !task.isComplete()) && task.destination.pos != undefined);
    },
    save: function() {

        // Convert current data to memory safe values.
        this.m.tasks = this.toMemory(this.tasks);
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
    getIdleCreeps: function() {
        return Object.values(Game.creeps).filter(creep => !this.tasks.some(task => task.worker.id === creep.id));
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
        const baseTask = this.taskMap[name];
        if (baseTask != undefined) {
            return baseTask.create(options);
        }
    },
    meetsThreshold: function(task) {
        return this.tasks.filter(x => x.name === task.name && task.destination.id === x.destination.id).length <= Object.keys(Game.creeps).length;
    },
    taskExists: function(task) {
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
        getTasksForRequirementsFunction: () => []
    },
    create: function(options) {
        const task = new Task(
            this.name,
            this
        );
        Object.keys(options || {}).filter(key => !this.STATIC_PROPERTIES.includes(key)).forEach(key => task[key] = options[key]);
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
        const value = this.getSaveableProperties().map(key => {
            if (typeof(this[key]) == "object" && this[key] != undefined) {
                return this[key].id
            }
            return this[key];
        });
        return value;
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
    hasBodyParts: function(creep) {
        return this.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart));
    },
    meetsRequirements: function(creep) {
        return this.hasBodyParts(creep) && this.meetsRequirementsFunction(creep, this.destination);
    },
    getTasksForRequirements: function(creep) {
        return this.getTasksForRequirementsFunction(creep, this.destination);
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
