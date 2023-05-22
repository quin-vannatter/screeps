const { Manager } = require("./manager");
const { log } = require("./utils");

function Entry(e, name, template, defaults, transient, properties) {
    this.e = e;
    this.name = name;
    this.template = template;
    this.defaults = defaults;
    this.transient = transient || {};
    this.properties = properties || [];
    this.referenceProperties = [];
    this.data = {};
    this.updateTransientData(this.transient);
}

// Number of elements in collection memory data that's unique.
const DEDICATED_COLLECTION_SIZE = 3;

// Number of elements within each data element that is unique
const DEDICATED_ENTRY_SIZE = 2;

Entry.prototype = {
    create: function (data, index) {

        // E is the Entity Manager, it's in charge of ensuring we're efficiently fetching game references and keeping them up to date
        // The name is the unique identifier for the template. Templates are initially created with properties and methods that can be
        // whatever on top of the root collection template and defaults.
        // The template is the actual template methods and data.
        // Transient is special. Only contains methods that return values. Each is ran once per tick
        // Any subsequent calls return the initial value for the remainder of the tick.
        const entry = new Entry(this.e, this.name, this.template, this.defaults, this.transient, this.properties);

        // Index is for storing. -1 indicates a new entry, if an index is provided and the item
        // needs to be saved, the entry in memory can be found using this.
        entry.index = index || -1;

        // The data object has all the properties that are returned for storing.
        entry.data = {
            ...this.defaults,
            ...data
        };

        // The completeData is all properties and methods from the template that have
        // accessors created at the root level.
        const completeData = {
            ...this.template,
            ...entry.data
        };

        // Properties holds the list of properties stored in memory.
        this.properties = this.properties.concat(Object.keys(entry.data)).filter((x, i, a) => a.indexOf(x) === i);

        // Changed is set to true when an accessor set method is used. When true, the data is saved.
        entry.changed = false;

        // Creates the accessors and wraps functions to provide a reference to the entry.
        entry.updateData(completeData);
        
        return entry;
    },
    updateData: function(data) {
        const self = this;
        Object.keys(data).forEach(key => {
            const value = data[key];
            this[key] = typeof (value) === "function" ? (...args) => value(self, ...args) : value;
        });
    },
    updateTransientData: function(data) {
        const self = this;
        if (this.transientProperties == undefined) {
            this.transientProperties = {};
        }
        Object.keys(data).forEach(key => {
            let value = data[key];
            if (typeof(value) === "function") {
                self[key] = (...args) => {
                    if(this.transientProperties[key] == undefined) {
                        this.transientProperties[key] = value(self, ...args);
                    }
                    return this.transientProperties[key];
                }
            }
        });
    },
    refreshReferences: function() {
        Object.keys(this.data).forEach(key => {
            if (this.e.isEntity(this[key])) {
                this[key] = this.e.refreshEntity(this[key]);
                this.data[key] = this[key];
            }
        });
    },
    refreshState: function() {
        this.transientProperties = {};
        this.changed = false;
        Object.keys(this.data).forEach(key => {

            // We don't care about functions.
            if (typeof(this[key] !== "function") && this[key] != this.data[key]) {
                this.data[key] = this[key];
                this.changed = true;
            }
        });
    },
    fromMemory: function (data, index, properties, idIndexes) {
        // Adjust id indexes to account for dedicated entry size
        idIndexes = idIndexes.map(index => index - DEDICATED_ENTRY_SIZE);
        return this.create(properties.map((key, i) => ({
            [key]: idIndexes.includes(i) ? this.e.getEntity(Memory.ids[data[i]]) : data[i]
        })).reduce((a, b) => ({
            ...a,
            ...b
        }), {}), index);
    },
    toMemory: function (names, properties) {

        // The number of elements before property data should be the same as DEDICATED_ENTRY_SIZE
        return [this.index, names.indexOf(this.name), ...properties.map(key => this.e.isEntity(this[key]) ? this.e.getId(this[key]) : this[key])];
    }
}

function MemoryManager() {
    Manager.call(this, MemoryManager.name);
    this.collections = {};
    this.ids = [];
}

