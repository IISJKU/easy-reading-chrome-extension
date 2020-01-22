var ports = [];

var background = {
    errorMsg: null,
    uuid: null,
    authMethod:null,
    userLoggedIn: false,

    connectToCloud: async function (config) {

        if(cloudWebSocket.initWebSocket({...config})){
            background.config = {...config};
        }else{
            await background.logoutUser("Could not connect to cloud server!");
        }
    },

    onConnectedToCloud: function (event) {


        background.errorMsg = null;
        background.uuid = null;
        cloudWebSocket.sendMessage(JSON.stringify({
            type: "getUUID",
            redirectURL: chrome.extension.getURL('/background/config/config.html'),
        }));

        setTimeout(function () {
            if (!background.uuid) {

                let optionsPage = background.getActiveOptionsPage();
                if (optionsPage) {
                    optionsPage.updateStatus("Did not receive UUID");
                }
            }
        }, 2000);
        let optionsPage = background.getActiveOptionsPage();

        if (optionsPage) {
            optionsPage.updateStatus();
        }
    },
    onMessageFromCloud: async function (message) {

        let receivedMessage = JSON.parse(message.data);
        let optionsPage = background.getActiveOptionsPage();

        switch (receivedMessage.type) {
            case "getUUIDResult" :

                //Try silent login
                background.uuid = receivedMessage.result;
                silentLogin.login(this.config, receivedMessage.result);

                break;
            case "userLoginResult":
                scriptManager.reset();
                scriptManager.loadScripts(receivedMessage.result, cloudWebSocket.config.url);


                background.getOpenConfigTabs(function (configTabs) {
                    let configTabIds = [];
                    if (configTabs.length !== 0) {
                        configTabs.forEach((tab) => {
                     //       chrome.tabs.update(tab.id, {url: chrome.extension.getURL('/background/config/config.html')});
                            configTabIds.push(tab.id);
                        });
                    }
                    /*else{
                        let optionsPage = await browser.runtime.openOptionsPage();
                        console.log(optionsPage);
                    }*/

                    try {

                        let m = {
                            type: "getUserProfile",
                            data: JSON.parse(JSON.stringify(scriptManager)),
                        };

                        chrome.tabs.query({},async function (tabs) {

                            for(let i=0; i < tabs.length; i++){
                                let tab = tabs[i];
                                if (tab.url.indexOf("chrome://") === -1 && !easyReading.isIgnoredUrl(tab.url)) {

                                    if (tab.status === "complete") {

                                        if (scriptManager.debugMode) {

                                            chrome.tabs.sendMessage(tab.id, m);

                                        } else {
                                            for (let i = 0; i < scriptManager.contentScripts.length; i++) {
                                                try {
                                                    await chrome.tabs.executeScript(tab.id, {code: (atob(scriptManager.contentScripts[i].source))});
                                                } catch (error) {
                                                    console.log(error);
                                                }

                                            }
                                            for (let i = 0; i < scriptManager.contentCSS.length; i++) {
                                                try {
                                                    await chrome.tabs.insertCSS(tab.id, {code: (atob(scriptManager.contentCSS[i].css))});
                                                } catch (error) {
                                                    console.log(error);
                                                }

                                            }

                                            chrome.tabs.sendMessage(tab.id, m);



                                        }
                                    }
                                }
                            }


                            background.userLoggedIn = true;
                            //Update options pages that logging in was successfull
                            let activeOptionPages = background.getActiveOptionPages();
                            activeOptionPages.forEach((optionsPage) => {
                                optionsPage.updateStatus();
                            });

                        });


                    } catch (error) {
                        console.log(error);
                    }
                });



                break;
            case "userUpdateResult":
                scriptManager.reset();
                scriptManager.loadScripts(receivedMessage.result, cloudWebSocket.config.url, true);

                let message = {
                    type: receivedMessage.type,
                    data: JSON.parse(JSON.stringify(scriptManager)),
                };

                if (scriptManager.debugMode) {

                    for (let i = 0; i < portManager.ports.length; i++) {

                        message.data.uiCollection.uiTabConfig = tabUiConfigManager.getConfigForTab(portManager.ports[i].p.sender.tab.id);
                        portManager.ports[i].p.postMessage(message);
                    }

                } else {
                    for (let k = 0; k < portManager.ports.length; k++) {

                        //! HACK: needs to be fixed. custom functions do not load sometimes without this. due to race condition.....
                        if (portManager.ports[k].p.sender.tab.status === "loading" && portManager.ports[k].p.sender.tab.url.indexOf("client/function-overview") !== -1) {
                            continue;
                        }

                        if (portManager.ports[k].startUpComplete) {
                            let tabId = portManager.ports[k].p.sender.tab.id;


                            for (let i = 0; i < scriptManager.updatedContentScripts.length; i++) {
                                try {
                                    await chrome.tabs.executeScript(tabId, {code: (atob(scriptManager.updatedContentScripts[i].source))});
                                } catch (error) {
                                    console.log(error);
                                }

                            }
                            for (let i = 0; i < scriptManager.updatedContentCSS.length; i++) {
                                try {
                                    await chrome.tabs.insertCSS(tabId, {code: (atob(scriptManager.updatedContentCSS[i].css))});
                                } catch (error) {
                                    console.log(error);
                                }

                            }
                            message.data.uiCollection.uiTabConfig = tabUiConfigManager.getConfigForTab(portManager.ports[k].p.sender.tab.id);
                            portManager.ports[k].p.postMessage(message);


                        }

                    }
                }



                break;
            case "cloudRequestResult":
                portManager.getPort(receivedMessage.windowInfo.tabId).p.postMessage(receivedMessage);

                break;
            case "userLogout" : {

                await background.logoutUser();

                break;

            }
            case "recommendation":{

                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    let currTab = tabs[0];
                    if (currTab) {

                        let port = portManager.getPort(currTab.id);
                        if(port){
                            port.p.postMessage(receivedMessage);
                        }
                    }
                });


                break;
            }


            default:
                console.log("Error: Unknown message type:" + receivedMessage.type);
                console.log(message);
                break;
        }
        // console.log(message);
    },
    onDisconnectFroCloud: async function (error) {
        await background.shutdownTabs();
        if (background.userLoggedIn) {
            background.connectToCloud(background.config);
            background.reconnect = true;
        } else {

            background.errorMsg = error;
            if (scriptManager.profileReceived || background.getActiveOptionsPage()) {
                await background.logoutUser(error);
            }

            cloudWebSocket.reconnect();
        }


    },

    getActiveOptionsPage: function () {
        let windows = chrome.extension.getViews();

        for (let i = 0; i < windows.length; i++) {
            if (windows[i].isEasyReadingConfigPage) {

                return windows[i];
            }
        }
    },

    getActiveOptionPages: function () {
        let optionPages = [];
        let windows = chrome.extension.getViews();

        for (let i = 0; i < windows.length; i++) {
            if (windows[i].isEasyReadingConfigPage) {

                optionPages.push(windows[i]);
            }
        }

        return optionPages;

    },
    getOpenConfigTabs: function (callback, includeOptionsPage = false) {

        let configTabs = [];


        let backgroundUrl = chrome.extension.getURL('/background/config/config.html');

        chrome.tabs.query({},function (tabs) {
            tabs.forEach((tab) => {
                console.log(tab);
                if (tab.url.indexOf("https://"+cloudWebSocket.config.url) !== -1) {
                    configTabs.push(tab);
                }else if (tab.url.indexOf(backgroundUrl) !== -1) {
                    if(includeOptionsPage){
                        configTabs.push(tab);
                    }

                }
            });
            callback(configTabs);
        });




    },
    reloadAllConfigurationTabs: async function () {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.url.indexOf("https://" + cloudWebSocket.config.url) !== -1) {
                    browser.tabs.reload(tab.id);
                }
            });
        });


    },
    updateTabs: function () {

        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {


                if (tab.url) {
                    //only reload non system pages...
                    if (tab.url.startsWith("http")) {

                        chrome.tabs.update(tab.id, {url: tab.url});
                    }
                }
            });
        });
    },

    logoutUser: async function (errorMsg) {
        background.userLoggedIn = false;
        scriptManager.reset();
        cloudWebSocket.closeWebSocket();
        await background.shutdownTabs();

        background.getOpenConfigTabs(async function (configTabs) {
            if (configTabs.length > 0) {
                //Close other tabs
                for (let i = 1; i < configTabs.length; i++) {
                    await chrome.tabs.remove(configTabs[i].id);
                }

                await chrome.tabs.update(configTabs[0].id, {url: chrome.extension.getURL('/background/config/config.html')});
            }

            let activeOptionPages = background.getActiveOptionPages();
            activeOptionPages.forEach((optionsPage) => {
                optionsPage.updateStatus(errorMsg);
            });

            if (configTabs.length === 0 && activeOptionPages.length === 0) {
                chrome.runtime.openOptionsPage();
            }

            setTimeout(async function () {
                await background.reloadAllConfigurationTabs();
            }, 300);

        });


    },
    async shutdownTabs() {
        let m = {
            type: "userLogout",
            data: null,
        };

        chrome.tabs.query({}, function (tabs) {
            tabs.forEach(async (tab) => {
                if (tab.status === "complete") {

                    chrome.tabs.sendMessage(tab.id, m);
                }
            });
        });
    }
};


