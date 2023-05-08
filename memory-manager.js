const {
    Manager
} = require("./manager");

function Entry(name, template, defaults) {
    this.name = name;
    this.template = template;
    this.defaults = defaults;
    this.updateEntry({ ...template, ...defaults });
    this.data = {};
}

Entry.prototype = {
    create: function (data) {
        const entry = new Entry(this.name, this.template, this.defaults);
        entry.data = { ...this.defaults, ...data };
        const completeData = { ...this.template, ...entry.data };
        entry.updateEntry(completeData);
        return entry;
    },
    updateEntry: function(data) {
        const self = this;
        Object.keys(data).forEach(key => {
            const value = data[key];
            this[key] = typeof(value) === "function" ? (...args) => value(self, ...args) : value;
        });
    },
    fromMemory: function (properties, data) {
        return this.create(properties.map((key, i) => ({ [key]: data[i] })).reduce((a, b) => ({...a, ...b}), {}));
    },
    toMemory: function (properties) {
        return properties.map(key => this[key]);
    },
    properties: function() {
        return ["name", ...Object.keys(this.data)];
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
    clear: function() {
        Memory.collections = {};
        Memory.ids = [];
    },
    load: function () {
        this.setup();
        const memory = Memory.collections;
        const references = Memory.ids.map(id => Game.getObjectById(id));
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            collection.entries = [];
            if (memory[key] == undefined) {
                memory[key] = [];
            }
            const collectionMemory = memory[key];
            if (collectionMemory.length >= 3) {
                const properties = collectionMemory[0];
                const idIndexes = collectionMemory[1];
                const entries = collectionMemory.slice(2);

                entries.forEach(entry => {
                    const name = entry[properties.indexOf("name")];

                    // Resolve game object ids.
                    idIndexes.forEach(index => {
                        const idIndex = entry[index];
                        entry[index] = idIndex < references.length ? references[idIndex] : {};
                    });

                    // Add entries.
                    const template = collection.templates[name];
                    if (template != undefined) {
                        collection.entries.push(template.fromMemory(properties, entry))
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

                const properties = entries.map(entry => entry.properties())
                    .reduce((a, b) => a.concat(b), [])
                    .filter((x, i, a) => a.indexOf(x) == i);

                if (properties.length > 0) {
                    const values = entries.map(entry => entry.toMemory(properties));
                    let idIndexes = [];

                    if (values.length > 0) {
                        idIndexes = values[0].map((x, i) => [x, i])
                            .filter(x => typeof (x[0]) === "object" && /[a-f0-9]{15}/.test(x[0].id))
                            .map(x => x[1]);
                    }

                    values.forEach(value => {
                        value.map((x, i) => [x, i]).filter((_x, i) => idIndexes.includes(i)).forEach(x => {
                            if (x[0] != undefined && x[0].id != undefined) {
                                let mapIndex = ids.indexOf(x[0].id);
                                if (mapIndex === -1) {
                                    ids.push(x[0].id);
                                    mapIndex = ids.length - 1;
                                }
                                value[x[1]] = mapIndex;
                            }
                        });
                    })

                    memory[key] = [properties, idIndexes, ...values];
                }
            }
        });
        Memory.ids = ids;
    },
    // Registering collections should only happen in the init function.
    register: function (name, baseTemplate, baseDefaults) {
        this.collections[name] = new Collection(baseTemplate, baseDefaults);
        return this.collections[name];
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
            if (entry != undefined && entry.template != undefined) {
                const template = { ...this.baseTemplate, ...entry.template };
                const defaults = { ...this.baseDefaults, ...(entry.defaults || {}) };
                this.templates[key] = new Entry(key, template, defaults);
            }
        });
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}