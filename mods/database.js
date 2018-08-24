const configs = require(__dirname + '/../_configs');
const env = configs.getENV();
const mysql = require('mysql');
const mysql_conf = {  
  host     : env.BD_HOST,
  user     : env.BD_USER,
  password : env.BD_PASSWORD,
  database : env.BD_DATABASE
}

var database = {

    query: (query, callback="undefined") => {
        let mysql_conn = mysql.createConnection(mysql_conf);
        mysql_conn.connect();
        mysql_conn.query(query, function(err, rows, fields){
            mysql_conn.end();
            if (err) throw err;
            if(callback!="undefined") callback(rows);
        });
    }

}
module.exports = database;
