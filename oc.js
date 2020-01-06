var ClientOAuth2 = require('client-oauth2');
var util = require('util');
var mysql = require('mysql');
var request = require('request');
var ICAL = require('ical.js');

var db = mysql.createConnection({
    host: 'proliant.home.vchrist.at',
    user: 'wastecalendar',
    password: '!!!SoMaSi01!!!'
});

db.connect();

function handleDisconnect(client) {
    client.on('error', function(error) {
        console.log("ErrorCode: " + error.code);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        db = mysql.createConnection(client.config);
        handleDisconnect(db);
        db.connect();
        console.log('Connected!');
    });
}
handleDisconnect(db);

var nextcloudAuth = new ClientOAuth2({
    clientId: 'wsdWZ7YHytNP94j3CSh2WFMWlQQ3Dq1Dafbf0Y8YQee3VS55kthpRIInBnAUNbR2',
    clientSecret: '9gJgwVagnH5mev3440kSt6KuCQ5SwKO82zrMucxjwICVgNk0LaHulCU1y7YKHbq7',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'http://calisto.home.vchrist.at:8080/auth/nextcloud/callback',
    scopes: []
});

var express = require('express');
var app = express();

app.get('/auth/nextcloud', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var uri = nextcloudAuth.code.getUri();

    console.log(util.inspect(uri));
    res.redirect(uri);
});


function refreshUser(user, cb) {
    user.refresh().then(function(updatedUser) {
        console.log(updatedUser);
        console.log(updatedUser !== user); //=> true
        console.log('AccessToken: ' + updatedUser.accessToken);
        console.log('RefreshToken: ' + updatedUser.refreshToken);
        console.log('Expires: ' + updatedUser.expires);

        var sql = `UPDATE wastecalendar.oc_user
        SET
        oc_accesstoken = '${updatedUser.accessToken}',
            oc_refreshtoken = '${updatedUser.refreshToken}',
            oc_expires = '${updatedUser.expires}'
        WHERE
        oc_userid = '${updatedUser.data.user_id}'`;

        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' record updated ' + util.inspect(result));

            if (cb) {
                cb(updatedUser);
            }
        });
    });
}


function insertUser(user, cb) {
    sql = `INSERT INTO wastecalendar.oc_user(
        oc_userid,
        oc_accesstoken,
        oc_refreshtoken,
        oc_expires)
    VALUES(
        '${user.data.user_id}',
        '${user.accessToken}',
        '${user.refreshToken}',
        '${user.expires}')`;

    db.query(sql, function(err, result) {
        if (err) {
            console.error(err.stack);
            result.statusCode = 500;
            result.end();
            return;
        }
        console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
        if (cb) {
            cb(user);
        }
    });
}

app.get('/auth/nextcloud/callback', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    nextcloudAuth.code.getToken(req.originalUrl).then(function(user) {
        console.log(user);

        var sql = `SELECT * FROM wastecalendar.oc_user WHERE oc_userid = '${user.data.user_id}'`;

        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' records found ' + util.inspect(result));

            if (result && result.length) {
                sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = '${user.data.user_id}'`;
                db.query(sql, function(err, result) {
                    if (err) {
                        console.error(err.stack);
                        res.statusCode = 500;
                        res.end();
                        return;
                    }
                    console.log(result.affectedRows + ' records deleted ' + util.inspect(result));

                    insertUser(user, function(user) {
                        refreshUser(user, function(updatedUser) {
                            return res.send(updatedUser.accessToken);
                        });
                    });
                });
            } else {
                insertUser(user, function(user) {
                    refreshUser(user, function(updatedUser) {
                        return res.send(updatedUser.accessToken);
                    });
                });
            }
        });
    });
});


function getCalendar(user, cb) {
    rec = user.sign({
        url: `https://cloud.vchrist.at/remote.php/dav/calendars/${user.data.user_id}/mllabfuhr/?export`
    });

    request.get(rec, function(error, response, body) {
        console.log('Call Response: ' + body);
        console.log('Call Status: ' + response.statusCode);
        console.log('ENDE');
        cb(body);
    });
}

app.get('/test', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    sql = "SELECT * FROM wastecalendar.oc_user WHERE oc_userid = 'voc'";

    db.query(sql, function(err, result) {
        if (err) {
            console.error(err.stack);
            res.statusCode = 500;
            res.end();
            return;
        }
        console.log("SELECT result: " + util.inspect(result));

        result.forEach(function(oc_user) {
            var user = nextcloudAuth.createToken(oc_user.oc_accesstoken, oc_user.oc_refreshtoken, 'bearer');
            user.data.user_id = oc_user.oc_userid;

            expires = new Date(oc_user.oc_expires);
            expires.setMinutes(expires.getMinutes() - 10);
            user.expiresIn(expires);

            if (user.expired()) {
                refreshUser(user, function(updatedUser) {
                    console.log('111----------------------------------------');
                    console.log('UpdatedUser: ' + util.inspect(updatedUser));
                    console.log('111----------------------------------------');

                    getCalendar(updatedUser, function(body) {
                        return res.send(body);
                    });
                });
            } else {
                console.log('222----------------------------------------');
                console.log('User: ' + util.inspect(user));
                console.log('222----------------------------------------');

                getCalendar(user, function(body) {
                    var iCalData = ICAL.parse(body);
                    var comp = new ICAL.Component(iCalData);
                    var vevent = comp.getFirstSubcomponent('vevent');
                    var event = new ICAL.Event(vevent);
                    console.log('Local: ' + event.startDate.toJSDate()); // Correct local time
                    return res.send(body);
                });
            }
        });
    });
    console.log('ende');
});

app.listen(8080, function() {
    console.log('Nextcloud oauth2 client endpoint listening on port 8080!');
});

/*
let getQueueLength = function() {
    return Math.round(12 * Math.random());
};

// We would like to retrieve the queue length at regular intervals
// this way, we can decide when to make a quick dash over
// at the optimal time

setInterval(function() {
    let queueLength = getQueueLength();

    console.log(`The queue at the McDonald's drive-through is now ${queueLength} cars long.`);

    if (queueLength === 0) {
        console.log('Quick, grab your coat!');
    }

    if (queueLength > 8) {
        return console.log('This is beginning to look impossible!');
    }
}, 3000);
*/