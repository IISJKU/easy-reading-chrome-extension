let contentScriptController = {
    debugModeListenerStarted:false,
    profileReceived: false,
    init: function () {

        //listens to messages from the background script
        this.portToBackGroundScript = chrome.runtime.connect({name: "port-to-bgs"});
        this.portToBackGroundScript.onMessage.addListener(function (m) {

            //Result of conversion request is send back to the injected content script.
            contentScriptController.receiveMessageFromBackgroundScript(m);

        });
        this.portToBackGroundScript.postMessage({type: "getUserProfile"});

    },

    receiveMessageFromBackgroundScript : function (m) {
        switch (m.type) {
            case "cloudRequestResult":
                if(this.scriptManager.debugMode){

                    let el = document.querySelector('#easy-reading-debug');
                    el.setAttribute('data-result', JSON.stringify(m));

                    let event = new CustomEvent("cloudRequestResult");
                    document.dispatchEvent(event);

                }else{

                    requestManager.receiveRequestResult(m);
                }

                break;
            case "getUserProfile":
                if(this.profileReceived){
                    console.log("profile already received");
                    return;
                }
                this.profileReceived = true;
                this.scriptManager = m.data;

                if(this.scriptManager.debugMode){
                    let injection = {scripts: this.scriptManager.remoteScripts, styleSheets: this.scriptManager.remoteCSS};
                    this.initDebugMode(injection);
                }else{
                    $(document).ready(function () {
                        document.removeEventListener('easyReadingUpdate', contentScriptController.easyReadingUiUpdate);
                        document.addEventListener('easyReadingUpdate', contentScriptController.easyReadingUiUpdate);
                        console.log("starting up");
                        if(easyReading.busyAnimation){
                            easyReading.busyAnimation.stopAnimation();
                        }
                        easyReading.startup( contentScriptController.scriptManager.uiCollection);

                    });

                }

                this.portToBackGroundScript.postMessage({type: "startUpComplete"});


                break;
            case "userUpdateResult":

                this.scriptManager = m.data;

                if(this.scriptManager.debugMode){
                    let injection = {scripts: this.scriptManager.updatedRemoteScripts, styleSheets: this.scriptManager.updatedRemoteCSS};
                    this.initDebugMode(injection);
                }else{
                    $(document).ready(function () {
                        if (typeof easyReading !== 'undefined') {
                            console.log("starting up updated");
                            document.removeEventListener('easyReadingUpdate', contentScriptController.easyReadingUiUpdate);
                            document.addEventListener('easyReadingUpdate', contentScriptController.easyReadingUiUpdate);
                            if(easyReading.busyAnimation){
                                easyReading.busyAnimation.stopAnimation();
                            }
                            easyReading.update( contentScriptController.scriptManager.uiCollection);
                        }

                    });

                }

                this.portToBackGroundScript.postMessage({type: "startUpComplete"});
                break;
            case "userLogout":{

                this.profileReceived = false;

                if(this.scriptManager.debugMode){
                    let event = new CustomEvent("userLogout");
                    document.dispatchEvent(event);
                }else{

                    easyReading.shutdown();

                }
                this.scriptManager = m.data;

            }
            case "recommendation": {
                if (typeof easyReading !== 'undefined') {
                    console.log(m.data);
                    recommendationDialog.showDialogForRecommendation(m.data);
                }



            }

        }
    },
    easyReadingUiUpdate:function (event){
        easyReading.busyAnimation.startAnimation();
        console.log("HIII");
    },
    sendMessageToBackgroundScript: function(message) {
        this.portToBackGroundScript.postMessage(message);
    },


    initDebugMode: function(injection){
        if(!contentScriptController.debugModeListenerStarted){
            document.addEventListener('cloudRequest', function (event) {
                contentScriptController.sendMessageToBackgroundScript(event.detail.message);
            });
            contentScriptController.debugModeListenerStarted = true;
        }



        this.loadStyleSheetsDebugMode(injection.styleSheets);
        this.loadScriptsDebugMode(injection.scripts);
    },
    loadStyleSheetsDebugMode:function (styleSheets) {
        for (let i = 0; i < styleSheets.length; i++) {
            let fileRef = document.createElement("link");
            fileRef.rel = "stylesheet";
            fileRef.type = "text/css";
            fileRef.href = util.appendPathToUrl(contentScriptController.scriptManager.webSocketUrl,styleSheets[i]);
            document.getElementsByTagName("head")[0].appendChild(fileRef);
        }
    },
    loadScriptsDebugMode: function (scripts,index) {

        index = (typeof index !== 'undefined') ? index : 0;

        $.getScript(util.appendPathToUrl(contentScriptController.scriptManager.webSocketUrl,scripts[index]), function (data, textStatus, jqxhr) {
            if (jqxhr.status === 200 && index + 1 < scripts.length) {
                contentScriptController.loadScriptsDebugMode(scripts, index + 1);
            } else if (index === scripts.length - 1) {
                contentScriptController.debugModeStartUp();
            }

        });
    },
    debugModeStartUp:function () {
        $(document).ready(function () {
            console.log("starting up");
            if (! $( "#easy-reading-debug" ).length ) {
                $("body").append("<div id='easy-reading-debug'></div>");
            }

            let el = document.querySelector('#easy-reading-debug');
            el.setAttribute('data-result', JSON.stringify(contentScriptController.scriptManager.uiCollection));

            let event = new CustomEvent("easyReadingStartUp", {});
            document.dispatchEvent(event);
        });


    },

    
    loadScripts:function (injection) {

    }
    


};

let util ={
    isDefined: function (obj) {
        if (obj !== undefined && obj !== null && obj !== "" && obj !== {} && obj !== []) {
            return true;
        }
        return true;
    },
    appendPathToUrl:function (url, str) {
        if (url.startsWith("wss://")) {
            url = url.substr(6, url.length - 1);
        }
        if (!str.startsWith('/')) {
            str = '/' + str;
        }
        return "https://" + url + '/' + str;
    }
};

contentScriptController.init();

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    contentScriptController.receiveMessageFromBackgroundScript(request);

});