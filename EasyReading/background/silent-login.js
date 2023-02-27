var silentLogin = {

    login: async function () {
        const loginUrl = await this.getLoginURL();
        fetch(loginUrl, { method: 'POST' })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('Network response was not ok.');
                }
            })
            .then(response => {
                console.log(response);
                if (!response.success) {
                    this.handleAuthFailure();
                } else {
                    chrome.storage.local.set({ 'reconnect': false });
                }
            })
            .catch(error => {
                console.error('There was a problem with the fetch operation:', error);
                this.handleAuthFailure();
            });
    },
    async handleAuthFailure () {
        if (await readLocalStorage('reconnect')) {
            chrome.storage.local.set({ 'reconnect': false });
            await background.logoutUser("Lost connection!");
        } else {
            let optionsPage = await background.getActiveOptionsPage();
            const loginURL = await this.getLoginURL();
            if (optionsPage) {
                console.log("silent login:");
                console.log(loginURL);
                optionsPage.silentLoginFailed(loginURL);
            } else {
                chrome.runtime.openOptionsPage();
                optionsPage = await background.getActiveOptionsPage();
                if (optionsPage) {
                    console.log("silent login:");
                    console.log(loginURL);
                    optionsPage.silentLoginFailed(loginURL);
                } else {
                    console.log('No options page found!');
                }
            }
        }
    },

    getLoginURL: async function () {
        const authMethod = await readLocalStorage('authMethod');
        const uuid = await readLocalStorage('uuid');
        const config = await readLocalStorage('config');

        const url = config?.url;
        if (!url) {
            console.log('No login url found in configuration!');
            return '';
        }

        const lang = config?.lang ? `&lang=${config.lang}` : '';
        // Google is default path ('')
        const path = authMethod === 'fb' ? '/facebook' : authMethod === 'anonym' ? '/anonym' : '';
        return `https://${url}/client/login${path}?token=${uuid}${lang}`;
    }
};
