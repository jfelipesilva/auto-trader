const crypto = require('crypto-js');
//const crypto = require('crypto');
const request = require('request');
const moment = require('moment');
const bf_ws = require('ws'); //bifinex websocket
const lh_ws = require('ws'); //localhost websocket
const env = require(__dirname + '/_configs');

const mysql = require('mysql');
const mysql_conf = {  
  host     : env.BD_HOST,
  user     : env.BD_USER,
  password : env.BD_PASSWORD,
  database : env.BD_DATABASE
}
var mysql_conn = "";

const utils = require(__dirname + '/utils');
const database = require(__dirname + '/mods/database');
const users = require(__dirname + '/mods/users');
const strategies = require(__dirname + '/mods/strategies');

var pairs = {};
var channels = [];

utils.log(":::: :::: :::: :::: :::");
utils.log(":::: START  LISTEN ::::");
utils.log(":::: :::: :::: :::: :::");
//assinatura: http://www.kammerl.de/ascii/AsciiSignature.php

database.query('SELECT CONCAT(c.slug,b.slug) pair, a.id, a.user_id, d.strategyTrading, a.buy, a.stop, a.target, a.buyFlag, a.status FROM strategy a INNER JOIN currency b ON a.currency_id = b.id INNER JOIN asset c ON a.asset_id = c.id INNER JOIN user d ON a.user_id = d.id WHERE b.exchanges_id = 1 ORDER BY a.created_at', function(rows) {
    if(rows.length > 0){
        rows.forEach(function(res, i){

            //controle de usuário
            users.pushUser(res.user_id,res.strategyTrading);


            //separa stratégias por pares
            if(!pairs.hasOwnProperty(res.pair)){
                pairs[res.pair] = {};
                pairs[res.pair].strategies = [];
                pairs[res.pair].price = 0;
                pairs[res.pair].priceMoves = 0;
                pairs[res.pair].channel = 0;

            }
            pairs[res.pair].strategies.push(res);

        });
    }
});


const wss = new bf_ws('wss://api.bitfinex.com/ws/2');
const lhs = new lh_ws('ws://127.0.0.1:'+env.WSS_PORT);

lhs.onmessage = (msg) => {
    let messages = JSON.parse(msg.data);
    if(messages.action == "submit"){

    }
};

lhs.onopen = () => {
};

wss.onmessage = (msg) => {
    //utils.log(msg.data);
    let messages = JSON.parse(msg.data);

    //SUBSCRIPTIONS
    if(messages.event == "subscribed"){
        channels.push(messages);
        if(pairs.hasOwnProperty(messages.pair)){
            pairs[messages.pair].channel = messages.chanId;
            utils.log("subscribed "+messages.pair+" into channel #"+messages.chanId);
        }
    }

    //PRICES
    if(Array.isArray(messages[1])){
        priceChanges(messages[0],messages[1][0][3]);
    }
    if(messages[1] == "te"){
        priceChanges(messages[0],messages[2][3]);
    }

};
wss.onopen = () => {

    for(var prop in pairs){
        utils.log("sending subscription request for "+prop);
        wss.send(JSON.stringify({ 
            event: 'subscribe', 
            channel: 'trades', 
            symbol: 't'+prop 
        }));
    }

    //buy(1,1,'IOTUSD', '0.2');
};

priceChanges = (channel, lastPrice) => {
    let temp = 0;
    for(var prop in pairs){
        temp=0;
        if(pairs[prop].channel == channel){
            pairs[prop].price = lastPrice;
            verifyStrategiesByPrice(prop);
            lhs.send('{"request":"bitfinex_ws", "pair":"'+prop+'", "pairs":'+JSON.stringify(pairs[prop])+'}');

            if(pairs[prop].priceMoves == 0){
                pairs[prop].priceMoves = lastPrice;
                utils.log(prop+":"+pairs[prop].price);
            }else{
                temp = Math.abs(pairs[prop].priceMoves - pairs[prop].price);
                //utils.log("Temp "+prop+":"+temp);
                temp = (temp*100)/pairs[prop].price;
                //utils.log("Temp "+prop+":"+temp);
                if(temp>utils.priceVariance){
                    pairs[prop].priceMoves = lastPrice;
                    utils.log(prop+":"+pairs[prop].price);
                }
            }
        }
        //utils.log(prop+":"+pairs[prop].price);
    }

};

