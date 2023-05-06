const {
    Manager
} = require("./manager");

function Entry(managers, data) {
    managers.forEach(manager => this[manager.name] = manager);
    this.definition = Object.keys(data);
    this.definition.forEach(key => {
        const value = data[key];
        if (typeof (value) === "function") {
            this[key] = function (...args) {
                value(...args);
            }
        } else {
            this[key] = value;
        }
    });
}

Entry.prototype = {
    create: function (data) {
        const newEntry = new Entry(this.definitionValue, this.managers);
        Object.keys(data).forEach(key => newEntry[key] = data[key]);
        return newEntry;
    },
    getProperties: function () {
        return Object.keys(this).filter(key => !this.definition.includes(key));
    },
    definitionValue: function () {
        return this.definition.reduce((a, b) => ({
            ...a,
            [b]: this[b]
        }), {});
    },
    fromMemory: function (propertyMap, rawData) {
        const data = {};
        propertyMap.forEach((key, i) => {
            if (rawData[i] != undefined) {
                data[key] = rawData[key];
            }
        });
        return this.create(data);
    },
    toMemory: function (propertyMap) {
        return propertyMap.map(key => this[key]);
    }
}

function MemoryManager() {
    Manager.call(this, CollectionManager.name);
    this.collections = {};
}

MemoryManager.prototype = {
    ...Manager.prototype,
    setup: function () {
        if (Memory.collections == undefined) {
            Memory.collections = {};
        }
        if (Memory.ids == undefined) {
            Memory.ids = [];
        }
    },
    load: function () {
        this.setup();
        const memory = Memory.collections;
        const references = Memory.ids.map(id => Game.getObjectById(id));
        Object.keys(this.collections).forEach(key => {
            const collectionMemory = memory[key];
            if (collectionMemory.length >= 3) {
                const name = collectionMemory[0];
                const propertyMap = collectionMemory[1];
                const idIndexes = collectionMemory[2];
                const values = collectionMemory.slice(3);

                values.forEach(value => {

                    // Resolve game object ids.
                    idIndexes.forEach(index => {
                        const idIndex = value[index];
                        value[index] = idIndex < references.length ? references[idIndex] : undefined;
                    });

                    // Add entries.
                    const template = collection.templates[name];
                    if (template != undefined) {
                        collection.entries.push(template.fromMemory(propertyMap, value))
                    }
                });
            }
        });
    },
    save: function () {
        this.setup();
        const ids = [];
        const memory = Memory.collections;
        Object.keys(this.collections).forEach(key => {
            const entries = this.collections[key].entries;
            if (entries != undefined && entries.length > 0) {
                const propertyMap = entries.map(entry => entry.getProperties())
                    .reduce((a, b) => a.concat(b), [])
                    .filter((x, i, a) => a.indexOf(x) == i);
                if (propertyMap.length > 0) {
                    const values = entries.map(entry => entry.toMemory(propertyMap));
                    const idIndexes = values.map((x, i) => [x, i])
                        .filter(x => typeof (x[0]) === "object" && /[a-f0-9]{15}/.test(x[0].id))
                        .map(x => x[1]);
                    values.filter((_x, i) => idIndexes.includes(i)).forEach((value, i) => {
                        if (value != undefined && value.id != undefined) {
                            let mapIndex = ids.indexOf(value.id);
                            if (mapIndex === -1) {
                                ids.push(value.id);
                                mapIndex = ids.length - 1;
                            }
                            values[i] = mapIndex;
                        }
                    });
                    memory[key] = [propertyMap, idIndexes, ...values];
                }
            }
        });
        Memory.ids = ids;
    },
    // Registering collections should only happen in the init function.
    register: function (name, entryPrototype) {
        this.collections[name] = new Collection(this.managers, entryPrototype);
        return collections[name];
    }
}

function Collection(managers, entryPrototype) {
    this.templates = {};
    this.entries = [];
    this.entryPrototype = entryPrototype;
    this.managers = managers;
}

Collection.prototype = {
    create: function (name, data) {
        const template = this.templates[name];
        if (template != undefined) {
            return template.create(data);
        }
    },
    register: function (...args) {
        if (this.entryPrototype != undefined) {
            if (args.length === 2 && typeof (args[0]) === "string") {
                this.template[args[0]] = new Entry(args[1], this.entryPrototype);
            } else if (args.length === 1 && typeof (args[0]) === "string") {
                const data = args[0];
                Object.keys(data).forEach(key => {
                    if (typeof (data[key]) === "object") {
                        this.template[key] = new Entry({ ...data[key], ...this.entryPrototype }, this.managers);
                    }
                });
            }
        }
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}