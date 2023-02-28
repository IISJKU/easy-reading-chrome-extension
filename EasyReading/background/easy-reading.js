try {
    importScripts("util.js");
} catch (e) {
    console.log(e);
}

var easyReading = {
        config: null,
        cloudEndpoints: [
            {
                description: "Prod server",
                url: "easyreading-cloud.eu",
            },
            {
                description: "DEV server",
                url: "dev.easyreading-cloud.eu",
            },
            {
                description: "Localhost",
                url: "localhost:8080"
            }
        ],
        ignoredConfigSites: [
            "/client/function-editor",
            "/client/setup",
        ],
        init: function () {
            chrome.storage.local.get("er_config", function (configuration) {
                if (isEmptyObject(configuration)) {
                    configuration = easyReading.getDefaultConfig();
                    easyReading.saveConfig(configuration);
                }
                easyReading.startup();
            });
        },
        startup: function () {
            chrome.runtime.openOptionsPage();
        },
        getDefaultConfig: function () {
            return {
                cloudEndpointIndex: 0,
            };
        },
        saveConfig: function (config) {
            if (!config) {
                config = easyReading.getDefaultConfig();
            }
            chrome.storage.local.set({"er_config": config});
        },
        updateEndpointIndex: function (index) {
            easyReading.saveConfig({
                cloudEndpointIndex: index,
            });
        },
        async isIgnoredUrl(url) {
            const config = await chrome.storage.local.get("er_config");
            for (let i = 0; i < easyReading.ignoredConfigSites.length; i++) {
                let currentURL = easyReading.cloudEndpoints[config.cloudEndpointIndex || 0].url;
                if (url.includes(currentURL + easyReading.ignoredConfigSites[i])) {
                    return true;
                }
            }
            return false;
        }
    }
;

easyReading.init();