var ports = [];

var background = {
    errorMsg: null,
    uuid: null,
    connectToCloud: function (config) {

        cloudWebSocket.initWebSocket(config);
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
                silentLogin.login("https://"+cloudWebSocket.config.url, receivedMessage.result);

                break;
            case "userLoginResult":
                scriptManager.reset();
                scriptManager.loadScripts(receivedMessage.result, cloudWebSocket.config.url);


                background.getOpenConfigTabs(function (configTabs) {
                    let configTabIds = [];
                    if (configTabs.length !== 0) {
                        configTabs.forEach((tab) => {
                            chrome.tabs.update(tab.id, {url: chrome.extension.getURL('/background/config/config.html')});
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
                            tabs.forEach( async (tab) => {

                                if (tab.url.indexOf("chrome://") === -1 && !configTabIds.includes(tab.id)) {

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

                    for (let i = 0; i < ports.length; i++) {

                        ports[i].postMessage(message);
                    }

                } else {
                    for (let i = 0; i < scriptManager.updatedContentScripts.length; i++) {
                        try {
                            await chrome.tabs.executeScript({code: (atob(scriptManager.updatedContentScripts[i].source))});
                        } catch (error) {
                            console.log(error);
                        }

                    }
                    for (let i = 0; i < scriptManager.updatedContentCSS.length; i++) {
                        try {
                            await chrome.tabs.insertCSS({code: (atob(scriptManager.updatedContentCSS[i].css))});
                        } catch (error) {
                            console.log(error);
                        }

                    }
                    for (let i = 0; i < ports.length; i++) {

                        ports[i].postMessage(message);
                    }
                }


                // background.updateTabs();

                break;
            case "cloudRequestResult":
                getPort(receivedMessage.windowInfo.windowId, receivedMessage.windowInfo.tabId).postMessage(receivedMessage);
                // ports[receivedMessage.data.tab_id].postMessage(receivedMessage);
                break;
            case "userLogout" : {

                await background.logoutUser();


            }
                break;
            default:
                console.log("Error: Unknown message type:" + receivedMessage.type);
                console.log(message);
                break;
        }
        // console.log(message);
    },
    onDisconnectFroCloud: async function (error) {
        background.errorMsg = error;
        if (scriptManager.profileReceived || background.getActiveOptionsPage()) {
            background.logoutUser(error);
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
                if (tab.url.indexOf("https://"+cloudWebSocket.config.url + "/client/") !== -1) {
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
    updateTabs: function () {

        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {


                if (tab.url) {
                    //only reload non system pages...
                    if (tab.url.startsWith("http")) {
                        console.log("Reloading:", tab.url);
                        chrome.tabs.update(tab.id, {url: tab.url});
                    }
                }
            });
        });
    },

    logoutUser: async function (errorMsg) {
        scriptManager.reset();

        let m = {
            type: "userLogout",
            data: null,
        };

       chrome.tabs.query({},async function (tabs) {
           tabs.forEach(async (tab) => {

               if (tab.url !== "about:debugging") {

                   if (tab.status === "complete") {

                       chrome.tabs.sendMessage(tab.id, m);
                   }
               }


           });

           background.getOpenConfigTabs(function (configTabs) {
               configTabs.forEach(async (tab) => {
                   chrome.tabs.update(tab.id, {url: chrome.extension.getURL('/background/config/config.html')});
               });

               let activeOptionPages = background.getActiveOptionPages();
               activeOptionPages.forEach((optionsPage) =>{
                   optionsPage.updateStatus(errorMsg);
               });

               if (configTabs.length === 0 && activeOptionPages.length === 0) {
                   chrome.runtime.openOptionsPage();
               }
           });

       });






    }
};


chrome.runtime.onConnect.addListener(function (p) {
    //if (scriptManager.profileReceived) {
    if (true) {
        //Store port to content script
        addPort(p);
        // ports[p.sender.tab.id] = p;
        var currentPort = p;
        currentPort.onMessage.addListener(async function (m) {

            switch (m.type) {
                case "cloudRequest":
                    //Add window id and tab id to the request, so that it can be send back to the original content script
                    m.windowInfo = {
                        tabId: p.sender.tab.id,
                        windowId: p.sender.tab.windowId,
                    };
                    cloudWebSocket.sendMessage(JSON.stringify(m));
                    break;
                case "getUserProfile":
                    if (scriptManager.profileReceived) {
                        if (scriptManager.debugMode) {
                            m.data = JSON.parse(JSON.stringify(scriptManager));
                            currentPort.postMessage(m);
                        } else {
                            for (let i = 0; i < scriptManager.contentScripts.length; i++) {
                                await chrome.tabs.executeScript(p.sender.tab.id, {code: (atob(scriptManager.contentScripts[i].source))});
                            }
                            for (let i = 0; i < scriptManager.contentCSS.length; i++) {
                                await chrome.tabs.insertCSS(p.sender.tab.id, {code: (atob(scriptManager.contentCSS[i].css))});
                            }

                            m.data = JSON.parse(JSON.stringify(scriptManager));
                            currentPort.postMessage(m);

                        }
                    }

                    break;
            }
        });

        currentPort.onDisconnect.addListener((p) => {
            removePort(p);
            if (p.error) {
                console.log(`Disconnected due to an error: ${p.error.message}`);
            }
        });

    }

});


function addPort(p) {
    for (let i = 0; i < ports.length; i++) {
        if (ports[i].sender.tab.id === p.sender.tab.id) {

            ports[i] = p;
            return;
        }
    }
    ports.push(p);
}

function removePort(p) {

    for (let i = 0; i < ports.length; i++) {
        if (ports[i] === p) {
            ports.splice(i, 1);
            return;
        }

    }
}

function getPort(window_id, tab_id) {

    for (let i = 0; i < ports.length; i++) {
        if (ports[i].sender.tab.windowId === window_id && ports[i].sender.tab.id === tab_id) {
            return ports[i];
        }
    }
}

chrome.browserAction.onClicked.addListener(() => {

    background.getOpenConfigTabs(function (configTabs) {
        if (configTabs.length !== 0) {
            chrome.tabs.update(configTabs[0].id, {active: true});
        } else {
            chrome.runtime.openOptionsPage();
        }
    } ,true);

});

