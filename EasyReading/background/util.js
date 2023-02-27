const readLocalStorage = async (key) => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], function (result) {
            if (result[key] === undefined) {
                reject();
            } else {
                resolve(result[key]);
            }
        });
    });
};

const isEmptyObject = (obj) => {
    for ( let name in obj ) {
        return false;
    }
    return true;
}