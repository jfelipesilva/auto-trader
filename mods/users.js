var database = require(__dirname + '/database');

var conf = {
    users: []
};

var users = {

    getUsers: () => {
        return conf.users;
    },

    pushUser: (user_id, strategyTrading) => {
        let flag = 0;
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                flag = 1;
                i = -1;
            }
        }
        if(!flag){
            conf.users.push({"id":user_id,"strategyTrading":strategyTrading});
        }
        return;
    },

    getOpenTrade: (user_id) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                return parseInt(conf.users[i].strategyTrading);
            }
        }
    },

    setOpenTrade: (user_id, strategy_id) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                conf.users[i].strategyTrading = strategy_id;
                database.query("UPDATE user SET strategyTrading = "+strategy_id+" WHERE id = "+user_id);
            }
        }
    },

    setCloseTrade: (user_id) => {
        for(let i=(conf.users.length-1); i>=0; i--){
            if(conf.users[i].id == user_id){
                conf.users[i].strategyTrading = 0;
                database.query("UPDATE user SET strategyTrading = 0 WHERE id = "+user_id);
            }
        }
    }

}
module.exports = users;
