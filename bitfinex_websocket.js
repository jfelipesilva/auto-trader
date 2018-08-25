const crypto = require('crypto-js');
const WebSocket = require('ws');
const configs = require(__dirname + '/_configs');
const env = configs.getENV();

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

var messages = {};
var pairs = {};
var channels = [];

utils.log(":::: :::: :::: :::: :::");
utils.log(":::: START  LISTEN ::::");
utils.log(":::: :::: :::: :::: :::");
//assinatura: http://www.kammerl.de/ascii/AsciiSignature.php

database.query('SELECT CONCAT(c.slug,b.slug) pair, a.id, a.user_id, d.strategyTrading, a.buy, a.stop, a.target, a.buyFlag FROM strategy a INNER JOIN currency b ON a.currency_id = b.id INNER JOIN asset c ON a.asset_id = c.id INNER JOIN user d ON a.user_id = d.id WHERE b.exchanges_id = 1 ORDER BY a.created_at', function(rows) {
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


const wss = new WebSocket('wss://api.bitfinex.com/ws/2');

wss.onmessage = (msg) => {
    //utils.log(msg.data);
    messages = JSON.parse(msg.data);

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
    // API keys setup here (See "Authenticated Channels")
    const apiKey = env.BITFINEX_APIKEY;
    const apiSecret = env.BITFINEX_APISECRET;

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

    for(var prop in pairs){
        utils.log("sending subscription request for "+prop);
        wss.send(JSON.stringify({ 
            event: 'subscribe', 
            channel: 'trades', 
            symbol: 't'+prop 
        }));
    }

};

priceChanges = (channel, lastPrice) => {
    let temp = 0;
    for(var prop in pairs){
        temp=0;
        if(pairs[prop].channel == channel){
            pairs[prop].price = lastPrice;
            verifyStrategiesByPrice(prop);
        }

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
                users.setOpenTrade(strat.user_id,strat.id);
                utils.log("Usuário #"+strat.user_id+" Comprou "+pair+" por "+obj.price, "info");
            }
        }else if(userTradingStrategy == strat.id){
            if(obj.price < strat.stop){
                utils.log("Usuário #"+strat.user_id+" foi stopado "+pair+" por "+obj.price, "danger");
                strat.buyFlag = 0;
                users.setCloseTrade(strat.user_id);
                buyFlagControl(0, strat.id);
            }else if(obj.price > strat.target){
                utils.log("Usuário #"+strat.user_id+" atingiu seu target "+pair+" por "+obj.price, "success");
                users.setCloseTrade(strat.user_id);
            }
        }else{
            if(strat.buyFlag && obj.price <= strat.stop){
                utils.log("Estratégia #"+strat.id+" foi stopada "+pair+" por "+obj.price, "danger");
                strat.buyFlag = 0;
                buyFlagControl(0, strat.id);
            }else if(!strat.buyFlag && obj.price >= strat.target){
                utils.log("Estratégia #"+strat.id+" atingiu seu target "+pair+" por "+obj.price, "success");
                strat.buyFlag = 1;
                buyFlagControl(1, strat.id);
            }
        }

    });

};

buyFlagControl = (flag, strat_id) => {
    mysql_conn = mysql.createConnection(mysql_conf);
    mysql_conn.connect();
    mysql_conn.query("UPDATE strategy SET buyFlag = "+flag+" WHERE id = "+strat_id , function (err, result) {
        if (err) throw err;
        mysql_conn.end();
    });
};