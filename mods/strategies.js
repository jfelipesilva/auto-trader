var database = require(__dirname + '/database');

var conf = {
};

var strategies = {

    buyFlagControl: (flag, strat_id, status) => {
        database.query("UPDATE strategy SET buyFlag = "+flag+", status = '"+status+"' WHERE id = "+strat_id);
    },

    setStatus: (strat_id, status) => {
        database.query("UPDATE strategy SET status = '"+status+"' WHERE id = "+strat_id);
    }

}
module.exports = strategies;
