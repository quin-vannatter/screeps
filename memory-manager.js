const {
    Manager
} = require("./manager");

function Entry(template, defaults) {
    this.template = template;
    this.defaults = defaults;
    this.data = {};
}

Entry.prototype = {
    create: function (data) {
        this.data = { ...data, ...this.defaults };
        const completeData = { ...this.data, ...this.template };
        const self = this;
        Object.keys(completeData).forEach(key => {
            const value = completeData[key];
            this[key] = typeof(value) === "function" ? (...args) => value(self, ...args) : value;
        })
    },
    fromMemory: function (properties, data) {
        return this.create(properties.map((key, i) => ({ [key]: data[i] })).reduce((a, b) => ({...a, ...b}), {}));
    },
    toMemory: function (properties) {
        return properties.map(key => this[key]);
    },
    properties: function() {
        return Object.keys(this.data);
    }
}

function MemoryManager() {
    Manager.call(this, MemoryManager.name);
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
                const properties = collectionMemory[1];
                const idIndexes = collectionMemory[2];
                const entries = collectionMemory.slice(3);

                entries.forEach(entry => {
                    entry.forEach(value => {

                        // Resolve game object ids.
                        idIndexes.forEach(index => {
                            const idIndex = value[index];
                            value[index] = idIndex < references.length ? references[idIndex] : undefined;
                        });
    
                        // Add entries.
                        const template = collection.templates[name];
                        if (template != undefined) {
                            collection.entries.push(template.fromMemory(properties, value))
                        }
                    });
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

                const properties = entries.map(entry => entry.properties())
                    .reduce((a, b) => a.concat(b), [])
                    .filter((x, i, a) => a.indexOf(x) == i);

                if (properties.length > 0) {
                    const values = entries.map(entry => entry.toMemory(properties));
                    let idIndexes = [];

                    if (values.length > 0) {
                        idIndexes = values.map((x, i) => [x, i])
                            .filter(x => typeof (x[0]) === "object" && /[a-f0-9]{15}/.test(x[0].id))
                            .map(x => x[1]);
                    }

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
    register: function (name, baseTemplate, baseDefaults) {
        this.collections[name] = new Collection(baseTemplate, baseDefaults);
        return collections[name];
    }
}

function Collection(baseTemplate, baseDefaults) {
    this.templates = {};
    this.entries = [];
    this.baseTemplate = baseTemplate;
    this.baseDefaults = baseDefaults;
}

Collection.prototype = {
    create: function (name, data) {
        const template = this.templates[name];
        if (template != undefined) {
            return template.create(data);
        }
    },
    register: function (data) {
        Object.keys(data).forEach(key => {
            const entry = data[key];
            if (entry != undefined && entry.template != undefined && entry.defaults != undefined) {
                const template = { ...this.baseTemplate, ...entry.template };
                const defaults = { ...this.baseDefaults, ...(entry.defaults || {}) };
                this.templates[key] = new Entry(template, defaults);
            }
        });
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}