MemoryManager.prototype = {
    ...Manager.prototype,
    clear: function () {
        Memory.collections = {};
        Memory.ids = [];
    },
    load: function () {
        if (Memory.collections == undefined) {
            Memory.collections = {};
        }
        this.e.clear();
        const memory = Memory.collections;
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            if (collection.entries && collection.entries.length > 0) {
                collection.entries.forEach(entry => entry.changed = false);
                collection.entries.forEach(entry => entry.refreshReferences());
            }
            if (memory[key] == undefined) {
                memory[key] = [];
            }
            const collectionMemory = memory[key];
            if (collectionMemory.length >= 2) {
                const properties = collectionMemory[0];
                const names = collectionMemory[1];
                const idIndexes = collectionMemory[2];
                const records = collectionMemory.slice(DEDICATED_COLLECTION_SIZE);

                const newEntries = records.filter(record => !collection.entries.some(entry => entry.index == record[0])).map(record => {
                    const index = record[0];
                    const name = names[record[1]];

                    // Find and load entry.
                    const template = collection.templates[name];
                    if (template != undefined) {
                        return template.fromMemory(record.slice(DEDICATED_ENTRY_SIZE), index, properties, idIndexes);
                    }
                });
                collection.entries.push(...newEntries);
            }
        });
    },
    save: function () {
        if (Memory.collections == undefined) {
            Memory.collections = {};
        }
        const memory = Memory.collections;

        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            const collectionMemory = memory[key] || [];
            let properties = collection.getProperties();
            let names = collection.getNames();
            let idIndexes = [];
            let existingRecords = [];
            const entries = collection.entries;

            entries.forEach(entry => entry.refreshState());

            if (collectionMemory.length > 3) {
                properties = collectionMemory[0].concat(properties).filter((x, i, a) => a.indexOf(x) === i);
                names = collectionMemory[1].concat(names).filter((x, i, a) => a.indexOf(x) === i);
                idIndexes = collectionMemory[2];
                existingRecords = collectionMemory.slice(DEDICATED_COLLECTION_SIZE).filter(record => entries.some(entry => entry.index == record[0] && !entry.changed));
            }

            if (entries != undefined && entries.length > 0) {

                if (properties.length > 0) {
                    let index = Math.max(...existingRecords.map(entry => entry[0]).concat(0));
                    entries.filter(entry => entry.index == -1).forEach(entry => {
                        entry.index = ++index;
                        entry.changed = true;
                    });

                    const updatedRecords = entries.filter(entry => entry.changed)
                        .map(entry => entry.toMemory(names, properties));

                    idIndexes = idIndexes.concat(updatedRecords.map(record => record.map((item, index) => ({ item, index }))
                        .filter(indexedItem => this.e.isEntityId(indexedItem.item))
                        .map(indexedItem => indexedItem.index)).reduce((a, b) => a.concat(b), []))
                        .filter((x, i, a) => a.indexOf(x) === i);

                    updatedRecords.forEach(record => idIndexes.forEach(index => {
                        if (this.e.isEntityId(record[index])) {
                            let mapIndex = Memory.ids.indexOf(record[index]);
                            if (mapIndex == -1) {
                                mapIndex = Memory.ids.length;
                                Memory.ids.push(record[index]);
                            }
                            record[index] = mapIndex;
                        }
                    }));
                    
                    let records = existingRecords.filter(record => !updatedRecords.some(updatedRecord => updatedRecord[0] == record[0])).concat(updatedRecords);

                    // The number of elements before records should be the same as DEDICATED_COLLECTION_SIZE.
                    if (existingRecords.length !== entries.length || updatedRecords.length > 0) {

                        memory[key] = [properties, names, idIndexes, ...records];
                    }
                }
            } else {
                delete memory[key];
            }
        });
        this.e.clear();
    },
    // Registering collections should only happen in the init function.
    register: function (name, {
        template,
        defaults,
        transient
    }) {
        this.collections[name] = new Collection(this.e, template, defaults, transient);
        return this.collections[name];
    }
}

function Collection(e, baseTemplate, baseDefaults, baseTransient) {
    this.e = e;
    this.templates = {};
    this.entries = [];
    this.baseTemplate = baseTemplate;
    this.baseDefaults = baseDefaults;
    this.baseTransient = baseTransient || {};
}

Collection.prototype = {
    create: function (...args) {
        if (args.length == 2) {
            const template = this.templates[args[0]];
            return template.create(args[1]);
        } else if (args.length == 1 && this.templates.single != undefined) {
            return this.templates.single.create(args[0]);
        }
    },
    single: function () {
        this.templates.single = new Entry(this.e, "single", this.baseTemplate, this.baseDefaults);
        return this;
    },
    register: function (data) {
        Object.keys(data).forEach(key => {
            const entry = data[key];
            if (entry != undefined && entry.template != undefined) {
                const template = {
                    ...this.baseTemplate,
                    ...(entry.template || {})
                };
                const defaults = {
                    ...this.baseDefaults,
                    ...(entry.defaults || {})
                };
                const transient = {
                    ...this.baseTransient,
                    ...(entry.transient || {})
                }
                this.templates[key] = new Entry(this.e, key, template, defaults, transient);
            }
        });
    },
    getNames: function() {
        return Object.keys(this.templates);
    },
    getProperties: function() {
        return Object.values(this.templates).map(template => template.properties)
            .reduce((a, b) => a.concat(b), [])
            .filter((x, i, a) => a.indexOf(x) === i);
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}