chrome.runtime.onConnect.addListener(function (p) {
    //if (scriptManager.profileReceived) {
    if (true) {

        if (easyReading.isIgnoredUrl(p.sender.tab.url)) {
            return;
        }
        //Store port to content script
        portManager.addPort(p);
        // ports[p.sender.tab.id] = p;
        var currentPort = p;
        currentPort.onMessage.addListener(async function (m) {
            console.log(m);

            switch (m.type) {
                case "cloudRequest":
                    //Add window id and tab id to the request, so that it can be send back to the original content script
                    m.windowInfo = {
                        tabId: p.sender.tab.id,
                        windowId: p.sender.tab.windowId,
                    };
                    cloudWebSocket.sendMessage(JSON.stringify(m));
                    break;
                case "recommendationResult":

                    cloudWebSocket.sendMessage(JSON.stringify(m));
                    break;
                case "getUserProfile":
                    if (scriptManager.profileReceived) {
                        if (scriptManager.debugMode) {
                            m.data = JSON.parse(JSON.stringify(scriptManager));
                            m.data.uiCollection.uiTabConfig = tabUiConfigManager.getConfigForTab(p.sender.tab.id)
                            currentPort.postMessage(m);
                        } else {
                            for (let i = 0; i < scriptManager.contentScripts.length; i++) {
                                await chrome.tabs.executeScript(p.sender.tab.id, {code: (atob(scriptManager.contentScripts[i].source))});
                            }
                            for (let i = 0; i < scriptManager.contentCSS.length; i++) {
                                await chrome.tabs.insertCSS(p.sender.tab.id, {code: (atob(scriptManager.contentCSS[i].css))});
                            }

                            m.data = JSON.parse(JSON.stringify(scriptManager));
                            m.data.uiCollection.uiTabConfig = tabUiConfigManager.getConfigForTab(p.sender.tab.id);
                            currentPort.postMessage(m);

                        }
                    }
                    break;
                case "startUpComplete":

                    let portInfo = portManager.getPort(p.sender.tab.id);
                    portInfo.startUpComplete = true;
                    console.log(p.sender.tab.id);
                    console.log("startup complete");
                    break;

                case "saveUiConfigurationForTab": {

                    tabUiConfigManager.addConfig(p.sender.tab.id,
                        {
                            id: m.id,
                            configuration: m.configuration,
                        });


                }

                    break;
            }
        });

        currentPort.onDisconnect.addListener((p) => {
            portManager.removePort(p);
            if (p.error) {
                console.log(`Disconnected due to an error: ${p.error.message}`);
            }
        });

    }

});

