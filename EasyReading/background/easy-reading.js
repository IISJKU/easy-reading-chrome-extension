var easyReading = {
        config: null,
        cloudEndpoints: [
            {
                description: "AWS Prod server",
                url: "easyreading-cloud.eu",
            },
            {
                description: "AWS DEV server",
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

            chrome.storage.local.get(function (configuration) {

                if ($.isEmptyObject(configuration)) {
                    configuration = easyReading.getDefaultConfig();

                }
                easyReading.config = configuration;
                easyReading.saveConfig();
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
        getEndpoint: function () {
            if (easyReading.cloudEndpoints[easyReading.config.cloudEndpointIndex]) {
                cloudWebSocket.initWebSocket(easyReading.cloudEndpoints[easyReading.config.cloudEndpointIndex]);
            } else {
                cloudWebSocket.initWebSocket(easyReading.cloudEndpoints[0]);
            }
        },
        saveConfig: function () {

            if (!easyReading.config) {
                easyReading.config = easyReading.getDefaultConfig();
            }
            chrome.storage.local.set(easyReading.config);

        },

        updateEndpointIndex: function (index) {
            easyReading.config.cloudEndpointIndex = index;
            easyReading.saveConfig();
        },
        isIgnoredUrl(url) {
            for (let i = 0; i < easyReading.ignoredConfigSites.length; i++) {

                let currentURL = easyReading.cloudEndpoints[easyReading.config.cloudEndpointIndex].url;
                if (url.includes(currentURL + easyReading.ignoredConfigSites[i])) {
                    return true;
                }

            }

            return false;
        }


    }
;


easyReading.init();