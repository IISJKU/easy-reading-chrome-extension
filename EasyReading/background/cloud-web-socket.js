"use strict";
var cloudWebSocket = {
    webSocket: null,
    config: null,
    isConnected: false,
    initWebSocket: function (config) {

        if(config){
            this.config = JSON.parse(JSON.stringify(config));
        }
        cloudWebSocket.closeWebSocket();
        cloudWebSocket.webSocket = new WebSocket("wss://"+this.config.url);
        cloudWebSocket.webSocket.onopen = this.onOpen;
        cloudWebSocket.webSocket.onmessage = this.onMessage;
        cloudWebSocket.webSocket.onclose = this.onClose;
        cloudWebSocket.webSocket.onerror = this.onError;

    },

    closeWebSocket: function () {

        if (this.webSocket) {
            this.webSocket.onopen = null;
            this.webSocket.onmessage = null;
            this.webSocket.onclose = null;
            this.webSocket.onerror = null;
            this.webSocket.close();
        }
    },

    onOpen: function (event) {
        cloudWebSocket.isConnected = true;
        background.onConnectedToCloud(event);

        cloudWebSocket.ping();

    },

    onMessage: function (message) {

        try {
            background.onMessageFromCloud(message);
        } catch (e) {
            console.log("ws: error on m essage- " + e);
            throw e; // intentionally re-throw (caught by window.onerror)
        }
    },
    onClose: function (event) {
        let errorMsg = "Could not connect to: "+event.currentTarget.url;
        cloudWebSocket.isConnected = false;
        cloudWebSocket.webSocket = undefined;
     //   background.onDisconnectFroCloud(errorMsg);
     //   cloudWebSocket.reconnect();
    },
    onError: function (event) {
        let errorMsg = "Could not connect to: "+event.currentTarget.url;
        cloudWebSocket.isConnected = false;
        cloudWebSocket.webSocket = undefined;
        background.onDisconnectFroCloud(errorMsg);
        cloudWebSocket.reconnect();
    },
    sendMessage: function (message) {
        if (this.webSocket) {
            this.webSocket.send(message);
        }
    },

    reconnect: function () {
        console.log("ws: recconect");
        setTimeout(function () {
             cloudWebSocket.initWebSocket();
        }, 1000);
    },

    ping:function () {

        if(this.isConnected){
            this.sendMessage({type: "ping"});

            console.log("ping");
            setTimeout(function () {
                cloudWebSocket.ping();
            }, 10000);
        }


    },

    getConfig:function () {
      return this.config;
    },

};