let portManager = {
    ports: [],
    addPort: function (p) {
        let portInfo = {
            p: p,
            startUpComplete: false,
        };

        for (let i = 0; i < portManager.ports.length; i++) {
            if (portManager.ports[i].p.sender.tab.id === p.sender.tab.id) {

                portManager.ports[i] = portInfo;
                console.log("adding new port");
                return;
            }
        }
        portManager.ports.push(portInfo);
    },
    removePort: function (p) {
        for (let i = 0; i < portManager.ports.length; i++) {
            if (portManager.ports[i].p === p) {
                portManager.ports.splice(i, 1);
                return;
            }
        }

    },

    getPort: function (tab_id) {
        for (let i = 0; i < portManager.ports.length; i++) {
            if (portManager.ports[i].p.sender.tab.id === tab_id) {
                return portManager.ports[i];
            }
        }

    }


};

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    tabUiConfigManager.removeTab(tabId);
});

chrome.tabs.onCreated.addListener(function (tab) {

    tabUiConfigManager.addTab(tab.id)

});

let tabUiConfigManager = {
    tabConfigs: [],
    addTab: function (tabID) {
        this.tabConfigs.push({
            tabID: tabID,
            uiConfigurations: [],
        })
    },
    removeTab: function (tabID) {
        for (let i = 0; i < this.tabConfigs.length; i++) {
            if (this.tabConfigs[i].tabID === tabID) {
                this.tabConfigs.splice(i, 1);

                return;
            }
        }
    },

    addConfig: function (tabID, configuration) {
        for (let i = 0; i < this.tabConfigs.length; i++) {
            if (this.tabConfigs[i].tabID === tabID) {

                //Try to update...
                for (let j = 0; j < this.tabConfigs[i].uiConfigurations.length; j++) {
                    if (this.tabConfigs[i].uiConfigurations[j].id === configuration.id) {
                        this.tabConfigs[i].uiConfigurations[j] = configuration;
                        return;
                    }
                }

                this.tabConfigs[i].uiConfigurations.push(configuration);


            }
        }
    },

    getConfigForTab(tabID) {
        for (let i = 0; i < this.tabConfigs.length; i++) {
            if (this.tabConfigs[i].tabID === tabID) {
                return this.tabConfigs[i].uiConfigurations;

            }
        }

        return [];
    }

};

chrome.browserAction.onClicked.addListener(() => {

    background.getOpenConfigTabs(function (configTabs) {
        if (configTabs.length > 0) {
            for(let i=0; i < configTabs.length; i++){
                if (configTabs[i].url.indexOf("https://" + cloudWebSocket.config.url+"/client") !== -1) {
                    chrome.tabs.update(configTabs[i].id, {active: true});

                    return;
                }
            }
        }

        chrome.runtime.openOptionsPage();

        } ,true);

});

