//copy this file to "_config.js" and configure it with your environment needs

var configs = {
    getVars : function(){
        return {
            "BITFINEX_APIKEY":"",
            "BITFINEX_APISECRET":"",
            "BITFINEX_BASEURL":"https://api.bitfinex.com",

            "BD_HOST":"127.0.0.1",
            "BD_USER":"root",
            "BD_PASSWORD":"000000",
            "BD_DATABASE":"auto-trader"
        };
    }
}

module.exports = configs;
