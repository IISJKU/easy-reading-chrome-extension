var silentLogin = {
    httpRequest : null,
    url: null,
    uuid: null,
    login: function (url, uuid) {
        this.url = url;
        this.uuid = uuid;
        this.httpRequest = new XMLHttpRequest();
        this.httpRequest.open("POST",this.getLoginURL() );
        this.httpRequest.onreadystatechange = this.onReadyStateChange;
        this.httpRequest.send();
    },
    onReadyStateChange(e){
        if (e.target.readyState === XMLHttpRequest.DONE && e.target.status === 200) {
            let authFailed = false;
            try {
                let response = JSON.parse(silentLogin.httpRequest.responseText);
                console.log(response);

                if(!response.success){
                    authFailed = true;
                }
            } catch (e) {
                authFailed = true;
            }

            if(authFailed){

                chrome.runtime.openOptionsPage();
                let optionsPage = background.getActiveOptionsPage();

                if(optionsPage){
                    optionsPage.silentLoginFailed(silentLogin.getLoginURL());
                }
            }

        }
    },

    getLoginURL: function () {

        return this.url+"/client/login?token="+this.uuid;
    }
};
