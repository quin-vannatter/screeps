

// Manager.
function Manager(name) {
    this.name = name;
}

Manager.prototype = {
    // Base methods that each manager should implement.

    // Called once, services registered at this point.
    init: () => {},

    // Managers are in a useable state here but no data loaded.
    afterInit: () => {},

    // Bulk work of the manager.
    run: () => {},

    // Allows services to be registered.
    registerManagers: function(managers) {
        this.managers = managers
        managers.forEach(manager =>  this[manager.name] = service);
    },

    requestWork: () => false
};

// Manager Container
function ManagerContainer(managers) {
    this.name = ManagerContainer.name;
    this.managers = managers;
}

ManagerContainer.prototype = {
    init: function() {
        this.managers.forEach(manager => manager.registerManagers([...this.managers, this]));
        this.managers.forEach(manager => manager.init());
    },
    run: function() {
        this.MemoryManager.load();
        this.managers.forEach(manager => manager.run());
        this.MemoryManager.save();
    },
    getAll: function(caller) {
        return this.managers.filter(manager => manager != caller);
    }
}

module.exports = {
    Manager,
    ManagerContainer
};