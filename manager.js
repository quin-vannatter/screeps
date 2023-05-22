const { cpuLimitReached } = require("./utils");

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
        managers.forEach(manager =>  this[manager.name] = manager);
    },

    requestWork: () => false
};

// Manager Container
function ManagerContainer(managers, e) {
    this.name = ManagerContainer.name;
    this.managers = managers;
    this.e = e;
}

ManagerContainer.prototype = {
    init: function() {
        this.managers.forEach(manager => manager.registerManagers([...this.managers, this.e, this]));
        this.managers.forEach(manager => manager.init());
        this.managers.forEach(manager => manager.afterInit());
        this.roomIndex = 0;
    },
    run: function() {
        const rooms = this.e.rooms;
        let ranRoomCount = 0;
        while(!cpuLimitReached() && ranRoomCount < rooms.length) {
            this.managers.forEach(manager => {
                manager.run(rooms[this.roomIndex]);
                if (cpuLimitReached()) {
                    return;
                }
            });
            this.roomIndex = (this.roomIndex + 1) % rooms.length;
            ranRoomCount++;
        }
    },
    getAll: function(caller) {
        return this.managers.filter(manager => manager != caller);
    }
}

module.exports = {
    Manager,
    ManagerContainer
};