

// Manager.
function Manager(name) {
    this.name = name;

    // Defines a quick access way to get memory.
    Object.defineProperty(this, "m", {
        get: function() {
            if (Memory.Manager == undefined) {
                Memory.Manager = {};
            }
            if (Memory.Manager[this.name] == undefined) {
                Memory.Manager[this.name] = {};
            }
            return Memory.Manager[this.name];
        }
    });
}

Manager.prototype = {
    // Base methods that each manager should implement.

    // Called once, services registered at this point.
    init: () => {},

    // Load data from memory and initial setup.
    load: () => {},

    // Bulk work of the manager.
    run: () => {},

    // Save the data to memory.
    save: () => {},

    // Allows services to be registered.
    registerServices: function(services) {
        services.forEach(service =>  this[service.name] = service);
    }
};

// Manager Container
function ManagerContainer(managers) {
    this.managers = managers;
}

ManagerContainer.prototype = {
    init: function() {
        this.managers.forEach(manager => manager.registerServices(this.managers));
        this.managers.forEach(manager => manager.init());
    },
    run: function() {
        this.managers.forEach(manager => manager.load());
        this.managers.forEach(manager => manager.run());
        this.managers.forEach(manager => manager.save());
    }
}

module.exports = {
    Manager,
    ManagerContainer
};