verifyStrategiesByPrice = (pair) => {
    let userTradingStrategy = 0;
    obj = pairs[pair];
    obj.strategies.forEach(function(strat,i){
        userTradingStrategy = users.getOpenTrade(strat.user_id);
        if(userTradingStrategy==0 && strat.buyFlag){
            //utils.log("Actual price:"+obj.price+"".padEnd(20)+"Buy price:"+strat.buy+"".padEnd(20)+"Stop price:"+strat.stop+"".padEnd(20));
            if(obj.price <= strat.buy && obj.price >= strat.stop){
                //https://gist.github.com/joshuarossi/456a16bd17577a9e7681b6d43880b920
                strat.status = "open";
                strategies.setStatus(strat.id, strat.status);
                users.setOpenTrade(strat.user_id,strat.id,pair,obj.price);
                utils.log("Usuário #"+strat.user_id+" Comprou "+pair+" por "+obj.price, "info");
            }
        }else if(userTradingStrategy == strat.id){
            if(obj.price < strat.stop){
                utils.log("Usuário #"+strat.user_id+" foi stopado "+pair+" por "+obj.price, "danger");
                users.setCloseTrade(strat.user_id, strat.id, pair, obj.price, 'stop');
                strat.status = "stoped";
                strategies.buyFlagControl(0, strat.id, strat.status);
                strat.buyFlag = 0;
            }else if(obj.price > strat.target){
                utils.log("Usuário #"+strat.user_id+" atingiu seu target "+pair+" por "+obj.price, "success");
                users.setCloseTrade(strat.user_id, strat.id, pair, obj.price, 'target');
                strat.status = "obsolete";
                strategies.buyFlagControl(1, strat.id, strat.status);
            }
        }else{
            if(strat.buyFlag && obj.price <= strat.stop){
                utils.log("Estratégia #"+strat.id+" foi stopada "+pair+" por "+obj.price, "danger");
                strat.buyFlag = 0;
                strat.status = "disabled";
                strategies.buyFlagControl(0, strat.id, strat.status);
            }else if(!strat.buyFlag && obj.price > strat.target){
                utils.log("Estratégia #"+strat.id+" atingiu seu target "+pair+" por "+obj.price, "success");
                strat.buyFlag = 1;
                strat.status = "obsolete";
                strategies.buyFlagControl(1, strat.id, strat.status);
            }else if(userTradingStrategy!=0 && strat.status == "enabled" && strat.buyFlag && obj.price <= strat.buy && obj.price > strat.stop){
                utils.log("Estratégia #"+strat.id+" está em zona de compra "+pair+" por "+obj.price, "info");
                strat.status = "in buy zone";
                strategies.setStatus(strat.id, strat.status);
            }else if(strat.status == "in buy zone" && obj.price > strat.buy){
                strat.status = "enabled";
                strategies.buyFlagControl(1, strat.id, strat.status);
            }else if(strat.status == "obsolete" && obj.price < strat.target){
                strat.status = "enabled";
                strategies.buyFlagControl(1, strat.id, strat.status);                
            }else if(strat.status == "enabled" && obj.price > strat.target){
                strat.status = "obsolete";
                strategies.buyFlagControl(1, strat.id, strat.status);                
            }
        }

    });

};

buy = (user_id, exchange_id, pair, price) => {
    /*
    https://docs.bitfinex.com/v2/docs/abbreviations-glossary
    te: trade executed;
    tu: trade updated;
    wu: wallet updates;
    oc: order cancel;
    os: order snapshot;

    */

    const bf_pair = "t"+pair;
    let wss_auth = {};
    let CHAN_ID = "";

    database.query('SELECT * FROM user_has_exchange WHERE user_id = '+user_id+' AND exchange_id = '+exchange_id, function(rows) {
        if(rows.length > 0){

            wss_auth = new bf_ws('wss://api.bitfinex.com/ws/2');

            wss_auth.onmessage = (msg) => {
                //console.log(msg);
                let messages = JSON.parse(msg.data);
                if(messages.event == "auth" && messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==1){
                    
                    //LOGGED IN
                    
                    //SEARCH FOR OPEN ORDERS
                    CHAN_ID = messages.chanId;
                    getAllOrders();

                    //wss_auth.close();
                    console.log(messages);
                }else if(messages.event == "auth" && messages.status == "FAILED"){
                    utils.log("Falha de autenticação => "+messages.msg);
                    wss_auth.close();
                }else if(messages.event == "auth" && messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==0){
                    utils.log("sem permissão de escrita");
                    wss_auth.close();
                }else if(Array.isArray(messages[2]) && messages[1] == "n" && messages[2][1] == "on-req" && messages[2][4][3] == bf_pair && messages[2][6] == "ERROR"){
                    //UPDATES
                    utils.log("DEU ERRO NA TRANSAÇÃO:"+ messages[2][7]);
                    wss_auth.close();
                }else if(Array.isArray(messages[2]) && messages[1] == "os"){

                    //OPEN ORDERS
                    console.log(messages);
                    cancellAll(messages[2]);

                }else if(Array.isArray(messages[2])){
                    utils.log(messages);
                    utils.log("ARRAY--");
                    //echoNestedArray(messages[2]);
                    utils.log("");
                    utils.log("");
                }else{
                    console.log(messages);
                }
            };

            wss_auth.onopen = () => {

                const apiKey = rows[0].key;
                const apiSecret = rows[0].secret;

                const authNonce = Date.now() * 1000;
                const authPayload = 'AUTH' + authNonce;
                const authSig = crypto
                    .HmacSHA384(authPayload, apiSecret)
                    .toString(crypto.enc.Hex)

                const payload = {
                    apiKey,
                    authSig,
                    authNonce,
                    authPayload,
                    //dms: 4, uncomment to enable dead-man-switch
                    event: 'auth'
                };

                wss_auth.send(JSON.stringify(payload));

            };


        }
    });

    cancellAll = (data) => {
        if(data.length > 0){

            let ids = [];
            data.forEach(function(res, i){
                ids.push(res[0]);
            });
            wss_auth.send(JSON.stringify([
                0,
                "oc_multi",
                null,
                {
                    "id": ids
                }
            ]));

            setTimeout(getAllOrders,2000);

        }else{

            //ORDER
            wss_auth.send(JSON.stringify([
                0,
                'on',
                null,
                {
                    cid: Date.now(),
                    type: "EXCHANGE LIMIT",
                    symbol: bf_pair,
                    amount: "20",
                    price: price,
                    hidden: 0
                }
            ]));

        }
    }

    getAllOrders = () => {
        utils.log("AAQQUUII");
        wss_auth.send(JSON.stringify([
            CHAN_ID,
            'os'
        ]));
    }

};

echoNestedArray = (array,parent="") => {
    array.forEach(function(res, i){
        if(Array.isArray(res)){
            echoNestedArray(res,"["+i+"]");
        }else{
            utils.log(parent+"["+i+"]=>"+res);
        }
    });
};