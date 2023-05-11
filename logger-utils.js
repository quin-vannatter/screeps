module.exports = {
    userFriendlyList: items => {
        if (items.length > 1) {
            const lastItem = items.pop();
            return [items.join(', '), lastItem].join(' and ');
        } else {
            return items.join(', ');
        }
    }
}