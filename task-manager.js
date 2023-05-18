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
                    console.log(`${creep.name} will ${self.getTaskName()}.`);
                    creep.say(self.getMessage(), true);
                },
                unassign: self => {
                    console.log(`${self.creep.name} will no longer ${self.getTaskName()}.`);
                    self.creep.say("Unassigned", true);
                    self.creep = {};
                },
                hasBodyParts: (self, creep) => self.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart)),
                meetsRequirements: (self, creep) => self.hasBodyParts(creep) && self.canExecute(creep),
                canExecute: () => true,
                getTaskName: self => self.name.split("").map((x, i) => (x.toUpperCase() == x) ? ` ${x.toLowerCase()}` : x).join("").trim(),
                range: 1,
                getMessage: () => "Doing task",
                isWorkingTask: false,
                bodyParts: []
            },
            defaults: {
                creep: {},
                destination: {},
                priority: 0
            }
        });
    },
    run: function() {

        let idleCreeps = this.getIdleCreeps();

        this.tasks.entries = this.tasks.entries.sort((a, b) => b.priority - a.priority);

        this.handleQueuedTasks(idleCreeps);
        this.handleIdleCreeps(idleCreeps);
        this.handleActiveTasks();

        this.tasks.entries = this.tasks.entries.filter(task => (!this.e.exists(task.creep) || !task.isComplete()) && Object.keys(task.destination).length > 0);
    },
    getIdleCreeps: function() {
        return this.e.creeps.filter(creep => this.e.exists(creep) && !creep.spawning && !this.tasks.entries.some(task => task.creep == creep && task.meetsRequirements(creep)));
    },
    handleQueuedTasks: function(idleCreeps) {

        // Purge tasks that don't have a destination.
        let noCreepAvailable = true;
        let queuedTasks = this.queuedTasks();

        queuedTasks.forEach((task, i) => {
            const creeps = idleCreeps.filter(creep => creep && task.hasBodyParts(creep));
            if (creeps.length > 0) {
                
                const creep = creeps.map(x => [x, x.pos.getRangeTo(task.destination)])
                    .sort((a, b) => a[1] - b[1]).map(x => x[0])
                    .find(creep => task.meetsRequirements(creep));

                noCreepAvailable = false;
                if (creep != undefined) {
                    task.assign(creep);

                    queuedTasks[i] = undefined;
                    idleCreeps[idleCreeps.indexOf(creep)] = undefined
                } else {
                    const newTasks = task.getTasksForRequirements(creep);
                    if (newTasks.length > 0) {
                        console.log(`No creeps can ${task.getTaskName()}.`);
                        this.submitTasks(newTasks, true);
                    }
                }
            }
        });
        queuedTasks = queuedTasks.filter(x => x);

        // Get queued tasks that haven't been assigned and create creeps.
        if (noCreepAvailable) {

            // Get tasks where the spawn is the destination and they're deposits and increase the priority.
            const depositEnergyTasks = queuedTasks.filter(task => task.name === "depositEnergy" && task.destination instanceof StructureSpawn);
            depositEnergyTasks.forEach(task => task.priority++);
            this.SpawnManager.requestCreep(queuedTasks);
        }
    },
    handleIdleCreeps: function(idleCreeps) {
        idleCreeps = idleCreeps.filter(x => x);
        if (idleCreeps.length > 0) {
            console.log(`${userFriendlyList(idleCreeps.map(creep => creep.name))} ${idleCreeps.length == 1 ? "is" : "are"} looking for tasks.`);
            idleCreeps.forEach(creep => creep.say("Idle", true));
            const managers = this.ManagerContainer.getAll(this);
            idleCreeps.forEach(creep => managers.some(manager => manager.requestWork(creep)));
        }
    },
    handleActiveTasks: function() {
        const activeTasks = this.activeTasks();
        activeTasks.forEach((task, i) => {
            if (!task.isComplete() && !task.meetsRequirements(task.creep)) {
                task.unassign();
                this.CommuteManager.vacate(task.creep);
            } else if (!task.isComplete()) {
                if (this.CommuteManager.canCommuteTo(task.destination, task.creep)) {
                    this.CommuteManager.commuteTo(task.creep, task.destination);
                } else if (!task.creep.pos.inRangeTo(task.destination, task.range)) {
                    task.creep.moveTo(task.destination);
                }
                if (this.CommuteManager.commuteComplete(task.creep) || task.creep.pos.inRangeTo(task.destination, task.range)) {
                    const result = task.execute();
                    if(result != OK) {
                        task.unassign();
                        this.CommuteManager.vacate(task.creep);
                    }
                }
            } else {
                this.CommuteManager.vacate(task.creep);
                task.creep.say("Complete", true);
            }
        });
    },
    unassignCreep: function(creep) {
        this.tasks.entries.filter(task => task.creep == creep).forEach(task => task.unassign());
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
        const zone = this.CommuteManager.getSafeZone(task.destination);
        return zone == undefined ? 
            this.tasks.entries.filter(x => x.name === task.name && task.destination == x.destination).length <= this.e.creeps.length : 
            !zone.isFull();
    },
    taskExists: function(task) {
        return this.tasks.entries.some(x => x.name === task.name && task.destination == x.destination);
    },
    queuedTasks: function() {
        return this.tasks.entries.filter(task => !this.e.exists(task.creep));
    },
    activeTasks: function() {
        return this.tasks.entries.filter(task => this.e.exists(task.creep));
    }
}

module.exports = {
    TaskManager: new TaskManager()
}
